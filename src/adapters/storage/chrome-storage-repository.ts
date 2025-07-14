import { Memo, MemoFactory } from "../../core/entities/memo";
import { StorageRepository } from "../../core/ports/repositories";
import { logger } from "../../utils/logger";

/**
 * Storage usage statistics interface
 */
interface StorageStats {
  syncUsed: number;
  syncTotal: number;
  localUsed: number;
  localTotal: number;
}

/**
 * Save operation result interface
 */
interface SaveResult {
  success: boolean;
  location: 'sync' | 'local' | 'backup';
  error?: Error;
  bytesUsed?: number;
}

/**
 * Implementation of storage repository using Chrome Storage API
 */
export class ChromeStorageRepository implements StorageRepository {
  private readonly STORAGE_KEY = "newTabText";
  private readonly BACKUP_KEY = "newTabText_backup";
  private readonly SYNC_TIMEOUT_MS = 3000;
  private readonly GET_TIMEOUT_MS = 2000;
  private readonly MAX_SYNC_ITEM_SIZE = 8192; // 8KB limit for sync storage
  private readonly MAX_LOCAL_ITEM_SIZE = 5242880; // 5MB limit for local storage
  
  // Save operation in progress flag to prevent concurrent saves
  private saveInProgress = false;

  /**
   * Save memo (save to both sync and local)
   * @param memo Memo to save
   */
  async saveMemo(memo: Memo): Promise<void> {
    // Prevent concurrent save operations
    if (this.saveInProgress) {
      logger.warn('ChromeStorage', 'Save operation already in progress, skipping');
      return;
    }

    this.saveInProgress = true;
    const startTime = Date.now();
    
    try {
      const memoData = {
        ...memo,
        lastSaved: new Date().toISOString(),
      };

      // Check data size before saving
      const dataSize = this.calculateDataSize(memoData);
      logger.info('ChromeStorage', `Attempting to save ${dataSize} bytes`);

      // Log current storage usage
      await this.logStorageUsage();

      const saveResults: SaveResult[] = [];

      // Try sync storage first (if data size allows)
      if (dataSize <= this.MAX_SYNC_ITEM_SIZE) {
        const syncResult = await this.trySaveToSync(memoData);
        saveResults.push(syncResult);
      } else {
        logger.warn('ChromeStorage', `Data too large for sync storage (${dataSize} > ${this.MAX_SYNC_ITEM_SIZE})`);
        saveResults.push({ success: false, location: 'sync', error: new Error('Data too large for sync storage') });
      }

      // Try local storage
      if (dataSize <= this.MAX_LOCAL_ITEM_SIZE) {
        const localResult = await this.trySaveToLocal(memoData);
        saveResults.push(localResult);
        
        // Try backup storage
        const backupResult = await this.trySaveToBackup(memoData);
        saveResults.push(backupResult);
      } else {
        logger.error('ChromeStorage', `Data too large even for local storage (${dataSize} > ${this.MAX_LOCAL_ITEM_SIZE})`);
        saveResults.push({ success: false, location: 'local', error: new Error('Data too large for local storage') });
      }

      // Log save results
      const successCount = saveResults.filter(r => r.success).length;
      const saveTime = Date.now() - startTime;
      
      logger.info('ChromeStorage', `Save completed: ${successCount}/${saveResults.length} successful (${saveTime}ms)`);
      saveResults.forEach(result => {
        if (result.success) {
          logger.debug('ChromeStorage', `✓ ${result.location}: saved successfully`);
        } else {
          logger.error('ChromeStorage', `✗ ${result.location}: ${result.error?.message}`);
        }
      });

      // Verify save by reading back the data
      const verification = await this.verifySave(memo.id);
      if (!verification.success) {
        logger.error('ChromeStorage', 'Save verification failed:', verification.error);
      }

      // Check if at least one storage operation succeeded
      if (successCount === 0) {
        const errorMsg = "Failed to save to all storage locations";
        logger.error('ChromeStorage', errorMsg, {
          contentLength: memo.content.length,
          timestamp: new Date().toISOString(),
          saveResults
        });
        throw new Error(errorMsg);
      }
    } finally {
      this.saveInProgress = false;
    }
  }

  /**
   * Try to save to sync storage
   */
  private async trySaveToSync(memoData: any): Promise<SaveResult> {
    try {
      await Promise.race([
        chrome.storage.sync.set({ [this.STORAGE_KEY]: memoData }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Sync timeout')), this.SYNC_TIMEOUT_MS))
      ]);
      return { success: true, location: 'sync' };
    } catch (error) {
      return { success: false, location: 'sync', error: error as Error };
    }
  }

  /**
   * Try to save to local storage
   */
  private async trySaveToLocal(memoData: any): Promise<SaveResult> {
    try {
      await chrome.storage.local.set({ [this.STORAGE_KEY]: memoData });
      return { success: true, location: 'local' };
    } catch (error) {
      return { success: false, location: 'local', error: error as Error };
    }
  }

  /**
   * Try to save to backup storage
   */
  private async trySaveToBackup(memoData: any): Promise<SaveResult> {
    try {
      await chrome.storage.local.set({ [this.BACKUP_KEY]: memoData });
      return { success: true, location: 'backup' };
    } catch (error) {
      return { success: false, location: 'backup', error: error as Error };
    }
  }

  /**
   * Calculate the size of data in bytes
   */
  private calculateDataSize(data: any): number {
    return new Blob([JSON.stringify(data)]).size;
  }

  /**
   * Log current storage usage
   */
  private async logStorageUsage(): Promise<void> {
    try {
      const stats = await this.getStorageStats();
      logger.debug('ChromeStorage', 'Storage usage:', {
        sync: `${stats.syncUsed}/${stats.syncTotal} bytes (${Math.round(stats.syncUsed / stats.syncTotal * 100)}%)`,
        local: `${stats.localUsed}/${stats.localTotal} bytes (${Math.round(stats.localUsed / stats.localTotal * 100)}%)`
      });
    } catch (error) {
      logger.warn('ChromeStorage', 'Could not get storage usage:', error);
    }
  }

  /**
   * Get storage usage statistics
   */
  private async getStorageStats(): Promise<StorageStats> {
    const [syncUsage, localUsage] = await Promise.all([
      chrome.storage.sync.getBytesInUse(),
      chrome.storage.local.getBytesInUse()
    ]);

    return {
      syncUsed: syncUsage,
      syncTotal: chrome.storage.sync.QUOTA_BYTES,
      localUsed: localUsage,
      localTotal: chrome.storage.local.QUOTA_BYTES
    };
  }

  /**
   * Verify that the save operation was successful
   */
  private async verifySave(expectedId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const savedMemo = await this.getMemo();
      if (!savedMemo) {
        return { success: false, error: 'No data found after save' };
      }
      if (savedMemo.id !== expectedId) {
        return { success: false, error: `ID mismatch: expected ${expectedId}, got ${savedMemo.id}` };
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Get memo (try in order: sync -> local -> backup)
   * @returns Saved memo or undefined
   */
  async getMemo(): Promise<Memo | undefined> {
    const startTime = Date.now();
    logger.debug('ChromeStorage', 'Attempting to retrieve memo');
    
    try {
      // First try sync (with timeout)
      try {
        const result = await Promise.race([
          chrome.storage.sync.get(this.STORAGE_KEY),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Sync timeout')), this.GET_TIMEOUT_MS))
        ]) as any;
        
        const data = result[this.STORAGE_KEY];
        if (data) {
          const memo = this.createMemoFromData(data);
          const retrieveTime = Date.now() - startTime;
          logger.debug('ChromeStorage', `✓ Retrieved from sync storage (${retrieveTime}ms)`);
          return memo;
        }
      } catch (error) {
        logger.info('ChromeStorage', `Sync retrieval failed: ${(error as Error).message}`);
      }

      // If not in sync, try local
      try {
        const result = await chrome.storage.local.get(this.STORAGE_KEY);
        const data = result[this.STORAGE_KEY];
        if (data) {
          const memo = this.createMemoFromData(data);
          const retrieveTime = Date.now() - startTime;
          logger.debug('ChromeStorage', `✓ Retrieved from local storage (${retrieveTime}ms)`);
          return memo;
        }
      } catch (error) {
        logger.warn('ChromeStorage', `Local retrieval failed: ${(error as Error).message}`);
      }

      // If not in local either, try backup
      try {
        const result = await chrome.storage.local.get(this.BACKUP_KEY);
        const data = result[this.BACKUP_KEY];
        if (data) {
          const memo = this.createMemoFromData(data);
          const retrieveTime = Date.now() - startTime;
          logger.debug('ChromeStorage', `✓ Retrieved from backup storage (${retrieveTime}ms)`);
          return memo;
        }
      } catch (error) {
        logger.warn('ChromeStorage', `Backup retrieval failed: ${(error as Error).message}`);
      }

      const retrieveTime = Date.now() - startTime;
      logger.debug('ChromeStorage', `No memo found in any storage location (${retrieveTime}ms)`);
      return undefined;
      
    } catch (error) {
      const retrieveTime = Date.now() - startTime;
      logger.error('ChromeStorage', `Failed to get memo from Chrome storage (${retrieveTime}ms):`, error);
      throw new Error("Failed to retrieve memo");
    }
  }

  /**
   * Create memo object from data
   * @param data Data retrieved from storage
   * @returns Memo object
   */
  private createMemoFromData(data: any): Memo {
    return MemoFactory.fromData({
      id: data.id,
      content: data.content || "",
      timestamp: data.timestamp || Date.now(),
    });
  }
}

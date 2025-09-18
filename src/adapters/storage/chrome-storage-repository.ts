import { Memo, MemoFactory } from "../../core/entities/memo";
import { StorageRepository } from "../../core/ports/repositories";
import { ChromeIntegration } from "../../infrastructure/chrome/chrome-integration";
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
      // Ensure service worker is active before saving
      const serviceWorkerActive = await ChromeIntegration.ensureServiceWorkerActive();
      if (!serviceWorkerActive) {
        logger.warn('ChromeStorage', 'Service worker may not be active, proceeding with save anyway');
      }
      const memoData = {
        ...memo,
        lastSaved: new Date().toISOString(),
      };

      // Check data size before saving
      const dataSize = this.calculateDataSize(memoData);
      logger.saveInfo('ChromeStorage', `Attempting to save ${dataSize} bytes`);

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
      
      logger.saveInfo('ChromeStorage', `Save completed: ${successCount}/${saveResults.length} successful (${saveTime}ms)`);
      saveResults.forEach(result => {
        if (result.success) {
          logger.debug('ChromeStorage', `✓ ${result.location}: saved successfully`);
        } else {
          logger.error('ChromeStorage', `✗ ${result.location}: ${result.error?.message}`);
        }
      });

      // Verify save by reading back the data with timestamp check
      const verification = await this.verifySave(memo.id, memo.timestamp);
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
   * Verify that the save operation was successful with enhanced checks
   */
  private async verifySave(expectedId: string, expectedTimestamp: number): Promise<{ success: boolean; error?: string }> {
    try {
      // Check multiple storage locations for verification
      const verifications = await Promise.allSettled([
        this.verifyStorageLocation('sync', expectedId, expectedTimestamp),
        this.verifyStorageLocation('local', expectedId, expectedTimestamp),
        this.verifyStorageLocation('backup', expectedId, expectedTimestamp)
      ]);

      // Count successful verifications
      const successfulVerifications = verifications.filter(v => v.status === 'fulfilled' && v.value.success);
      
      if (successfulVerifications.length === 0) {
        const errors = verifications.map(v => 
          v.status === 'rejected' ? v.reason.message : 
          (v.status === 'fulfilled' && !v.value.success ? v.value.error : 'Unknown error')
        );
        return { success: false, error: `No storage location verified successfully: ${errors.join(', ')}` };
      }

      logger.debug('ChromeStorage', `Save verification: ${successfulVerifications.length}/3 locations verified`);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Verify a specific storage location
   */
  private async verifyStorageLocation(location: 'sync' | 'local' | 'backup', expectedId: string, expectedTimestamp: number): Promise<{ success: boolean; error?: string }> {
    try {
      let result: any;
      const key = location === 'backup' ? this.BACKUP_KEY : this.STORAGE_KEY;

      if (location === 'sync') {
        result = await Promise.race([
          chrome.storage.sync.get(key),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Sync timeout')), this.GET_TIMEOUT_MS))
        ]);
      } else {
        result = await chrome.storage.local.get(key);
      }

      const data = result[key];
      if (!data) {
        return { success: false, error: `No data found in ${location} storage` };
      }

      if (data.id !== expectedId) {
        return { success: false, error: `ID mismatch in ${location}: expected ${expectedId}, got ${data.id}` };
      }

      // Check if timestamp is reasonably recent (within last 5 seconds)
      const timeDiff = Math.abs(data.timestamp - expectedTimestamp);
      if (timeDiff > 5000) {
        return { success: false, error: `Timestamp too old in ${location}: ${timeDiff}ms difference` };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Get memo with enhanced reliability (try all locations and choose most recent)
   * @returns Saved memo or undefined
   */
  async getMemo(): Promise<Memo | undefined> {
    const startTime = Date.now();
    logger.debug('ChromeStorage', 'Attempting to retrieve memo');
    
    try {
      // Try all storage locations in parallel and choose the most recent
      const retrievalPromises = [
        this.tryGetFromStorage('sync'),
        this.tryGetFromStorage('local'),
        this.tryGetFromStorage('backup')
      ];

      const results = await Promise.allSettled(retrievalPromises);
      const successfulResults = results
        .filter((result): result is PromiseFulfilledResult<{ data: any; location: string }> => 
          result.status === 'fulfilled' && result.value.data !== null
        )
        .map(result => result.value);

      if (successfulResults.length === 0) {
        const retrieveTime = Date.now() - startTime;
        logger.debug('ChromeStorage', `No memo found in any storage location (${retrieveTime}ms)`);
        return undefined;
      }

      // Choose the most recent data based on timestamp
      const mostRecent = successfulResults.reduce((latest, current) => {
        const currentTimestamp = current.data.timestamp || 0;
        const latestTimestamp = latest.data.timestamp || 0;
        return currentTimestamp > latestTimestamp ? current : latest;
      });

      const memo = this.createMemoFromData(mostRecent.data);
      const retrieveTime = Date.now() - startTime;
      
      logger.debug('ChromeStorage', `✓ Retrieved most recent memo from ${mostRecent.location} storage (${retrieveTime}ms)`);
      
      // If we found data in backup but not in primary locations, restore to primary
      if (mostRecent.location === 'backup') {
        logger.info('ChromeStorage', 'Restoring data from backup to primary storage locations');
        try {
          await this.saveMemo(memo);
        } catch (error) {
          logger.warn('ChromeStorage', 'Failed to restore from backup:', error);
        }
      }

      return memo;
      
    } catch (error) {
      const retrieveTime = Date.now() - startTime;
      logger.error('ChromeStorage', `Failed to get memo from Chrome storage (${retrieveTime}ms):`, error);
      throw new Error("Failed to retrieve memo");
    }
  }

  /**
   * Try to get data from a specific storage location
   */
  private async tryGetFromStorage(location: 'sync' | 'local' | 'backup'): Promise<{ data: any; location: string }> {
    const key = location === 'backup' ? this.BACKUP_KEY : this.STORAGE_KEY;
    
    try {
      let result: any;
      
      if (location === 'sync') {
        result = await Promise.race([
          chrome.storage.sync.get(key),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Sync timeout')), this.GET_TIMEOUT_MS))
        ]);
      } else {
        result = await chrome.storage.local.get(key);
      }

      const data = result[key];
      return { data: data || null, location };
    } catch (error) {
      logger.debug('ChromeStorage', `${location} retrieval failed: ${(error as Error).message}`);
      return { data: null, location };
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

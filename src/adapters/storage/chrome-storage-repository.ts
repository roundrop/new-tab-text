import { Memo, MemoFactory } from "../../core/entities/memo";
import { StorageRepository } from "../../core/ports/repositories";

/**
 * Implementation of storage repository using Chrome Storage API
 */
export class ChromeStorageRepository implements StorageRepository {
  private readonly STORAGE_KEY = "newTabText";
  private readonly BACKUP_KEY = "newTabText_backup";

  /**
   * Save memo (save to both sync and local)
   * @param memo Memo to save
   */
  async saveMemo(memo: Memo): Promise<void> {
    const memoData = {
      ...memo,
      lastSaved: new Date().toISOString(),
    };

    // Flags to record save results
    let syncSuccess = false;
    let localSuccess = false;
    let backupSuccess = false;

    try {
      // First save to sync (cross-device synchronization)
      await Promise.race([
        chrome.storage.sync.set({ [this.STORAGE_KEY]: memoData }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Sync timeout')), 3000))
      ]);
      syncSuccess = true;
      
    } catch (error) {
      // Silently handle sync storage save failure
    }

    try {
      // Save to local (main storage or fallback)
      await chrome.storage.local.set({ [this.STORAGE_KEY]: memoData });
      localSuccess = true;
      
    } catch (error) {
      // Silently handle local storage save failure
    }

    try {
      // Save to local with different key as backup
      await chrome.storage.local.set({ [this.BACKUP_KEY]: memoData });
      backupSuccess = true;
      
    } catch (error) {
      // Silently handle backup save failure
    }

    // Check if at least one storage operation succeeded
    if (!syncSuccess && !localSuccess && !backupSuccess) {
      const errorMsg = "Failed to save to all storage locations";
      console.error(errorMsg, {
        contentLength: memo.content.length,
        timestamp: new Date().toISOString()
      });
      throw new Error(errorMsg);
    }
  }

  /**
   * Get memo (try in order: sync -> local -> backup)
   * @returns Saved memo or undefined
   */
  async getMemo(): Promise<Memo | undefined> {
    try {
      // First try sync (with timeout)
      try {
        const result = await Promise.race([
          chrome.storage.sync.get(this.STORAGE_KEY),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Sync timeout')), 2000))
        ]) as any;
        
        const data = result[this.STORAGE_KEY];
        if (data) {
          return this.createMemoFromData(data);
        }
      } catch (error) {
        // Silently handle sync storage retrieval failure
      }

      // If not in sync, try local
      try {
        const result = await chrome.storage.local.get(this.STORAGE_KEY);
        const data = result[this.STORAGE_KEY];
        if (data) {
          return this.createMemoFromData(data);
        }
      } catch (error) {
        // Silently handle local storage retrieval failure
      }

      // If not in local either, try backup
      try {
        const result = await chrome.storage.local.get(this.BACKUP_KEY);
        const data = result[this.BACKUP_KEY];
        if (data) {
          return this.createMemoFromData(data);
        }
      } catch (error) {
        // Silently handle backup retrieval failure
      }

      return undefined;
      
    } catch (error) {
      console.error("Failed to get memo from Chrome storage:", error);
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

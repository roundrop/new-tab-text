import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChromeStorageRepository } from '../../src/adapters/storage/chrome-storage-repository';
import { MemoFactory } from '../../src/core/entities/memo';

// Mock Chrome API
const mockChrome = {
  storage: {
    sync: {
      set: vi.fn(),
      get: vi.fn(),
      getBytesInUse: vi.fn(),
      QUOTA_BYTES: 102400, // 100KB
    },
    local: {
      set: vi.fn(),
      get: vi.fn(),
      getBytesInUse: vi.fn(),
      QUOTA_BYTES: 5242880, // 5MB
    },
  },
  runtime: {
    sendMessage: vi.fn(),
    lastError: null,
  },
};

// Mock global chrome object
global.chrome = mockChrome as any;

describe('Storage Reliability Tests', () => {
  let repository: ChromeStorageRepository;

  beforeEach(() => {
    repository = new ChromeStorageRepository();
    vi.clearAllMocks();
    // Reset mock implementations
    mockChrome.storage.sync.set.mockResolvedValue(undefined);
    mockChrome.storage.local.set.mockResolvedValue(undefined);
    mockChrome.storage.sync.get.mockResolvedValue({});
    mockChrome.storage.local.get.mockResolvedValue({});
    mockChrome.storage.sync.getBytesInUse.mockResolvedValue(1000);
    mockChrome.storage.local.getBytesInUse.mockResolvedValue(2000);
    mockChrome.runtime.sendMessage.mockImplementation((message, callback) => {
      if (callback) callback({ status: 'active' });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Save Operation Reliability', () => {
    it('should save to both sync and local storage when data size allows', async () => {
      const memo = MemoFactory.create('Test content');
      
      await repository.saveMemo(memo);

      // Mock verification to return successful results
      mockChrome.storage.sync.get.mockResolvedValue({
        newTabText: expect.objectContaining({
          id: memo.id,
          content: memo.content,
          timestamp: memo.timestamp,
        }),
      });
      mockChrome.storage.local.get.mockResolvedValue({
        newTabText: expect.objectContaining({
          id: memo.id,
          content: memo.content,
          timestamp: memo.timestamp,
        }),
      });

      expect(mockChrome.storage.sync.set).toHaveBeenCalledWith({
        newTabText: expect.objectContaining({
          id: memo.id,
          content: memo.content,
          timestamp: memo.timestamp,
          lastSaved: expect.any(String),
        }),
      });

      expect(mockChrome.storage.local.set).toHaveBeenCalledTimes(2); // Main and backup
    });

    it('should handle sync storage failures gracefully', async () => {
      const memo = MemoFactory.create('Test content');
      
      // Mock sync storage failure
      mockChrome.storage.sync.set.mockRejectedValue(new Error('Sync failed'));

      await repository.saveMemo(memo);

      // Should still save to local storage
      expect(mockChrome.storage.local.set).toHaveBeenCalledTimes(2);
    });

    it('should not fail when all storage fails', async () => {
      const memo = MemoFactory.create('Test content');
      
      // Mock all storage failures
      mockChrome.storage.sync.set.mockRejectedValue(new Error('Sync failed'));
      mockChrome.storage.local.set.mockRejectedValue(new Error('Local failed'));

      await expect(repository.saveMemo(memo)).rejects.toThrow('Failed to save to all storage locations');
    });

    it('should skip sync storage for large content', async () => {
      // Create content larger than 8KB
      const largeContent = 'x'.repeat(10000);
      const memo = MemoFactory.create(largeContent);
      
      await repository.saveMemo(memo);

      // Sync storage should not be called for large content
      expect(mockChrome.storage.sync.set).not.toHaveBeenCalled();
      // Local storage should still be called
      expect(mockChrome.storage.local.set).toHaveBeenCalledTimes(2);
    });
  });

  describe('Retrieval Operation Reliability', () => {
    it('should retrieve from sync storage first', async () => {
      const testMemo = {
        id: 'test-id',
        content: 'Test content',
        timestamp: Date.now(),
      };

      mockChrome.storage.sync.get.mockResolvedValue({
        newTabText: testMemo,
      });

      const result = await repository.getMemo();

      expect(result).toEqual(expect.objectContaining({
        id: testMemo.id,
        content: testMemo.content,
        timestamp: testMemo.timestamp,
      }));
      expect(mockChrome.storage.sync.get).toHaveBeenCalledWith('newTabText');
    });

    it('should fallback to local storage when sync fails', async () => {
      const testMemo = {
        id: 'test-id',
        content: 'Test content',
        timestamp: Date.now(),
      };

      // Mock sync failure
      mockChrome.storage.sync.get.mockRejectedValue(new Error('Sync timeout'));
      mockChrome.storage.local.get.mockResolvedValueOnce({
        newTabText: testMemo,
      });

      const result = await repository.getMemo();

      expect(result).toEqual(expect.objectContaining({
        id: testMemo.id,
        content: testMemo.content,
        timestamp: testMemo.timestamp,
      }));
    });

    it('should choose most recent data when multiple sources have data', async () => {
      const olderMemo = {
        id: 'old-id',
        content: 'Old content',
        timestamp: Date.now() - 10000, // 10 seconds ago
      };

      const newerMemo = {
        id: 'new-id',
        content: 'New content',
        timestamp: Date.now(),
      };

      // Mock sync with older data
      mockChrome.storage.sync.get.mockResolvedValue({
        newTabText: olderMemo,
      });
      
      // Mock local with newer data
      mockChrome.storage.local.get.mockResolvedValueOnce({
        newTabText: newerMemo,
      }).mockResolvedValueOnce({
        newTabText_backup: olderMemo,
      });

      const result = await repository.getMemo();

      // Should return the newer memo
      expect(result).toEqual(expect.objectContaining({
        id: newerMemo.id,
        content: newerMemo.content,
        timestamp: newerMemo.timestamp,
      }));
    });

    it('should restore from backup when only backup has data', async () => {
      const backupMemo = {
        id: 'backup-id',
        content: 'Backup content',
        timestamp: Date.now(),
      };

      // Mock sync and local as empty
      mockChrome.storage.sync.get.mockResolvedValue({});
      mockChrome.storage.local.get.mockResolvedValueOnce({}).mockResolvedValueOnce({
        newTabText_backup: backupMemo,
      });

      const result = await repository.getMemo();

      expect(result).toEqual(expect.objectContaining({
        id: backupMemo.id,
        content: backupMemo.content,
        timestamp: backupMemo.timestamp,
      }));

      // Should attempt to restore to primary storage
      expect(mockChrome.storage.sync.set).toHaveBeenCalled();
      expect(mockChrome.storage.local.set).toHaveBeenCalled();
    });
  });

  describe('Service Worker Integration', () => {
    it('should check service worker status before saving', async () => {
      const memo = MemoFactory.create('Test content');
      
      await repository.saveMemo(memo);

      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith(
        { action: 'keepAlive' },
        expect.any(Function)
      );
    });

    it('should proceed with save even when service worker check fails', async () => {
      const memo = MemoFactory.create('Test content');
      
      // Mock service worker failure
      mockChrome.runtime.sendMessage.mockImplementation((message, callback) => {
        if (callback) {
          mockChrome.runtime.lastError = { message: 'Extension context invalidated' };
          callback(null);
        }
      });

      await repository.saveMemo(memo);

      // Should still attempt to save
      expect(mockChrome.storage.local.set).toHaveBeenCalled();
    });
  });
});
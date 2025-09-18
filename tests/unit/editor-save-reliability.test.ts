import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EditorUseCase } from '../../src/core/usecases/editor-usecase';
import { StorageRepository, EditorRepository, ThemeRepository } from '../../src/core/ports/repositories';

// Mock repositories
const mockStorageRepository = {
  saveMemo: vi.fn(),
  getMemo: vi.fn(),
} as StorageRepository;

const mockEditorRepository = {
  initializeEditor: vi.fn(),
  getContent: vi.fn(),
  setContent: vi.fn(),
  onContentChange: vi.fn(),
  setTheme: vi.fn(),
} as EditorRepository;

const mockThemeRepository = {
  isDarkMode: vi.fn(),
  setDarkMode: vi.fn(),
  onThemeChange: vi.fn(),
} as ThemeRepository;

// Mock Chrome API for synchronous save tests
const mockChrome = {
  storage: {
    sync: {
      set: vi.fn(),
    },
    local: {
      set: vi.fn(),
    },
  },
};

global.chrome = mockChrome as any;

// Mock crypto.randomUUID
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: () => 'test-uuid-123',
  },
  writable: true,
});

describe('Editor Save Reliability Tests', () => {
  let editorUseCase: EditorUseCase;

  beforeEach(() => {
    editorUseCase = new EditorUseCase(
      mockStorageRepository,
      mockEditorRepository,
      mockThemeRepository
    );
    
    vi.clearAllMocks();
    
    // Default mock implementations
    mockStorageRepository.getMemo.mockResolvedValue(undefined);
    mockStorageRepository.saveMemo.mockResolvedValue();
    mockEditorRepository.getContent.mockReturnValue('');
    mockThemeRepository.isDarkMode.mockReturnValue(false);
    mockChrome.storage.sync.set.mockImplementation(() => {});
    mockChrome.storage.local.set.mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Debounced Save Mechanism', () => {
    it('should debounce multiple rapid content changes', async () => {
      const mockElement = document.createElement('div');
      await editorUseCase.initialize(mockElement);

      // Get the content change callback
      const contentChangeCallback = mockEditorRepository.onContentChange.mock.calls[0][0];

      // Simulate rapid content changes
      mockEditorRepository.getContent.mockReturnValue('content1');
      contentChangeCallback('content1');
      
      mockEditorRepository.getContent.mockReturnValue('content2');
      contentChangeCallback('content2');
      
      mockEditorRepository.getContent.mockReturnValue('content3');
      contentChangeCallback('content3');

      // Wait for debounce timeout
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Should only save once with the latest content
      expect(mockStorageRepository.saveMemo).toHaveBeenCalledTimes(1);
      expect(mockStorageRepository.saveMemo).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'content3',
        })
      );
    });
  });

  describe('Force Save on Page Events', () => {
    it('should trigger save immediately on visibility change', async () => {
      const mockElement = document.createElement('div');
      await editorUseCase.initialize(mockElement);

      // Simulate content change
      const contentChangeCallback = mockEditorRepository.onContentChange.mock.calls[0][0];
      mockEditorRepository.getContent.mockReturnValue('unsaved content');
      contentChangeCallback('unsaved content');

      // Simulate page becoming hidden
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));

      // Should trigger immediate save
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(mockStorageRepository.saveMemo).toHaveBeenCalled();
    });

    it('should use synchronous save on pagehide event', async () => {
      const mockElement = document.createElement('div');
      await editorUseCase.initialize(mockElement);

      // Simulate content change
      const contentChangeCallback = mockEditorRepository.onContentChange.mock.calls[0][0];
      mockEditorRepository.getContent.mockReturnValue('content to save');
      contentChangeCallback('content to save');

      // Trigger pagehide event
      window.dispatchEvent(new Event('pagehide'));

      // Should call Chrome storage APIs directly (synchronous save)
      expect(mockChrome.storage.local.set).toHaveBeenCalledWith({
        newTabText: expect.objectContaining({
          content: 'content to save',
        }),
      });
    });

    it('should prompt user on beforeunload when there are unsaved changes', async () => {
      const mockElement = document.createElement('div');
      await editorUseCase.initialize(mockElement);

      // Simulate content change
      const contentChangeCallback = mockEditorRepository.onContentChange.mock.calls[0][0];
      mockEditorRepository.getContent.mockReturnValue('unsaved content');
      contentChangeCallback('unsaved content');

      // Create beforeunload event
      const beforeUnloadEvent = new Event('beforeunload') as BeforeUnloadEvent;
      
      // Mock event returnValue setter
      let returnValue: string | undefined;
      Object.defineProperty(beforeUnloadEvent, 'returnValue', {
        set: (value) => { returnValue = value; },
        get: () => returnValue,
        configurable: true
      });

      window.dispatchEvent(beforeUnloadEvent);

      // Should set return value to prompt user
      expect(returnValue).toBe('Unsaved changes may be lost. Are you sure you want to leave?');
    });
  });

  describe('Save Queue Management', () => {
    it('should handle concurrent save requests through queue', async () => {
      const mockElement = document.createElement('div');
      await editorUseCase.initialize(mockElement);

      // Mock a slow save operation
      mockStorageRepository.saveMemo.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 500))
      );

      const contentChangeCallback = mockEditorRepository.onContentChange.mock.calls[0][0];

      // Simulate rapid content changes that trigger force saves
      mockEditorRepository.getContent.mockReturnValue('content1');
      contentChangeCallback('content1');
      window.dispatchEvent(new Event('blur'));

      mockEditorRepository.getContent.mockReturnValue('content2');
      contentChangeCallback('content2');
      window.dispatchEvent(new Event('blur'));

      // Wait for queue processing
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Should handle queue properly without dropping saves
      expect(mockStorageRepository.saveMemo).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Handling', () => {
    it('should retry failed saves', async () => {
      const mockElement = document.createElement('div');
      await editorUseCase.initialize(mockElement);

      // Mock storage failure then success
      mockStorageRepository.saveMemo
        .mockRejectedValueOnce(new Error('Storage failed'))
        .mockRejectedValueOnce(new Error('Storage failed again'))
        .mockResolvedValueOnce();

      const contentChangeCallback = mockEditorRepository.onContentChange.mock.calls[0][0];
      mockEditorRepository.getContent.mockReturnValue('test content');
      contentChangeCallback('test content');

      // Wait for debounce and retries
      await new Promise(resolve => setTimeout(resolve, 8000));

      // Should retry multiple times
      expect(mockStorageRepository.saveMemo).toHaveBeenCalledTimes(3);
    });

    it('should continue operating after save failures', async () => {
      const mockElement = document.createElement('div');
      await editorUseCase.initialize(mockElement);

      // Mock storage failure
      mockStorageRepository.saveMemo.mockRejectedValue(new Error('Storage failed'));

      const contentChangeCallback = mockEditorRepository.onContentChange.mock.calls[0][0];
      
      // First save fails
      mockEditorRepository.getContent.mockReturnValue('failing content');
      contentChangeCallback('failing content');
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Reset mock to succeed
      mockStorageRepository.saveMemo.mockResolvedValue();

      // Second save should still work
      mockEditorRepository.getContent.mockReturnValue('working content');
      contentChangeCallback('working content');
      await new Promise(resolve => setTimeout(resolve, 1100));

      expect(mockStorageRepository.saveMemo).toHaveBeenCalledTimes(2);
    });
  });

  describe('Auto-save Intervals', () => {
    it('should auto-save at regular intervals when page is visible', async () => {
      const mockElement = document.createElement('div');
      await editorUseCase.initialize(mockElement);

      // Simulate content change
      const contentChangeCallback = mockEditorRepository.onContentChange.mock.calls[0][0];
      mockEditorRepository.getContent.mockReturnValue('auto-save content');
      contentChangeCallback('auto-save content');

      // Mock page as visible
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });

      // Wait for interval (30 seconds, but we'll use fake timers)
      vi.useFakeTimers();
      vi.advanceTimersByTime(30000);
      vi.useRealTimers();

      await new Promise(resolve => setTimeout(resolve, 100));

      // Should trigger auto-save
      expect(mockStorageRepository.saveMemo).toHaveBeenCalled();
    });
  });
});
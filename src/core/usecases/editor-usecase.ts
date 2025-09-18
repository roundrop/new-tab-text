import { logger } from "../../utils/logger";
import { Memo, MemoFactory } from "../entities/memo";
import {
  StorageRepository,
  EditorRepository,
  ThemeRepository,
} from "../ports/repositories";


/**
 * Use case for editor initialization and state management
 * Silent auto-save that doesn't disturb user focus
 */
export class EditorUseCase {
  private saveTimeout: NodeJS.Timeout | null = null;
  private readonly SAVE_DELAY_MS = 1000; // Save after 1 second
  private lastContent: string = '';
  private hasUnsavedChanges: boolean = false;
  private isPageVisible: boolean = true;
  
  // Enhanced save operation management
  private saveInProgress: boolean = false;
  private pendingSaveContent: string | null = null;
  private saveAttemptCount: number = 0;
  private readonly MAX_SAVE_RETRIES = 3;
  private readonly RETRY_DELAY_MS = 2000;
  
  // Save queue management
  private saveQueue: string[] = [];
  private queueProcessing: boolean = false;

  constructor(
    private storageRepository: StorageRepository,
    private editorRepository: EditorRepository,
    private themeRepository: ThemeRepository,
  ) {}

  /**
   * Initialize and configure the editor
   * @param editorElement DOM element to mount the editor
   */
  async initialize(editorElement: HTMLElement): Promise<void> {
    // Get memo from storage
    let memo = await this.storageRepository.getMemo();

    // Create new memo with default content if none exists
    if (!memo) {
      const defaultContent = this.getDefaultContent();
      memo = MemoFactory.create(defaultContent);
      await this.storageRepository.saveMemo(memo);
    }

    // Get theme state in advance and apply
    const isDarkMode = this.themeRepository.isDarkMode();
    
    // Initialize editor
    this.editorRepository.initializeEditor(editorElement, memo.content);

    // Apply theme (reapply after initialization to ensure it's reflected)
    this.editorRepository.setTheme(isDarkMode);

    // Record initial content (used for unsaved changes detection)
    this.lastContent = memo.content;
    this.hasUnsavedChanges = false;

    // Set up change monitoring
    this.setupChangeListeners();
    
    // Set up visibility change and browser event monitoring
    this.setupVisibilityAndUnloadHandlers();
  }

  /**
   * Get default content
   * @returns Default sample content based on user's language environment
   */
  private getDefaultContent(): string {
    // Get browser language settings
    const userLanguage = this.getUserLanguage();
    
    if (userLanguage === 'ja') {
      return this.getJapaneseContent();
    } else {
      return this.getEnglishContent();
    }
  }

  /**
   * Get user's language setting
   * @returns 'ja' or 'en'
   */
  private getUserLanguage(): 'ja' | 'en' {
    // Get language from navigator.language or navigator.languages[0]
    const browserLanguage = navigator.language || navigator.languages?.[0];
    
    // Return 'ja' for Japanese
    if (browserLanguage?.startsWith('ja')) {
      return 'ja';
    }
    
    // Treat everything else as English
    return 'en';
  }

  /**
   * Japanese default content
   * @returns Japanese sample content
   */
  private getJapaneseContent(): string {
    return `# New Tab Text へようこそ！

これは新規タブをテキストエディタとして使用できるChrome拡張機能です。
タイピングを始めると、自動的に保存されます。

## マークダウンをサポートしています

- **太字**、*斜体*、~~取り消し線~~
- [リンク](https://example.com)
- リスト項目

\`\`\`
コードブロックも使えます
\`\`\`

> 引用ブロック

-----

お好みに合わせてテーマを切り替えることもできます。
右上のボタンをクリックしてみてください！
`;
  }

  /**
   * English default content
   * @returns English sample content
   */
  private getEnglishContent(): string {
    return `# Welcome to New Tab Text!

This is a Chrome extension that transforms your new tab into a text editor.
Your content is automatically saved as you type.

## Markdown Support

- **Bold**, *italic*, ~~strikethrough~~
- [Links](https://example.com)
- List items

\`\`\`
Code blocks work too
\`\`\`

> Quote blocks

-----

You can also switch themes to match your preference.
Try clicking the button in the top-right corner!
`;
  }

  /**
   * Set up change listeners
   */
  private setupChangeListeners(): void {
    // Handle editor content changes (with debouncing)
    this.editorRepository.onContentChange((content) => {
      this.hasUnsavedChanges = (content !== this.lastContent);
      this.debouncedSave(content);
    });

    // Handle theme changes
    this.themeRepository.onThemeChange((isDark) => {
      this.editorRepository.setTheme(isDark);
    });
  }

  /**
   * Set up page visibility change and browser event monitoring
   * Ensure auto-save executes when tab becomes inactive
   */
  private setupVisibilityAndUnloadHandlers(): void {
    // Handle page visibility changes
    document.addEventListener('visibilitychange', () => {
      this.isPageVisible = !document.hidden;
      
      if (document.hidden && this.hasUnsavedChanges) {
        // Save immediately when tab becomes inactive if there are unsaved changes
        this.forceSave();
      }
    });

    // Handle page hide (more reliable than beforeunload for saving)
    window.addEventListener('pagehide', () => {
      if (this.hasUnsavedChanges) {
        // Use synchronous save for page hide to ensure data is saved
        this.synchronousSave();
      }
    });

    // Handle before page unload (as backup)
    window.addEventListener('beforeunload', () => {
      if (this.hasUnsavedChanges) {
        // Try to save, but don't rely on this due to async nature
        this.synchronousSave();
        // Set a return value to trigger browser confirmation if save might fail
        return 'Unsaved changes may be lost. Are you sure you want to leave?';
      }
    });

    // Handle when page loses focus
    window.addEventListener('blur', () => {
      if (this.hasUnsavedChanges) {
        // Save when window loses focus if there are unsaved changes
        this.forceSave();
      }
    });

    // Auto-save at regular intervals (as backup)
    setInterval(() => {
      if (this.hasUnsavedChanges && this.isPageVisible) {
        this.forceSave();
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Debounced save process with queue management
   * @param content Content to save
   */
  private debouncedSave(content: string): void {
    // Add content to pending queue
    this.pendingSaveContent = content;
    
    // Cancel previous timer
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    // Set new timer
    this.saveTimeout = setTimeout(async () => {
      await this.processSave();
    }, this.SAVE_DELAY_MS);
  }

  /**
   * Process save operation with queue and retry logic
   */
  private async processSave(): Promise<void> {
    // If save is already in progress, just update the pending content
    if (this.saveInProgress) {
      logger.info('EditorUseCase', 'Save in progress, content queued');
      return;
    }

    if (!this.pendingSaveContent) {
      return;
    }

    const contentToSave = this.pendingSaveContent;
    this.pendingSaveContent = null;
    this.saveTimeout = null;
    
    await this.executeSaveWithRetry(contentToSave);
  }

  /**
   * Execute save with retry logic
   */
  private async executeSaveWithRetry(content: string, isRetry: boolean = false): Promise<void> {
    this.saveInProgress = true;
    const startTime = Date.now();
    
    try {
      logger.info('EditorUseCase', `${isRetry ? 'Retrying' : 'Starting'} save operation (${content.length} chars)`);
      
      await this.saveContent(content);
      
      // Save successful
      this.lastContent = content;
      this.hasUnsavedChanges = false;
      this.saveAttemptCount = 0; // Reset retry counter
      
      const saveTime = Date.now() - startTime;
      logger.debug('EditorUseCase', `Save successful (${saveTime}ms)`);
      
    } catch (error) {
      logger.error('EditorUseCase', `Save failed:`, error);
      
      // Retry logic
      this.saveAttemptCount++;
      if (this.saveAttemptCount <= this.MAX_SAVE_RETRIES) {
        logger.warn('EditorUseCase', `Scheduling retry ${this.saveAttemptCount}/${this.MAX_SAVE_RETRIES} in ${this.RETRY_DELAY_MS}ms`);
        
        setTimeout(() => {
          this.executeSaveWithRetry(content, true);
        }, this.RETRY_DELAY_MS);
        
        return; // Don't clear saveInProgress flag yet
      } else {
        logger.error('EditorUseCase', `All save retries exhausted`);
        this.saveAttemptCount = 0; // Reset for next attempt
      }
    } finally {
      // Process any pending content that accumulated during save
      if (this.pendingSaveContent && this.pendingSaveContent !== content) {
        logger.debug('EditorUseCase', 'Processing queued content');
        setTimeout(() => this.processSave(), 100);
      }
    }
    
    // Reset saveInProgress only after retries are exhausted or save is successful
    if (!isRetry || this.saveAttemptCount > this.MAX_SAVE_RETRIES) {
      this.saveInProgress = false;
    }
  }

  /**
   * Execute synchronous save for critical save points (page hide, unload)
   * Uses synchronous Chrome API calls to ensure data is saved
   */
  private synchronousSave(): void {
    try {
      const currentContent = this.editorRepository.getContent();
      
      // If content hasn't changed, no need to save
      if (currentContent === this.lastContent) {
        logger.debug('EditorUseCase', 'No changes detected, skipping synchronous save');
        return;
      }

      logger.saveInfo('EditorUseCase', 'Executing synchronous save for page unload');
      
      // Create memo data
      const memo = {
        id: crypto.randomUUID(),
        content: currentContent,
        timestamp: Date.now(),
        lastSaved: new Date().toISOString(),
      };

      // Save to multiple storage locations synchronously
      try {
        // Try sync storage first (if content is small enough)
        const dataSize = new Blob([JSON.stringify(memo)]).size;
        if (dataSize <= 8192) { // 8KB limit for sync storage
          chrome.storage.sync.set({ newTabText: memo });
          logger.debug('EditorUseCase', 'Synchronous save to sync storage completed');
        }
      } catch (error) {
        logger.warn('EditorUseCase', 'Sync storage failed during synchronous save:', error);
      }

      try {
        // Always save to local storage as backup
        chrome.storage.local.set({ newTabText: memo });
        chrome.storage.local.set({ newTabText_backup: memo });
        logger.debug('EditorUseCase', 'Synchronous save to local storage completed');
      } catch (error) {
        logger.error('EditorUseCase', 'Local storage failed during synchronous save:', error);
      }

      // Update internal state
      this.lastContent = currentContent;
      this.hasUnsavedChanges = false;
      
    } catch (error) {
      logger.error('EditorUseCase', 'Synchronous save failed:', error);
    }
  }

  /**
   * Execute save immediately (without debouncing)
   * Used when tab becomes inactive or when leaving page
   */
  private async forceSave(): Promise<void> {
    logger.debug('EditorUseCase', 'Force save triggered');
    
    // Cancel pending debounced timer
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }

    const currentContent = this.editorRepository.getContent();
    
    // If content hasn't changed, no need to save
    if (currentContent === this.lastContent) {
      logger.debug('EditorUseCase', 'No changes detected, skipping force save');
      return;
    }

    // Add to save queue to ensure content is saved
    this.addToSaveQueue(currentContent);
    
    // Process queue immediately
    await this.processSaveQueue();
  }

  /**
   * Add content to save queue
   */
  private addToSaveQueue(content: string): void {
    // Only keep the latest content in queue
    this.saveQueue = [content];
    logger.debug('EditorUseCase', `Added content to save queue (${content.length} chars)`);
  }

  /**
   * Process save queue with priority handling
   */
  private async processSaveQueue(): Promise<void> {
    if (this.queueProcessing || this.saveQueue.length === 0) {
      return;
    }

    this.queueProcessing = true;
    logger.debug('EditorUseCase', `Processing save queue (${this.saveQueue.length} items)`);

    try {
      while (this.saveQueue.length > 0) {
        const contentToSave = this.saveQueue.shift()!;
        
        // If there's a save in progress, wait with shorter timeout for force saves
        if (this.saveInProgress) {
          logger.info('EditorUseCase', 'Waiting for current save to complete');
          
          const maxWaitTime = 2000; // 2 seconds for queue processing
          const startWait = Date.now();
          
          while (this.saveInProgress && (Date.now() - startWait) < maxWaitTime) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
          
          if (this.saveInProgress) {
            logger.warn('EditorUseCase', 'Timeout waiting for save, executing anyway');
            // Continue with save attempt
          }
        }

        try {
          await this.executeSaveWithRetry(contentToSave);
          logger.debug('EditorUseCase', 'Save queue item processed successfully');
        } catch (error) {
          logger.error('EditorUseCase', 'Save queue item failed:', error);
          // Continue processing other items in queue
        }
      }
    } finally {
      this.queueProcessing = false;
      logger.debug('EditorUseCase', 'Save queue processing completed');
    }
  }

  /**
   * Save content
   * @param content Content to save
   */
  private async saveContent(content: string): Promise<void> {
    try {
      const memo = await this.storageRepository.getMemo();
      if (memo) {
        const updatedMemo: Memo = {
          ...memo,
          content,
          timestamp: Date.now(),
        };
        await this.storageRepository.saveMemo(updatedMemo);
      } else {
        // Create new memo if none exists
        const newMemo = MemoFactory.create(content);
        await this.storageRepository.saveMemo(newMemo);
      }
    } catch (error) {
      // Log detailed save error information
      logger.error('EditorUseCase', 'Error occurred in saveContent:', {
        error: error,
        contentLength: content.length,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Toggle theme
   */
  toggleTheme(): void {
    const currentTheme = this.themeRepository.isDarkMode();
    this.themeRepository.setDarkMode(!currentTheme);
  }
}

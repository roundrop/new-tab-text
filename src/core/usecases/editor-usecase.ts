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

    // Handle before page unload
    window.addEventListener('beforeunload', () => {
      if (this.hasUnsavedChanges) {
        // Save unsaved changes before leaving the page
        this.forceSave();
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
   * Debounced save process
   * @param content Content to save
   */
  private debouncedSave(content: string): void {
    // Cancel previous timer
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    // Set new timer
    this.saveTimeout = setTimeout(async () => {
      try {
        await this.saveContent(content);
        this.lastContent = content;
        this.hasUnsavedChanges = false;
        // Silent save - don't notify user
      } catch (error) {
        // Only log errors to console (don't show to user)
        console.error('Save failed:', error);
      }
      this.saveTimeout = null;
    }, this.SAVE_DELAY_MS);
  }

  /**
   * Execute save immediately (without debouncing)
   * Used when tab becomes inactive or when leaving page
   */
  private async forceSave(): Promise<void> {
    // Cancel pending debounced timer
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }

    try {
      const currentContent = this.editorRepository.getContent();
      if (currentContent !== this.lastContent) {
        await this.saveContent(currentContent);
        this.lastContent = currentContent;
        this.hasUnsavedChanges = false;
      }
    } catch (error) {
      console.error('Force save failed:', error);
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
      console.error('Error occurred in saveContent:', {
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

  /**
   * Get debug information (function available in console)
   * @returns Current state information
   */
  getDebugInfo(): any {
    return {
      lastContent: this.lastContent,
      hasUnsavedChanges: this.hasUnsavedChanges,
      isPageVisible: this.isPageVisible,
      hasPendingSave: this.saveTimeout !== null,
      currentContent: this.editorRepository.getContent(),
      contentLength: this.editorRepository.getContent().length,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Manually execute force save (for debugging)
   */
  async debugSave(): Promise<void> {
    await this.forceSave();
  }
}

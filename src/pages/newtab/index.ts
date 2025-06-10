import './style.css';
import './heading-styles.css';
import './heading-reset.css';
import './heading-reset-extreme.css';

// Core
import { EditorUseCase } from '../../core/usecases/editor-usecase';

// Adapters
import { ChromeStorageRepository } from '../../adapters/storage/chrome-storage-repository';
import { CodeMirrorRepository } from '../../adapters/editor/codemirror-repository';
import { LocalThemeRepository } from '../../adapters/theme/local-theme-repository';

// Infrastructure
import { UIManager } from '../../infrastructure/ui/ui-manager';

/**
 * New Tab Text application entry point
 */
class NewTabTextApp {
  private editorUseCase: EditorUseCase;
  private uiManager: UIManager;

  constructor() {
    // Create repository instances
    const storageRepository = new ChromeStorageRepository();
    const editorRepository = new CodeMirrorRepository();
    const themeRepository = new LocalThemeRepository();
    this.uiManager = new UIManager();

    // Create use case instance
    this.editorUseCase = new EditorUseCase(
      storageRepository,
      editorRepository,
      themeRepository
    );

    // Start initialization when DOM is loaded
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.initialize());
    } else {
      this.initialize();
    }
  }

  /**
   * Initialize the application
   */
  private async initialize(): Promise<void> {
    try {
      // 開発環境でのみインジケーターを表示
      if (__DEV__) {
        this.createDevIndicator();
      }

      // Get DOM elements
      const editorElement = document.getElementById('editor');
      if (!editorElement) {
        throw new Error('Editor element not found');
      }

      // Initialize UI manager
      this.uiManager.initialize(() => {
        this.editorUseCase.toggleTheme();
      });

      // Initialize editor
      await this.editorUseCase.initialize(editorElement);

      // Expose to global scope for debugging
      (window as any).newTabTextDebug = {
        getInfo: () => this.editorUseCase.getDebugInfo(),
        forceSave: () => this.editorUseCase.debugSave(),
        version: '1.1.0'
      };

      console.log('New Tab Text application initialized');
    } catch (error) {
      console.error('New Tab Text initialization failed:', error);
    }
  }

  /**
   * 開発版インジケーターを作成する
   */
  private createDevIndicator(): void {
    const indicator = document.createElement('div');
    indicator.textContent = 'DEV';
    indicator.style.cssText = `
      position: fixed;
      top: 10px;
      left: 10px;
      background: #ff6b6b;
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      z-index: 1000;
      font-family: monospace;
    `;
    document.body.appendChild(indicator);
  }
}

// Create application instance
new NewTabTextApp();

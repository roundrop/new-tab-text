import { ThemeRepository } from "../../core/ports/repositories";
import { logger } from "../../utils/logger";

/**
 * Implementation of theme repository using local storage and system settings
 */
export class LocalThemeRepository implements ThemeRepository {
  private readonly THEME_KEY = "newTabTextTheme";
  private listeners: ((isDark: boolean) => void)[] = [];
  private localStorageAvailable: boolean = true;

  constructor() {
    // Check localStorage availability
    this.checkLocalStorageAvailability();
    
    // Apply initial theme settings early
    this.applyInitialTheme();
    
    // Detect system theme changes
    this.setupSystemThemeListener();
  }

  /**
   * Check if localStorage is available and working
   */
  private checkLocalStorageAvailability(): void {
    try {
      const testKey = 'newTabText_storage_test';
      localStorage.setItem(testKey, 'test');
      localStorage.removeItem(testKey);
      this.localStorageAvailable = true;
      logger.debug('LocalThemeRepository', 'localStorage is available');
    } catch (error) {
      this.localStorageAvailable = false;
      logger.warn('LocalThemeRepository', 'localStorage is not available:', error);
    }
  }

  /**
   * Apply initial theme
   */
  private applyInitialTheme(): void {
    const isDarkMode = this.isDarkMode();
    const theme = isDarkMode ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", theme);
  }

  /**
   * Set up system theme change listener
   */
  private setupSystemThemeListener(): void {
    if (window.matchMedia) {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

      // Use system settings if no initial value is saved
      if (this.getStoredTheme() === null) {
        this.setDarkMode(mediaQuery.matches);
      }

      // Handle when system settings change
      mediaQuery.addEventListener("change", (e) => {
        // Follow system settings only when there's no explicit setting in local storage
        if (this.getStoredTheme() === null) {
          this.setDarkMode(e.matches);
        }
      });
    }
  }

  /**
   * Safely get stored theme value
   */
  private getStoredTheme(): string | null {
    if (!this.localStorageAvailable) {
      return null;
    }
    
    try {
      return localStorage.getItem(this.THEME_KEY);
    } catch (error) {
      logger.warn('LocalThemeRepository', 'Failed to read from localStorage:', error);
      this.localStorageAvailable = false;
      return null;
    }
  }

  /**
   * Safely set stored theme value
   */
  private setStoredTheme(theme: string): boolean {
    if (!this.localStorageAvailable) {
      logger.warn('LocalThemeRepository', 'localStorage not available, theme not persisted');
      return false;
    }
    
    try {
      localStorage.setItem(this.THEME_KEY, theme);
      return true;
    } catch (error) {
      logger.error('LocalThemeRepository', 'Failed to write to localStorage:', error);
      
      // Check if it's a quota exceeded error
      if (error instanceof Error && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
        logger.warn('LocalThemeRepository', 'localStorage quota exceeded');
      }
      
      this.localStorageAvailable = false;
      return false;
    }
  }

  /**
   * Get current theme
   * @returns Whether theme is dark mode
   */
  isDarkMode(): boolean {
    const savedTheme = this.getStoredTheme();

    // Use saved theme if available
    if (savedTheme !== null) {
      return savedTheme === "dark";
    }

    // Otherwise use system settings
    if (window.matchMedia) {
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }

    // Fallback
    return false;
  }

  /**
   * Set theme
   * @param isDark Whether dark mode or not
   */
  setDarkMode(isDark: boolean): void {
    const theme = isDark ? "dark" : "light";
    
    // Try to save to localStorage (may fail, but theme will still work)
    const saveResult = this.setStoredTheme(theme);
    
    if (!saveResult) {
      logger.warn('LocalThemeRepository', 'Theme preference could not be saved, will revert to system default on next load');
    }

    // Set data attribute to DOM (this always works)
    document.documentElement.setAttribute("data-theme", theme);

    // Notify listeners
    this.notifyListeners(isDark);
    
    logger.debug('LocalThemeRepository', `Theme set to ${theme} (saved: ${saveResult})`);
  }

  /**
   * Register callback for theme changes
   * @param callback Callback function to call on change
   */
  onThemeChange(callback: (isDark: boolean) => void): void {
    this.listeners.push(callback);
  }

  /**
   * Notify registered listeners
   * @param isDark Whether dark mode or not
   */
  private notifyListeners(isDark: boolean): void {
    this.listeners.forEach((listener) => {
      try {
        listener(isDark);
      } catch (error) {
        logger.error('LocalThemeRepository', 'Error in theme change listener:', error);
      }
    });
  }
}

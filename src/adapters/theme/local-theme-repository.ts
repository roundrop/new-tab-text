import { ThemeRepository } from "../../core/ports/repositories";

/**
 * Implementation of theme repository using local storage and system settings
 */
export class LocalThemeRepository implements ThemeRepository {
  private readonly THEME_KEY = "newTabTextTheme";
  private listeners: ((isDark: boolean) => void)[] = [];

  constructor() {
    // Apply initial theme settings early
    this.applyInitialTheme();
    
    // Detect system theme changes
    this.setupSystemThemeListener();
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
      if (localStorage.getItem(this.THEME_KEY) === null) {
        this.setDarkMode(mediaQuery.matches);
      }

      // Handle when system settings change
      mediaQuery.addEventListener("change", (e) => {
        // Follow system settings only when there's no explicit setting in local storage
        if (localStorage.getItem(this.THEME_KEY) === null) {
          this.setDarkMode(e.matches);
        }
      });
    }
  }

  /**
   * Get current theme
   * @returns Whether theme is dark mode
   */
  isDarkMode(): boolean {
    const savedTheme = localStorage.getItem(this.THEME_KEY);

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
    localStorage.setItem(this.THEME_KEY, theme);

    // Set data attribute to DOM
    document.documentElement.setAttribute("data-theme", theme);

    // Notify listeners
    this.notifyListeners(isDark);
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
    this.listeners.forEach((listener) => listener(isDark));
  }
}

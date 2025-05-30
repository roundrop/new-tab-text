/**
 * Class to manage UI components
 * Manages only theme toggle functionality
 */
export class UIManager {
  private themeToggleButton: HTMLButtonElement | null = null;

  /**
   * Initialize UI
   * @param toggleThemeCallback Callback to call when toggling theme
   */
  initialize(toggleThemeCallback: () => void): void {
    this.setupThemeToggleButton(toggleThemeCallback);
  }

  /**
   * Set up theme toggle button
   * @param callback Callback to call on click
   */
  private setupThemeToggleButton(callback: () => void): void {
    this.themeToggleButton = document.getElementById('theme-toggle') as HTMLButtonElement;
    
    if (!this.themeToggleButton) {
      console.warn('Theme toggle button DOM element not found');
      return;
    }

    // Set click event
    this.themeToggleButton.addEventListener('click', () => {
      callback();
      this.updateThemeIcon();
    });

    // Set initial icon
    this.updateThemeIcon();
  }

  /**
   * Get icon based on current theme
   * @returns Icon SVG string
   */
  private getThemeIcon(): string {
    const isDarkMode =
      document.documentElement.getAttribute("data-theme") === "dark";

    if (isDarkMode) {
      // Sun icon (switch to light mode)
      return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="5"></circle>
        <line x1="12" y1="1" x2="12" y2="3"></line>
        <line x1="12" y1="21" x2="12" y2="23"></line>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
        <line x1="1" y1="12" x2="3" y2="12"></line>
        <line x1="21" y1="12" x2="23" y2="12"></line>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
      </svg>`;
    } else {
      // Moon icon (switch to dark mode)
      return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
      </svg>`;
    }
  }

  /**
   * Update icon when theme changes
   */
  updateThemeIcon(): void {
    if (this.themeToggleButton) {
      this.themeToggleButton.innerHTML = this.getThemeIcon();
    }
  }
}

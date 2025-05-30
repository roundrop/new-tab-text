/**
 * Chrome API integration helper class
 * Manages integration with Chrome extension APIs
 */
export class ChromeIntegration {
  /**
   * Send keepAlive message to background process
   * Used to activate service worker when needed
   */
  static sendKeepAliveMessage(): void {
    try {
      chrome.runtime.sendMessage({ action: "keepAlive" }, (response) => {
        if (chrome.runtime.lastError) {
          console.info(
            "Keep alive message failed, but this is usually not an issue.",
          );
          return;
        }
        console.info("Background service worker status:", response?.status);
      });
    } catch (error) {
      console.warn("Failed to send keep alive message:", error);
    }
  }

  /**
   * Extension startup process
   * Note service worker lifecycle in Manifest V3
   */
  static initialize(): void {
    // Periodically keep background process active
    setInterval(this.sendKeepAliveMessage, 25000); // Execute every 25 seconds

    // Initial execution
    this.sendKeepAliveMessage();

    // Event to save last data just before tab is closed
    window.addEventListener("beforeunload", () => {
      this.sendKeepAliveMessage();
    });
  }

  /**
   * Start monitoring Chrome's system theme settings
   * @param callback Callback to call when system theme changes
   */
  static setupSystemThemeListener(
    callback: (isDarkMode: boolean) => void,
  ): void {
    if (window.matchMedia) {
      const colorSchemeQuery = window.matchMedia(
        "(prefers-color-scheme: dark)",
      );

      // Call callback with current value
      callback(colorSchemeQuery.matches);

      // Monitor changes
      colorSchemeQuery.addEventListener("change", (e) => {
        callback(e.matches);
      });
    }
  }
}

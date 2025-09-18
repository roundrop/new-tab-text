/**
 * Log levels enum
 */
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

/**
 * Environment-aware logger for New Tab Text
 */
class Logger {
  private readonly isDev: boolean;
  private readonly logLevel: LogLevel;

  constructor() {
    // Check if we're in development mode
    this.isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV === 'development';
    
    // Set log level based on environment
    this.logLevel = this.isDev ? LogLevel.DEBUG : LogLevel.WARN;
  }

  /**
   * Log error messages (always shown)
   */
  error(component: string, message: string, ...args: any[]): void {
    if (this.logLevel >= LogLevel.ERROR) {
      console.error(`[NewTabText:${component}] ${message}`, ...args);
    }
  }

  /**
   * Log warning messages (shown in development and production)
   */
  warn(component: string, message: string, ...args: any[]): void {
    if (this.logLevel >= LogLevel.WARN) {
      console.warn(`[NewTabText:${component}] ${message}`, ...args);
    }
  }

  /**
   * Log info messages (shown only in development, except for save-related critical info)
   */
  info(component: string, message: string, ...args: any[]): void {
    if (this.logLevel >= LogLevel.INFO) {
      console.log(`[NewTabText:${component}] ${message}`, ...args);
    }
    // Show critical save-related info messages even in production
    else if (this.isCriticalSaveMessage(component, message)) {
      console.log(`[NewTabText:${component}] ${message}`, ...args);
    }
  }

  /**
   * Log save-related critical info (always shown regardless of environment)
   */
  saveInfo(component: string, message: string, ...args: any[]): void {
    console.log(`[NewTabText:${component}] SAVE: ${message}`, ...args);
  }

  /**
   * Log debug messages (shown only in development)
   */
  debug(component: string, message: string, ...args: any[]): void {
    if (this.logLevel >= LogLevel.DEBUG) {
      console.log(`[NewTabText:${component}] ${message}`, ...args);
    }
  }

  /**
   * Check if message is critical save-related info that should be shown in production
   */
  private isCriticalSaveMessage(component: string, message: string): boolean {
    const criticalKeywords = [
      'save failed', 'save verification failed', 'synchronous save',
      'restoring data from backup', 'service worker may not be active',
      'all save retries exhausted', 'force save triggered'
    ];
    
    return (component === 'ChromeStorage' || component === 'EditorUseCase') &&
           criticalKeywords.some(keyword => message.toLowerCase().includes(keyword));
  }

  /**
   * Get current environment info
   */
  getEnvironmentInfo(): { isDev: boolean; logLevel: string } {
    return {
      isDev: this.isDev,
      logLevel: LogLevel[this.logLevel]
    };
  }
}

// Export singleton instance
export const logger = new Logger();

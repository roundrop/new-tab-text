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
   * Log info messages (shown only in development)
   */
  info(component: string, message: string, ...args: any[]): void {
    if (this.logLevel >= LogLevel.INFO) {
      console.log(`[NewTabText:${component}] ${message}`, ...args);
    }
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

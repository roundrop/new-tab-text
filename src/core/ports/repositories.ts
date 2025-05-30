import { Memo } from "../entities/memo";

/**
 * ストレージリポジトリのインターフェース
 * メモの保存と取得の抽象化
 */
export interface StorageRepository {
  /**
   * メモを保存する
   * @param memo 保存するメモ
   */
  saveMemo(memo: Memo): Promise<void>;

  /**
   * メモを取得する
   * @returns 保存されているメモ、または undefined
   */
  getMemo(): Promise<Memo | undefined>;
}

/**
 * エディタリポジトリのインターフェース
 * エディタ状態の管理の抽象化
 */
export interface EditorRepository {
  /**
   * エディタを初期化する
   * @param element エディタをマウントするDOM要素
   * @param initialContent 初期コンテンツ
   */
  initializeEditor(element: HTMLElement, initialContent: string): void;

  /**
   * エディタの内容を取得
   * @returns エディタの現在の内容
   */
  getContent(): string;

  /**
   * Set editor content
   * @param content Content to set
   */
  setContent(content: string): void;

  /**
   * Register callback for editor changes
   * @param callback Callback function to call on change
   */
  onContentChange(callback: (content: string) => void): void;

  /**
   * Set theme
   * @param isDark Whether dark mode or not
   */
  setTheme(isDark: boolean): void;
}

/**
 * Theme repository interface
 * Abstraction for theme management
 */
export interface ThemeRepository {
  /**
   * Get current theme
   * @returns Whether theme is dark mode
   */
  isDarkMode(): boolean;

  /**
   * Set theme
   * @param isDark Whether dark mode or not
   */
  setDarkMode(isDark: boolean): void;

  /**
   * Register callback for theme changes
   * @param callback Callback function to call on change
   */
  onThemeChange(callback: (isDark: boolean) => void): void;
}

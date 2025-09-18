import { EditorView } from "@codemirror/view";

import { EditorRepository } from "../../core/ports/repositories";
import { setupCodeMirror, setEditorTheme, addChangeListener, getEditorContent, setEditorContent } from "../../infrastructure/editor/codemirror-setup";

/**
 * Implementation of editor repository using CodeMirror 6
 */
export class CodeMirrorRepository implements EditorRepository {
  private view: EditorView | null = null;

  /**
   * Initialize the editor
   * @param element DOM element to mount the editor
   * @param initialContent Initial content
   */
  initializeEditor(element: HTMLElement, initialContent: string): void {
    // Get system dark mode settings
    const isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches ||
                      document.documentElement.getAttribute('data-theme') === 'dark';

    // Set up CodeMirror editor
    this.view = setupCodeMirror(element, initialContent, isDarkMode);
  }

  /**
   * Get editor content
   * @returns Current editor content
   */
  getContent(): string {
    if (!this.view) {
      return "";
    }
    return getEditorContent(this.view);
  }

  /**
   * Set editor content
   * @param content Content to set
   */
  setContent(content: string): void {
    if (!this.view) {
      return;
    }
    setEditorContent(this.view, content);
  }

  /**
   * Register callback for editor changes
   * @param callback Callback function to call on change
   */
  onContentChange(callback: (content: string) => void): void {
    if (!this.view) {
      return;
    }
    addChangeListener(this.view, callback);
  }

  /**
   * Set theme
   * @param isDark Whether dark mode or not
   */
  setTheme(isDark: boolean): void {
    if (!this.view) {
      return;
    }
    setEditorTheme(this.view, isDark);
  }
}

import { EditorState, Extension, StateEffect } from '@codemirror/state';
import { 
  EditorView, 
  keymap, 
  lineNumbers, 
  highlightActiveLine,
  highlightSpecialChars
} from '@codemirror/view';
import { 
  defaultKeymap, 
  history, 
  historyKeymap,
  indentWithTab
} from '@codemirror/commands';
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { markdown } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { tags } from '@lezer/highlight';


// Chromium IME bug fix
// Apply minimal settings only to resolve Japanese input issues
// @ts-ignore
EditorView.EDIT_CONTEXT = false; // Recommended fix from article

/**
 * Function to set up CodeMirror editor
 * 
 * @param element DOM element to mount the editor
 * @param initialContent Initial content
 * @param isDarkMode Whether dark mode or not
 * @returns Configured editor view
 */
export function setupCodeMirror(
  element: HTMLElement,
  initialContent: string = '',
  isDarkMode: boolean = false
): EditorView {
  // Create editor extensions
  const extensions = createExtensions(isDarkMode);
  
  // Create editor state
  const state = EditorState.create({
    doc: initialContent,
    extensions,
  });
  
  // Create editor view and mount to DOM
  return new EditorView({
    state,
    parent: element,
  });
}

/**
 * Light mode markdown highlight style
 */
const lightMarkdownHighlightStyle = HighlightStyle.define([
  // Special handling for headings with forced style reset
  { tag: tags.heading, fontWeight: "bold", textDecoration: "none !important", color: "#212529" },
  { tag: tags.heading1, fontSize: "1.8em", fontWeight: "bold", textDecoration: "none !important", color: "#212529" },
  { tag: tags.heading2, fontSize: "1.5em", fontWeight: "bold", textDecoration: "none !important", color: "#212529" },
  { tag: tags.heading3, fontSize: "1.3em", fontWeight: "bold", textDecoration: "none !important", color: "#212529" },
  { tag: tags.heading4, fontSize: "1.2em", fontWeight: "bold", textDecoration: "none !important", color: "#212529" },
  { tag: tags.heading5, fontSize: "1.1em", fontWeight: "bold", textDecoration: "none !important", color: "#212529" },
  { tag: tags.heading6, fontSize: "1em", fontWeight: "bold", textDecoration: "none !important", color: "#212529" },
  // Other styles
  { tag: tags.strong, fontWeight: "bold", color: "#212529" },
  { tag: tags.emphasis, fontStyle: "italic", color: "#212529" },
  { tag: tags.link, color: "#0d6efd" },
  { tag: tags.url, color: "#6c757d" },
  { tag: tags.quote, color: "#198754", fontStyle: "italic" },
  { tag: tags.list, color: "#212529" },
  { tag: tags.content, color: "#212529" },
  { tag: tags.monospace, color: "#212529", backgroundColor: "transparent" },
  { tag: tags.meta, color: "#495057" },
], { themeType: 'light' });

/**
 * Dark mode markdown highlight style
 */
const darkMarkdownHighlightStyle = HighlightStyle.define([
  // Special handling for headings with forced style reset
  { tag: tags.heading, fontWeight: "bold", textDecoration: "none !important", color: "#e9ecef" },
  { tag: tags.heading1, fontSize: "1.8em", fontWeight: "bold", textDecoration: "none !important", color: "#e9ecef" },
  { tag: tags.heading2, fontSize: "1.5em", fontWeight: "bold", textDecoration: "none !important", color: "#e9ecef" },
  { tag: tags.heading3, fontSize: "1.3em", fontWeight: "bold", textDecoration: "none !important", color: "#e9ecef" },
  { tag: tags.heading4, fontSize: "1.2em", fontWeight: "bold", textDecoration: "none !important", color: "#e9ecef" },
  { tag: tags.heading5, fontSize: "1.1em", fontWeight: "bold", textDecoration: "none !important", color: "#e9ecef" },
  { tag: tags.heading6, fontSize: "1em", fontWeight: "bold", textDecoration: "none !important", color: "#e9ecef" },
  // Other styles
  { tag: tags.strong, fontWeight: "bold", color: "#e9ecef" },
  { tag: tags.emphasis, fontStyle: "italic", color: "#e9ecef" },
  { tag: tags.link, color: "#60a5fa" },
  { tag: tags.url, color: "#9ca3af" },
  { tag: tags.quote, color: "#34d399", fontStyle: "italic" },
  { tag: tags.list, color: "#e9ecef" },
  { tag: tags.content, color: "#e9ecef" },
  { tag: tags.monospace, color: "#e9ecef", backgroundColor: "transparent" },
  // Improved visibility of Markdown notation characters (#, -, *, > etc.) - changed to very bright color
  { tag: tags.meta, color: "#f3f4f6" },
  { tag: tags.processingInstruction, color: "#f3f4f6" },
  { tag: tags.punctuation, color: "#f3f4f6" },
], { themeType: 'dark' });

/**
 * Extension for Japanese IME input issues
 * Stabilization measures for Japanese input when using monospace fonts
 */
const imeSupport = EditorView.domEventHandlers({
  compositionstart: (event, _view) => {
    // Adjust conversion candidate position for monospace fonts
    const target = event.target as HTMLElement;
    if (target) {
      target.style.transform = 'translateZ(0)';
      target.style.isolation = 'isolate';
    }
    return false;
  },
  compositionupdate: (_event, _view) => {
    // Adjust display position of characters during conversion
    return false;
  },
  compositionend: (event, _view) => {
    // Cleanup when conversion is complete
    const target = event.target as HTMLElement;
    if (target) {
      target.style.transform = '';
    }
    return false;
  },
  // Additional handler for cursor position adjustment
  input: (_event, _view) => {
    // Cursor position correction for Japanese input with monospace fonts
    return false;
  }
});

/**
 * Function to create CodeMirror extensions
 * 
 * @param isDarkMode Whether to apply dark mode
 * @returns Array of extensions
 */
function createExtensions(isDarkMode: boolean): Extension[] {
  // Basic extensions
  const baseExtensions: Extension[] = [
    history(),
    // Enhanced keymap settings
    keymap.of([
      ...defaultKeymap,
      ...historyKeymap,
      indentWithTab
    ]),
    lineNumbers(),
    highlightActiveLine(),
    highlightSpecialChars(),
    // Markdown syntax highlighting
    markdown({
      codeLanguages: languages,
      addKeymap: true,
    }),
    // Syntax highlighting style (use custom styles only)
    syntaxHighlighting(isDarkMode ? darkMarkdownHighlightStyle : lightMarkdownHighlightStyle),
    EditorView.lineWrapping,
    // Settings for Japanese IME support
    EditorState.allowMultipleSelections.of(false),
    // Character width adjustment for monospace fonts
    EditorView.theme({
      '.cm-content': {
        // Adjust Japanese character spacing with monospace fonts
        letterSpacing: '0.02em',
        // Optimize character rendering
        textRendering: 'optimizeSpeed',
        // Hardware acceleration
        transform: 'translateZ(0)',
      },
      // For adjusting conversion candidate window position
      '.cm-cursor': {
        // Stabilize cursor position
        transform: 'translateZ(0)',
        willChange: 'transform',
      }
    }),
    // Japanese IME issue countermeasures extension - monospace font compatible version
    imeSupport,
    // Set editor as editable
    EditorState.readOnly.of(false),
  ];
  
  // Theme extension
  const themeExtension = isDarkMode ? createDarkTheme() : createLightTheme();
  
  return [...baseExtensions, themeExtension];
}

/**
 * Function to create dark mode theme
 * 
 * @returns Dark mode theme extension
 */
function createDarkTheme(): Extension {
  return EditorView.theme({
    '&': {
      backgroundColor: 'var(--editor-bg, #252830)',
      color: 'var(--editor-text, #e9ecef)',
      height: '100vh',
      width: '100vw',
    },
    '.cm-content': {
      caretColor: 'var(--editor-text, #e9ecef)',
      fontFamily: "Consolas, 'Cascadia Code', 'Cascadia Mono', 'SF Mono', Monaco, Menlo, 'Liberation Mono', 'DejaVu Sans Mono', 'Ubuntu Mono', 'Courier New', monospace",
      fontSize: '16px',
      lineHeight: '1.6',
      // Japanese input countermeasures
      isolation: 'isolate',
      position: 'relative',
    },
    '.cm-cursor': {
      borderLeftColor: 'var(--editor-text, #e9ecef)',
      borderLeftWidth: '2px',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--gutter-bg, #2c2f36)',
      color: 'var(--gutter-text, #8e9297)',
      border: 'none',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'var(--gutter-active-bg, #3a3f47)',
    },
    '.cm-lineNumbers': {
      minWidth: '2.5em',
    },
    '.cm-scroller': {
      overflow: 'auto',
      fontFamily: "Consolas, 'Cascadia Code', 'Cascadia Mono', 'SF Mono', Monaco, Menlo, 'Liberation Mono', 'DejaVu Sans Mono', 'Ubuntu Mono', 'Courier New', monospace",
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: 'var(--selection-bg, rgba(59, 130, 246, 0.3))',
    },
    // Japanese IME input related
    '.ime-friendly': {
      position: 'relative',
      zIndex: '1',
      transformStyle: 'preserve-3d',
      isolation: 'isolate',
    },
    // Code block styles
    '.cm-line': {
      padding: '0 4px',
      position: 'relative',
    },
    // Heading styles (forcibly remove underlines etc.)
    '.cm-header': { 
      fontWeight: 'bold', 
      textDecoration: 'none !important', 
      borderBottom: 'none !important',
      boxShadow: 'none !important',
      color: 'var(--editor-text, #e9ecef) !important',
    },
    '.cm-header-1': { 
      fontSize: '1.8em', 
      textDecoration: 'none !important', 
      borderBottom: 'none !important',
      boxShadow: 'none !important' 
    },
    '.cm-header-2': { 
      fontSize: '1.5em', 
      textDecoration: 'none !important', 
      borderBottom: 'none !important',
      boxShadow: 'none !important' 
    },
    '.cm-header-3': { 
      fontSize: '1.3em', 
      textDecoration: 'none !important', 
      borderBottom: 'none !important',
      boxShadow: 'none !important' 
    },
    // Set dark mode code block color same as normal text
    '.cm-monospace': {
      color: 'var(--editor-text, #e9ecef) !important',
      backgroundColor: 'transparent !important'
    },
    // For inline code (multiple patterns)
    '.tok-monospace': {
      color: 'var(--editor-text, #e9ecef) !important',
      backgroundColor: 'transparent !important'
    },
    '.cm-content .cm-monospace': {
      color: 'var(--editor-text, #e9ecef) !important',
      backgroundColor: 'transparent !important'
    },
    // Classes possibly used by CodeMirror's HighlightStyle
    '.ͼ1': { // CodeMirror internal class (for monospace)
      color: 'var(--editor-text, #e9ecef) !important',
      backgroundColor: 'transparent !important'
    },
    // Directly specify color for Markdown notation characters
    '.cm-meta': {
      color: '#f3f4f6 !important'
    },
    '.cm-punctuation': {
      color: '#f3f4f6 !important'
    },
  }, { dark: true });
}

/**
 * Function to create light mode theme
 * 
 * @returns Light mode theme extension
 */
function createLightTheme(): Extension {
  return EditorView.theme({
    '&': {
      backgroundColor: 'var(--editor-bg, #f8f9fa)',
      color: 'var(--editor-text, #212529)',
      height: '100vh',
      width: '100vw',
    },
    '.cm-content': {
      caretColor: 'var(--editor-text, #212529)',
      fontFamily: "Consolas, 'Cascadia Code', 'Cascadia Mono', 'SF Mono', Monaco, Menlo, 'Liberation Mono', 'DejaVu Sans Mono', 'Ubuntu Mono', 'Courier New', monospace",
      fontSize: '16px',
      lineHeight: '1.6',
      // Japanese input countermeasures
      isolation: 'isolate',
      position: 'relative',
    },
    '.cm-cursor': {
      borderLeftColor: 'var(--editor-text, #212529)',
      borderLeftWidth: '2px',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--gutter-bg, #f0f0f0)',
      color: 'var(--gutter-text, #6c757d)',
      border: 'none',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'var(--gutter-active-bg, #e9ecef)',
    },
    '.cm-lineNumbers': {
      minWidth: '2.5em',
    },
    '.cm-scroller': {
      overflow: 'auto',
      fontFamily: "Consolas, 'Cascadia Code', 'Cascadia Mono', 'SF Mono', Monaco, Menlo, 'Liberation Mono', 'DejaVu Sans Mono', 'Ubuntu Mono', 'Courier New', monospace",
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: 'var(--selection-bg, rgba(13, 110, 253, 0.2))',
    },
    // Japanese IME input related
    '.ime-friendly': {
      position: 'relative',
      zIndex: '1',
      transformStyle: 'preserve-3d',
      isolation: 'isolate',
    },
    // Code block styles
    '.cm-line': {
      padding: '0 4px',
      position: 'relative',
    },
    // Heading styles (forcibly remove underlines etc.)
    '.cm-header': { 
      fontWeight: 'bold', 
      textDecoration: 'none !important', 
      borderBottom: 'none !important',
      boxShadow: 'none !important',
      color: 'var(--editor-text, #212529) !important',
    },
    '.cm-header-1': { 
      fontSize: '1.8em', 
      textDecoration: 'none !important', 
      borderBottom: 'none !important',
      boxShadow: 'none !important' 
    },
    '.cm-header-2': { 
      fontSize: '1.5em', 
      textDecoration: 'none !important', 
      borderBottom: 'none !important',
      boxShadow: 'none !important' 
    },
    '.cm-header-3': { 
      fontSize: '1.3em', 
      textDecoration: 'none !important', 
      borderBottom: 'none !important',
      boxShadow: 'none !important' 
    },
    // Set light mode code block color same as normal text
    '.cm-monospace': {
      color: 'var(--editor-text, #212529) !important',
      backgroundColor: 'transparent !important'
    },
    // For inline code (multiple patterns)
    '.tok-monospace': {
      color: 'var(--editor-text, #212529) !important',
      backgroundColor: 'transparent !important'
    },
    '.cm-content .cm-monospace': {
      color: 'var(--editor-text, #212529) !important',
      backgroundColor: 'transparent !important'
    },
  });
}

/**
 * Function to change editor view theme
 * 
 * @param view Target editor view
 * @param isDarkMode Whether to change to dark mode
 */
export function setEditorTheme(view: EditorView, isDarkMode: boolean): void {
  // Create array including all necessary extensions to completely replace current settings
  const extensions: Extension[] = createExtensions(isDarkMode);
  
  // Apply all extensions
  view.dispatch({
    effects: StateEffect.reconfigure.of(extensions)
  });
}

/**
 * Function to add change listener
 * 
 * @param view Editor view
 * @param callback Callback function to call on change
 */
export function addChangeListener(
  view: EditorView, 
  callback: (content: string) => void
): void {
  const changeListener = EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      const content = update.state.doc.toString();
      callback(content);
    }
  });
  
  // Add listener to existing extensions
  view.dispatch({
    effects: StateEffect.appendConfig.of(changeListener)
  });
}

/**
 * Function to get editor content
 * 
 * @param view Editor view
 * @returns Current editor content
 */
export function getEditorContent(view: EditorView): string {
  return view.state.doc.toString();
}

/**
 * Function to set editor content
 * 
 * @param view Editor view
 * @param content Content to set
 */
export function setEditorContent(view: EditorView, content: string): void {
  view.dispatch({
    changes: {
      from: 0,
      to: view.state.doc.length,
      insert: content,
    },
  });
}

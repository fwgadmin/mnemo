import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

/**
 * CodeMirror chrome (gutters, cursor, scrollbars) — uses --mnemo-editor-* CSS variables.
 */
export const mnemoEditorTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'transparent',
      color: 'var(--mnemo-editor-foreground)',
      fontSize: 'var(--mnemo-editor-font-size)',
      height: '100%',
    },
    '&.cm-focused': {
      outline: 'none',
    },
    '.cm-content': {
      fontFamily: 'var(--mnemo-editor-font-family)',
      lineHeight: 'var(--mnemo-editor-line-height)',
      padding: '0',
      paddingLeft: '6px',
      caretColor: 'var(--mnemo-editor-caret)',
    },
    '.cm-cursor': {
      borderLeftColor: 'var(--mnemo-editor-caret)',
      borderLeftWidth: '2px',
    },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      color: 'var(--mnemo-editor-gutter-fg)',
      border: 'none',
      paddingRight: '8px',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'transparent',
      color: 'var(--mnemo-editor-gutter-active-fg)',
    },
    '.cm-activeLine': {
      backgroundColor: 'var(--mnemo-editor-active-line-bg)',
    },
    '.cm-selectionBackground': {
      backgroundColor: 'var(--mnemo-editor-selection-bg) !important',
    },
    '&.cm-focused .cm-selectionBackground': {
      backgroundColor: 'var(--mnemo-editor-selection-bg) !important',
    },
    '.cm-line': {
      padding: '0 0',
    },
    '.cm-wikilink': {
      color: 'var(--mnemo-editor-link)',
      textDecoration: 'underline',
      textDecorationColor: 'color-mix(in srgb, var(--mnemo-editor-link) 35%, transparent)',
      textUnderlineOffset: '3px',
      cursor: 'pointer',
    },
    '.cm-wikilink:hover': {
      textDecorationColor: 'var(--mnemo-editor-link)',
    },
    '.cm-wikilink-bracket': {
      color: 'var(--mnemo-editor-meta)',
    },
    '.cm-wikilink-muted': {
      color: 'var(--mnemo-editor-meta)',
      fontSize: '0.92em',
    },
    '.cm-wikilink-pipe': {
      color: 'var(--mnemo-editor-meta)',
      padding: '0 1px',
    },
    '.cm-scroller': {
      overflow: 'auto',
    },
    /* Scrollbar chrome lives in styles.css (.cm-scroller) for WebKit + Firefox, semi-transparent overlay */
    '.cm-selectionMatch': {
      backgroundColor: 'var(--mnemo-editor-selection-match-bg)',
    },
    '&.cm-focused .cm-matchingBracket': {
      backgroundColor: 'var(--mnemo-editor-bracket-match-bg)',
    },
    '&.cm-focused .cm-nonmatchingBracket': {
      backgroundColor: 'var(--mnemo-editor-bracket-mismatch-bg)',
    },
  },
  { dark: true },
);

/**
 * Markdown + fenced code syntax — uses --mnemo-editor-* and --mnemo-syntax-* variables.
 * Order: broad tags first, then specifics (later rules win for overlapping tags).
 */
const mnemoHighlightStyle = HighlightStyle.define(
  [
    /* Markdown / prose — one spec per heading level so tagHighlighter map isn't overwritten by font-only rules */
    {
      tag: t.heading1,
      color: 'var(--mnemo-editor-heading)',
      fontWeight: 'var(--mnemo-editor-heading-weight)',
      fontSize: 'var(--mnemo-editor-h1-size)',
    },
    {
      tag: t.heading2,
      color: 'var(--mnemo-editor-heading)',
      fontWeight: 'var(--mnemo-editor-heading-weight)',
      fontSize: 'var(--mnemo-editor-h2-size)',
    },
    {
      tag: t.heading3,
      color: 'var(--mnemo-editor-heading)',
      fontWeight: 'var(--mnemo-editor-heading-weight)',
      fontSize: 'var(--mnemo-editor-h3-size)',
    },
    {
      tag: t.heading4,
      color: 'var(--mnemo-editor-heading)',
      fontWeight: 'var(--mnemo-editor-heading-weight)',
      fontSize: 'var(--mnemo-editor-h4-size)',
    },
    {
      tag: t.heading5,
      color: 'var(--mnemo-editor-heading)',
      fontWeight: 'var(--mnemo-editor-heading-weight)',
      fontSize: 'var(--mnemo-editor-h5-size)',
    },
    {
      tag: t.heading6,
      color: 'var(--mnemo-editor-heading)',
      fontWeight: 'var(--mnemo-editor-heading-weight)',
      fontSize: 'var(--mnemo-editor-h6-size)',
    },
    { tag: t.heading, color: 'var(--mnemo-editor-heading)', fontWeight: 'var(--mnemo-editor-heading-weight)' },
    { tag: t.strong, fontWeight: 'bold', color: 'var(--mnemo-editor-strong)' },
    { tag: t.emphasis, fontStyle: 'italic', color: 'var(--mnemo-editor-emphasis)' },
    { tag: t.strikethrough, textDecoration: 'line-through', color: 'var(--mnemo-editor-strikethrough)' },
    { tag: t.link, color: 'var(--mnemo-editor-link)', textDecoration: 'underline' },
    { tag: t.url, color: 'var(--mnemo-editor-link)' },
    { tag: t.monospace, color: 'var(--mnemo-editor-code-fg)', fontFamily: 'var(--mnemo-editor-mono-font-family)' },
    { tag: t.quote, color: 'var(--mnemo-editor-quote)', fontStyle: 'italic' },
    { tag: t.list, color: 'var(--mnemo-editor-foreground)' },
    { tag: t.contentSeparator, color: 'var(--mnemo-editor-separator)' },
    { tag: t.processingInstruction, color: 'var(--mnemo-editor-meta)' },
    { tag: t.meta, color: 'var(--mnemo-editor-meta)' },
    { tag: t.punctuation, color: 'var(--mnemo-editor-punctuation)' },
    { tag: t.bracket, color: 'var(--mnemo-editor-bracket)' },
    { tag: t.separator, color: 'var(--mnemo-editor-meta)' },
    /* Code (fenced blocks + inline) */
    { tag: t.keyword, color: 'var(--mnemo-syntax-keyword)' },
    { tag: t.controlKeyword, color: 'var(--mnemo-syntax-control-keyword)' },
    { tag: t.definitionKeyword, color: 'var(--mnemo-syntax-definition-keyword)' },
    { tag: t.moduleKeyword, color: 'var(--mnemo-syntax-keyword)' },
    { tag: t.operatorKeyword, color: 'var(--mnemo-syntax-keyword)' },
    { tag: t.self, color: 'var(--mnemo-syntax-keyword)' },
    { tag: t.atom, color: 'var(--mnemo-syntax-atom)' },
    { tag: t.bool, color: 'var(--mnemo-syntax-bool)' },
    { tag: t.null, color: 'var(--mnemo-syntax-bool)' },
    { tag: t.variableName, color: 'var(--mnemo-syntax-variable)' },
    { tag: t.propertyName, color: 'var(--mnemo-syntax-property)' },
    { tag: t.function(t.variableName), color: 'var(--mnemo-syntax-function)' },
    { tag: t.namespace, color: 'var(--mnemo-syntax-type)' },
    { tag: t.typeName, color: 'var(--mnemo-syntax-type)' },
    { tag: t.className, color: 'var(--mnemo-syntax-type)' },
    { tag: t.string, color: 'var(--mnemo-syntax-string)' },
    { tag: t.regexp, color: 'var(--mnemo-syntax-regexp)' },
    { tag: t.number, color: 'var(--mnemo-syntax-number)' },
    { tag: t.comment, color: 'var(--mnemo-syntax-comment)', fontStyle: 'italic' },
    { tag: t.lineComment, color: 'var(--mnemo-syntax-comment)', fontStyle: 'italic' },
    { tag: t.blockComment, color: 'var(--mnemo-syntax-comment)', fontStyle: 'italic' },
    { tag: t.operator, color: 'var(--mnemo-syntax-operator)' },
    { tag: t.compareOperator, color: 'var(--mnemo-syntax-operator)' },
    { tag: t.arithmeticOperator, color: 'var(--mnemo-syntax-operator)' },
    { tag: t.tagName, color: 'var(--mnemo-syntax-tag)' },
    { tag: t.attributeName, color: 'var(--mnemo-syntax-attribute)' },
    { tag: t.attributeValue, color: 'var(--mnemo-syntax-string)' },
    { tag: t.invalid, color: 'var(--mnemo-syntax-invalid)' },
  ],
  {
    all: { color: 'var(--mnemo-editor-foreground)' },
  },
);

export const mnemoSyntaxHighlighting = syntaxHighlighting(mnemoHighlightStyle);

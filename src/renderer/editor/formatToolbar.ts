/**
 * Floating formatting toolbar above a non-empty selection, plus the matching keyboard shortcuts.
 */
import { Prec, StateField, type EditorState, type Extension, type StateCommand } from '@codemirror/state';
import { EditorView, keymap, showTooltip, type Tooltip } from '@codemirror/view';
import { inlineCommand, lineCommand, linkCommand } from './formatting';

interface ToolbarButton {
  label: string;
  title: string;
  run: StateCommand;
  className?: string;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? '⌘' : 'Ctrl+';
const alt = isMac ? '⌥' : 'Alt+';
const shift = isMac ? '⇧' : 'Shift+';

const GROUPS: ToolbarButton[][] = [
  [
    { label: 'B', title: `Bold (${mod}B)`, run: inlineCommand('bold'), className: 'cm-fmt-bold' },
    { label: 'I', title: `Italic (${mod}I)`, run: inlineCommand('italic'), className: 'cm-fmt-italic' },
    { label: 'S', title: `Strikethrough (${mod}${shift}X)`, run: inlineCommand('strike'), className: 'cm-fmt-strike' },
    { label: 'H', title: `Highlight (${mod}${alt}H)`, run: inlineCommand('highlight'), className: 'cm-fmt-highlight' },
    { label: '</>', title: `Inline code (${mod}E)`, run: inlineCommand('code'), className: 'cm-fmt-code' },
    { label: '🔗', title: `Link (${mod}K)`, run: linkCommand },
  ],
  [
    { label: 'H1', title: `Heading 1 (${mod}1)`, run: lineCommand('h1') },
    { label: 'H2', title: `Heading 2 (${mod}2)`, run: lineCommand('h2') },
    { label: 'H3', title: `Heading 3 (${mod}3)`, run: lineCommand('h3') },
  ],
  [
    { label: '❝', title: `Quote (${mod}${shift}.)`, run: lineCommand('quote') },
    { label: '•', title: `Bulleted list (${mod}${shift}8)`, run: lineCommand('bullet') },
    { label: '1.', title: `Numbered list (${mod}${shift}7)`, run: lineCommand('number') },
    { label: '☐', title: `Task list (${mod}${shift}9)`, run: lineCommand('task') },
  ],
];

function createToolbar(view: EditorView): HTMLElement {
  const dom = document.createElement('div');
  dom.className = 'cm-format-toolbar';
  dom.setAttribute('role', 'toolbar');
  dom.setAttribute('aria-label', 'Formatting');
  GROUPS.forEach((group, i) => {
    if (i > 0) {
      const sep = document.createElement('span');
      sep.className = 'cm-format-sep';
      dom.appendChild(sep);
    }
    for (const b of group) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = b.label;
      btn.title = b.title;
      btn.setAttribute('aria-label', b.title);
      if (b.className) btn.classList.add(b.className);
      // Keep focus and the selection in the editor.
      btn.addEventListener('mousedown', e => e.preventDefault());
      btn.addEventListener('click', () => {
        b.run(view);
        view.focus();
      });
      dom.appendChild(btn);
    }
  });
  return dom;
}

function toolbarFor(state: EditorState): readonly Tooltip[] {
  const r = state.selection.main;
  if (r.empty || state.selection.ranges.length > 1) return [];
  return [{ pos: r.from, above: true, strictSide: false, arrow: false, create: view => ({ dom: createToolbar(view) }) }];
}

const toolbarField = StateField.define<readonly Tooltip[]>({
  create: toolbarFor,
  update: (value, tr) => {
    if (!tr.docChanged && !tr.selection) return value;
    const next = toolbarFor(tr.state);
    // Keep the same tooltip object while the selection start stays put, to avoid rebuilding the DOM.
    if (next.length && value.length && next[0]!.pos === value[0]!.pos) return value;
    return next;
  },
  provide: f => showTooltip.computeN([f], state => state.field(f)),
});

const toolbarTheme = EditorView.baseTheme({
  '.cm-tooltip.cm-tooltip-above:has(.cm-format-toolbar), .cm-tooltip:has(> .cm-format-toolbar)': {
    border: 'none',
    background: 'transparent',
  },
  '.cm-format-toolbar': {
    display: 'flex',
    alignItems: 'center',
    gap: '1px',
    padding: '3px',
    marginBottom: '6px',
    borderRadius: '6px',
    border: '1px solid var(--mnemo-border-strong)',
    backgroundColor: 'var(--mnemo-bg-panel)',
    boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
    fontFamily: 'system-ui, sans-serif',
  },
  '.cm-format-toolbar button': {
    minWidth: '26px',
    height: '24px',
    padding: '0 5px',
    border: 'none',
    borderRadius: '4px',
    background: 'transparent',
    color: 'var(--mnemo-editor-foreground)',
    fontSize: '12px',
    lineHeight: '24px',
    cursor: 'pointer',
  },
  '.cm-format-toolbar button:hover, .cm-format-toolbar button:focus-visible': {
    backgroundColor: 'color-mix(in srgb, var(--mnemo-accent) 22%, transparent)',
    outline: 'none',
  },
  '.cm-format-toolbar .cm-fmt-bold': { fontWeight: '700' },
  '.cm-format-toolbar .cm-fmt-italic': { fontStyle: 'italic' },
  '.cm-format-toolbar .cm-fmt-strike': { textDecoration: 'line-through' },
  '.cm-format-toolbar .cm-fmt-highlight': {
    backgroundColor: 'color-mix(in srgb, var(--mnemo-accent) 28%, transparent)',
  },
  '.cm-format-toolbar .cm-fmt-code': { fontFamily: 'var(--mnemo-editor-mono-font-family)' },
  '.cm-format-sep': {
    width: '1px',
    alignSelf: 'stretch',
    margin: '2px 3px',
    backgroundColor: 'var(--mnemo-border-strong)',
  },
});

/** Selection toolbar (toggle with the editorFormatToolbar preference). */
export function formatToolbar(): Extension {
  return [toolbarField, toolbarTheme];
}

/** Formatting shortcuts (always on). Mod-k (link) is bound by the editor already. */
export const formatKeymap: Extension = Prec.high(
  keymap.of([
    { key: 'Mod-b', run: inlineCommand('bold') },
    { key: 'Mod-i', run: inlineCommand('italic') },
    { key: 'Mod-Shift-x', run: inlineCommand('strike') },
    { key: 'Mod-Alt-h', run: inlineCommand('highlight') },
    { key: 'Mod-e', run: inlineCommand('code') },
    { key: 'Mod-1', run: lineCommand('h1') },
    { key: 'Mod-2', run: lineCommand('h2') },
    { key: 'Mod-3', run: lineCommand('h3') },
    { key: 'Mod-0', run: lineCommand('paragraph') },
    { key: 'Mod-Shift-8', run: lineCommand('bullet') },
    { key: 'Mod-Shift-7', run: lineCommand('number') },
    { key: 'Mod-Shift-9', run: lineCommand('task') },
    { key: 'Mod-Shift-.', run: lineCommand('quote') },
  ]),
);

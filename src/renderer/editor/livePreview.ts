/**
 * Obsidian-style live preview for the Markdown editor.
 *
 * Markdown stays the stored text; this only changes how it is drawn. Syntax marks (`#`, `**`, `` ` ``, `[`/`](url)`,
 * `>`, `==`) are hidden unless the selection touches the element, images render inline, bullets and task boxes
 * become widgets, and quotes / code blocks / rules get block styling. Moving the cursor into an element reveals
 * its raw Markdown so it can be edited directly.
 */
import { syntaxTree } from '@codemirror/language';
import { StateField, type EditorState, type Extension, type Range, type Transaction } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import { tags } from '@lezer/highlight';
import type { MarkdownConfig } from '@lezer/markdown';
import type { SyntaxNodeRef } from '@lezer/common';
import { parseAttachmentUrl } from '../../shared/attachments';
import { parseMediaDisplayOptions } from './mediaMarkdown';
import { parseMarkdownTable, type ParsedTable } from './markdownTable';
import { markdownInlineToHtml } from './richClipboard';
import { renderMermaidInto } from './mermaidRender';
import { EMBED_LINE, parseEmbedTarget, renderEmbedInto, type EmbedTarget } from './embedRender';

// ─── ==highlight== syntax (Obsidian) ─────────────────────────────────────────────

const HighlightDelim = { resolve: 'Highlight', mark: 'HighlightMark' };
const PUNCTUATION = /[!"#$%&'()*+,\-.\/:;<=>?@[\\\]^_`{|}~¡-¿‐-‧]/;

/** `==text==` → Highlight node (same flanking rules as GFM strikethrough). */
export const markdownHighlight: MarkdownConfig = {
  defineNodes: [
    { name: 'Highlight', style: { 'Highlight/...': tags.special(tags.content) } },
    { name: 'HighlightMark', style: tags.processingInstruction },
  ],
  parseInline: [
    {
      name: 'Highlight',
      parse(cx, next, pos) {
        if (next !== 61 /* = */ || cx.char(pos + 1) !== 61 || cx.char(pos + 2) === 61) return -1;
        const before = cx.slice(pos - 1, pos);
        const after = cx.slice(pos + 2, pos + 3);
        const sBefore = /\s|^$/.test(before);
        const sAfter = /\s|^$/.test(after);
        const pBefore = PUNCTUATION.test(before);
        const pAfter = PUNCTUATION.test(after);
        return cx.addDelimiter(
          HighlightDelim,
          pos,
          pos + 2,
          !sAfter && (!pAfter || sBefore || pBefore),
          !sBefore && (!pBefore || sAfter || pAfter),
        );
      },
      after: 'Emphasis',
    },
  ],
};

// ─── Widgets ─────────────────────────────────────────────────────────────────────

class BulletWidget extends WidgetType {
  eq(): boolean {
    return true;
  }
  toDOM(): HTMLElement {
    const el = document.createElement('span');
    el.className = 'cm-lp-bullet';
    el.textContent = '•';
    return el;
  }
}

class CheckboxWidget extends WidgetType {
  constructor(private readonly checked: boolean, private readonly pos: number) {
    super();
  }
  eq(other: CheckboxWidget): boolean {
    return other.checked === this.checked && other.pos === this.pos;
  }
  toDOM(view: EditorView): HTMLElement {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.className = 'cm-lp-task';
    box.checked = this.checked;
    box.setAttribute('aria-label', this.checked ? 'Mark task incomplete' : 'Mark task complete');
    box.addEventListener('mousedown', e => e.preventDefault());
    box.addEventListener('click', e => {
      e.preventDefault();
      // `[ ]` / `[x]`: the state character sits one past the opening bracket.
      view.dispatch({
        changes: { from: this.pos + 1, to: this.pos + 2, insert: this.checked ? ' ' : 'x' },
        userEvent: 'input.toggleTask',
      });
    });
    return box;
  }
  ignoreEvent(): boolean {
    return true;
  }
}

class RuleWidget extends WidgetType {
  eq(): boolean {
    return true;
  }
  toDOM(): HTMLElement {
    const el = document.createElement('span');
    el.className = 'cm-lp-hr';
    return el;
  }
}

/** Images that the renderer CSP allows (attachments and inline data URLs); everything else stays as Markdown. */
export function livePreviewImageSrc(url: string): string | null {
  const asset = parseAttachmentUrl(url);
  if (asset) return asset.mime?.startsWith('image/') ? url : null;
  return /^data:image\/(?:png|jpe?g|gif|webp|bmp);base64,/i.test(url) ? url : null;
}

export type LivePreviewMediaKind = 'image' | 'audio' | 'video';

/** Media kind for a destination the renderer may load (attachments of any media type, inline data images). */
export function livePreviewMediaKind(url: string): LivePreviewMediaKind | null {
  if (livePreviewImageSrc(url)) return 'image';
  const mime = parseAttachmentUrl(url)?.mime;
  if (mime?.startsWith('audio/')) return 'audio';
  if (mime?.startsWith('video/')) return 'video';
  return null;
}

class MediaWidget extends WidgetType {
  constructor(
    private readonly kind: LivePreviewMediaKind,
    private readonly src: string,
    private readonly alt: string,
    private readonly width: number,
    private readonly align: string,
  ) {
    super();
  }
  eq(o: MediaWidget): boolean {
    return o.kind === this.kind && o.src === this.src && o.alt === this.alt && o.width === this.width && o.align === this.align;
  }
  toDOM(): HTMLElement {
    const wrap = document.createElement('span');
    wrap.className = `cm-lp-image cm-lp-image-${this.align}`;
    const el =
      this.kind === 'image' ? document.createElement('img') : document.createElement(this.kind === 'audio' ? 'audio' : 'video');
    el.setAttribute('src', this.src);
    el.title = this.alt;
    if (el instanceof HTMLImageElement) {
      el.alt = this.alt;
      el.draggable = false;
    } else {
      (el as HTMLMediaElement).controls = true;
      (el as HTMLMediaElement).preload = 'metadata';
    }
    el.style.width = `${this.width}%`;
    wrap.appendChild(el);
    return wrap;
  }
  /** Images: a click moves the cursor in (reveals Markdown). Players keep their own clicks (play, seek). */
  ignoreEvent(): boolean {
    return this.kind !== 'image';
  }
}

/** Click handler shared by block widgets: put the cursor at the block's source to edit it. */
function revealOnMouseDown(el: HTMLElement, view: EditorView, pos: number): void {
  el.addEventListener('mousedown', e => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('a, audio, video')) return;
    e.preventDefault();
    view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
    view.focus();
  });
}

class MermaidWidget extends WidgetType {
  constructor(private readonly code: string, private readonly pos: number) {
    super();
  }
  eq(o: MermaidWidget): boolean {
    return o.code === this.code && o.pos === this.pos;
  }
  toDOM(view: EditorView): HTMLElement {
    const el = document.createElement('div');
    el.className = 'cm-lp-mermaid mermaid-svg';
    el.title = 'Click to edit the diagram source';
    void renderMermaidInto(el, this.code).then(() => view.requestMeasure());
    revealOnMouseDown(el, view, this.pos);
    return el;
  }
  ignoreEvent(): boolean {
    return true;
  }
}

class EmbedWidget extends WidgetType {
  constructor(private readonly target: EmbedTarget, private readonly key: string, private readonly pos: number) {
    super();
  }
  eq(o: EmbedWidget): boolean {
    return o.key === this.key && o.pos === this.pos;
  }
  toDOM(view: EditorView): HTMLElement {
    const el = document.createElement('div');
    el.title = 'Click to edit the embed';
    void renderEmbedInto(el, this.target).then(() => view.requestMeasure());
    revealOnMouseDown(el, view, this.pos);
    return el;
  }
  ignoreEvent(): boolean {
    return true;
  }
}

/** Rendered GFM table; clicking a cell moves the cursor to that cell's Markdown (revealing the source). */
class TableWidget extends WidgetType {
  constructor(private readonly source: string, private readonly table: ParsedTable) {
    super();
  }
  eq(o: TableWidget): boolean {
    return o.source === this.source && o.table.header[0]?.from === this.table.header[0]?.from;
  }
  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'cm-lp-table-wrap';
    const table = document.createElement('table');
    table.className = 'cm-lp-table';
    const addRow = (parent: HTMLElement, cells: ParsedTable['header'], tag: 'th' | 'td') => {
      const tr = document.createElement('tr');
      const width = Math.max(this.table.aligns.length, cells.length);
      for (let i = 0; i < width; i++) {
        const cell = cells[i];
        const el = document.createElement(tag);
        const align = this.table.aligns[i];
        if (align) el.style.textAlign = align;
        // Sanitized by rehype-sanitize (same schema as rich copy).
        el.innerHTML = cell ? markdownInlineToHtml(cell.text) : '';
        const target = cell?.from ?? cells[cells.length - 1]?.from ?? 0;
        el.addEventListener('mousedown', e => {
          if (e.button !== 0) return;
          e.preventDefault();
          view.dispatch({ selection: { anchor: target }, scrollIntoView: true });
          view.focus();
        });
        tr.appendChild(el);
      }
      parent.appendChild(tr);
    };
    const thead = document.createElement('thead');
    addRow(thead, this.table.header, 'th');
    const tbody = document.createElement('tbody');
    for (const row of this.table.rows) addRow(tbody, row, 'td');
    table.append(thead, tbody);
    wrap.appendChild(table);
    return wrap;
  }
  ignoreEvent(): boolean {
    return true;
  }
}

/** Block-level table widgets (multi-line replacements must come from a state field, not a view plugin). */
function inCode(state: EditorState, pos: number): boolean {
  for (let n: { name: string; parent: unknown } | null = syntaxTree(state).resolveInner(pos, 1); n; n = n.parent as typeof n) {
    if (n.name === 'FencedCode' || n.name === 'CodeBlock') return true;
  }
  return false;
}

/** Block widgets: tables, Mermaid fences, and standalone `![[…]]` embed lines (all only off the cursor). */
export function buildTableDecorations(state: EditorState): DecorationSet {
  const out: Range<Decoration>[] = [];
  const doc = state.doc;
  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n);
    const m = EMBED_LINE.exec(line.text);
    if (!m || touches(state, line.from, line.to) || inCode(state, line.from)) continue;
    const target = parseEmbedTarget(m[1]!);
    if (target) {
      out.push(Decoration.replace({ widget: new EmbedWidget(target, m[1]!, line.from), block: true }).range(line.from, line.to));
    }
  }
  syntaxTree(state).iterate({
    enter: node => {
      if (node.name === 'FencedCode') {
        const info = node.node.getChild('CodeInfo');
        const lang = info ? doc.sliceString(info.from, info.to).trim().toLowerCase() : '';
        const from = doc.lineAt(node.from).from;
        const to = doc.lineAt(node.to).to;
        if (lang === 'mermaid' && !touches(state, from, to)) {
          const text = node.node.getChild('CodeText');
          const code = text ? doc.sliceString(text.from, text.to) : '';
          if (code.trim()) out.push(Decoration.replace({ widget: new MermaidWidget(code, from), block: true }).range(from, to));
        }
        return false;
      }
      if (node.name !== 'Table') return;
      const from = state.doc.lineAt(node.from).from;
      const to = state.doc.lineAt(node.to).to;
      if (!touches(state, from, to)) {
        const source = state.doc.sliceString(from, to);
        const parsed = parseMarkdownTable(source, from);
        if (parsed) out.push(Decoration.replace({ widget: new TableWidget(source, parsed), block: true }).range(from, to));
      }
      return false;
    },
  });
  return Decoration.set(out, true);
}

const tableField = StateField.define<DecorationSet>({
  create: state => buildTableDecorations(state),
  update: (value, tr: Transaction) =>
    tr.docChanged || tr.selection || syntaxTree(tr.startState) !== syntaxTree(tr.state)
      ? buildTableDecorations(tr.state)
      : value,
  provide: f => [EditorView.decorations.from(f), EditorView.atomicRanges.of(view => view.state.field(f))],
});

// ─── Decoration builder ──────────────────────────────────────────────────────────

const hide = Decoration.replace({});
const bullet = Decoration.replace({ widget: new BulletWidget() });
const rule = Decoration.replace({ widget: new RuleWidget() });
const highlightMark = Decoration.mark({ class: 'cm-lp-highlight' });
const inlineCodeMark = Decoration.mark({ class: 'cm-lp-inline-code' });
const linkLabelMark = (href: string) =>
  Decoration.mark({ class: 'cm-lp-link', attributes: { 'data-lp-href': href, title: `${href}\nCtrl/⌘-click to open` } });
const line = (cls: string) => Decoration.line({ class: cls });

const INLINE_WRAPPERS: Record<string, string[]> = {
  Emphasis: ['EmphasisMark'],
  StrongEmphasis: ['EmphasisMark'],
  Strikethrough: ['StrikethroughMark'],
  Highlight: ['HighlightMark'],
  InlineCode: ['CodeMark'],
};

function touches(state: EditorState, from: number, to: number): boolean {
  for (const r of state.selection.ranges) if (r.from <= to && r.to >= from) return true;
  return false;
}

function lineTouched(state: EditorState, pos: number): boolean {
  const l = state.doc.lineAt(pos);
  return touches(state, l.from, l.to);
}

/** Hide a mark plus one following space (e.g. `# `, `> `). */
function hideWithSpace(state: EditorState, out: Range<Decoration>[], from: number, to: number): void {
  const end = state.doc.sliceString(to, to + 1) === ' ' ? to + 1 : to;
  if (end > from) out.push(hide.range(from, end));
}

function childrenOf(node: SyntaxNodeRef, name: string[]): Array<{ from: number; to: number; name: string }> {
  const out: Array<{ from: number; to: number; name: string }> = [];
  const cursor = node.node.cursor();
  if (!cursor.firstChild()) return out;
  do {
    if (name.includes(cursor.name)) out.push({ from: cursor.from, to: cursor.to, name: cursor.name });
  } while (cursor.nextSibling());
  return out;
}

export interface LivePreviewDecorations {
  /** Everything drawn (line classes, marks, hidden syntax, widgets). */
  decorations: DecorationSet;
  /** Only hidden/replaced ranges — treated as single units for cursor motion and deletion. */
  atomic: DecorationSet;
}

export function buildLivePreviewDecorations(
  state: EditorState,
  ranges: ReadonlyArray<{ from: number; to: number }>,
): LivePreviewDecorations {
  const out: Range<Decoration>[] = [];
  const tree = syntaxTree(state);
  const doc = state.doc;

  for (const { from, to } of ranges) {
    tree.iterate({
      from,
      to,
      enter: node => {
        const name = node.name;

        // Tables render as a block widget off the cursor (tableField) and as plain source while being edited.
        if (name === 'Table') return false;

        const heading = /^ATXHeading(\d)$/.exec(name);
        if (heading) {
          if (!lineTouched(state, node.from)) {
            for (const mark of childrenOf(node, ['HeaderMark'])) {
              // Leading `###` gets hidden with its space; a closing `###` sequence is hidden on its own.
              if (mark.from === node.from) hideWithSpace(state, out, mark.from, mark.to);
              else out.push(hide.range(mark.from, mark.to));
            }
          }
          return;
        }

        const marks = INLINE_WRAPPERS[name];
        if (marks) {
          if (name === 'Highlight') out.push(highlightMark.range(node.from, node.to));
          if (name === 'InlineCode') out.push(inlineCodeMark.range(node.from, node.to));
          if (!touches(state, node.from, node.to)) {
            for (const mark of childrenOf(node, marks)) out.push(hide.range(mark.from, mark.to));
          }
          return;
        }

        if (name === 'Image') {
          if (touches(state, node.from, node.to)) return false;
          const text = doc.sliceString(node.from, node.to);
          const m = /^!\[([^\]]*)\]\((\S+)(?:\s+"([^"]*)")?\)$/.exec(text);
          const kind = m ? livePreviewMediaKind(m[2]!) : null;
          if (m && kind) {
            const opts = parseMediaDisplayOptions(m[3]);
            out.push(
              Decoration.replace({ widget: new MediaWidget(kind, m[2]!, m[1] ?? '', opts.width, opts.align) }).range(
                node.from,
                node.to,
              ),
            );
          }
          return false;
        }

        if (name === 'Link') {
          const parts = childrenOf(node, ['LinkMark', 'URL']);
          const url = parts.find(p => p.name === 'URL');
          const open = parts[0];
          const close = parts.find(p => p.name === 'LinkMark' && doc.sliceString(p.from, p.to) === ']');
          if (!url || !open || !close || doc.sliceString(open.from, open.to) !== '[') return;
          const href = doc.sliceString(url.from, url.to);
          if (open.to < close.from) out.push(linkLabelMark(href).range(open.to, close.from));
          if (!touches(state, node.from, node.to)) {
            out.push(hide.range(open.from, open.to));
            out.push(hide.range(close.from, node.to));
          }
          return false;
        }

        if (name === 'Blockquote') {
          for (let pos = node.from; pos <= node.to; ) {
            const l = doc.lineAt(pos);
            out.push(line('cm-lp-quote').range(l.from));
            pos = l.to + 1;
          }
          return;
        }

        if (name === 'QuoteMark') {
          if (!lineTouched(state, node.from)) hideWithSpace(state, out, node.from, node.to);
          return;
        }

        if (name === 'ListMark') {
          const text = doc.sliceString(node.from, node.to);
          const nextIsTask = /^ \[[ xX]\]/.test(doc.sliceString(node.to, node.to + 4));
          if (/^[-*+]$/.test(text) && !lineTouched(state, node.from)) {
            // Task items show only the checkbox; plain items show a bullet.
            if (nextIsTask) hideWithSpace(state, out, node.from, node.to);
            else out.push(bullet.range(node.from, node.to));
          }
          return;
        }

        if (name === 'TaskMarker') {
          const checked = /x/i.test(doc.sliceString(node.from, node.to));
          if (!lineTouched(state, node.from)) {
            out.push(Decoration.replace({ widget: new CheckboxWidget(checked, node.from) }).range(node.from, node.to));
          }
          if (checked) {
            const l = doc.lineAt(node.from);
            out.push(line('cm-lp-task-done').range(l.from));
          }
          return;
        }

        if (name === 'HorizontalRule') {
          const l = doc.lineAt(node.from);
          out.push(line('cm-lp-hr-line').range(l.from));
          if (!lineTouched(state, node.from)) out.push(rule.range(node.from, node.to));
          return;
        }

        if (name === 'FencedCode' || name === 'CodeBlock') {
          const active = touches(state, node.from, node.to);
          const first = doc.lineAt(node.from).number;
          const last = doc.lineAt(node.to).number;
          for (let n = first; n <= last; n++) {
            const l = doc.line(n);
            const fence = name === 'FencedCode' && (n === first || n === last);
            const cls = ['cm-lp-codeblock'];
            if (n === first) cls.push('cm-lp-codeblock-first');
            if (n === last) cls.push('cm-lp-codeblock-last');
            if (fence && !active) cls.push('cm-lp-fence');
            out.push(line(cls.join(' ')).range(l.from));
          }
          return false;
        }
        return;
      },
    });
  }
  // Replaced ranges (hidden syntax, widgets) are non-empty points; line decorations are zero-length points.
  const atomic = out.filter(r => r.value.point && r.to > r.from);
  return { decorations: Decoration.set(out, true), atomic: Decoration.set(atomic, true) };
}

const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    atomic: DecorationSet;
    constructor(view: EditorView) {
      ({ decorations: this.decorations, atomic: this.atomic } = buildLivePreviewDecorations(
        view.state,
        view.visibleRanges,
      ));
    }
    update(u: ViewUpdate) {
      if (
        u.docChanged ||
        u.viewportChanged ||
        u.selectionSet ||
        u.focusChanged ||
        syntaxTree(u.startState) !== syntaxTree(u.state)
      ) {
        ({ decorations: this.decorations, atomic: this.atomic } = buildLivePreviewDecorations(
          u.state,
          u.view.visibleRanges,
        ));
      }
    }
  },
  {
    decorations: v => v.decorations,
    provide: plugin =>
      // Hidden marks behave as one unit for cursor motion and deletion, like Obsidian.
      EditorView.atomicRanges.of(view => view.plugin(plugin)?.atomic ?? Decoration.none),
  },
);

/** Ctrl/⌘-click on a rendered link label opens it through the app's normal link handling. */
function livePreviewLinkClicks(openLink: (href: string) => void): Extension {
  return EditorView.domEventHandlers({
    mousedown: (e, view) => {
      if (!(e.ctrlKey || e.metaKey) || e.button !== 0) return false;
      const el = (e.target as HTMLElement).closest('[data-lp-href]') as HTMLElement | null;
      const href = el?.dataset['lpHref'];
      if (!href) return false;
      e.preventDefault();
      openLink(href);
      view.focus();
      return true;
    },
  });
}

const livePreviewTheme = EditorView.baseTheme({
  '.cm-lp-bullet': { color: 'var(--mnemo-editor-meta)', padding: '0 0.15em' },
  '.cm-lp-task': {
    margin: '0 0.35em 0 0',
    verticalAlign: '-0.12em',
    cursor: 'pointer',
    accentColor: 'var(--mnemo-accent)',
  },
  '.cm-lp-task-done': { color: 'var(--mnemo-editor-meta)', textDecoration: 'line-through' },
  '.cm-lp-highlight': {
    backgroundColor: 'color-mix(in srgb, var(--mnemo-accent) 28%, transparent)',
    borderRadius: '2px',
  },
  '.cm-lp-inline-code': {
    backgroundColor: 'color-mix(in srgb, var(--mnemo-editor-code-fg) 10%, transparent)',
    borderRadius: '3px',
    padding: '0 0.15em',
  },
  '.cm-lp-link': { cursor: 'pointer' },
  '.cm-line.cm-lp-quote': {
    borderLeft: '3px solid var(--mnemo-border-strong)',
    paddingLeft: '0.75em',
  },
  '.cm-line.cm-lp-hr-line': { position: 'relative' },
  '.cm-lp-hr': {
    display: 'inline-block',
    width: '100%',
    verticalAlign: 'middle',
    borderTop: '1px solid var(--mnemo-border-strong)',
  },
  '.cm-line.cm-lp-codeblock': {
    fontFamily: 'var(--mnemo-editor-mono-font-family)',
    backgroundColor: 'color-mix(in srgb, var(--mnemo-editor-code-fg) 7%, transparent)',
    paddingLeft: '0.75em',
  },
  '.cm-line.cm-lp-codeblock-first': { borderTopLeftRadius: '4px', borderTopRightRadius: '4px' },
  '.cm-line.cm-lp-codeblock-last': { borderBottomLeftRadius: '4px', borderBottomRightRadius: '4px' },
  '.cm-line.cm-lp-fence': { color: 'var(--mnemo-editor-meta)', fontSize: '0.85em', opacity: '0.7' },
  '.cm-lp-image': { display: 'inline-block', width: '100%', lineHeight: '0', padding: '0.25em 0' },
  '.cm-lp-image img': {
    // Tailwind preflight makes <img> display:block, which would ignore the wrapper's text-align.
    display: 'inline-block',
    maxWidth: '100%',
    height: 'auto',
    borderRadius: '4px',
    border: '1px solid var(--mnemo-border)',
  },
  '.cm-lp-table-wrap': { overflowX: 'auto', padding: '0.35em 0' },
  '.cm-lp-table': { borderCollapse: 'collapse', fontSize: '0.95em' },
  '.cm-lp-table th, .cm-lp-table td': {
    border: '1px solid var(--mnemo-border-strong)',
    padding: '0.25em 0.6em',
    cursor: 'text',
    verticalAlign: 'top',
  },
  '.cm-lp-table th': {
    fontWeight: '600',
    backgroundColor: 'color-mix(in srgb, var(--mnemo-editor-foreground) 6%, transparent)',
  },
  '.cm-lp-table code': { fontFamily: 'var(--mnemo-editor-mono-font-family)', fontSize: '0.9em' },
  '.cm-lp-table mark': { backgroundColor: 'color-mix(in srgb, var(--mnemo-accent) 28%, transparent)', color: 'inherit' },
  '.cm-lp-table a': { color: 'var(--mnemo-editor-link)' },
  '.cm-lp-image-center': { textAlign: 'center' },
  '.cm-lp-image-right': { textAlign: 'right' },
  '.cm-lp-image-left': { textAlign: 'left' },
});

/** Live preview extension. `openLink` receives the raw link target on Ctrl/⌘-click. */
export function livePreview(openLink: (href: string) => void): Extension {
  return [livePreviewPlugin, tableField, livePreviewLinkClicks(openLink), livePreviewTheme];
}

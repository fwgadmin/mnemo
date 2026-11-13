/**
 * Obsidian-style live preview for the Markdown editor.
 *
 * Markdown stays the stored text; this only changes how it is drawn. Syntax marks (`#`, `**`, `` ` ``, `[`/`](url)`,
 * `>`, `==`) are hidden unless the selection touches the element, images render inline, bullets and task boxes
 * become widgets, and quotes / code blocks / rules get block styling. Moving the cursor into an element reveals
 * its raw Markdown so it can be edited directly.
 */
import { syntaxTree } from '@codemirror/language';
import type { EditorState, Extension, Range } from '@codemirror/state';
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

class ImageWidget extends WidgetType {
  constructor(
    private readonly src: string,
    private readonly alt: string,
    private readonly width: number,
    private readonly align: string,
  ) {
    super();
  }
  eq(o: ImageWidget): boolean {
    return o.src === this.src && o.alt === this.alt && o.width === this.width && o.align === this.align;
  }
  toDOM(): HTMLElement {
    const wrap = document.createElement('span');
    wrap.className = `cm-lp-image cm-lp-image-${this.align}`;
    const img = document.createElement('img');
    img.src = this.src;
    img.alt = this.alt;
    img.title = this.alt;
    img.style.width = `${this.width}%`;
    img.draggable = false;
    wrap.appendChild(img);
    return wrap;
  }
  ignoreEvent(): boolean {
    return false;
  }
}

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
          const src = m ? livePreviewImageSrc(m[2]!) : null;
          if (m && src) {
            const opts = parseMediaDisplayOptions(m[3]);
            out.push(
              Decoration.replace({ widget: new ImageWidget(src, m[1] ?? '', opts.width, opts.align) }).range(
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
  '.cm-lp-image-center': { textAlign: 'center' },
  '.cm-lp-image-right': { textAlign: 'right' },
  '.cm-lp-image-left': { textAlign: 'left' },
});

/** Live preview extension. `openLink` receives the raw link target on Ctrl/⌘-click. */
export function livePreview(openLink: (href: string) => void): Extension {
  return [livePreviewPlugin, livePreviewLinkClicks(openLink), livePreviewTheme];
}

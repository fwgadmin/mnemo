// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { EditorSelection, EditorState } from '@codemirror/state';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { buildLivePreviewDecorations, livePreviewImageSrc, markdownHighlight } from './livePreview';
import { markdownToClipboardHtml } from './richClipboard';

const HASH = 'c'.repeat(64);

function stateFor(doc: string, cursor: number): EditorState {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.cursor(cursor),
    extensions: [markdown({ base: markdownLanguage, extensions: [markdownHighlight] })],
  });
  ensureSyntaxTree(state, doc.length, 5000);
  return state;
}

/** Text of every hidden/replaced range, in document order. */
function hidden(doc: string, cursor: number): string[] {
  const state = stateFor(doc, cursor);
  const { atomic } = buildLivePreviewDecorations(state, [{ from: 0, to: doc.length }]);
  const out: string[] = [];
  atomic.between(0, doc.length, (from, to) => {
    out.push(doc.slice(from, to));
  });
  return out;
}

function lineClasses(doc: string, cursor: number): string[] {
  const state = stateFor(doc, cursor);
  const { decorations } = buildLivePreviewDecorations(state, [{ from: 0, to: doc.length }]);
  const out: string[] = [];
  decorations.between(0, doc.length, (_f, _t, deco) => {
    const cls = (deco.spec as { class?: string }).class;
    if (cls) out.push(cls);
  });
  return out;
}

describe('==highlight== syntax', () => {
  it('parses Highlight nodes but not ===, spaced, or code', () => {
    const names = (doc: string) => {
      const state = stateFor(doc, 0);
      const seen: string[] = [];
      syntaxTree(state).iterate({ enter: n => void seen.push(n.name) });
      return seen;
    };
    expect(names('a ==hot== b')).toContain('Highlight');
    expect(names('a === b')).not.toContain('Highlight');
    expect(names('a == b == c')).not.toContain('Highlight');
    expect(names('`==x==`')).not.toContain('Highlight');
  });
});

describe('live preview decorations', () => {
  const doc = '# Title\n\nSome **bold** and ==hot== with [a link](https://example.com).\n';
  const away = doc.length; // cursor on the trailing empty line

  it('hides syntax away from the cursor', () => {
    expect(hidden(doc, away)).toEqual(['# ', '**', '**', '==', '==', '[', '](https://example.com)']);
  });

  it('reveals the element under the cursor only', () => {
    const inBold = doc.indexOf('bold') + 1;
    const h = hidden(doc, inBold);
    expect(h).toContain('# ');
    expect(h).not.toContain('**');
    expect(h).toContain('==');
    const onHeading = 3;
    expect(hidden(doc, onHeading)).not.toContain('# ');
  });

  it('turns list bullets and task markers into widgets off the cursor line', () => {
    const list = '- plain\n- [ ] todo\n- [x] done\n\nend';
    const h = hidden(list, list.length);
    expect(h).toEqual(['-', '- ', '[ ]', '- ', '[x]']);
    expect(lineClasses(list, list.length)).toContain('cm-lp-task-done');
    // Cursor on the "todo" line shows its raw Markdown.
    expect(hidden(list, list.indexOf('todo'))).toEqual(['-', '- ', '[x]']);
  });

  it('styles quotes, rules, and code blocks; dims fences only when inactive', () => {
    const md = '> quoted\n\n---\n\n```js\nx()\n```\n\nend';
    const cls = lineClasses(md, md.length);
    expect(cls).toContain('cm-lp-quote');
    expect(cls).toContain('cm-lp-hr-line');
    expect(cls.filter(c => c.includes('cm-lp-fence'))).toHaveLength(2);
    expect(hidden(md, md.length)).toEqual(['> ', '---']);
    const inCode = md.indexOf('x()');
    expect(lineClasses(md, inCode).filter(c => c.includes('cm-lp-fence'))).toHaveLength(0);
  });

  it('renders attachment and data images, leaves other image URLs as Markdown', () => {
    const md = `![a](mnemo-asset://asset/${HASH}.png "mnemo:w=50;align=left")\n\n![b](https://x.test/b.png)\n\nend`;
    expect(hidden(md, md.length)).toEqual([`![a](mnemo-asset://asset/${HASH}.png "mnemo:w=50;align=left")`]);
    expect(livePreviewImageSrc(`mnemo-asset://asset/${HASH}.pdf`)).toBeNull();
    expect(livePreviewImageSrc('data:image/png;base64,AA==')).toBe('data:image/png;base64,AA==');
    expect(livePreviewImageSrc('javascript:alert(1)')).toBeNull();
  });
});

describe('highlight rendering', () => {
  it('renders ==text== as <mark> in clipboard HTML but not inside code', async () => {
    const html = await markdownToClipboardHtml('a ==hot== b `==x==`');
    expect(html).toContain('<mark>hot</mark>');
    expect(html).toContain('<code>==x==</code>');
  });
});

describe('tables', () => {
  it('parses cells with offsets, alignment, escaped pipes, and pipes inside code', async () => {
    const { parseMarkdownTable } = await import('./markdownTable');
    const src = '| A | B |\n|:--|--:|\n| `a|b` | x \\| y |\n';
    const t = parseMarkdownTable(src, 100)!;
    expect(t.aligns).toEqual(['left', 'right']);
    expect(t.header.map(c => c.text)).toEqual(['A', 'B']);
    expect(t.rows[0]!.map(c => c.text)).toEqual(['`a|b`', 'x \\| y']);
    expect(t.header[1]!.from).toBe(100 + src.indexOf('B'));
    expect(parseMarkdownTable('| A |\n| nope |', 0)).toBeNull();
  });

  it('replaces a table with a widget only when the cursor is outside it', async () => {
    const { buildTableDecorations } = await import('./livePreview');
    const md = 'intro\n\n| A | B |\n| --- | --- |\n| 1 | **2** |\n\nend';
    const count = (cursor: number) => {
      let n = 0;
      buildTableDecorations(stateFor(md, cursor)).between(0, md.length, () => void n++);
      return n;
    };
    expect(count(0)).toBe(1);
    expect(count(md.indexOf('**2**'))).toBe(0);
  });

  it('renders inline Markdown in cells, sanitized', async () => {
    const { markdownInlineToHtml } = await import('./richClipboard');
    expect(markdownInlineToHtml('**b** ==h== `c`')).toBe('<strong>b</strong> <mark>h</mark> <code>c</code>');
    expect(markdownInlineToHtml('<img src=x onerror=alert(1)>')).not.toContain('onerror');
  });
});

describe('table source mode', () => {
  it('leaves inline Markdown inside a table unhidden', () => {
    const md = '| A |\n| --- |\n| **b** [l](https://x.test) |\n\nend';
    expect(hidden(md, md.indexOf('A'))).toEqual([]);
  });
});

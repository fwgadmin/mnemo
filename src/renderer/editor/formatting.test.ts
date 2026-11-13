import { describe, expect, it } from 'vitest';
import { EditorSelection, EditorState } from '@codemirror/state';
import { linkCommand, setLineFormatSpec, toggleInlineSpec, type InlineFormat, type LineFormat } from './formatting';

function sel(doc: string, from: number, to = from): EditorState {
  return EditorState.create({ doc, selection: EditorSelection.range(from, to) });
}

/** Apply an inline toggle to `[selected]` text marked with brackets; return doc with the new selection bracketed. */
function inline(marked: string, format: InlineFormat): string {
  const from = marked.indexOf('[');
  const to = marked.indexOf(']') - 1;
  const doc = marked.replace('[', '').replace(']', '');
  const state = sel(doc, from, to);
  const next = state.update(toggleInlineSpec(state, format)).state;
  const r = next.selection.main;
  const d = next.doc.toString();
  return d.slice(0, r.from) + '[' + d.slice(r.from, r.to) + ']' + d.slice(r.to);
}

function lines(doc: string, from: number, to: number, format: LineFormat): string {
  const state = sel(doc, from, to);
  return state.update(setLineFormatSpec(state, format)).state.doc.toString();
}

describe('inline formatting toggles', () => {
  it('wraps, then unwraps from outside or inside the markers', () => {
    expect(inline('a [word] b', 'bold')).toBe('a **[word]** b');
    expect(inline('a **[word]** b', 'bold')).toBe('a [word] b');
    expect(inline('a [**word**] b', 'bold')).toBe('a [word] b');
    expect(inline('x [hot] y', 'highlight')).toBe('x ==[hot]== y');
    expect(inline('x ~~[gone]~~ y', 'strike')).toBe('x [gone] y');
    expect(inline('[f()]', 'code')).toBe('`[f()]`');
  });

  it('keeps bold and italic distinct', () => {
    expect(inline('**[bold]**', 'italic')).toBe('***[bold]***');
    expect(inline('***[both]***', 'italic')).toBe('**[both]**');
    expect(inline('***[both]***', 'bold')).toBe('*[both]*');
    expect(inline('*[it]*', 'bold')).toBe('***[it]***');
  });

  it('keeps selected surrounding spaces outside the markers', () => {
    expect(inline('a[ word ]b', 'bold')).toBe('a **[word]** b');
  });

  it('inserts an empty pair at a cursor', () => {
    const state = sel('ab', 1);
    const next = state.update(toggleInlineSpec(state, 'bold')).state;
    expect(next.doc.toString()).toBe('a****b');
    expect(next.selection.main.head).toBe(3);
  });
});

describe('line formatting toggles', () => {
  it('sets and replaces headings, toggling off when already applied', () => {
    expect(lines('Title', 0, 0, 'h2')).toBe('## Title');
    expect(lines('# Title', 0, 0, 'h2')).toBe('## Title');
    expect(lines('## Title', 0, 0, 'h2')).toBe('Title');
    expect(lines('#### Deep', 0, 0, 'paragraph')).toBe('Deep');
  });

  it('applies lists and quotes across lines, numbering ordered lists, skipping blank lines', () => {
    const doc = 'one\n\ntwo\nthree';
    expect(lines(doc, 0, doc.length, 'number')).toBe('1. one\n\n2. two\n3. three');
    expect(lines(doc, 0, doc.length, 'bullet')).toBe('- one\n\n- two\n- three');
    expect(lines('- [ ] a\n- [x] b', 0, 15, 'task')).toBe('a\nb');
    expect(lines('- a\n- b', 0, 7, 'task')).toBe('- [ ] a\n- [ ] b');
    expect(lines('  - nested', 0, 0, 'quote')).toBe('  > nested');
  });
});

describe('link command', () => {
  it('wraps a label and selects the url placeholder; links a selected URL', () => {
    let state = sel('see docs', 4, 8);
    linkCommand({ state, dispatch: tr => void (state = tr.state) });
    expect(state.doc.toString()).toBe('see [docs](url)');
    expect(state.sliceDoc(state.selection.main.from, state.selection.main.to)).toBe('url');

    state = sel('https://x.test', 0, 14);
    linkCommand({ state, dispatch: tr => void (state = tr.state) });
    expect(state.doc.toString()).toBe('[](https://x.test)');
    expect(state.selection.main.head).toBe(1);
  });
});

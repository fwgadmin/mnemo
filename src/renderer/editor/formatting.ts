/**
 * Markdown formatting commands shared by the selection toolbar, keyboard shortcuts, and the context menu.
 * Each command toggles: applying it to already-formatted text removes the formatting.
 */
import { EditorSelection, type EditorState, type StateCommand, type TransactionSpec } from '@codemirror/state';

export type InlineFormat = 'bold' | 'italic' | 'strike' | 'highlight' | 'code';
export type LineFormat = 'h1' | 'h2' | 'h3' | 'paragraph' | 'quote' | 'bullet' | 'number' | 'task';

const INLINE_MARKERS: Record<InlineFormat, string> = {
  bold: '**',
  italic: '*',
  strike: '~~',
  highlight: '==',
  code: '`',
};

function runLength(text: string, ch: string, fromEnd: boolean): number {
  let n = 0;
  if (fromEnd) for (let i = text.length - 1; i >= 0 && text[i] === ch; i--) n++;
  else for (let i = 0; i < text.length && text[i] === ch; i++) n++;
  return n;
}

/** `*`/`**` share a character: `***x***` is bold+italic, so either can be removed from a run of 3. */
function runMatches(run: number, markerLen: number, ch: string): boolean {
  if (run === markerLen) return true;
  return ch === '*' && run === 3;
}

export function toggleInlineSpec(state: EditorState, format: InlineFormat): TransactionSpec {
  const marker = INLINE_MARKERS[format];
  const m = marker.length;
  const ch = marker[0]!;
  return state.changeByRange(range => {
    // Leave surrounding whitespace outside the markers ("**word** " not "**word **").
    let from = range.from;
    let to = range.to;
    while (from < to && /\s/.test(state.sliceDoc(from, from + 1))) from++;
    while (to > from && /\s/.test(state.sliceDoc(to - 1, to))) to--;

    if (from === to) {
      return {
        changes: { from: range.from, insert: marker + marker },
        range: EditorSelection.cursor(range.from + m),
      };
    }

    const before = state.sliceDoc(Math.max(0, from - 3), from);
    const after = state.sliceDoc(to, to + 3);
    const runBefore = runLength(before, ch, true);
    const runAfter = runLength(after, ch, false);
    if (runBefore === runAfter && runMatches(runBefore, m, ch)) {
      return {
        changes: [
          { from: from - m, to: from },
          { from: to, to: to + m },
        ],
        range: EditorSelection.range(from - m, to - m),
      };
    }

    const text = state.sliceDoc(from, to);
    const innerBefore = runLength(text, ch, false);
    const innerAfter = runLength(text, ch, true);
    if (text.length > 2 * m && innerBefore === innerAfter && runMatches(innerBefore, m, ch)) {
      return {
        changes: [
          { from, to: from + m },
          { from: to - m, to },
        ],
        range: EditorSelection.range(from, to - 2 * m),
      };
    }

    return {
      changes: [
        { from, insert: marker },
        { from: to, insert: marker },
      ],
      range: EditorSelection.range(from + m, to + m),
    };
  });
}

/** Existing block prefix: indentation, then a heading / quote / task / bullet / ordered marker. */
const PREFIX = /^(\s*)(#{1,6}\s+|>\s?|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+)?/;

function prefixKind(prefix: string): string | null {
  if (!prefix) return null;
  if (/^#\s/.test(prefix)) return 'h1';
  if (/^##\s/.test(prefix)) return 'h2';
  if (/^###\s/.test(prefix)) return 'h3';
  if (/^#{4,6}\s/.test(prefix)) return 'h4-6';
  if (prefix.startsWith('>')) return 'quote';
  if (/^[-*+]\s+\[/.test(prefix)) return 'task';
  if (/^[-*+]/.test(prefix)) return 'bullet';
  return 'number';
}

export function setLineFormatSpec(state: EditorState, format: LineFormat): TransactionSpec {
  const lines = new Set<number>();
  for (const r of state.selection.ranges) {
    const first = state.doc.lineAt(r.from).number;
    const last = state.doc.lineAt(r.to).number;
    for (let n = first; n <= last; n++) lines.add(n);
  }
  const ordered = [...lines].sort((a, b) => a - b);
  // Toggle off only when every selected line already has this format.
  const kindOf = (n: number) => prefixKind(PREFIX.exec(state.doc.line(n).text)![2] ?? '') ?? 'paragraph';
  const allHave = format !== 'paragraph' && ordered.every(n => kindOf(n) === format);
  const changes: Array<{ from: number; to: number; insert: string }> = [];
  let counter = 0;
  for (const n of ordered) {
    const line = state.doc.line(n);
    const m = PREFIX.exec(line.text)!;
    const indent = m[1] ?? '';
    const existing = m[2] ?? '';
    if (line.text.trim() === '' && ordered.length > 1) continue;
    let insert = '';
    if (!allHave) {
      counter++;
      insert = {
        h1: '# ',
        h2: '## ',
        h3: '### ',
        paragraph: '',
        quote: '> ',
        bullet: '- ',
        number: `${counter}. `,
        task: '- [ ] ',
      }[format];
    }
    const from = line.from + indent.length;
    changes.push({ from, to: from + existing.length, insert });
  }
  return { changes, userEvent: 'input.format', scrollIntoView: true };
}

export function inlineCommand(format: InlineFormat): StateCommand {
  return ({ state, dispatch }) => {
    dispatch(state.update(toggleInlineSpec(state, format), { userEvent: 'input.format', scrollIntoView: true }));
    return true;
  };
}

export function lineCommand(format: LineFormat): StateCommand {
  return ({ state, dispatch }) => {
    dispatch(state.update(setLineFormatSpec(state, format)));
    return true;
  };
}

/** Wrap the selection as a link label and select the `url` placeholder (or link a selected URL). */
export const linkCommand: StateCommand = ({ state, dispatch }) => {
  const range = state.selection.main;
  const text = state.sliceDoc(range.from, range.to);
  if (/^https?:\/\/\S+$/.test(text)) {
    const insert = `[](${text})`;
    dispatch(
      state.update({
        changes: { from: range.from, to: range.to, insert },
        selection: EditorSelection.cursor(range.from + 1),
        userEvent: 'input.format',
      }),
    );
    return true;
  }
  const label = text || 'text';
  const insert = `[${label}](url)`;
  const urlFrom = range.from + label.length + 3;
  dispatch(
    state.update({
      changes: { from: range.from, to: range.to, insert },
      selection: EditorSelection.range(urlFrom, urlFrom + 3),
      userEvent: 'input.format',
    }),
  );
  return true;
};

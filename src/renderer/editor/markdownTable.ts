/** GFM table source → cells with document offsets (for rendering and click-to-edit). */

export type TableAlign = 'left' | 'center' | 'right' | null;

export interface TableCell {
  /** Trimmed Markdown source of the cell. */
  text: string;
  /** Document offset of the first character of `text` (or of the cell gap when empty). */
  from: number;
}

export interface ParsedTable {
  aligns: TableAlign[];
  header: TableCell[];
  rows: TableCell[][];
}

/** Split one table row on unescaped pipes outside inline code; offsets are absolute. */
export function splitTableRow(line: string, lineFrom: number): TableCell[] {
  const cells: TableCell[] = [];
  let start = 0;
  let inCode = false;
  const push = (end: number) => {
    const raw = line.slice(start, end);
    const lead = raw.length - raw.trimStart().length;
    cells.push({ text: raw.trim(), from: lineFrom + start + lead });
  };
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '\\') {
      i++;
      continue;
    }
    if (ch === '`') inCode = !inCode;
    if (ch === '|' && !inCode) {
      push(i);
      start = i + 1;
    }
  }
  push(line.length);
  // Leading / trailing pipes produce empty edge cells.
  if (cells.length && cells[0]!.text === '' && /^\s*\|/.test(line)) cells.shift();
  if (cells.length && cells[cells.length - 1]!.text === '' && /\|\s*$/.test(line)) cells.pop();
  return cells;
}

export function parseMarkdownTable(text: string, from: number): ParsedTable | null {
  const lines: Array<{ text: string; from: number }> = [];
  let pos = from;
  for (const l of text.split('\n')) {
    lines.push({ text: l, from: pos });
    pos += l.length + 1;
  }
  if (lines.length < 2) return null;
  const delim = splitTableRow(lines[1]!.text, lines[1]!.from);
  if (!delim.length || !delim.every(c => /^:?-+:?$/.test(c.text))) return null;
  const aligns: TableAlign[] = delim.map(c =>
    c.text.startsWith(':') && c.text.endsWith(':') ? 'center' : c.text.endsWith(':') ? 'right' : c.text.startsWith(':') ? 'left' : null,
  );
  const header = splitTableRow(lines[0]!.text, lines[0]!.from);
  const rows = lines
    .slice(2)
    .filter(l => l.text.trim() !== '')
    .map(l => splitTableRow(l.text, l.from));
  return { aligns, header, rows };
}

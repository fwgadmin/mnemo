/**
 * Pure sheet operations used by the grid: sorting rows and fill-handle series. No DOM, fully testable.
 */
import { cellKey, parseCellKey, type CellFormat, type SheetData } from './sheet';
import { dateStringToSerial, literalValue, offsetFormula, serialToDateString, SheetError, type CellValue } from './sheetFormula';

export interface Rect {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}

/** Numbers < text < booleans; blanks always last; text compares case-insensitively with numeric awareness. */
export function compareCellValues(a: CellValue, b: CellValue): number {
  const empty = (v: CellValue) => v === null || v === '';
  if (empty(a) || empty(b)) return empty(a) === empty(b) ? 0 : empty(a) ? 1 : -1;
  const rank = (v: CellValue) => (typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : typeof v === 'boolean' ? 2 : 3);
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  return String(a instanceof SheetError ? a.code : a).localeCompare(String(b instanceof SheetError ? b.code : b));
}

/**
 * Reorder rows r1..r2 (every column) by the computed value in `col`. Stable; blanks stay last in both
 * directions. Formulas in moved rows shift their relative references by the row distance (Excel behaviour).
 */
export function sortRows(
  sheet: SheetData,
  rows: { r1: number; r2: number },
  col: number,
  descending: boolean,
  valueAt: (row: number, col: number) => CellValue,
): SheetData {
  const order = Array.from({ length: rows.r2 - rows.r1 + 1 }, (_, i) => rows.r1 + i);
  const keyed = order.map(r => ({ r, v: valueAt(r, col) }));
  keyed.sort((x, y) => {
    const blankX = x.v === null || x.v === '';
    const blankY = y.v === null || y.v === '';
    if (blankX || blankY) return blankX === blankY ? x.r - y.r : blankX ? 1 : -1;
    const c = compareCellValues(x.v, y.v);
    return (descending ? -c : c) || x.r - y.r;
  });
  const destOf = new Map<number, number>();
  keyed.forEach((k, i) => destOf.set(k.r, rows.r1 + i));

  const cells: Record<string, string> = {};
  for (const [key, raw] of Object.entries(sheet.cells)) {
    const a = parseCellKey(key)!;
    const dest = destOf.get(a.row);
    if (dest === undefined) {
      cells[key] = raw;
      continue;
    }
    cells[cellKey(dest, a.col)] = raw.startsWith('=') ? offsetFormula(raw, dest - a.row, 0) : raw;
  }
  let formats = sheet.formats;
  if (formats) {
    const moved: Record<string, CellFormat> = {};
    for (const [key, f] of Object.entries(formats)) {
      const a = parseCellKey(key)!;
      const dest = destOf.get(a.row);
      moved[dest === undefined ? key : cellKey(dest, a.col)] = f;
    }
    formats = moved;
  }
  return { ...sheet, cells, ...(formats ? { formats } : {}) };
}

/** "Item 7" → { prefix: "Item ", n: 7, width: 1 }; null when there is no trailing integer. */
function trailingNumber(text: string): { prefix: string; n: number; width: number } | null {
  const m = /^(.*?)(\d+)$/.exec(text);
  if (!m || m[1] === '' || /[-+.]$/.test(m[1]!)) return null;
  return { prefix: m[1]!, n: Number(m[2]), width: m[2]!.length };
}

/**
 * Values for extending one line of source cells (raws in order) by `count` steps, Excel-style:
 * numbers/dates continue their arithmetic step (single numbers repeat), "Item 1" text increments,
 * formulas shift by their distance from the source cell, other text repeats.
 */
export function fillSeries(sources: string[], count: number, step: { dRow: number; dCol: number }): string[] {
  const out: string[] = [];
  const n = sources.length;
  const nums = sources.map(s => (s.startsWith('=') ? null : literalValue(s)));
  const allNumeric = n > 0 && nums.every(v => typeof v === 'number');
  const allDates = n > 0 && sources.every(s => dateStringToSerial(s) !== null);
  if (allNumeric && (n > 1 || allDates)) {
    const vals = nums as number[];
    const delta = n > 1 ? (vals[n - 1]! - vals[0]!) / (n - 1) : 1;
    for (let i = 1; i <= count; i++) {
      const v = vals[n - 1]! + delta * i;
      out.push(allDates ? serialToDateString(v) : String(Number.parseFloat(v.toPrecision(15))));
    }
    return out;
  }
  const tails = sources.map(trailingNumber);
  const sameTailPrefix = tails.every(t => t && t.prefix === tails[0]!.prefix);
  if (sameTailPrefix && !sources.some(s => s.startsWith('='))) {
    const t = tails as Array<{ prefix: string; n: number; width: number }>;
    const delta = n > 1 ? (t[n - 1]!.n - t[0]!.n) / (n - 1) : 1;
    if (Number.isInteger(delta)) {
      for (let i = 1; i <= count; i++) {
        const v = t[n - 1]!.n + delta * i;
        out.push(`${t[0]!.prefix}${String(Math.max(0, v)).padStart(t[n - 1]!.width, '0')}`);
      }
      return out;
    }
  }
  for (let i = 0; i < count; i++) {
    const srcIdx = i % n;
    const raw = sources[srcIdx]!;
    const distance = n + i - srcIdx; // how far the new cell is from its source
    out.push(raw.startsWith('=') ? offsetFormula(raw, step.dRow * distance, step.dCol * distance) : raw);
  }
  return out;
}

/** Cell updates for dragging the fill handle from `src` to the cell `target` (down/up/right/left). */
export function fillRange(
  sheet: SheetData,
  src: Rect,
  target: { row: number; col: number },
): { cells: Record<string, string>; formats: Record<string, CellFormat | null>; filled: Rect } | null {
  const down = target.row - src.r2;
  const up = src.r1 - target.row;
  const right = target.col - src.c2;
  const left = src.c1 - target.col;
  const vertical = Math.max(down, up) >= Math.max(right, left);
  const cells: Record<string, string> = {};
  const formats: Record<string, CellFormat | null> = {};
  const raw = (r: number, c: number) => sheet.cells[cellKey(r, c)] ?? '';
  const fmt = (r: number, c: number) => sheet.formats?.[cellKey(r, c)] ?? null;
  if (vertical && Math.max(down, up) > 0) {
    const forward = down >= up;
    const count = forward ? down : up;
    for (let c = src.c1; c <= src.c2; c++) {
      const column = Array.from({ length: src.r2 - src.r1 + 1 }, (_, i) => raw(src.r1 + i, c));
      const seq = forward ? column : [...column].reverse();
      const vals = fillSeries(seq, count, { dRow: forward ? 1 : -1, dCol: 0 });
      vals.forEach((v, i) => {
        const r = forward ? src.r2 + 1 + i : src.r1 - 1 - i;
        cells[cellKey(r, c)] = v;
        const srcRow = forward ? src.r1 + (i % column.length) : src.r2 - (i % column.length);
        formats[cellKey(r, c)] = fmt(srcRow, c);
      });
    }
    return {
      cells,
      formats,
      filled: forward ? { ...src, r2: src.r2 + count } : { ...src, r1: src.r1 - count },
    };
  }
  if (!vertical && Math.max(right, left) > 0) {
    const forward = right >= left;
    const count = forward ? right : left;
    for (let r = src.r1; r <= src.r2; r++) {
      const line = Array.from({ length: src.c2 - src.c1 + 1 }, (_, i) => raw(r, src.c1 + i));
      const seq = forward ? line : [...line].reverse();
      const vals = fillSeries(seq, count, { dRow: 0, dCol: forward ? 1 : -1 });
      vals.forEach((v, i) => {
        const c = forward ? src.c2 + 1 + i : src.c1 - 1 - i;
        cells[cellKey(r, c)] = v;
        const srcCol = forward ? src.c1 + (i % line.length) : src.c2 - (i % line.length);
        formats[cellKey(r, c)] = fmt(r, srcCol);
      });
    }
    return {
      cells,
      formats,
      filled: forward ? { ...src, c2: src.c2 + count } : { ...src, c1: src.c1 - count },
    };
  }
  return null;
}

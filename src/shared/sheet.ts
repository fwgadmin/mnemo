/**
 * Mnemo spreadsheet documents: the body of a `kind: 'sheet'` note.
 *
 * Stored as compact JSON so search still matches cell text and sync stays whole-note last-write-wins.
 * Cells hold the raw user input (`"12"`, `"hello"`, `"=SUM(A1:A3)"`); values are computed on demand
 * (see sheetFormula.ts) and never stored.
 */

export const SHEET_FORMAT_VERSION = 1;
export const DEFAULT_SHEET_ROWS = 100;
export const DEFAULT_SHEET_COLS = 26;
export const MAX_SHEET_ROWS = 100_000;
export const MAX_SHEET_COLS = 702; // A..ZZ

export type NumberFormatKind = 'general' | 'number' | 'integer' | 'percent' | 'currency' | 'date' | 'text';

/** Per-cell presentation. Absent keys mean defaults; only non-default formats are stored. */
export interface CellFormat {
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
  /** #rrggbb */
  color?: string;
  /** #rrggbb */
  fill?: string;
  num?: NumberFormatKind;
  /** Decimal places for number / percent / currency (0–10). */
  dp?: number;
}

export interface SheetData {
  name: string;
  /** A1 address → presentation (bold, colors, number format…). */
  formats?: Record<string, CellFormat>;
  /** A1 address → raw input. Empty strings are not stored. */
  cells: Record<string, string>;
  /** Column index (as string) → width in px. */
  colWidths?: Record<string, number>;
}

export interface SheetDoc {
  mnemoSheet: typeof SHEET_FORMAT_VERSION;
  sheets: SheetData[];
}

export interface CellAddress {
  row: number;
  col: number;
}

// ─── Addresses ──────────────────────────────────────────────────────────────────

export function colName(col: number): string {
  let n = col + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export function colIndex(name: string): number {
  let n = 0;
  for (const ch of name.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function cellKey(row: number, col: number): string {
  return `${colName(col)}${row + 1}`;
}

export function parseCellKey(key: string): CellAddress | null {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d{1,6})$/.exec(key.trim());
  if (!m) return null;
  const row = Number(m[2]) - 1;
  const col = colIndex(m[1]!);
  if (row < 0 || col < 0 || row >= MAX_SHEET_ROWS || col >= MAX_SHEET_COLS) return null;
  return { row, col };
}

/** `A1:C3` / `B2` → inclusive bounds (normalized so start <= end). */
export function parseRange(text: string): { r1: number; c1: number; r2: number; c2: number } | null {
  const [a, b] = text.split(':');
  const start = parseCellKey(a ?? '');
  const end = b === undefined ? start : parseCellKey(b);
  if (!start || !end) return null;
  return {
    r1: Math.min(start.row, end.row),
    c1: Math.min(start.col, end.col),
    r2: Math.max(start.row, end.row),
    c2: Math.max(start.col, end.col),
  };
}

// ─── Documents ──────────────────────────────────────────────────────────────────

export function emptySheet(name = 'Sheet1'): SheetData {
  return { name, cells: {} };
}

export function emptySheetDoc(): SheetDoc {
  return { mnemoSheet: SHEET_FORMAT_VERSION, sheets: [emptySheet()] };
}

export function serializeSheetDoc(doc: SheetDoc): string {
  return JSON.stringify(doc);
}

function cleanSheet(raw: unknown, index: number): SheetData {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const name = typeof o['name'] === 'string' && o['name'].trim() ? o['name'].trim().slice(0, 100) : `Sheet${index + 1}`;
  const cells: Record<string, string> = {};
  if (o['cells'] && typeof o['cells'] === 'object') {
    for (const [k, v] of Object.entries(o['cells'] as Record<string, unknown>)) {
      const addr = parseCellKey(k);
      if (!addr || v === null || v === undefined) continue;
      const text = typeof v === 'string' ? v : String(v);
      if (text !== '') cells[cellKey(addr.row, addr.col)] = text;
    }
  }
  const sheet: SheetData = { name, cells };
  if (o['formats'] && typeof o['formats'] === 'object') {
    const formats: Record<string, CellFormat> = {};
    for (const [k, v] of Object.entries(o['formats'] as Record<string, unknown>)) {
      const addr = parseCellKey(k);
      const f = cleanFormat(v);
      if (addr && f) formats[cellKey(addr.row, addr.col)] = f;
    }
    if (Object.keys(formats).length) sheet.formats = formats;
  }
  if (o['colWidths'] && typeof o['colWidths'] === 'object') {
    const widths: Record<string, number> = {};
    for (const [k, v] of Object.entries(o['colWidths'] as Record<string, unknown>)) {
      const w = Number(v);
      if (/^\d+$/.test(k) && Number.isFinite(w)) widths[k] = Math.max(30, Math.min(800, Math.round(w)));
    }
    if (Object.keys(widths).length) sheet.colWidths = widths;
  }
  return sheet;
}

/**
 * Parse a sheet note body. Never throws: an empty body is a new sheet, and non-JSON text (for example a
 * body edited by an older Mnemo build) is imported as CSV/TSV so nothing is lost.
 */
export function parseSheetDoc(body: string): SheetDoc {
  const text = body.trim();
  if (!text) return emptySheetDoc();
  try {
    const raw = JSON.parse(text) as Record<string, unknown>;
    if (raw && Array.isArray(raw['sheets'])) {
      const sheets = (raw['sheets'] as unknown[]).map(cleanSheet);
      uniquifySheetNames(sheets);
      return { mnemoSheet: SHEET_FORMAT_VERSION, sheets: sheets.length ? sheets : [emptySheet()] };
    }
  } catch {
    /* fall through to CSV */
  }
  return { mnemoSheet: SHEET_FORMAT_VERSION, sheets: [{ name: 'Sheet1', cells: cellsFromRows(parseDelimited(text)) }] };
}

const HEX = /^#[0-9a-f]{6}$/i;
const NUM_KINDS: readonly NumberFormatKind[] = ['general', 'number', 'integer', 'percent', 'currency', 'date', 'text'];

/** Validate a stored/imported format; null when it carries nothing. */
export function cleanFormat(raw: unknown): CellFormat | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const f: CellFormat = {};
  if (o['bold'] === true) f.bold = true;
  if (o['italic'] === true) f.italic = true;
  if (o['align'] === 'left' || o['align'] === 'center' || o['align'] === 'right') f.align = o['align'];
  if (typeof o['color'] === 'string' && HEX.test(o['color'])) f.color = o['color'].toLowerCase();
  if (typeof o['fill'] === 'string' && HEX.test(o['fill'])) f.fill = o['fill'].toLowerCase();
  if (typeof o['num'] === 'string' && NUM_KINDS.includes(o['num'] as NumberFormatKind) && o['num'] !== 'general') {
    f.num = o['num'] as NumberFormatKind;
  }
  if (typeof o['dp'] === 'number' && Number.isInteger(o['dp']) && o['dp'] >= 0 && o['dp'] <= 10) f.dp = o['dp'];
  return Object.keys(f).length ? f : null;
}

function uniquifySheetNames(sheets: SheetData[]): void {
  const seen = new Set<string>();
  for (const s of sheets) {
    let name = s.name;
    for (let i = 2; seen.has(name.toLowerCase()); i++) name = `${s.name} (${i})`;
    s.name = name;
    seen.add(name.toLowerCase());
  }
}

export function nextSheetName(doc: SheetDoc): string {
  const names = new Set(doc.sheets.map(s => s.name.toLowerCase()));
  for (let i = doc.sheets.length + 1; ; i++) if (!names.has(`sheet${i}`)) return `Sheet${i}`;
}

/** Used rows/cols (1 past the furthest non-empty cell). */
export function sheetExtent(sheet: SheetData): { rows: number; cols: number } {
  let rows = 0;
  let cols = 0;
  for (const key of Object.keys(sheet.cells)) {
    const a = parseCellKey(key);
    if (!a) continue;
    rows = Math.max(rows, a.row + 1);
    cols = Math.max(cols, a.col + 1);
  }
  return { rows, cols };
}

export function cellsFromRows(rows: readonly (readonly string[])[], origin: CellAddress = { row: 0, col: 0 }): Record<string, string> {
  const cells: Record<string, string> = {};
  rows.forEach((r, ri) =>
    r.forEach((v, ci) => {
      const row = origin.row + ri;
      const col = origin.col + ci;
      if (v !== '' && row < MAX_SHEET_ROWS && col < MAX_SHEET_COLS) cells[cellKey(row, col)] = v;
    }),
  );
  return cells;
}

// ─── CSV / TSV ──────────────────────────────────────────────────────────────────

/** RFC 4180 parsing (quotes, doubled quotes, embedded newlines). Delimiter auto-detects tab vs comma vs semicolon. */
export function parseDelimited(text: string, delimiter?: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const d =
    delimiter ??
    (firstLine.includes('\t') ? '\t' : firstLine.split(';').length > firstLine.split(',').length ? ';' : ',');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === '') quoted = true;
    else if (ch === d) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function toDelimited(rows: readonly (readonly string[])[], delimiter = ','): string {
  const quote = (v: string) =>
    v.includes(delimiter) || v.includes('"') || v.includes('\n') || v.includes('\r') || /^\s|\s$/.test(v)
      ? `"${v.replace(/"/g, '""')}"`
      : v;
  return rows.map(r => r.map(quote).join(delimiter)).join('\n');
}

// ─── Export payload (renderer → main) ──────────────────────────────────────────

export interface SheetExportCell {
  raw: string;
  value: string | number | boolean | null;
  format?: CellFormat;
}

export interface SheetExportPayload {
  format: 'csv' | 'xlsx';
  title: string;
  sheets: Array<{ name: string; cells: SheetExportCell[][]; colWidths: Record<string, number> }>;
}

/**
 * Spreadsheet file conversion (no Electron): XLSX via exceljs, CSV/TSV via shared/sheet. Used by the desktop
 * IPC layer (sheetFiles.ts) and the CLI.
 */
import ExcelJS from 'exceljs';
import {
  cellKey,
  cellsFromRows,
  parseDelimited,
  MAX_SHEET_COLS,
  MAX_SHEET_ROWS,
  type SheetData,
  type SheetExportPayload,
} from '../shared/sheet';
import { literalValue } from '../shared/sheetFormula';

const PX_PER_CHAR = 7;

function excelCellToRaw(cell: ExcelJS.Cell): string {
  const v = cell.value as unknown;
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && v !== null) {
    const o = v as Record<string, unknown>;
    if (typeof o['formula'] === 'string') return `=${o['formula']}`;
    if (typeof o['sharedFormula'] === 'string') {
      // Shared formulas: exceljs exposes the translated formula through cell.formula.
      return cell.formula ? `=${cell.formula}` : String(o['result'] ?? '');
    }
    if (Array.isArray(o['richText'])) return (o['richText'] as Array<{ text?: string }>).map(r => r.text ?? '').join('');
    if (typeof o['text'] === 'string') return o['text'] as string;
    if (typeof o['error'] === 'string') return o['error'] as string;
    if (v instanceof Date) return v.toISOString().slice(0, v.getUTCHours() || v.getUTCMinutes() ? 16 : 10).replace('T', ' ');
    return '';
  }
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return String(v);
}

export async function sheetsFromXlsx(buffer: Buffer): Promise<SheetData[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const out: SheetData[] = [];
  wb.eachSheet(ws => {
    const cells: Record<string, string> = {};
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber > MAX_SHEET_ROWS) return;
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        if (colNumber > MAX_SHEET_COLS) return;
        const raw = excelCellToRaw(cell);
        if (raw !== '') cells[cellKey(rowNumber - 1, colNumber - 1)] = raw;
      });
    });
    const colWidths: Record<string, number> = {};
    ws.columns?.forEach((c, i) => {
      if (c?.width) colWidths[String(i)] = Math.max(30, Math.min(800, Math.round(c.width * PX_PER_CHAR)));
    });
    out.push({ name: ws.name.slice(0, 100) || `Sheet${out.length + 1}`, cells, ...(Object.keys(colWidths).length ? { colWidths } : {}) });
  });
  return out;
}

export function sheetFromDelimited(text: string, name: string): SheetData {
  return { name, cells: cellsFromRows(parseDelimited(text)) };
}

const XLSX_BAD_NAME = /[[\]:*?/\\]/g;

export async function xlsxFromPayload(payload: SheetExportPayload): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Mnemo';
  const used = new Set<string>();
  for (const sheet of payload.sheets) {
    let name = sheet.name.replace(XLSX_BAD_NAME, ' ').trim().slice(0, 31) || 'Sheet';
    for (let i = 2; used.has(name.toLowerCase()); i++) name = `${name.slice(0, 27)} (${i})`;
    used.add(name.toLowerCase());
    const ws = wb.addWorksheet(name);
    sheet.cells.forEach((row, r) =>
      row.forEach((cell, c) => {
        if (cell.raw === '') return;
        const target = ws.getCell(r + 1, c + 1);
        if (cell.raw.startsWith('=') && cell.raw.length > 1) {
          const result = typeof cell.value === 'string' && cell.value.startsWith('#') ? undefined : cell.value ?? undefined;
          target.value = { formula: cell.raw.slice(1), result } as ExcelJS.CellFormulaValue;
        } else {
          const lit = literalValue(cell.raw);
          target.value = lit === null || typeof lit === 'object' ? cell.raw : lit;
        }
      }),
    );
    for (const [k, w] of Object.entries(sheet.colWidths)) ws.getColumn(Number(k) + 1).width = Math.round(w / PX_PER_CHAR);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

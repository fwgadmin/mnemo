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
  cleanFormat,
  type CellFormat,
  type NumberFormatKind,
  type SheetData,
  type SheetExportPayload,
} from '../shared/sheet';
import { dateStringToSerial, literalValue } from '../shared/sheetFormula';

/** Mnemo number format → Excel numFmt code. */
export function excelNumFmt(f: CellFormat | undefined, rawIsDate = false): string | undefined {
  const num = f?.num ?? (rawIsDate ? 'date' : undefined);
  if (!num) return undefined;
  const zeros = (dp: number) => (dp > 0 ? `.${'0'.repeat(dp)}` : '');
  switch (num) {
    case 'number':
      return `#,##0${zeros(f?.dp ?? 2)}`;
    case 'integer':
      return '#,##0';
    case 'percent':
      return `0${zeros(f?.dp ?? 0)}%`;
    case 'currency':
      return `"$"#,##0${zeros(f?.dp ?? 2)}`;
    case 'date':
      return 'yyyy-mm-dd';
    case 'text':
      return '@';
    default:
      return undefined;
  }
}

/** Excel numFmt code → Mnemo number format (best effort; unknown codes stay General). */
export function numFmtToFormat(code: string | undefined): Pick<CellFormat, 'num' | 'dp'> {
  if (!code || /^general$/i.test(code)) return {};
  const c = code.replace(/\[[^\]]*\]|"[^"]*"(?![^"]*\$)/g, m => (m.includes('$') ? '$' : ''));
  const dp = (/\.(0+)/.exec(c)?.[1]?.length ?? 0) as number;
  if (c === '@') return { num: 'text' };
  if (/[yd]{1,4}|m{3,}/i.test(c) && !/0/.test(c)) return { num: 'date' };
  if (c.includes('%')) return { num: 'percent', dp };
  if (/[$€£¥]/.test(code)) return { num: 'currency', dp };
  if (/^#,##0(\.0+)?$/.test(c)) return dp ? { num: 'number', dp } : { num: 'integer' };
  if (/^0\.0+$/.test(c)) return { num: 'number', dp };
  return {};
}

function argbToHex(argb: unknown): string | undefined {
  return typeof argb === 'string' && /^[0-9a-f]{8}$/i.test(argb) ? `#${argb.slice(2).toLowerCase()}` : undefined;
}

function formatFromExcel(cell: ExcelJS.Cell): CellFormat | null {
  const font = cell.font ?? {};
  const fill = cell.fill as { type?: string; pattern?: string; fgColor?: { argb?: string } } | undefined;
  const h = cell.alignment?.horizontal;
  return cleanFormat({
    bold: font.bold === true || undefined,
    italic: font.italic === true || undefined,
    color: argbToHex(font.color?.argb),
    fill: fill?.type === 'pattern' && fill.pattern === 'solid' ? argbToHex(fill.fgColor?.argb) : undefined,
    align: h === 'left' || h === 'center' || h === 'right' ? h : undefined,
    ...numFmtToFormat(cell.numFmt),
  } as Record<string, unknown>);
}

function applyExcelStyle(target: ExcelJS.Cell, f: CellFormat | undefined, rawIsDate: boolean): void {
  if (f?.bold || f?.italic || f?.color) {
    target.font = {
      ...(f.bold ? { bold: true } : {}),
      ...(f.italic ? { italic: true } : {}),
      ...(f.color ? { color: { argb: `FF${f.color.slice(1).toUpperCase()}` } } : {}),
    };
  }
  if (f?.fill) target.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${f.fill.slice(1).toUpperCase()}` } };
  if (f?.align) target.alignment = { horizontal: f.align };
  const numFmt = excelNumFmt(f, rawIsDate);
  if (numFmt) target.numFmt = numFmt;
}

export type { NumberFormatKind };

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
    const formats: Record<string, CellFormat> = {};
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber > MAX_SHEET_ROWS) return;
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        if (colNumber > MAX_SHEET_COLS) return;
        const raw = excelCellToRaw(cell);
        const key = cellKey(rowNumber - 1, colNumber - 1);
        if (raw !== '') cells[key] = raw;
        const f = formatFromExcel(cell);
        // A date cell's raw text is already an ISO date (shown as a date without a format).
        if (f && !(f.num === 'date' && Object.keys(f).length === 1)) formats[key] = f;
      });
    });
    const colWidths: Record<string, number> = {};
    ws.columns?.forEach((c, i) => {
      if (c?.width) colWidths[String(i)] = Math.max(30, Math.min(800, Math.round(c.width * PX_PER_CHAR)));
    });
    out.push({
      name: ws.name.slice(0, 100) || `Sheet${out.length + 1}`,
      cells,
      ...(Object.keys(colWidths).length ? { colWidths } : {}),
      ...(Object.keys(formats).length ? { formats } : {}),
    });
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
        if (cell.raw === '' && !cell.format) return;
        const target = ws.getCell(r + 1, c + 1);
        applyExcelStyle(target, cell.format, dateStringToSerial(cell.raw) !== null);
        if (cell.raw === '') return;
        if (cell.raw.startsWith('=') && cell.raw.length > 1) {
          const result = typeof cell.value === 'string' && cell.value.startsWith('#') ? undefined : cell.value ?? undefined;
          target.value = { formula: cell.raw.slice(1), result } as ExcelJS.CellFormulaValue;
        } else {
          const lit = literalValue(cell.raw);
          const serial = dateStringToSerial(cell.raw);
          target.value =
            serial !== null
              ? new Date(Math.round((serial - 25569) * 86_400_000))
              : lit === null || typeof lit === 'object'
                ? cell.raw
                : lit;
        }
      }),
    );
    for (const [k, w] of Object.entries(sheet.colWidths)) ws.getColumn(Number(k) + 1).width = Math.round(w / PX_PER_CHAR);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

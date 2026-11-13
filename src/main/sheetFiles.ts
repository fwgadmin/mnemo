/**
 * Spreadsheet import/export dialogs for sheet notes (desktop main process).
 */
import { BrowserWindow, dialog, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { IPC } from '../shared/types';
import { toDelimited, type SheetExportPayload } from '../shared/sheet';
import { sheetFromDelimited, sheetsFromXlsx, xlsxFromPayload } from './sheetConvert';

export { sheetFromDelimited, sheetsFromXlsx, xlsxFromPayload } from './sheetConvert';

const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

function validatePayload(raw: unknown): SheetExportPayload {
  const p = raw as SheetExportPayload;
  if (!p || (p.format !== 'csv' && p.format !== 'xlsx') || !Array.isArray(p.sheets) || p.sheets.length === 0) {
    throw new Error('Invalid spreadsheet export.');
  }
  return p;
}

function safeFileBase(title: string): string {
  return title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').trim().slice(0, 120) || 'Spreadsheet';
}

export function registerSheetFileIpc(): void {
  ipcMain.handle(IPC.SHEET_IMPORT_FILE, async event => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const opts: Electron.OpenDialogOptions = {
      properties: ['openFile'],
      filters: [{ name: 'Spreadsheets', extensions: ['xlsx', 'csv', 'tsv', 'txt'] }],
    };
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    const file = res.filePaths[0];
    if (res.canceled || !file) return null;
    const stat = await fs.promises.stat(file);
    if (stat.size > MAX_IMPORT_BYTES) throw new Error('That file is larger than the 25 MB import limit.');
    const ext = path.extname(file).toLowerCase();
    const base = path.basename(file, ext).slice(0, 100) || 'Imported';
    if (ext === '.xlsx') return sheetsFromXlsx(await fs.promises.readFile(file));
    return [sheetFromDelimited(await fs.promises.readFile(file, 'utf-8'), base)];
  });

  ipcMain.handle(IPC.SHEET_EXPORT_FILE, async (event, raw: unknown) => {
    const payload = validatePayload(raw);
    const win = BrowserWindow.fromWebContents(event.sender);
    const base = safeFileBase(payload.format === 'csv' ? `${payload.title} - ${payload.sheets[0]!.name}` : payload.title);
    const opts: Electron.SaveDialogOptions = {
      defaultPath: `${base}.${payload.format}`,
      filters: [payload.format === 'csv' ? { name: 'CSV', extensions: ['csv'] } : { name: 'Excel workbook', extensions: ['xlsx'] }],
    };
    const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
    if (res.canceled || !res.filePath) return false;
    if (payload.format === 'csv') {
      const rows = payload.sheets[0]!.cells.map(r => r.map(c => (c.value === null ? '' : String(c.value === true ? 'TRUE' : c.value === false ? 'FALSE' : c.value))));
      await fs.promises.writeFile(res.filePath, toDelimited(rows) + '\n', 'utf-8');
    } else {
      await fs.promises.writeFile(res.filePath, await xlsxFromPayload(payload));
    }
    return true;
  });
}

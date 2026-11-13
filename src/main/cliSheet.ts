/**
 * `mnemo sheet …` — create, print, and edit spreadsheet notes from the terminal.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { INoteStore, Note } from '../shared/types';
import {
  cellKey,
  emptySheetDoc,
  parseCellKey,
  parseRange,
  parseSheetDoc,
  serializeSheetDoc,
  sheetExtent,
  toDelimited,
  type SheetDoc,
  type SheetData,
} from '../shared/sheet';
import { createEvaluator, formatValue, sheetRows } from '../shared/sheetFormula';
import { sheetFromDelimited, sheetsFromXlsx } from './sheetConvert';
import { tagsForCategoryPath } from './cliCategory';

export type OpenStore = (argv: string[]) => Promise<{ store: INoteStore; tenantId: string }>;

export const SHEET_USAGE = `Usage:
  mnemo sheet new --title "Budget" [-c Category] [--from file.csv|file.xlsx]
  mnemo sheet show <ref|uuid> [--sheet NAME] [--range A1:D20] [--csv|--tsv|--json] [--formulas]
  mnemo sheet set <ref|uuid> <A1> <value> [--sheet NAME]     (value "=…" is a formula, "" clears)
  mnemo sheet list                                           (spreadsheet notes only)
Global flags: --workspace, --db, --vault (same as mnemo note …)`;

function takeFlag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  if (i < 0) return undefined;
  const v = argv[i + 1];
  argv.splice(i, v === undefined ? 1 : 2);
  return v;
}

function takeBool(argv: string[], name: string): boolean {
  const i = argv.indexOf(name);
  if (i < 0) return false;
  argv.splice(i, 1);
  return true;
}

async function resolveSheetNote(store: INoteStore, arg: string, tenantId: string): Promise<Note> {
  const note = /^\d+$/.test(arg) ? await store.readByRef(Number(arg), tenantId) : await store.read(arg);
  if (!note) throw new Error(`No note ${arg}.`);
  if (note.kind !== 'sheet') throw new Error(`Note ${arg} (“${note.title}”) is not a spreadsheet.`);
  return note;
}

function pickSheet(doc: SheetDoc, name: string | undefined): SheetData {
  if (!name) return doc.sheets[0]!;
  const s = doc.sheets.find(x => x.name.toLowerCase() === name.toLowerCase());
  if (!s) throw new Error(`No sheet “${name}”. Sheets: ${doc.sheets.map(x => x.name).join(', ')}`);
  return s;
}

function printTable(rows: string[][]): string {
  if (!rows.length) return '(empty sheet)';
  const widths = rows[0]!.map((_, c) => Math.min(40, Math.max(...rows.map(r => (r[c] ?? '').length), 1)));
  const fit = (v: string, w: number) => (v.length > w ? `${v.slice(0, w - 1)}…` : v.padEnd(w));
  return rows.map(r => r.map((v, c) => fit(v, widths[c]!)).join('  ').trimEnd()).join('\n');
}

export async function cmdSheet(argvIn: string[], openStore: OpenStore): Promise<void> {
  const sub = argvIn[0]?.toLowerCase();
  const argv = argvIn.slice(1);
  if (!sub || sub === 'help' || sub === '--help' || sub === '-h') {
    console.log(SHEET_USAGE);
    return;
  }

  if (sub === 'new') {
    const title = takeFlag(argv, '--title') ?? takeFlag(argv, '-t') ?? 'Untitled spreadsheet';
    const category = takeFlag(argv, '-c') ?? takeFlag(argv, '--category');
    const from = takeFlag(argv, '--from');
    let doc = emptySheetDoc();
    if (from) {
      const ext = path.extname(from).toLowerCase();
      const sheets =
        ext === '.xlsx'
          ? await sheetsFromXlsx(await fs.promises.readFile(from))
          : [sheetFromDelimited(await fs.promises.readFile(from, 'utf-8'), path.basename(from, ext) || 'Sheet1')];
      if (sheets.length) doc = { mnemoSheet: 1, sheets };
    }
    const { store, tenantId } = await openStore(argv);
    try {
      const note = await store.create({
        title,
        body: serializeSheetDoc(doc),
        tags: category ? tagsForCategoryPath(category, []) : [],
        tenantId,
        kind: 'sheet',
      });
      console.log(`Created spreadsheet #${note.ref} “${note.title}” (${note.id})`);
    } finally {
      store.close();
    }
    return;
  }

  if (sub === 'list' || sub === 'ls') {
    const { store, tenantId } = await openStore(argv);
    try {
      for (const n of (await store.list(tenantId)).filter(x => x.kind === 'sheet')) {
        console.log(`${String(n.ref).padStart(4)}  ${n.title}`);
      }
    } finally {
      store.close();
    }
    return;
  }

  if (sub === 'show' || sub === 'cat') {
    const sheetName = takeFlag(argv, '--sheet');
    const range = takeFlag(argv, '--range');
    const csv = takeBool(argv, '--csv');
    const tsv = takeBool(argv, '--tsv');
    const json = takeBool(argv, '--json');
    const formulas = takeBool(argv, '--formulas');
    const target = argv.shift();
    if (!target) throw new Error(SHEET_USAGE);
    const { store, tenantId } = await openStore(argv);
    try {
      const note = await resolveSheetNote(store, target, tenantId);
      const doc = parseSheetDoc(note.body);
      const sheet = pickSheet(doc, sheetName);
      const rows = sheetRows(doc, sheet, range, formulas);
      if (json) console.log(JSON.stringify({ ref: note.ref, id: note.id, title: note.title, sheet: sheet.name, sheets: doc.sheets.map(s => s.name), rows }));
      else if (csv || tsv) console.log(toDelimited(rows, tsv ? '\t' : ','));
      else {
        console.log(`#${note.ref} ${note.title} — ${sheet.name}${doc.sheets.length > 1 ? ` (sheets: ${doc.sheets.map(s => s.name).join(', ')})` : ''}\n`);
        console.log(printTable(rows));
      }
    } finally {
      store.close();
    }
    return;
  }

  if (sub === 'set') {
    const sheetName = takeFlag(argv, '--sheet');
    const [target, addr, ...valueParts] = argv;
    if (!target || !addr || valueParts.length === 0) throw new Error(SHEET_USAGE);
    const pos = parseCellKey(addr);
    if (!pos) throw new Error(`Bad cell address “${addr}”.`);
    const value = valueParts.join(' ');
    const { store, tenantId } = await openStore([]);
    try {
      const note = await resolveSheetNote(store, target, tenantId);
      const doc = parseSheetDoc(note.body);
      const sheet = pickSheet(doc, sheetName);
      const key = cellKey(pos.row, pos.col);
      if (value === '') delete sheet.cells[key];
      else sheet.cells[key] = value;
      await store.update({ id: note.id, body: serializeSheetDoc(doc) });
      console.log(`${sheet.name}!${key} = ${formatValue(createEvaluator(doc).value(sheet.name, pos.row, pos.col))}`);
    } finally {
      store.close();
    }
    return;
  }

  throw new Error(`Unknown sheet command “${sub}”.\n${SHEET_USAGE}`);
}

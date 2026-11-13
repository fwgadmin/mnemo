/**
 * MCP tools for spreadsheet notes: create, read (computed values and/or formulas), and update cells.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { INoteStore } from '../../shared/types';
import {
  cellKey,
  cellsFromRows,
  emptySheetDoc,
  parseCellKey,
  parseDelimited,
  parseSheetDoc,
  serializeSheetDoc,
  type SheetDoc,
} from '../../shared/sheet';
import { createEvaluator, formatValue, sheetRows } from '../../shared/sheetFormula';
import { idOrRefError, idOrRefShape, resolveToNoteId } from './noteArgs';

type Resolve = () => Promise<{ store: INoteStore; tenantId: string; workspaceId: string }>;

const err = (text: string) => ({ content: [{ type: 'text' as const, text }], isError: true });
const ok = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] });

async function loadSheetNote(store: INoteStore, args: { id?: string; ref?: number }, tenantId: string) {
  const bad = idOrRefError(args);
  if (bad) return { error: bad } as const;
  const resolved = await resolveToNoteId(store, args, tenantId);
  if (!resolved.ok) return { error: resolved.text } as const;
  const note = await store.read(resolved.id);
  if (!note) return { error: `Note ${resolved.id} not found` } as const;
  if (note.kind !== 'sheet') return { error: `Note ${note.ref} (“${note.title}”) is not a spreadsheet; use read_note.` } as const;
  return { note, doc: parseSheetDoc(note.body) } as const;
}

function sheetByName(doc: SheetDoc, name?: string) {
  if (!name) return doc.sheets[0]!;
  return doc.sheets.find(s => s.name.toLowerCase() === name.toLowerCase()) ?? null;
}

export function registerSheetTools(mcp: McpServer, resolve: Resolve): void {
  mcp.tool(
    'create_sheet',
    'Create a spreadsheet note. Optional csv seeds the first sheet (comma, tab, or semicolon separated; cells starting with = are formulas). First tag is the category folder, as for create_note.',
    {
      title: z.string(),
      csv: z.string().optional(),
      sheet_name: z.string().optional(),
      tags: z.array(z.string()).optional(),
    },
    async args => {
      const { store, tenantId } = await resolve();
      const doc = emptySheetDoc();
      if (args.sheet_name?.trim()) doc.sheets[0]!.name = args.sheet_name.trim().slice(0, 100);
      if (args.csv) doc.sheets[0]!.cells = cellsFromRows(parseDelimited(args.csv));
      const note = await store.create({ title: args.title, body: serializeSheetDoc(doc), tags: args.tags ?? [], tenantId, kind: 'sheet' });
      return ok({ id: note.id, ref: note.ref, title: note.title, kind: note.kind, sheets: doc.sheets.map(s => s.name) });
    },
  );

  mcp.tool(
    'read_sheet',
    'Read a spreadsheet note as rows of computed values (as displayed), optionally with raw formulas. Target by id or ref; optional sheet name and A1 range (e.g. A1:D20).',
    {
      ...idOrRefShape,
      sheet: z.string().optional(),
      range: z.string().optional(),
      include_formulas: z.boolean().optional(),
    },
    async args => {
      const { store, tenantId } = await resolve();
      const loaded = await loadSheetNote(store, args, tenantId);
      if ('error' in loaded) return err(loaded.error!);
      const sheet = sheetByName(loaded.doc, args.sheet);
      if (!sheet) return err(`No sheet “${args.sheet}”. Sheets: ${loaded.doc.sheets.map(s => s.name).join(', ')}`);
      try {
        const values = sheetRows(loaded.doc, sheet, args.range);
        return ok({
          id: loaded.note.id,
          ref: loaded.note.ref,
          title: loaded.note.title,
          sheets: loaded.doc.sheets.map(s => s.name),
          sheet: sheet.name,
          range: args.range ?? 'A1:(used range)',
          values,
          ...(args.include_formulas ? { formulas: sheetRows(loaded.doc, sheet, args.range, true) } : {}),
        });
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    },
  );

  mcp.tool(
    'update_sheet_cells',
    'Set cells in a spreadsheet note. cells maps A1 addresses to raw input ("12", "text", "=SUM(A1:A3)"; empty string clears). Returns the new computed value of each cell.',
    {
      ...idOrRefShape,
      sheet: z.string().optional(),
      cells: z.record(z.string(), z.string()),
    },
    async args => {
      const { store, tenantId } = await resolve();
      const loaded = await loadSheetNote(store, args, tenantId);
      if ('error' in loaded) return err(loaded.error!);
      const sheet = sheetByName(loaded.doc, args.sheet);
      if (!sheet) return err(`No sheet “${args.sheet}”. Sheets: ${loaded.doc.sheets.map(s => s.name).join(', ')}`);
      const addrs: Array<{ key: string; row: number; col: number; value: string }> = [];
      for (const [addr, value] of Object.entries(args.cells)) {
        const p = parseCellKey(addr);
        if (!p) return err(`Bad cell address “${addr}”.`);
        addrs.push({ key: cellKey(p.row, p.col), ...p, value });
      }
      for (const a of addrs) {
        if (a.value === '') delete sheet.cells[a.key];
        else sheet.cells[a.key] = a.value;
      }
      await store.update({ id: loaded.note.id, body: serializeSheetDoc(loaded.doc) });
      const ev = createEvaluator(loaded.doc);
      return ok({
        sheet: sheet.name,
        values: Object.fromEntries(addrs.map(a => [a.key, formatValue(ev.value(sheet.name, a.row, a.col))])),
      });
    },
  );
}

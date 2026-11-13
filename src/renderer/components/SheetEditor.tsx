import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import type { Note } from '../../shared/types';
import {
  DEFAULT_SHEET_COLS,
  DEFAULT_SHEET_ROWS,
  MAX_SHEET_COLS,
  MAX_SHEET_ROWS,
  cellKey,
  colName,
  emptySheet,
  nextSheetName,
  parseCellKey,
  parseDelimited,
  parseSheetDoc,
  serializeSheetDoc,
  sheetExtent,
  toDelimited,
  type CellFormat,
  type NumberFormatKind,
  type SheetChart,
  type SheetChartType,
  type SheetData,
  type SheetDoc,
} from '../../shared/sheet';
import {
  SheetError,
  createEvaluator,
  cellDisplay,
  formatValue,
  offsetFormula,
  shiftFormula,
  type CellValue,
  type StructuralEdit,
} from '../../shared/sheetFormula';
import type { EditorHandle } from './Editor';
import { fillRange, sortRows } from '../../shared/sheetOps';
import { chartData } from '../../shared/sheetChart';
import SheetChartView from './SheetChartView';

const ROW_H = 24;
const HEADER_H = 24;
const ROWHEAD_W = 48;
const DEFAULT_COL_W = 100;
const SAVE_DELAY_MS = 500;
const CLIP_MIME = 'application/x-mnemo-cells';

interface Pos {
  row: number;
  col: number;
}

interface Selection {
  anchor: Pos;
  focus: Pos;
}

interface EditState {
  pos: Pos;
  value: string;
  /** Where typing happens; the other input mirrors it. */
  source: 'cell' | 'bar';
}

function rect(sel: Selection) {
  return {
    r1: Math.min(sel.anchor.row, sel.focus.row),
    r2: Math.max(sel.anchor.row, sel.focus.row),
    c1: Math.min(sel.anchor.col, sel.focus.col),
    c2: Math.max(sel.anchor.col, sel.focus.col),
  };
}

function clamp(p: Pos): Pos {
  return {
    row: Math.max(0, Math.min(MAX_SHEET_ROWS - 1, p.row)),
    col: Math.max(0, Math.min(MAX_SHEET_COLS - 1, p.col)),
  };
}

/** Apply a structural edit to one sheet's cells/widths and rewrite formulas in every sheet. */
/** New key for a cell after a structural edit on its own sheet; null when the cell is deleted. */
function movedKey(key: string, edit: StructuralEdit): string | null {
  const a = parseCellKey(key);
  if (!a) return null;
  let { row, col } = a;
  const idx = edit.axis === 'row' ? row : col;
  if (edit.count < 0 && idx >= edit.at && idx < edit.at - edit.count) return null;
  const shifted = idx >= edit.at ? idx + edit.count : idx;
  if (edit.axis === 'row') row = shifted;
  else col = shifted;
  if (row < 0 || col < 0 || row >= MAX_SHEET_ROWS || col >= MAX_SHEET_COLS) return null;
  return cellKey(row, col);
}

function applyStructural(doc: SheetDoc, edit: StructuralEdit): SheetDoc {
  const sheets = doc.sheets.map(s => {
    const own = s.name === edit.sheet;
    const cells: Record<string, string> = {};
    for (const [key, raw] of Object.entries(s.cells)) {
      const next = own ? movedKey(key, edit) : key;
      if (!next) continue;
      cells[next] = raw.startsWith('=') ? shiftFormula(raw, s.name, edit) : raw;
    }
    let formats = s.formats;
    if (own && formats) {
      const moved: Record<string, CellFormat> = {};
      for (const [key, f] of Object.entries(formats)) {
        const next = movedKey(key, edit);
        if (next) moved[next] = f;
      }
      formats = moved;
    }
    let colWidths = s.colWidths;
    if (s.name === edit.sheet && edit.axis === 'col' && colWidths) {
      const next: Record<string, number> = {};
      for (const [k, w] of Object.entries(colWidths)) {
        const c = Number(k);
        if (edit.count < 0 && c >= edit.at && c < edit.at - edit.count) continue;
        next[String(c >= edit.at ? c + edit.count : c)] = w;
      }
      colWidths = next;
    }
    const charts = own && s.charts
      ? s.charts.map(c => ({ ...c, range: shiftFormula(`=${c.range}`, s.name, edit).slice(1) }))
      : s.charts;
    return {
      ...s,
      cells,
      ...(colWidths ? { colWidths } : {}),
      ...(formats ? { formats } : {}),
      ...(charts ? { charts } : {}),
    };
  });
  return { ...doc, sheets };
}

function cellStyle(f: CellFormat | undefined): React.CSSProperties {
  if (!f) return {};
  return {
    ...(f.bold ? { fontWeight: 700 } : {}),
    ...(f.italic ? { fontStyle: 'italic' } : {}),
    ...(f.align ? { textAlign: f.align } : {}),
    ...(f.color ? { color: f.color } : {}),
    ...(f.fill ? { backgroundColor: f.fill } : {}),
  };
}

const NUMBER_FORMATS: Array<[NumberFormatKind, string]> = [
  ['general', 'General'],
  ['number', '1,234.56'],
  ['integer', '1,235'],
  ['percent', 'Percent'],
  ['currency', 'Currency ($)'],
  ['date', 'Date'],
  ['text', 'Plain text'],
];

function valueClass(v: CellValue): string {
  if (v instanceof SheetError) return 'text-red-400 text-right';
  if (typeof v === 'number') return 'text-right tabular-nums';
  if (typeof v === 'boolean') return 'text-center';
  return '';
}

interface SheetEditorProps {
  note: Note;
  onUpdate: (id: string, title: string, body: string) => Promise<boolean>;
  onDirty?: (id: string) => void;
  showHeader?: boolean;
  saveSignal?: number;
  reloadNonce?: number;
}

const SheetEditor = forwardRef<EditorHandle, SheetEditorProps>(function SheetEditor(
  { note, onUpdate, onDirty, showHeader = true, saveSignal, reloadNonce },
  ref,
) {
  const [doc, setDocState] = useState<SheetDoc>(() => parseSheetDoc(note.body));
  const [title, setTitle] = useState(note.title);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [sel, setSel] = useState<Selection>({ anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } });
  const selRef = useRef(sel);
  selRef.current = sel;
  const [edit, setEdit] = useState<EditState | null>(null);
  const [scroll, setScroll] = useState({ top: 0, height: 600 });
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState<number | null>(null);
  const [status, setStatus] = useState('');
  /** View-only row filter (never saved): rows whose displayed value in `col` contains `q`; row 1 always shows. */
  const [filter, setFilter] = useState<{ col: number; q: string } | null>(null);
  const [fillTarget, setFillTarget] = useState<Pos | null>(null);

  const gridRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const cellInputRef = useRef<HTMLInputElement>(null);
  const barInputRef = useRef<HTMLInputElement>(null);
  const docRef = useRef(doc);
  const titleValRef = useRef(title);
  const dirtyRef = useRef(false);
  const saveTimer = useRef<number | null>(null);
  const undoStack = useRef<SheetDoc[]>([]);
  const redoStack = useRef<SheetDoc[]>([]);
  const dragRef = useRef<{ selecting: boolean } | null>(null);

  docRef.current = doc;
  titleValRef.current = title;
  const sheet: SheetData = doc.sheets[Math.min(sheetIdx, doc.sheets.length - 1)]!;

  // Reload when the note changes or is explicitly reloaded.
  useEffect(() => {
    const parsed = parseSheetDoc(note.body);
    setDocState(parsed);
    docRef.current = parsed;
    setTitle(note.title);
    setSheetIdx(0);
    setSel({ anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } });
    setEdit(null);
    undoStack.current = [];
    redoStack.current = [];
    dirtyRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id, reloadNonce]);

  const save = useCallback(async (): Promise<boolean> => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (!dirtyRef.current) return true;
    dirtyRef.current = false;
    const ok = await onUpdate(note.id, titleValRef.current.trim() || 'Untitled', serializeSheetDoc(docRef.current));
    if (!ok) dirtyRef.current = true;
    return ok;
  }, [note.id, onUpdate]);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    onDirty?.(note.id);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void save(), SAVE_DELAY_MS);
  }, [note.id, onDirty, save]);

  useEffect(() => () => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    if (dirtyRef.current) void save();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  useEffect(() => {
    if (saveSignal) void save();
  }, [saveSignal, save]);

  const commit = useCallback(
    (next: SheetDoc) => {
      undoStack.current.push(docRef.current);
      if (undoStack.current.length > 200) undoStack.current.shift();
      redoStack.current = [];
      docRef.current = next;
      setDocState(next);
      markDirty();
    },
    [markDirty],
  );

  const updateSheet = useCallback(
    (fn: (s: SheetData) => SheetData) => {
      const d = docRef.current;
      const idx = Math.min(sheetIdx, d.sheets.length - 1);
      commit({ ...d, sheets: d.sheets.map((s, i) => (i === idx ? fn(s) : s)) });
    },
    [commit, sheetIdx],
  );

  const setCells = useCallback(
    (updates: Record<string, string>) => {
      updateSheet(s => {
        const cells = { ...s.cells };
        for (const [k, v] of Object.entries(updates)) {
          if (v === '') delete cells[k];
          else cells[k] = v;
        }
        return { ...s, cells };
      });
    },
    [updateSheet],
  );

  /** Apply a format change to every cell in the selection (undefined fields are removed). */
  const formatSelection = useCallback(
    (fn: (f: CellFormat) => CellFormat) => {
      const r0 = rect(selRef.current);
      updateSheet(s => {
        const formats = { ...(s.formats ?? {}) };
        for (let row = r0.r1; row <= r0.r2; row++) {
          for (let col = r0.c1; col <= r0.c2; col++) {
            const key = cellKey(row, col);
            const next = fn({ ...(formats[key] ?? {}) });
            for (const k of Object.keys(next) as Array<keyof CellFormat>) if (next[k] === undefined) delete next[k];
            if (Object.keys(next).length) formats[key] = next;
            else delete formats[key];
          }
        }
        return { ...s, formats };
      });
    },
    [updateSheet],
  );

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push(docRef.current);
    docRef.current = prev;
    setDocState(prev);
    setSheetIdx(i => Math.min(i, prev.sheets.length - 1));
    markDirty();
  }, [markDirty]);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(docRef.current);
    docRef.current = next;
    setDocState(next);
    setSheetIdx(i => Math.min(i, next.sheets.length - 1));
    markDirty();
  }, [markDirty]);

  const evaluator = useMemo(() => createEvaluator(doc), [doc]);
  const extent = useMemo(() => sheetExtent(sheet), [sheet]);
  const baseRows = Math.max(DEFAULT_SHEET_ROWS, extent.rows + 20, sel.focus.row + 20);
  /** Visible row indices when filtering (display order); null = every row. */
  const visibleRows = useMemo(() => {
    if (!filter || !filter.q.trim()) return null;
    const q = filter.q.trim().toLowerCase();
    const out: number[] = [0];
    for (let r = 1; r < extent.rows; r++) {
      if (cellDisplay(doc, sheet, r, filter.col, evaluator.value(sheet.name, r, filter.col)).toLowerCase().includes(q)) out.push(r);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, doc, sheet, extent.rows]);
  const rows = visibleRows ? visibleRows.length : baseRows;

  // Keep the selection on a visible row when a filter hides it.
  useEffect(() => {
    if (!visibleRows || visibleRows.includes(selRef.current.focus.row)) return;
    const row = visibleRows[1] ?? visibleRows[0] ?? 0;
    const col = selRef.current.focus.col;
    setSel({ anchor: { row, col }, focus: { row, col } });
  }, [visibleRows]);
  const rowAt = (i: number) => (visibleRows ? visibleRows[Math.max(0, Math.min(i, visibleRows.length - 1))]! : i);
  const indexOfRow = (r: number) => {
    if (!visibleRows) return r;
    const i = visibleRows.indexOf(r);
    return i < 0 ? 0 : i;
  };
  const cols = Math.min(MAX_SHEET_COLS, Math.max(DEFAULT_SHEET_COLS, extent.cols + 4, sel.focus.col + 4));

  const colW = useCallback((c: number) => sheet.colWidths?.[String(c)] ?? DEFAULT_COL_W, [sheet.colWidths]);
  const colLeft = useMemo(() => {
    const out: number[] = [];
    let x = 0;
    for (let c = 0; c <= cols; c++) {
      out.push(x);
      x += colW(c);
    }
    return out;
  }, [cols, colW]);

  const firstRow = Math.max(0, Math.floor(scroll.top / ROW_H) - 5);
  const lastRow = Math.min(rows - 1, Math.ceil((scroll.top + scroll.height) / ROW_H) + 5);

  const raw = (p: Pos) => sheet.cells[cellKey(p.row, p.col)] ?? '';
  const active = sel.focus;

  // ─── Editing ────────────────────────────────────────────────────────────────
  const startEdit = (initial?: string, source: 'cell' | 'bar' = 'cell') => {
    setEdit({ pos: active, value: initial ?? raw(active), source });
    setMenu(null);
  };

  const finishEdit = useCallback(
    (save: boolean, move?: Pos) => {
      if (!edit) return;
      if (save && edit.value !== (sheet.cells[cellKey(edit.pos.row, edit.pos.col)] ?? '')) {
        setCells({ [cellKey(edit.pos.row, edit.pos.col)]: edit.value });
      }
      setEdit(null);
      if (move) setSel({ anchor: clamp(move), focus: clamp(move) });
      requestAnimationFrame(() => gridRef.current?.focus());
    },
    [edit, setCells, sheet.cells],
  );

  useEffect(() => {
    if (!edit) return;
    const input = edit.source === 'cell' ? cellInputRef.current : barInputRef.current;
    if (input && document.activeElement !== input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }, [edit]);

  // Keep the active cell visible.
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const top = indexOfRow(active.row) * ROW_H;
    const bottom = top + ROW_H + HEADER_H;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (bottom > el.scrollTop + el.clientHeight) el.scrollTop = bottom - el.clientHeight;
    const left = colLeft[active.col] ?? 0;
    const right = left + colW(active.col) + ROWHEAD_W;
    if (left < el.scrollLeft) el.scrollLeft = left;
    else if (right > el.scrollLeft + el.clientWidth) el.scrollLeft = right - el.clientWidth;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.row, active.col, colLeft, colW, visibleRows]);

  const move = (dr: number, dc: number, extend: boolean) => {
    const row = visibleRows ? rowAt(indexOfRow(active.row) + dr) : active.row + dr;
    const focus = clamp({ row, col: active.col + dc });
    setSel(s => (extend ? { anchor: s.anchor, focus } : { anchor: focus, focus }));
  };

  const clearSelection = () => {
    const r = rect(sel);
    const updates: Record<string, string> = {};
    for (let row = r.r1; row <= r.r2; row++) for (let col = r.c1; col <= r.c2; col++) updates[cellKey(row, col)] = '';
    setCells(updates);
  };

  const onGridKeyDown = (e: ReactKeyboardEvent) => {
    if (edit) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      redo();
      return;
    }
    if (mod && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      setSel({ anchor: { row: 0, col: 0 }, focus: { row: Math.max(0, extent.rows - 1), col: Math.max(0, extent.cols - 1) } });
      return;
    }
    if (mod && !e.shiftKey && !e.altKey && (e.key.toLowerCase() === 'b' || e.key.toLowerCase() === 'i')) {
      e.preventDefault();
      const key = e.key.toLowerCase() === 'b' ? 'bold' : 'italic';
      const on = !sheet.formats?.[cellKey(active.row, active.col)]?.[key];
      formatSelection(f => ({ ...f, [key]: on || undefined }));
      return;
    }
    if (mod) return; // copy/cut/paste handled by clipboard events; leave app shortcuts alone
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        return move(-1, 0, e.shiftKey);
      case 'ArrowDown':
        e.preventDefault();
        return move(1, 0, e.shiftKey);
      case 'ArrowLeft':
        e.preventDefault();
        return move(0, -1, e.shiftKey);
      case 'ArrowRight':
        e.preventDefault();
        return move(0, 1, e.shiftKey);
      case 'Tab':
        e.preventDefault();
        return move(0, e.shiftKey ? -1 : 1, false);
      case 'Enter':
        e.preventDefault();
        if (e.shiftKey) return move(-1, 0, false);
        return startEdit();
      case 'F2':
        e.preventDefault();
        return startEdit();
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        return clearSelection();
      case 'Escape':
        setSel(s => ({ anchor: s.focus, focus: s.focus }));
        return;
      default:
        if (e.key.length === 1 && !e.altKey) {
          e.preventDefault();
          startEdit(e.key);
        }
    }
  };

  const onEditKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (!edit) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      finishEdit(true, { row: edit.pos.row + (e.shiftKey ? -1 : 1), col: edit.pos.col });
    } else if (e.key === 'Tab') {
      e.preventDefault();
      finishEdit(true, { row: edit.pos.row, col: edit.pos.col + (e.shiftKey ? -1 : 1) });
    } else if (e.key === 'Escape') {
      e.preventDefault();
      finishEdit(false);
    } else if (edit.source === 'cell' && !edit.value.startsWith('=') && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      finishEdit(true, { row: edit.pos.row + (e.key === 'ArrowUp' ? -1 : 1), col: edit.pos.col });
    }
  };

  // ─── Clipboard ──────────────────────────────────────────────────────────────
  const selectionRows = (useRaw: boolean) => {
    const r = rect(sel);
    const out: string[][] = [];
    for (let row = r.r1; row <= Math.min(r.r2, Math.max(r.r1, extent.rows - 1)); row++) {
      const line: string[] = [];
      for (let col = r.c1; col <= Math.min(r.c2, Math.max(r.c1, extent.cols - 1)); col++) {
        line.push(useRaw ? raw({ row, col }) : formatValue(evaluator.value(sheet.name, row, col)));
      }
      out.push(line);
    }
    return out;
  };

  const onCopy = (e: React.ClipboardEvent, cut: boolean) => {
    if (edit) return;
    e.preventDefault();
    const r = rect(sel);
    e.clipboardData.setData('text/plain', toDelimited(selectionRows(false), '\t'));
    const fmts: Array<Array<CellFormat | null>> = [];
    for (let row = r.r1; row <= r.r2 && row < r.r1 + 10_000; row++) {
      const line: Array<CellFormat | null> = [];
      for (let col = r.c1; col <= r.c2; col++) line.push(sheet.formats?.[cellKey(row, col)] ?? null);
      fmts.push(line);
    }
    e.clipboardData.setData(
      CLIP_MIME,
      JSON.stringify({ origin: { row: r.r1, col: r.c1 }, rows: selectionRows(true), formats: fmts }),
    );
    if (cut) clearSelection();
  };

  const onPaste = (e: React.ClipboardEvent) => {
    if (edit) return;
    e.preventDefault();
    const origin = rect(sel);
    const updates: Record<string, string> = {};
    const internal = e.clipboardData.getData(CLIP_MIME);
    let rowsIn: string[][];
    let shift: { dRow: number; dCol: number } | null = null;
    let fmtsIn: Array<Array<CellFormat | null>> | null = null;
    if (internal) {
      try {
        const parsed = JSON.parse(internal) as { origin: Pos; rows: string[][]; formats?: Array<Array<CellFormat | null>> };
        rowsIn = parsed.rows;
        fmtsIn = parsed.formats ?? null;
        shift = { dRow: origin.r1 - parsed.origin.row, dCol: origin.c1 - parsed.origin.col };
      } catch {
        rowsIn = parseDelimited(e.clipboardData.getData('text/plain'), '\t');
      }
    } else {
      const text = e.clipboardData.getData('text/plain');
      if (!text) return;
      rowsIn = parseDelimited(text.replace(/\r?\n$/, ''), text.includes('\t') ? '\t' : undefined);
    }
    rowsIn.forEach((line, ri) =>
      line.forEach((v, ci) => {
        const row = origin.r1 + ri;
        const col = origin.c1 + ci;
        if (row >= MAX_SHEET_ROWS || col >= MAX_SHEET_COLS) return;
        updates[cellKey(row, col)] = shift && v.startsWith('=') ? offsetFormula(v, shift.dRow, shift.dCol) : v;
      }),
    );
    if (fmtsIn) {
      const incoming = fmtsIn;
      updateSheet(s => {
        const cells = { ...s.cells };
        for (const [k, v] of Object.entries(updates)) {
          if (v === '') delete cells[k];
          else cells[k] = v;
        }
        const formats = { ...(s.formats ?? {}) };
        incoming.forEach((line, ri) =>
          line.forEach((f, ci) => {
            const key = cellKey(origin.r1 + ri, origin.c1 + ci);
            if (f) formats[key] = f;
            else delete formats[key];
          }),
        );
        return { ...s, cells, formats };
      });
    } else {
      setCells(updates);
    }
    const h = rowsIn.length;
    const w = Math.max(1, ...rowsIn.map(r => r.length));
    setSel({ anchor: { row: origin.r1, col: origin.c1 }, focus: clamp({ row: origin.r1 + h - 1, col: origin.c1 + w - 1 }) });
  };

  // ─── Structure ──────────────────────────────────────────────────────────────
  const structural = (axis: 'row' | 'col', at: number, count: number) => {
    commit(applyStructural(docRef.current, { sheet: sheet.name, axis, at, count }));
    setMenu(null);
  };

  // ─── Charts ─────────────────────────────────────────────────────────────────
  const insertChart = () => {
    const sr = rect(selRef.current);
    // A single cell charts the used block to its right/below; otherwise the selection.
    const range =
      sr.r1 === sr.r2 && sr.c1 === sr.c2
        ? `${cellKey(0, 0)}:${cellKey(Math.max(1, extent.rows - 1), Math.max(1, extent.cols - 1))}`
        : `${cellKey(sr.r1, sr.c1)}:${cellKey(sr.r2, sr.c2)}`;
    const chart: SheetChart = { id: `c${Date.now().toString(36)}`, type: 'column', range };
    updateSheet(s2 => ({ ...s2, charts: [...(s2.charts ?? []), chart] }));
    setMenu(null);
  };
  const updateChart = (id: string, patch: Partial<SheetChart>) =>
    updateSheet(s2 => ({ ...s2, charts: (s2.charts ?? []).map(c => (c.id === id ? { ...c, ...patch } : c)) }));
  const removeChart = (id: string) =>
    updateSheet(s2 => {
      const charts = (s2.charts ?? []).filter(c => c.id !== id);
      const { charts: _drop, ...rest } = s2;
      return charts.length ? { ...rest, charts } : rest;
    });

  const r = rect(sel);
  /** Rows to sort: the selected rows, or (single row selected) everything below the header row. */
  const sortSpan = r.r2 > r.r1 ? { r1: r.r1, r2: r.r2 } : { r1: 1, r2: Math.max(1, extent.rows - 1) };
  const sortBy = (descending: boolean) => {
    updateSheet(s => sortRows(s, sortSpan, active.col, descending, (row, col) => evaluator.value(s.name, row, col)));
    setMenu(null);
  };
  const sortLabel = r.r2 > r.r1 ? `rows ${r.r1 + 1}–${r.r2 + 1}` : 'below row 1';
  const menuItems: Array<[string, () => void] | null> = [
    [`Sort ${sortLabel} by ${colName(active.col)}, A → Z`, () => sortBy(false)],
    [`Sort ${sortLabel} by ${colName(active.col)}, Z → A`, () => sortBy(true)],
    [filter ? 'Clear filter' : `Filter by column ${colName(active.col)}…`, () => {
      setFilter(filter ? null : { col: active.col, q: '' });
      setMenu(null);
    }],
    ['Insert chart from selection', insertChart],
    null,
    ['Insert row above', () => structural('row', r.r1, r.r2 - r.r1 + 1)],
    ['Insert row below', () => structural('row', r.r2 + 1, r.r2 - r.r1 + 1)],
    [r.r2 > r.r1 ? `Delete rows ${r.r1 + 1}–${r.r2 + 1}` : `Delete row ${r.r1 + 1}`, () => structural('row', r.r1, -(r.r2 - r.r1 + 1))],
    null,
    ['Insert column left', () => structural('col', r.c1, r.c2 - r.c1 + 1)],
    ['Insert column right', () => structural('col', r.c2 + 1, r.c2 - r.c1 + 1)],
    [
      r.c2 > r.c1 ? `Delete columns ${colName(r.c1)}–${colName(r.c2)}` : `Delete column ${colName(r.c1)}`,
      () => structural('col', r.c1, -(r.c2 - r.c1 + 1)),
    ],
    null,
    ['Clear formatting', () => {
      formatSelection(() => ({}));
      setMenu(null);
    }],
    ['Clear', () => {
      clearSelection();
      setMenu(null);
    }],
  ];

  // ─── Sheets ─────────────────────────────────────────────────────────────────
  const addSheet = () => {
    const d = docRef.current;
    commit({ ...d, sheets: [...d.sheets, emptySheet(nextSheetName(d))] });
    setSheetIdx(d.sheets.length);
    setSel({ anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } });
  };

  const renameSheet = (idx: number, name: string) => {
    setRenaming(null);
    const d = docRef.current;
    const clean = name.trim().slice(0, 100);
    const old = d.sheets[idx]!.name;
    if (!clean || clean === old || d.sheets.some((s, i) => i !== idx && s.name.toLowerCase() === clean.toLowerCase())) return;
    // Rewrite cross-sheet references to the renamed sheet.
    const quoted = /^[A-Za-z_][A-Za-z0-9_.]*$/.test(clean) ? clean : `'${clean.replace(/'/g, "''")}'`;
    const pattern = new RegExp(`(^|[^A-Za-z0-9_.'])('${old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "''")}'|${old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})!`, 'gi');
    commit({
      ...d,
      sheets: d.sheets.map((s, i) => ({
        ...s,
        name: i === idx ? clean : s.name,
        cells: Object.fromEntries(
          Object.entries(s.cells).map(([k, v]) => [k, v.startsWith('=') ? v.replace(pattern, `$1${quoted}!`) : v]),
        ),
      })),
    });
  };

  const deleteSheet = (idx: number) => {
    const d = docRef.current;
    if (d.sheets.length <= 1) return;
    if (!window.confirm(`Delete sheet “${d.sheets[idx]!.name}”? Formulas that refer to it will show #REF!. Undo with Ctrl+Z.`)) return;
    commit({ ...d, sheets: d.sheets.filter((_, i) => i !== idx) });
    setSheetIdx(i => Math.max(0, Math.min(i, d.sheets.length - 2)));
  };

  // ─── Import / export ────────────────────────────────────────────────────────
  const importFile = async () => {
    const imported = await window.mnemo.sheets.importFile();
    if (!imported?.length) return;
    const d = docRef.current;
    const names = new Set(d.sheets.map(s => s.name.toLowerCase()));
    const add = imported.map(s => {
      let name = s.name;
      for (let i = 2; names.has(name.toLowerCase()); i++) name = `${s.name} (${i})`;
      names.add(name.toLowerCase());
      return { ...s, name };
    });
    // Replace a single untouched empty sheet instead of appending next to it.
    const replaceEmpty = d.sheets.length === 1 && Object.keys(d.sheets[0]!.cells).length === 0;
    commit({ ...d, sheets: replaceEmpty ? add : [...d.sheets, ...add] });
    setSheetIdx(replaceEmpty ? 0 : d.sheets.length);
    setStatus(`Imported ${add.length} sheet${add.length === 1 ? '' : 's'}`);
  };

  const exportFile = async (format: 'csv' | 'xlsx') => {
    const d = docRef.current;
    const ev = createEvaluator(d);
    const sheets = (format === 'csv' ? [sheet] : d.sheets).map(s => {
      const ext = sheetExtent(s);
      const cells: Array<Array<{ raw: string; value: string | number | boolean | null; format?: CellFormat }>> = [];
      for (let row = 0; row < ext.rows; row++) {
        const line: Array<{ raw: string; value: string | number | boolean | null; format?: CellFormat }> = [];
        for (let col = 0; col < ext.cols; col++) {
          const v = ev.value(s.name, row, col);
          const fmt = s.formats?.[cellKey(row, col)];
          line.push({
            raw: s.cells[cellKey(row, col)] ?? '',
            value: v instanceof SheetError ? v.code : v,
            ...(fmt ? { format: fmt } : {}),
          });
        }
        cells.push(line);
      }
      return { name: s.name, cells, colWidths: s.colWidths ?? {} };
    });
    const ok = await window.mnemo.sheets.exportFile({ format, title: titleValRef.current || 'Spreadsheet', sheets });
    if (ok) setStatus(`Exported ${format.toUpperCase()}`);
  };

  useImperativeHandle(
    ref,
    () => ({
      formatDocument: async () => {},
      getBody: () => serializeSheetDoc(docRef.current),
      isDirty: () => dirtyRef.current,
      flush: save,
      scrollToLine: () => {},
      focus: () => gridRef.current?.focus(),
      focusTitle: () => titleRef.current?.focus(),
      copyAsSummary: async () => {},
      pasteAsSummary: async () => {},
    }),
    [save],
  );

  // ─── Fill handle ────────────────────────────────────────────────────────────
  const startFill = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const src = rect(selRef.current);
    let latest: Pos | null = null;
    const toPos = (ev: MouseEvent): Pos | null => {
      const el = gridRef.current;
      if (!el) return null;
      const box = el.getBoundingClientRect();
      const x = ev.clientX - box.left + el.scrollLeft - ROWHEAD_W;
      const y = ev.clientY - box.top + el.scrollTop - HEADER_H;
      let col = 0;
      while (col < cols - 1 && colLeft[col + 1]! <= Math.max(0, x)) col++;
      return clamp({ row: Math.max(0, Math.floor(y / ROW_H)), col });
    };
    const onMove = (ev: MouseEvent) => {
      latest = toPos(ev);
      setFillTarget(latest);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setFillTarget(null);
      if (!latest) return;
      const result = fillRange(sheet, src, latest);
      if (!result) return;
      updateSheet(s => {
        const cells = { ...s.cells };
        for (const [k, v] of Object.entries(result.cells)) {
          if (v === '') delete cells[k];
          else cells[k] = v;
        }
        const formats = { ...(s.formats ?? {}) };
        for (const [k, f] of Object.entries(result.formats)) {
          if (f) formats[k] = f;
          else delete formats[k];
        }
        return { ...s, cells, formats };
      });
      setSel({ anchor: { row: result.filled.r1, col: result.filled.c1 }, focus: { row: result.filled.r2, col: result.filled.c2 } });
      gridRef.current?.focus();
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  /** Dashed preview of the area a fill drag would cover. */
  const fillPreview = (() => {
    if (!fillTarget) return null;
    const down = fillTarget.row - r.r2;
    const up = r.r1 - fillTarget.row;
    const right = fillTarget.col - r.c2;
    const left = r.c1 - fillTarget.col;
    const vertical = Math.max(down, up) >= Math.max(right, left);
    if (Math.max(down, up, right, left) <= 0) return null;
    const box = vertical
      ? down >= up
        ? { r1: r.r1, r2: fillTarget.row, c1: r.c1, c2: r.c2 }
        : { r1: fillTarget.row, r2: r.r2, c1: r.c1, c2: r.c2 }
      : right >= left
        ? { r1: r.r1, r2: r.r2, c1: r.c1, c2: fillTarget.col }
        : { r1: r.r1, r2: r.r2, c1: fillTarget.col, c2: r.c2 };
    return box;
  })();

  // ─── Mouse ──────────────────────────────────────────────────────────────────
  const posFromEvent = (e: React.MouseEvent): Pos | null => {
    const el = gridRef.current;
    if (!el) return null;
    const box = el.getBoundingClientRect();
    const x = e.clientX - box.left + el.scrollLeft - ROWHEAD_W;
    const y = e.clientY - box.top + el.scrollTop - HEADER_H;
    if (x < 0 || y < 0) return null;
    let col = 0;
    while (col < cols - 1 && colLeft[col + 1]! <= x) col++;
    return clamp({ row: rowAt(Math.floor(y / ROW_H)), col });
  };

  const onCellMouseDown = (e: React.MouseEvent) => {
    if (e.button === 2) {
      const p = posFromEvent(e);
      if (p && !(p.row >= r.r1 && p.row <= r.r2 && p.col >= r.c1 && p.col <= r.c2)) setSel({ anchor: p, focus: p });
      return;
    }
    if (e.button !== 0) return;
    const p = posFromEvent(e);
    if (!p) return;
    if (edit) finishEdit(true);
    setMenu(null);
    setSel(s => (e.shiftKey ? { anchor: s.anchor, focus: p } : { anchor: p, focus: p }));
    dragRef.current = { selecting: true };
    gridRef.current?.focus();
  };

  const onCellMouseMove = (e: React.MouseEvent) => {
    if (!dragRef.current?.selecting || !(e.buttons & 1)) return;
    const p = posFromEvent(e);
    if (p) setSel(s => (s.focus.row === p.row && s.focus.col === p.col ? s : { anchor: s.anchor, focus: p }));
  };

  // Track the real viewport height so row virtualization covers the visible area.
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const measure = () => setScroll({ top: el.scrollTop, height: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const up = () => {
      dragRef.current = null;
    };
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, []);

  const startResize = (col: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = colW(col);
    let latest = startW;
    const onMove = (ev: MouseEvent) => {
      latest = Math.max(30, Math.min(800, startW + ev.clientX - startX));
      const d = docRef.current;
      const idx = Math.min(sheetIdx, d.sheets.length - 1);
      const next = {
        ...d,
        sheets: d.sheets.map((s, i) => (i === idx ? { ...s, colWidths: { ...(s.colWidths ?? {}), [String(col)]: latest } } : s)),
      };
      docRef.current = next;
      setDocState(next);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (latest !== startW) {
        undoStack.current.push({
          ...docRef.current,
          sheets: docRef.current.sheets.map((s, i) =>
            i === Math.min(sheetIdx, docRef.current.sheets.length - 1)
              ? { ...s, colWidths: { ...(s.colWidths ?? {}), [String(col)]: startW } }
              : s,
          ),
        });
        markDirty();
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  const totalW = colLeft[cols] ?? 0;
  const activeRaw = edit && edit.pos.row === active.row && edit.pos.col === active.col ? edit.value : raw(active);
  const rowEls = [];
  for (let idx = firstRow; idx <= lastRow; idx++) {
    const row = rowAt(idx);
    const cellsEls = [];
    for (let col = 0; col < cols; col++) {
      const v = evaluator.value(sheet.name, row, col);
      const key = cellKey(row, col);
      const fmt = sheet.formats?.[key];
      const inSel = row >= r.r1 && row <= r.r2 && col >= r.c1 && col <= r.c2;
      const isActive = row === active.row && col === active.col;
      cellsEls.push(
        <div
          key={col}
          className={`absolute top-0 h-full px-1.5 truncate border-r border-b border-mnemo-border leading-[23px] ${valueClass(v)} ${
            inSel && !isActive ? 'bg-[color-mix(in_srgb,var(--mnemo-accent)_14%,transparent)]' : ''
          } ${isActive ? 'outline outline-2 -outline-offset-1 outline-[var(--mnemo-accent)] z-[1]' : ''}`}
          style={{ left: colLeft[col], width: colW(col), ...cellStyle(fmt), ...(inSel && !isActive && fmt?.fill ? { boxShadow: 'inset 0 0 0 999px color-mix(in srgb, var(--mnemo-accent) 18%, transparent)' } : {}) }}
          title={v instanceof SheetError ? raw({ row, col }) : undefined}
        >
          {cellDisplay(doc, sheet, row, col, v)}
        </div>,
      );
    }
    rowEls.push(
      <div key={row} className="absolute left-0 flex" style={{ top: HEADER_H + idx * ROW_H, height: ROW_H, width: ROWHEAD_W + totalW }}>
        <div
          className={`sticky left-0 z-[2] shrink-0 text-center text-[11px] leading-[23px] border-r border-b border-mnemo-border bg-mnemo-panel ${
            row >= r.r1 && row <= r.r2 ? 'text-mnemo-accent' : 'text-mnemo-dim'
          }`}
          style={{ width: ROWHEAD_W }}
          onMouseDown={e => {
            e.preventDefault();
            setSel(s => ({ anchor: e.shiftKey ? s.anchor : { row, col: 0 }, focus: { row, col: cols - 1 } }));
            gridRef.current?.focus();
          }}
        >
          {row + 1}
        </div>
        <div className="relative" style={{ width: totalW }}>
          {cellsEls}
        </div>
      </div>,
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-mnemo-app text-mnemo-text text-[13px]">
      {showHeader && (
        <div className="px-4 pt-3 pb-2 flex items-center gap-2">
          <span className="text-xl text-mnemo-dim" title="Spreadsheet" aria-hidden>
            ▦
          </span>
          <input
            ref={titleRef}
            value={title}
            onChange={e => {
              setTitle(e.target.value);
              titleValRef.current = e.target.value;
              markDirty();
            }}
            placeholder="Untitled"
            className="flex-1 bg-transparent text-2xl font-bold outline-none placeholder:text-mnemo-dim"
            aria-label="Spreadsheet title"
          />
        </div>
      )}
      <div
        className="flex flex-wrap items-center gap-1 px-3 py-1 border-t border-mnemo-border bg-mnemo-panel text-[12px]"
        role="toolbar"
        aria-label="Cell formatting"
        onMouseDown={e => {
          // Keep keyboard focus in the grid when using the toolbar (except native inputs).
          if (!(e.target as HTMLElement).closest('select, input')) e.preventDefault();
        }}
      >
        {(() => {
          const af = sheet.formats?.[cellKey(active.row, active.col)] ?? {};
          const btn = (label: string, title: string, on: boolean, onClick: () => void, cls = '') => (
            <button
              type="button"
              title={title}
              aria-label={title}
              aria-pressed={on}
              className={`min-w-[26px] h-6 px-1.5 rounded ${on ? 'bg-mnemo-hover text-mnemo-text' : 'text-mnemo-muted hover:bg-mnemo-hover'} ${cls}`}
              onClick={onClick}
            >
              {label}
            </button>
          );
          const sep = <span className="w-px h-4 bg-mnemo-border mx-1" />;
          return (
            <>
              {btn('B', 'Bold (Ctrl+B)', !!af.bold, () => formatSelection(f => ({ ...f, bold: f.bold ? undefined : true })), 'font-bold')}
              {btn('I', 'Italic (Ctrl+I)', !!af.italic, () => formatSelection(f => ({ ...f, italic: f.italic ? undefined : true })), 'italic')}
              {sep}
              {(['left', 'center', 'right'] as const).map(a =>
                <span key={a}>{btn(a === 'left' ? '⇤' : a === 'center' ? '↔' : '⇥', `Align ${a}`, af.align === a, () => formatSelection(f => ({ ...f, align: f.align === a ? undefined : a })))}</span>,
              )}
              {sep}
              <label className="flex items-center gap-1 text-mnemo-muted" title="Text color">
                A
                <input
                  type="color"
                  value={af.color ?? '#e5e5e5'}
                  onChange={e => formatSelection(f => ({ ...f, color: e.target.value }))}
                  className="w-5 h-5 bg-transparent border-0 p-0 cursor-pointer"
                  aria-label="Text color"
                />
              </label>
              <label className="flex items-center gap-1 text-mnemo-muted" title="Fill color">
                ▧
                <input
                  type="color"
                  value={af.fill ?? '#1f2937'}
                  onChange={e => formatSelection(f => ({ ...f, fill: e.target.value }))}
                  className="w-5 h-5 bg-transparent border-0 p-0 cursor-pointer"
                  aria-label="Fill color"
                />
              </label>
              {btn('⌫', 'Remove colors', false, () => formatSelection(f => ({ ...f, color: undefined, fill: undefined })))}
              {sep}
              <select
                value={af.num ?? 'general'}
                onChange={e => {
                  const num = e.target.value as NumberFormatKind;
                  formatSelection(f => ({ ...f, num: num === 'general' ? undefined : num }));
                  gridRef.current?.focus();
                }}
                className="h-6 bg-mnemo-app border border-mnemo-border rounded px-1 text-mnemo-text"
                aria-label="Number format"
                title="Number format"
              >
                {NUMBER_FORMATS.map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
              {btn('.0−', 'Fewer decimals', false, () =>
                formatSelection(f => ({ ...f, dp: Math.max(0, (f.dp ?? (f.num === 'percent' || f.num === 'integer' ? 0 : 2)) - 1) })),
              )}
              {btn('.0+', 'More decimals', false, () =>
                formatSelection(f => ({ ...f, num: f.num ?? 'number', dp: Math.min(10, (f.dp ?? (f.num === 'percent' || f.num === 'integer' ? 0 : 2)) + 1) })),
              )}
              {sep}
              {filter ? (
                <span className="flex items-center gap-1">
                  <span className="text-mnemo-dim">Filter {colName(filter.col)}</span>
                  <input
                    autoFocus
                    value={filter.q}
                    onChange={e => setFilter({ ...filter, q: e.target.value })}
                    onKeyDown={e => {
                      if (e.key === 'Escape') {
                        setFilter(null);
                        gridRef.current?.focus();
                      }
                    }}
                    placeholder="contains…"
                    className="h-6 w-32 bg-mnemo-app border border-mnemo-border rounded px-1.5 outline-none focus:border-mnemo-accent"
                    aria-label={`Filter column ${colName(filter.col)}`}
                  />
                  {visibleRows && <span className="text-mnemo-dim">{visibleRows.length - 1} match{visibleRows.length === 2 ? '' : 'es'}</span>}
                  {btn('✕', 'Clear filter', false, () => {
                    setFilter(null);
                    gridRef.current?.focus();
                  })}
                </span>
              ) : (
                btn('⏷', `Filter by column ${colName(active.col)}`, false, () => setFilter({ col: active.col, q: '' }))
              )}
              {sep}
              {btn('📊', 'Insert chart from selection', false, insertChart)}
            </>
          );
        })()}
      </div>
      <div className="flex items-center gap-2 px-3 py-1.5 border-y border-mnemo-border bg-mnemo-panel">
        <span className="w-14 shrink-0 text-center font-mono text-[12px] text-mnemo-muted">{cellKey(active.row, active.col)}</span>
        <span className="text-mnemo-dim italic">fx</span>
        <input
          ref={barInputRef}
          value={activeRaw}
          onFocus={() => {
            if (!edit) setEdit({ pos: active, value: raw(active), source: 'bar' });
          }}
          onChange={e => setEdit({ pos: edit?.pos ?? active, value: e.target.value, source: 'bar' })}
          onKeyDown={onEditKeyDown}
          onBlur={() => edit?.source === 'bar' && finishEdit(true)}
          className="flex-1 min-w-0 bg-mnemo-app border border-mnemo-border rounded px-2 py-0.5 font-mono text-[12px] outline-none focus:border-mnemo-accent"
          aria-label="Cell contents"
          spellCheck={false}
        />
        <button type="button" className="px-2 py-0.5 rounded hover:bg-mnemo-hover text-mnemo-muted" onClick={() => void importFile()}>
          Import…
        </button>
        <button type="button" className="px-2 py-0.5 rounded hover:bg-mnemo-hover text-mnemo-muted" onClick={() => void exportFile('csv')}>
          CSV
        </button>
        <button type="button" className="px-2 py-0.5 rounded hover:bg-mnemo-hover text-mnemo-muted" onClick={() => void exportFile('xlsx')}>
          XLSX
        </button>
      </div>
      <div
        ref={gridRef}
        tabIndex={0}
        className="relative flex-1 min-h-0 overflow-auto outline-none select-none"
        onScroll={e => setScroll({ top: e.currentTarget.scrollTop, height: e.currentTarget.clientHeight })}
        onKeyDown={onGridKeyDown}
        onCopy={e => onCopy(e, false)}
        onCut={e => onCopy(e, true)}
        onPaste={onPaste}
        onMouseDown={onCellMouseDown}
        onMouseMove={onCellMouseMove}
        onDoubleClick={e => {
          if (posFromEvent(e)) startEdit();
        }}
        onContextMenu={e => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
        role="grid"
        data-sheet-grid=""
        aria-label={`${sheet.name} cells`}
      >
        <div className="relative" style={{ width: ROWHEAD_W + totalW, height: HEADER_H + rows * ROW_H }}>
          <div className="sticky top-0 z-[3] flex" style={{ height: HEADER_H, width: ROWHEAD_W + totalW }}>
            <div className="sticky left-0 z-[4] shrink-0 border-r border-b border-mnemo-border bg-mnemo-panel" style={{ width: ROWHEAD_W }} />
            <div className="relative" style={{ width: totalW }}>
              {Array.from({ length: cols }, (_, col) => (
                <div
                  key={col}
                  className={`absolute top-0 h-full text-center text-[11px] leading-[23px] border-r border-b border-mnemo-border bg-mnemo-panel ${
                    col >= r.c1 && col <= r.c2 ? 'text-mnemo-accent' : 'text-mnemo-dim'
                  }`}
                  style={{ left: colLeft[col], width: colW(col) }}
                  onMouseDown={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSel(s => ({
                      anchor: e.shiftKey ? s.anchor : { row: 0, col },
                      focus: { row: Math.max(rows - 1, 0), col },
                    }));
                    gridRef.current?.focus();
                  }}
                >
                  {colName(col)}
                  <span
                    className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-mnemo-accent/50"
                    onMouseDown={e => startResize(col, e)}
                    aria-hidden
                  />
                </div>
              ))}
            </div>
          </div>
          {rowEls}
          {!edit && !visibleRows && (
            <div
              className="absolute z-[4] w-[7px] h-[7px] bg-[var(--mnemo-accent)] border border-mnemo-app cursor-crosshair"
              style={{
                left: ROWHEAD_W + (colLeft[r.c2] ?? 0) + colW(r.c2) - 4,
                top: HEADER_H + (r.r2 + 1) * ROW_H - 4,
              }}
              onMouseDown={startFill}
              title="Drag to fill"
              aria-label="Fill handle"
            />
          )}
          {fillPreview && (
            <div
              className="absolute z-[3] pointer-events-none border-2 border-dashed border-[var(--mnemo-accent)]"
              style={{
                left: ROWHEAD_W + (colLeft[fillPreview.c1] ?? 0),
                top: HEADER_H + fillPreview.r1 * ROW_H,
                width: (colLeft[fillPreview.c2 + 1] ?? 0) - (colLeft[fillPreview.c1] ?? 0),
                height: (fillPreview.r2 - fillPreview.r1 + 1) * ROW_H,
              }}
            />
          )}
          {edit && edit.source === 'cell' && (
            <input
              ref={cellInputRef}
              value={edit.value}
              onChange={e => setEdit({ ...edit, value: e.target.value })}
              onKeyDown={onEditKeyDown}
              onBlur={() => finishEdit(true)}
              onMouseDown={e => e.stopPropagation()}
              className="absolute z-[5] px-1.5 bg-mnemo-app text-mnemo-text outline outline-2 outline-[var(--mnemo-accent)] font-mono text-[12px]"
              style={{
                top: HEADER_H + indexOfRow(edit.pos.row) * ROW_H,
                left: ROWHEAD_W + (colLeft[edit.pos.col] ?? 0),
                width: Math.max(colW(edit.pos.col), 160),
                height: ROW_H,
              }}
              spellCheck={false}
              aria-label={`Edit ${cellKey(edit.pos.row, edit.pos.col)}`}
            />
          )}
        </div>
      </div>
      {sheet.charts?.length ? (
        <div className="max-h-[45%] overflow-y-auto border-t border-mnemo-border bg-mnemo-app px-3 py-2 space-y-3" aria-label="Charts">
          {sheet.charts.map(c => (
            <div key={c.id} className="rounded-md border border-mnemo-border bg-mnemo-panel p-2">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px]">
                <input
                  defaultValue={c.title ?? ''}
                  placeholder="Chart title"
                  onBlur={e => e.target.value !== (c.title ?? '') && updateChart(c.id, { title: e.target.value || undefined })}
                  className="min-w-0 flex-1 bg-transparent font-medium outline-none placeholder:text-mnemo-dim"
                  aria-label="Chart title"
                />
                <select
                  value={c.type}
                  onChange={e => updateChart(c.id, { type: e.target.value as SheetChartType })}
                  className="h-6 bg-mnemo-app border border-mnemo-border rounded px-1"
                  aria-label="Chart type"
                >
                  <option value="column">Column</option>
                  <option value="bar">Bar</option>
                  <option value="line">Line</option>
                  <option value="stacked">Stacked (share)</option>
                </select>
                <input
                  key={c.range}
                  defaultValue={c.range}
                  onBlur={e => {
                    const v = e.target.value.trim().toUpperCase();
                    if (v !== c.range && /^[A-Z]{1,3}\d{1,6}:[A-Z]{1,3}\d{1,6}$/.test(v)) updateChart(c.id, { range: v });
                    else e.target.value = c.range;
                  }}
                  className="h-6 w-28 bg-mnemo-app border border-mnemo-border rounded px-1.5 font-mono"
                  aria-label="Chart range"
                  title="Cell range: first column = labels, other columns = series"
                />
                <button
                  type="button"
                  className="h-6 px-1.5 rounded text-mnemo-muted hover:bg-mnemo-hover"
                  onClick={() => removeChart(c.id)}
                  aria-label="Delete chart"
                  title="Delete chart"
                >
                  ✕
                </button>
              </div>
              <SheetChartView data={chartData(doc, sheet, c, evaluator)} type={c.type} />
            </div>
          ))}
        </div>
      ) : null}
      <div className="flex items-center gap-1 px-2 py-1 border-t border-mnemo-border bg-mnemo-panel overflow-x-auto">
        {doc.sheets.map((s, i) =>
          renaming === i ? (
            <input
              key={i}
              autoFocus
              defaultValue={s.name}
              onBlur={e => renameSheet(i, e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') renameSheet(i, (e.target as HTMLInputElement).value);
                if (e.key === 'Escape') setRenaming(null);
              }}
              className="px-2 py-0.5 w-28 bg-mnemo-app border border-mnemo-accent rounded text-[12px] outline-none"
              aria-label="Sheet name"
            />
          ) : (
            <button
              key={i}
              type="button"
              className={`px-2.5 py-0.5 rounded text-[12px] whitespace-nowrap ${
                i === sheetIdx ? 'bg-mnemo-app text-mnemo-text border border-mnemo-border' : 'text-mnemo-muted hover:bg-mnemo-hover'
              }`}
              onClick={() => {
                if (edit) finishEdit(true);
                setSheetIdx(i);
                setSel({ anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } });
              }}
              onDoubleClick={() => setRenaming(i)}
              onContextMenu={e => {
                e.preventDefault();
                if (doc.sheets.length > 1) deleteSheet(i);
              }}
              title="Double-click to rename · right-click to delete"
            >
              {s.name}
            </button>
          ),
        )}
        <button type="button" className="px-2 py-0.5 rounded text-mnemo-muted hover:bg-mnemo-hover" onClick={addSheet} title="Add sheet" aria-label="Add sheet">
          +
        </button>
        <span className="ml-auto text-[11px] text-mnemo-dim pr-1">{status}</span>
      </div>
      {menu && (
        <div
          className="fixed z-50 min-w-[190px] py-1 rounded-md border border-mnemo-border bg-mnemo-panel-elevated shadow-lg text-[12px]"
          style={{ left: menu.x, top: menu.y }}
          onMouseLeave={() => setMenu(null)}
          role="menu"
        >
          {menuItems.map((item, i) =>
            item ? (
              <button
                key={i}
                type="button"
                role="menuitem"
                className="block w-full text-left px-3 py-1.5 hover:bg-mnemo-hover"
                onClick={item[1]}
              >
                {item[0]}
              </button>
            ) : (
              <div key={i} className="border-t border-mnemo-border my-1" />
            ),
          )}
        </div>
      )}
    </div>
  );
});

export default SheetEditor;

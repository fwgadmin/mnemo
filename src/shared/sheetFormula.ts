/**
 * Formula engine for Mnemo sheets: tokenizer, precedence parser, evaluator (lazy, memoized, cycle-safe), and
 * reference rewriting for row/column insertion and relative copy/paste. Excel functions come from formulajs (MIT).
 */
import * as formulajs from '@formulajs/formulajs';
import { cellKey, colIndex, colName, parseRange, sheetExtent, type SheetDoc, type SheetData } from './sheet';

// ─── Values ─────────────────────────────────────────────────────────────────────

export type SheetErrorCode = '#DIV/0!' | '#REF!' | '#NAME?' | '#VALUE!' | '#N/A' | '#NUM!' | '#NULL!' | '#CYCLE!' | '#ERROR!';

export class SheetError {
  constructor(readonly code: SheetErrorCode) {}
  toString(): string {
    return this.code;
  }
}

export type CellValue = number | string | boolean | SheetError | null;

const KNOWN_ERRORS = new Set(['#DIV/0!', '#REF!', '#NAME?', '#VALUE!', '#N/A', '#NUM!', '#NULL!', '#CYCLE!', '#ERROR!']);

function toSheetError(e: unknown): SheetError {
  const msg = e instanceof Error ? e.message : String(e);
  return new SheetError((KNOWN_ERRORS.has(msg) ? msg : '#VALUE!') as SheetErrorCode);
}

/** Plain (non-formula) input → value: numbers, percentages, booleans, `'`-forced text. */
export function literalValue(raw: string): CellValue {
  if (raw === '') return null;
  if (raw.startsWith("'")) return raw.slice(1);
  const t = raw.trim();
  if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) return Number(t);
  const pct = /^([-+]?(\d+\.?\d*|\.\d+))%$/.exec(t);
  if (pct) return Number(pct[1]) / 100;
  if (/^true$/i.test(t)) return true;
  if (/^false$/i.test(t)) return false;
  return raw;
}

export function formatValue(v: CellValue): string {
  if (v === null) return '';
  if (v instanceof SheetError) return v.code;
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return '#NUM!';
    // Trim binary noise (0.1+0.2) without forcing a fixed precision.
    return String(Number.parseFloat(v.toPrecision(15)));
  }
  return v;
}

// ─── Tokens ─────────────────────────────────────────────────────────────────────

type Token =
  | { t: 'num'; v: number; s: number; e: number }
  | { t: 'str'; v: string; s: number; e: number }
  | { t: 'bool'; v: boolean; s: number; e: number }
  | { t: 'err'; v: SheetErrorCode; s: number; e: number }
  | { t: 'ref'; sheet?: string; col: number; row: number; absCol: boolean; absRow: boolean; s: number; e: number }
  | { t: 'func'; v: string; s: number; e: number }
  | { t: 'name'; v: string; s: number; e: number }
  | { t: 'op'; v: string; s: number; e: number }
  | { t: '('; s: number; e: number }
  | { t: ')'; s: number; e: number }
  | { t: ','; s: number; e: number };

const REF_RE = /^(\$?)([A-Za-z]{1,3})(\$?)(\d{1,6})(?![A-Za-z0-9_(])/;

export function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    const start = i;
    if (ch === '"') {
      let v = '';
      i++;
      while (i < src.length) {
        if (src[i] === '"') {
          if (src[i + 1] === '"') {
            v += '"';
            i += 2;
            continue;
          }
          break;
        }
        v += src[i++];
      }
      if (src[i] !== '"') throw new SheetError('#ERROR!');
      i++;
      out.push({ t: 'str', v, s: start, e: i });
      continue;
    }
    if (ch === '#') {
      const m = /^#(DIV\/0!|REF!|NAME\?|VALUE!|N\/A|NUM!|NULL!)/i.exec(src.slice(i));
      if (!m) throw new SheetError('#ERROR!');
      i += m[0].length;
      out.push({ t: 'err', v: m[0].toUpperCase() as SheetErrorCode, s: start, e: i });
      continue;
    }
    // Sheet-qualified reference: Name!A1 or 'Sheet name'!A1
    let sheet: string | undefined;
    let j = i;
    if (ch === "'") {
      const m = /^'((?:[^']|'')+)'!/.exec(src.slice(i));
      if (!m) throw new SheetError('#ERROR!');
      sheet = m[1]!.replace(/''/g, "'");
      j = i + m[0].length;
    } else {
      const m = /^([A-Za-z_][A-Za-z0-9_.]*)!/.exec(src.slice(i));
      if (m) {
        sheet = m[1];
        j = i + m[0].length;
      }
    }
    const refMatch = REF_RE.exec(src.slice(j));
    if (refMatch) {
      const col = colIndex(refMatch[2]!);
      const row = Number(refMatch[4]) - 1;
      i = j + refMatch[0].length;
      out.push({ t: 'ref', sheet, col, row, absCol: refMatch[1] === '$', absRow: refMatch[3] === '$', s: start, e: i });
      continue;
    }
    if (sheet !== undefined) throw new SheetError('#REF!');
    const num = /^(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/.exec(src.slice(i));
    if (num) {
      i += num[0].length;
      out.push({ t: 'num', v: Number(num[0]), s: start, e: i });
      continue;
    }
    const ident = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(src.slice(i));
    if (ident) {
      i += ident[0].length;
      const upper = ident[0].toUpperCase();
      let k = i;
      while (/\s/.test(src[k] ?? '')) k++;
      if (src[k] === '(') out.push({ t: 'func', v: upper, s: start, e: i });
      else if (upper === 'TRUE' || upper === 'FALSE') out.push({ t: 'bool', v: upper === 'TRUE', s: start, e: i });
      else out.push({ t: 'name', v: ident[0], s: start, e: i });
      continue;
    }
    const two = src.slice(i, i + 2);
    if (two === '<=' || two === '>=' || two === '<>') {
      i += 2;
      out.push({ t: 'op', v: two, s: start, e: i });
      continue;
    }
    if ('+-*/^&=<>%:'.includes(ch)) {
      i++;
      out.push({ t: 'op', v: ch, s: start, e: i });
      continue;
    }
    if (ch === '(' || ch === ')') {
      i++;
      out.push({ t: ch, s: start, e: i });
      continue;
    }
    if (ch === ',' || ch === ';') {
      i++;
      out.push({ t: ',', s: start, e: i });
      continue;
    }
    throw new SheetError('#ERROR!');
  }
  return out;
}

// ─── Parser ─────────────────────────────────────────────────────────────────────

export type Ast =
  | { k: 'num'; v: number }
  | { k: 'str'; v: string }
  | { k: 'bool'; v: boolean }
  | { k: 'err'; v: SheetErrorCode }
  | { k: 'ref'; sheet?: string; row: number; col: number }
  | { k: 'range'; sheet?: string; r1: number; c1: number; r2: number; c2: number }
  | { k: 'name'; v: string }
  | { k: 'call'; name: string; args: Ast[] }
  | { k: 'unary'; op: string; arg: Ast }
  | { k: 'pct'; arg: Ast }
  | { k: 'bin'; op: string; a: Ast; b: Ast };

const BIN_PREC: Record<string, number> = { '=': 1, '<>': 1, '<': 1, '>': 1, '<=': 1, '>=': 1, '&': 2, '+': 3, '-': 3, '*': 4, '/': 4, '^': 5 };

export function parseFormula(src: string): Ast {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const next = () => toks[p++];

  function primary(): Ast {
    const tok = next();
    if (!tok) throw new SheetError('#ERROR!');
    switch (tok.t) {
      case 'num':
        return { k: 'num', v: tok.v };
      case 'str':
        return { k: 'str', v: tok.v };
      case 'bool':
        return { k: 'bool', v: tok.v };
      case 'err':
        return { k: 'err', v: tok.v };
      case 'name':
        return { k: 'name', v: tok.v };
      case 'ref': {
        const n = peek();
        if (n && n.t === 'op' && n.v === ':') {
          p++;
          const end = next();
          if (!end || end.t !== 'ref') throw new SheetError('#REF!');
          return {
            k: 'range',
            sheet: tok.sheet,
            r1: Math.min(tok.row, end.row),
            c1: Math.min(tok.col, end.col),
            r2: Math.max(tok.row, end.row),
            c2: Math.max(tok.col, end.col),
          };
        }
        return { k: 'ref', sheet: tok.sheet, row: tok.row, col: tok.col };
      }
      case 'func': {
        if (next()?.t !== '(') throw new SheetError('#ERROR!');
        const args: Ast[] = [];
        if (peek()?.t !== ')') {
          for (;;) {
            if (peek()?.t === ',' || peek()?.t === ')') args.push({ k: 'str', v: '' });
            else args.push(expr(0));
            if (peek()?.t === ',') {
              p++;
              continue;
            }
            break;
          }
        }
        if (next()?.t !== ')') throw new SheetError('#ERROR!');
        return { k: 'call', name: tok.v, args };
      }
      case '(': {
        const e = expr(0);
        if (next()?.t !== ')') throw new SheetError('#ERROR!');
        return e;
      }
      case 'op':
        if (tok.v === '-' || tok.v === '+') return { k: 'unary', op: tok.v, arg: unaryOperand() };
        throw new SheetError('#ERROR!');
      default:
        throw new SheetError('#ERROR!');
    }
  }

  /** Unary minus binds looser than ^ in Excel (-2^2 = 4), so parse a full postfix primary. */
  function unaryOperand(): Ast {
    return postfix(primary());
  }

  function postfix(node: Ast): Ast {
    let n = node;
    while (peek()?.t === 'op' && (peek() as { v: string }).v === '%') {
      p++;
      n = { k: 'pct', arg: n };
    }
    return n;
  }

  function expr(minPrec: number): Ast {
    let left = postfix(primary());
    for (;;) {
      const tok = peek();
      if (!tok || tok.t !== 'op') break;
      const prec = BIN_PREC[tok.v];
      if (prec === undefined || prec < minPrec) break;
      p++;
      const right = expr(tok.v === '^' ? prec : prec + 1);
      left = { k: 'bin', op: tok.v, a: left, b: right };
    }
    return left;
  }

  const ast = expr(0);
  if (p !== toks.length) throw new SheetError('#ERROR!');
  return ast;
}

// ─── Evaluation ─────────────────────────────────────────────────────────────────

type Grid = CellValue[][];
type FnImpl = (...args: unknown[]) => unknown;
const FUNCTIONS = formulajs as unknown as Record<string, FnImpl | undefined>;

/** Function names available to formulas (for autocomplete / docs). */
export const SHEET_FUNCTION_NAMES: readonly string[] = Object.keys(FUNCTIONS)
  .filter(k => typeof FUNCTIONS[k] === 'function' && /^[A-Z][A-Z0-9.]*$/.test(k))
  .sort();

function toNumber(v: CellValue): number | SheetError {
  if (v instanceof SheetError) return v;
  if (v === null || v === '') return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const lit = literalValue(v);
  return typeof lit === 'number' ? lit : new SheetError('#VALUE!');
}

function toText(v: CellValue): string | SheetError {
  if (v instanceof SheetError) return v;
  return formatValue(v);
}

function compare(a: CellValue, b: CellValue, op: string): boolean {
  const norm = (v: CellValue) => (v === null ? '' : v);
  let x: string | number | boolean = norm(a) as string | number | boolean;
  let y: string | number | boolean = norm(b) as string | number | boolean;
  if (typeof x === 'string' && typeof y === 'string') {
    x = x.toLowerCase();
    y = y.toLowerCase();
  } else if (typeof x !== typeof y) {
    // Excel ordering: numbers < text < booleans.
    const rank = (v: unknown) => (typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : 2);
    x = rank(x);
    y = rank(y);
  }
  switch (op) {
    case '=':
      return x === y;
    case '<>':
      return x !== y;
    case '<':
      return x < y;
    case '>':
      return x > y;
    case '<=':
      return x <= y;
    default:
      return x >= y;
  }
}

/** Convert a formulajs argument/result to a CellValue. */
function fromJs(v: unknown): CellValue {
  if (v instanceof SheetError) return v;
  if (v instanceof Error) return toSheetError(v);
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : new SheetError('#NUM!');
  if (typeof v === 'string' || typeof v === 'boolean') return v;
  if (v instanceof Date) return v.getTime() / 86_400_000 + 25569; // Excel serial date
  if (Array.isArray(v)) return fromJs(Array.isArray(v[0]) ? v[0][0] : v[0]);
  return String(v);
}

function toJs(v: CellValue): unknown {
  if (v instanceof SheetError) return new Error(v.code);
  return v;
}

export interface SheetEvaluator {
  /** Computed value of a cell (memoized). */
  value(sheet: string, row: number, col: number): CellValue;
  /** Values for a whole sheet as a dense grid of the given size. */
  grid(sheet: string, rows: number, cols: number): CellValue[][];
}

export function createEvaluator(doc: SheetDoc): SheetEvaluator {
  const byName = new Map<string, SheetData>();
  for (const s of doc.sheets) byName.set(s.name.toLowerCase(), s);
  const cache = new Map<string, CellValue>();
  const active = new Set<string>();
  const parsed = new Map<string, Ast | SheetError>();

  function cellValue(sheetName: string, row: number, col: number): CellValue {
    const sheet = byName.get(sheetName.toLowerCase());
    if (!sheet) return new SheetError('#REF!');
    const key = `${sheet.name.toLowerCase()}!${cellKey(row, col)}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const raw = sheet.cells[cellKey(row, col)] ?? '';
    if (!raw.startsWith('=') || raw.length === 1) {
      const v = literalValue(raw);
      cache.set(key, v);
      return v;
    }
    if (active.has(key)) return new SheetError('#CYCLE!');
    active.add(key);
    let result: CellValue;
    try {
      let ast = parsed.get(raw);
      if (!ast) {
        try {
          ast = parseFormula(raw.slice(1));
        } catch (e) {
          ast = e instanceof SheetError ? e : new SheetError('#ERROR!');
        }
        parsed.set(raw, ast);
      }
      result = ast instanceof SheetError ? ast : scalar(evalAst(ast, sheet.name));
    } catch (e) {
      result = e instanceof SheetError ? e : toSheetError(e);
    } finally {
      active.delete(key);
    }
    cache.set(key, result);
    return result;
  }

  function scalar(v: CellValue | Grid): CellValue {
    if (Array.isArray(v)) return v.length === 1 && v[0]!.length === 1 ? v[0]![0]! : new SheetError('#VALUE!');
    return v;
  }

  function evalAst(node: Ast, sheet: string): CellValue | Grid {
    switch (node.k) {
      case 'num':
      case 'str':
      case 'bool':
        return node.v;
      case 'err':
        return new SheetError(node.v);
      case 'name':
        return new SheetError('#NAME?');
      case 'ref':
        return cellValue(node.sheet ?? sheet, node.row, node.col);
      case 'range': {
        const s = node.sheet ?? sheet;
        if (!byName.has(s.toLowerCase())) return new SheetError('#REF!');
        const out: Grid = [];
        for (let r = node.r1; r <= node.r2; r++) {
          const row: CellValue[] = [];
          for (let c = node.c1; c <= node.c2; c++) row.push(cellValue(s, r, c));
          out.push(row);
        }
        return out;
      }
      case 'unary': {
        const n = toNumber(scalar(evalAst(node.arg, sheet)));
        return n instanceof SheetError ? n : node.op === '-' ? -n : n;
      }
      case 'pct': {
        const n = toNumber(scalar(evalAst(node.arg, sheet)));
        return n instanceof SheetError ? n : n / 100;
      }
      case 'bin': {
        const a = scalar(evalAst(node.a, sheet));
        const b = scalar(evalAst(node.b, sheet));
        if (a instanceof SheetError) return a;
        if (b instanceof SheetError) return b;
        if (node.op === '&') {
          const x = toText(a);
          const y = toText(b);
          return x instanceof SheetError ? x : y instanceof SheetError ? y : x + y;
        }
        if (BIN_PREC[node.op] === 1) return compare(a, b, node.op);
        const x = toNumber(a);
        const y = toNumber(b);
        if (x instanceof SheetError) return x;
        if (y instanceof SheetError) return y;
        switch (node.op) {
          case '+':
            return x + y;
          case '-':
            return x - y;
          case '*':
            return x * y;
          case '/':
            return y === 0 ? new SheetError('#DIV/0!') : x / y;
          default: {
            const r = Math.pow(x, y);
            return Number.isFinite(r) ? r : new SheetError('#NUM!');
          }
        }
      }
      case 'call': {
        const fn = FUNCTIONS[node.name];
        if (typeof fn !== 'function') return new SheetError('#NAME?');
        // Short-circuit the common lazy functions so an unused branch's error does not leak.
        if (node.name === 'IF') {
          const cond = scalar(evalAst(node.args[0] ?? { k: 'bool', v: false }, sheet));
          if (cond instanceof SheetError) return cond;
          const truthy = typeof cond === 'string' ? cond !== '' : Boolean(cond);
          const branch = node.args[truthy ? 1 : 2];
          return branch ? evalAst(branch, sheet) : truthy;
        }
        if (node.name === 'IFERROR') {
          const v = scalar(evalAst(node.args[0] ?? { k: 'str', v: '' }, sheet));
          return v instanceof SheetError ? evalAst(node.args[1] ?? { k: 'str', v: '' }, sheet) : v;
        }
        const args = node.args.map(a => {
          const v = evalAst(a, sheet);
          return Array.isArray(v) ? v.map(r => r.map(toJs)) : toJs(v);
        });
        try {
          return fromJs(fn(...args));
        } catch (e) {
          return toSheetError(e);
        }
      }
    }
  }

  return {
    value: cellValue,
    grid(sheet, rows, cols) {
      const out: CellValue[][] = [];
      for (let r = 0; r < rows; r++) {
        const row: CellValue[] = [];
        for (let c = 0; c < cols; c++) row.push(cellValue(sheet, r, c));
        out.push(row);
      }
      return out;
    },
  };
}

// ─── Reference rewriting ────────────────────────────────────────────────────────

function refText(tok: Extract<Token, { t: 'ref' }>, row: number, col: number, src: string): string {
  const prefix = src.slice(tok.s, tok.e).replace(/\$?[A-Za-z]{1,3}\$?\d{1,6}$/, '');
  return `${prefix}${tok.absCol ? '$' : ''}${colName(col)}${tok.absRow ? '$' : ''}${row + 1}`;
}

function rewriteRefs(raw: string, map: (tok: Extract<Token, { t: 'ref' }>) => { row: number; col: number } | null): string {
  if (!raw.startsWith('=')) return raw;
  const src = raw.slice(1);
  let toks: Token[];
  try {
    toks = tokenize(src);
  } catch {
    return raw;
  }
  let out = '';
  let last = 0;
  for (const tok of toks) {
    if (tok.t !== 'ref') continue;
    const next = map(tok);
    out += src.slice(last, tok.s);
    out += next ? refText(tok, next.row, next.col, src) : '#REF!';
    last = tok.e;
  }
  return '=' + out + src.slice(last);
}

export interface StructuralEdit {
  /** Sheet being edited (refs to other sheets are untouched unless they name this sheet). */
  sheet: string;
  axis: 'row' | 'col';
  /** First index affected. */
  at: number;
  /** Positive = insert, negative = delete. */
  count: number;
}

/** Rewrite a formula after rows/columns are inserted or deleted in `edit.sheet`. */
export function shiftFormula(raw: string, formulaSheet: string, edit: StructuralEdit): string {
  return rewriteRefs(raw, tok => {
    const target = (tok.sheet ?? formulaSheet).toLowerCase();
    if (target !== edit.sheet.toLowerCase()) return { row: tok.row, col: tok.col };
    const idx = edit.axis === 'row' ? tok.row : tok.col;
    let next = idx;
    if (edit.count > 0 && idx >= edit.at) next = idx + edit.count;
    if (edit.count < 0) {
      const delEnd = edit.at - edit.count; // exclusive
      if (idx >= edit.at && idx < delEnd) return null;
      if (idx >= delEnd) next = idx + edit.count;
    }
    return edit.axis === 'row' ? { row: next, col: tok.col } : { row: tok.row, col: next };
  });
}

/** Move a formula by (dRow, dCol) the way copy/paste does: relative refs shift, `$` refs stay. */
export function offsetFormula(raw: string, dRow: number, dCol: number): string {
  return rewriteRefs(raw, tok => {
    const row = tok.absRow ? tok.row : tok.row + dRow;
    const col = tok.absCol ? tok.col : tok.col + dCol;
    return row < 0 || col < 0 ? null : { row, col };
  });
}

// ─── Tabular output ─────────────────────────────────────────────────────────────

/** Rows of displayed values (or raw formulas) for a sheet/range. */
export function sheetRows(doc: SheetDoc, sheet: SheetData, range?: string, formulas = false): string[][] {
  const ext = sheetExtent(sheet);
  const r = range ? parseRange(range) : { r1: 0, c1: 0, r2: ext.rows - 1, c2: ext.cols - 1 };
  if (!r) throw new Error(`Bad range “${range}”.`);
  const ev = createEvaluator(doc);
  const rows: string[][] = [];
  for (let row = r.r1; row <= r.r2; row++) {
    const line: string[] = [];
    for (let col = r.c1; col <= r.c2; col++) {
      const raw = sheet.cells[cellKey(row, col)] ?? '';
      line.push(formulas ? raw : formatValue(ev.value(sheet.name, row, col)));
    }
    rows.push(line);
  }
  return rows;
}


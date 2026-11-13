import { describe, expect, it } from 'vitest';
import {
  cellKey,
  colIndex,
  colName,
  parseCellKey,
  parseDelimited,
  parseSheetDoc,
  sheetExtent,
  toDelimited,
  type SheetDoc,
} from './sheet';
import { createEvaluator, formatValue, offsetFormula, shiftFormula, SheetError, literalValue } from './sheetFormula';

function doc(sheets: Record<string, Record<string, string>>): SheetDoc {
  return { mnemoSheet: 1, sheets: Object.entries(sheets).map(([name, cells]) => ({ name, cells })) };
}

function val(d: SheetDoc, addr: string, sheet = d.sheets[0]!.name): string {
  const a = parseCellKey(addr)!;
  return formatValue(createEvaluator(d).value(sheet, a.row, a.col));
}

describe('addresses and documents', () => {
  it('converts column names both ways', () => {
    expect([0, 25, 26, 701].map(colName)).toEqual(['A', 'Z', 'AA', 'ZZ']);
    expect(['A', 'Z', 'AA', 'ZZ'].map(colIndex)).toEqual([0, 25, 26, 701]);
    expect(cellKey(9, 27)).toBe('AB10');
    expect(parseCellKey('$B$3')).toEqual({ row: 2, col: 1 });
    expect(parseCellKey('A0')).toBeNull();
  });

  it('parses bodies tolerantly: empty, JSON, junk keys, and CSV fallback', () => {
    expect(parseSheetDoc('').sheets).toHaveLength(1);
    const d = parseSheetDoc('{"mnemoSheet":1,"sheets":[{"name":"A","cells":{"a1":"x","zz9999999":"bad","B2":""}},{"name":"A","cells":{}}]}');
    expect(d.sheets.map(s => s.name)).toEqual(['A', 'A (2)']);
    expect(d.sheets[0]!.cells).toEqual({ A1: 'x' });
    const csv = parseSheetDoc('name,qty\nbolts,3');
    expect(csv.sheets[0]!.cells).toEqual({ A1: 'name', B1: 'qty', A2: 'bolts', B2: '3' });
    expect(sheetExtent(csv.sheets[0]!)).toEqual({ rows: 2, cols: 2 });
  });

  it('round-trips CSV with quotes, delimiters, and newlines; detects TSV', () => {
    const rows = [['a', 'b,c', 'say "hi"'], ['multi\nline', '', 'x']];
    expect(parseDelimited(toDelimited(rows))).toEqual(rows);
    expect(parseDelimited('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseDelimited('a;b;c\n1;2;3')[0]).toEqual(['a', 'b', 'c']);
  });
});

describe('formula evaluation', () => {
  it('handles literals, precedence, percent, concatenation, and comparisons', () => {
    expect(literalValue('12.5')).toBe(12.5);
    expect(literalValue('50%')).toBe(0.5);
    expect(literalValue("'007")).toBe('007');
    const d = doc({ S: { A1: '=1+2*3', A2: '=-2^2', A3: '=(1+2)*3', A4: '=10%*5', A5: '="a"&1&TRUE', A6: '=2>1', A7: '="B"="b"', A8: '=0.1+0.2' } });
    expect(['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8'].map(a => val(d, a))).toEqual([
      '7', '4', '9', '0.5', 'a1TRUE', 'TRUE', 'TRUE', '0.3',
    ]);
  });

  it('evaluates ranges and formulajs functions, treating empty cells sensibly', () => {
    const d = doc({
      S: {
        A1: '1', A2: '2', A3: '3', A5: 'text',
        B1: '=SUM(A1:A5)', B2: '=AVERAGE(A1:A3)', B3: '=A4+1', B4: '=COUNTA(A1:A5)',
        B5: '=VLOOKUP("y",D1:E2,2,FALSE)', D1: 'x', E1: '10', D2: 'y', E2: '20',
        B6: '=ROUND(10/3, 2)', B7: '=UPPER(A5)', B8: '=IF(A1>0,"pos","neg")', B9: '=MAX(A1:A3)*2',
      },
    });
    expect(['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9'].map(a => val(d, a))).toEqual([
      '6', '2', '1', '4', '20', '3.33', 'TEXT', 'pos', '6',
    ]);
  });

  it('resolves cross-sheet references, quoted sheet names, and missing sheets', () => {
    const d = doc({ Main: { A1: "=Data!B2*2", A2: "='Q1 Totals'!A1+1", A3: '=Nope!A1' }, Data: { B2: '21' }, 'Q1 Totals': { A1: '=SUM(Data!B1:B3)' } });
    expect(val(d, 'A1')).toBe('42');
    expect(val(d, 'A2')).toBe('22');
    expect(val(d, 'A3')).toBe('#REF!');
  });

  it('reports errors: divide by zero, unknown names, bad syntax, cycles; IF/IFERROR are lazy', () => {
    const d = doc({
      S: {
        A1: '=1/0', A2: '=NOSUCHFN(1)', A3: '=1+', A4: '=A5', A5: '=A4', A6: '=IFERROR(1/0,"safe")',
        A7: '=IF(TRUE,1,1/0)', A8: '=A1+1', A9: '="x"*2', A10: '=foo',
      },
    });
    expect(['A1', 'A2', 'A3', 'A4', 'A6', 'A7', 'A8', 'A9', 'A10'].map(a => val(d, a))).toEqual([
      '#DIV/0!', '#NAME?', '#ERROR!', '#CYCLE!', 'safe', '1', '#DIV/0!', '#VALUE!', '#NAME?',
    ]);
    expect(createEvaluator(d).value('S', 0, 0)).toBeInstanceOf(SheetError);
  });
});

describe('reference rewriting', () => {
  it('shifts references when rows/columns are inserted or deleted', () => {
    const ins = { sheet: 'S', axis: 'row' as const, at: 2, count: 2 };
    expect(shiftFormula('=SUM(A1:A5)+$B$3', 'S', ins)).toBe('=SUM(A1:A7)+$B$5');
    expect(shiftFormula('=Other!A5', 'S', ins)).toBe('=Other!A5');
    expect(shiftFormula('=S!A5', 'Other', ins)).toBe('=S!A7');
    const del = { sheet: 'S', axis: 'col' as const, at: 1, count: -1 };
    expect(shiftFormula('=A1+B1+C1', 'S', del)).toBe('=A1+#REF!+B1');
    expect(shiftFormula('plain', 'S', del)).toBe('plain');
    expect(shiftFormula('="B1 text"&B1', 'S', del)).toBe('="B1 text"&#REF!');
  });

  it('offsets relative references on paste and keeps $-anchored parts', () => {
    expect(offsetFormula('=A1+$A$1+A$1+$A1', 1, 2)).toBe('=C2+$A$1+C$1+$A2');
    expect(offsetFormula('=A1', -1, 0)).toBe('=#REF!');
    expect(offsetFormula("='My Sheet'!B2", 1, 1)).toBe("='My Sheet'!C3");
  });
});

describe('number formats and dates', () => {
  it('formats numbers, percents, currency, integers, and dates', async () => {
    const { displayValue, dateStringToSerial, serialToDateString } = await import('./sheetFormula');
    expect(displayValue(1234.5, { num: 'number' })).toBe('1,234.50');
    expect(displayValue(1234.567, { num: 'number', dp: 1 })).toBe('1,234.6');
    expect(displayValue(0.256, { num: 'percent', dp: 1 })).toBe('25.6%');
    expect(displayValue(-1234.5, { num: 'currency' })).toBe('-$1,234.50');
    expect(displayValue(2.5, { num: 'integer' })).toBe('3');
    expect(displayValue('x', { num: 'currency' })).toBe('x');
    const serial = dateStringToSerial('2026-11-13')!;
    expect(serialToDateString(serial)).toBe('2026-11-13');
    expect(displayValue(serial, { num: 'date' })).toBe('2026-11-13');
    expect(serialToDateString(dateStringToSerial('2026-11-13 09:30')!)).toBe('2026-11-13 09:30');
  });

  it('treats typed ISO dates as dates in arithmetic and display', async () => {
    const d = doc({ S: { A1: '2026-11-13', A2: '=A1+30', A3: '=A2-A1' } });
    const ev = createEvaluator(d);
    const { displayValue } = await import('./sheetFormula');
    expect(displayValue(ev.value('S', 0, 0), undefined, '2026-11-13')).toBe('2026-11-13');
    expect(displayValue(ev.value('S', 1, 0), { num: 'date' })).toBe('2026-12-13');
    expect(formatValue(ev.value('S', 2, 0))).toBe('30');
  });

  it('keeps only valid formats when parsing documents', () => {
    const d = parseSheetDoc(JSON.stringify({ mnemoSheet: 1, sheets: [{ name: 'S', cells: {}, formats: { a1: { bold: true, color: '#FF0000', num: 'percent', dp: 2 }, B2: { color: 'red', num: 'nope' } } }] }));
    expect(d.sheets[0]!.formats).toEqual({ A1: { bold: true, color: '#ff0000', num: 'percent', dp: 2 } });
  });
});

describe('inherited number formats', () => {
  it('formula cells inherit the first referenced cell format (dates, currency) unless they have their own', async () => {
    const { cellDisplay } = await import('./sheetFormula');
    const d = doc({ S: { A1: '2026-11-13', A2: '=A1+30', B1: '5', B2: '=B1*2', B3: '=B1*2' } });
    d.sheets[0]!.formats = { B1: { num: 'currency' }, B3: { num: 'number', dp: 1 } };
    const ev = createEvaluator(d);
    const show = (row: number, col: number) => cellDisplay(d, d.sheets[0]!, row, col, ev.value('S', row, col));
    expect(show(1, 0)).toBe('2026-12-13');
    expect(show(1, 1)).toBe('$10.00');
    expect(show(2, 1)).toBe('10.0');
  });
});

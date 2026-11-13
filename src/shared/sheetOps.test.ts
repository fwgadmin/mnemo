import { describe, expect, it } from 'vitest';
import { createEvaluator, formatValue } from './sheetFormula';
import { compareCellValues, fillRange, fillSeries, sortRows } from './sheetOps';
import type { SheetData } from './sheet';

describe('sorting', () => {
  it('orders numbers < text < booleans with blanks last, case-insensitive and numeric-aware', () => {
    const vals = ['b10', 3, 'B2', true, null, 1, 'a'] as const;
    expect([...vals].sort(compareCellValues as never)).toEqual([1, 3, 'a', 'B2', 'b10', true, null]);
  });

  it('sorts rows by a column, keeps blanks last both ways, moves formats, and shifts formulas in moved rows', () => {
    const sheet: SheetData = {
      name: 'S',
      cells: { A1: 'Item', B1: 'Qty', A2: 'Nuts', B2: '8', C2: '=B2*2', A3: 'Bolts', B3: '120', C3: '=B3*2', A4: 'Pins', A5: 'Axles', B5: '3', C5: '=B5*2' },
      formats: { B3: { bold: true } },
    };
    const ev = (s: SheetData) => createEvaluator({ mnemoSheet: 1, sheets: [s] });
    const asc = sortRows(sheet, { r1: 1, r2: 4 }, 1, false, (r, c) => ev(sheet).value('S', r, c));
    expect([asc.cells.A2, asc.cells.A3, asc.cells.A4, asc.cells.A5]).toEqual(['Axles', 'Nuts', 'Bolts', 'Pins']);
    expect(asc.cells.C2).toBe('=B2*2');
    expect(formatValue(ev(asc).value('S', 3, 2))).toBe('240');
    expect(asc.formats?.B4).toEqual({ bold: true });
    expect(asc.cells.A1).toBe('Item');
    const desc = sortRows(sheet, { r1: 1, r2: 4 }, 1, true, (r, c) => ev(sheet).value('S', r, c));
    expect([desc.cells.A2, desc.cells.A3, desc.cells.A4, desc.cells.A5]).toEqual(['Bolts', 'Nuts', 'Axles', 'Pins']);
  });
});

describe('fill handle', () => {
  it('continues numeric, date, and "text N" series; repeats single values and plain text', () => {
    expect(fillSeries(['1', '3'], 3, { dRow: 1, dCol: 0 })).toEqual(['5', '7', '9']);
    expect(fillSeries(['0.1', '0.2'], 2, { dRow: 1, dCol: 0 })).toEqual(['0.3', '0.4']);
    expect(fillSeries(['5'], 2, { dRow: 1, dCol: 0 })).toEqual(['5', '5']);
    expect(fillSeries(['2026-11-13'], 2, { dRow: 1, dCol: 0 })).toEqual(['2026-11-14', '2026-11-15']);
    expect(fillSeries(['2026-01-01', '2026-01-08'], 1, { dRow: 1, dCol: 0 })).toEqual(['2026-01-15']);
    expect(fillSeries(['Item 1'], 2, { dRow: 1, dCol: 0 })).toEqual(['Item 2', 'Item 3']);
    expect(fillSeries(['Q09'], 2, { dRow: 1, dCol: 0 })).toEqual(['Q10', 'Q11']);
    expect(fillSeries(['red', 'blue'], 3, { dRow: 1, dCol: 0 })).toEqual(['red', 'blue', 'red']);
  });

  it('fills formulas with shifted references and copies formats, in every direction', () => {
    const sheet: SheetData = { name: 'S', cells: { A1: '2', B1: '=A1*10' }, formats: { B1: { num: 'currency' } } };
    const down = fillRange(sheet, { r1: 0, c1: 1, r2: 0, c2: 1 }, { row: 2, col: 1 })!;
    expect(down.cells).toEqual({ B2: '=A2*10', B3: '=A3*10' });
    expect(down.formats.B3).toEqual({ num: 'currency' });
    expect(down.filled).toEqual({ r1: 0, c1: 1, r2: 2, c2: 1 });
    const right = fillRange(sheet, { r1: 0, c1: 0, r2: 0, c2: 1 }, { row: 0, col: 3 })!;
    expect(right.cells).toEqual({ C1: '2', D1: '=C1*10' });
    const up = fillRange({ name: 'S', cells: { A5: '10', A6: '20' } }, { r1: 4, c1: 0, r2: 5, c2: 0 }, { row: 2, col: 0 })!;
    expect(up.cells).toEqual({ A4: '0', A3: '-10' });
    expect(fillRange(sheet, { r1: 0, c1: 0, r2: 0, c2: 0 }, { row: 0, col: 0 })).toBeNull();
  });
});

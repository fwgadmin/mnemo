import { describe, expect, it } from 'vitest';
import { chartData, niceTicks } from './sheetChart';
import { createEvaluator } from './sheetFormula';
import { parseSheetDoc, type SheetDoc } from './sheet';

function mk(cells: Record<string, string>, formats?: Record<string, object>): SheetDoc {
  return { mnemoSheet: 1, sheets: [{ name: 'S', cells, ...(formats ? { formats } : {}) }] };
}

describe('chart data', () => {
  it('uses the first column as categories and a text header row as series names', () => {
    const d = mk({ A1: 'Month', B1: 'Sales', C1: 'Costs', A2: 'Jan', B2: '10', C2: '4', A3: 'Feb', B3: '=B2*2', C3: 'n/a' }, { B2: { num: 'currency' } });
    const data = chartData(d, d.sheets[0]!, { id: 'c', type: 'column', range: 'A1:C3' }, createEvaluator(d));
    expect(data.error).toBeUndefined();
    expect(data.categories).toEqual(['Jan', 'Feb']);
    expect(data.series.map(s => s.name)).toEqual(['Sales', 'Costs']);
    expect(data.series[0]!.values).toEqual([10, 20]);
    expect(data.series[0]!.labels[0]).toBe('$10.00');
    expect(data.series[1]!.values).toEqual([4, null]);
  });

  it('treats a numeric first row as data, and explains unusable ranges', () => {
    const d = mk({ A1: 'x', B1: '1', A2: 'y', B2: '2' });
    const ev = createEvaluator(d);
    const data = chartData(d, d.sheets[0]!, { id: 'c', type: 'line', range: 'A1:B2' }, ev);
    expect(data.categories).toEqual(['x', 'y']);
    expect(data.series[0]!.name).toBe('B');
    expect(chartData(d, d.sheets[0]!, { id: 'c', type: 'line', range: 'A1:A2' }, ev).error).toMatch(/two columns/);
    const words = mk({ A1: 'a', B1: 'b', A2: 'c', B2: 'd' });
    expect(chartData(words, words.sheets[0]!, { id: 'c', type: 'bar', range: 'A1:B2' }, createEvaluator(words)).error).toMatch(/No numbers/);
    const wide = mk({});
    expect(chartData(wide, wide.sheets[0]!, { id: 'c', type: 'bar', range: 'A1:J3' }, createEvaluator(wide)).error).toMatch(/more than 8/);
  });

  it('produces nice ticks that cover the data', () => {
    expect(niceTicks(0, 87)).toEqual([0, 20, 40, 60, 80, 100]);
    expect(niceTicks(-3, 12)).toEqual([-5, 0, 5, 10, 15]);
    expect(niceTicks(5, 5).length).toBeGreaterThan(1);
  });

  it('keeps only valid charts when parsing documents', () => {
    const d = parseSheetDoc(JSON.stringify({ mnemoSheet: 1, sheets: [{ name: 'S', cells: {}, charts: [{ id: 'a', type: 'line', range: 'a1:b5', title: 'T' }, { id: 'b', range: 'nope' }, { type: 'pie', range: 'A1:B2' }] }] }));
    const charts = d.sheets[0]!.charts!;
    expect(charts).toHaveLength(2);
    expect(charts[0]).toEqual({ id: 'a', type: 'line', range: 'A1:B5', title: 'T' });
    expect(charts[1]!.type).toBe('column');
  });
});

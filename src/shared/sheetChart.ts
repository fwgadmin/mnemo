/**
 * Chart data from a sheet range. First column = category labels, remaining columns = series; the first row
 * names the series when its value cells hold text. Non-numeric values become gaps.
 */
import { cellKey, parseRange, type SheetChart, type SheetData, type SheetDoc } from './sheet';
import { cellDisplay, formatValue, type SheetEvaluator } from './sheetFormula';

/** Categorical palette slots (fixed order, never cycled); more series fold into an error message. */
export const MAX_CHART_SERIES = 8;
export const MAX_CHART_CATEGORIES = 200;

export interface ChartSeries {
  name: string;
  values: Array<number | null>;
  /** Display strings in the cell's number format (tooltips / labels). */
  labels: string[];
}

export interface ChartData {
  categories: string[];
  series: ChartSeries[];
  /** Explains why nothing can be drawn (bad range, no numbers, too many series). */
  error?: string;
}

export function chartData(doc: SheetDoc, sheet: SheetData, chart: SheetChart, ev: SheetEvaluator): ChartData {
  const r = parseRange(chart.range);
  if (!r) return { categories: [], series: [], error: `Bad range ${chart.range}` };
  if (r.c2 === r.c1) return { categories: [], series: [], error: 'Select at least two columns: labels, then values' };
  const value = (row: number, col: number) => ev.value(sheet.name, row, col);
  const firstRowIsHeader = (() => {
    for (let c = r.c1 + 1; c <= r.c2; c++) {
      const v = value(r.r1, c);
      if (typeof v === 'string' && v.trim() !== '') return true;
    }
    return false;
  })();
  const dataStart = firstRowIsHeader ? r.r1 + 1 : r.r1;
  const seriesCount = r.c2 - r.c1;
  if (seriesCount > MAX_CHART_SERIES) {
    return { categories: [], series: [], error: `${seriesCount} series is more than ${MAX_CHART_SERIES}; chart fewer columns` };
  }
  const rows: number[] = [];
  for (let row = dataStart; row <= r.r2 && rows.length < MAX_CHART_CATEGORIES; row++) rows.push(row);
  const categories = rows.map(row => cellDisplay(doc, sheet, row, r.c1, value(row, r.c1)) || String(row + 1));
  const series: ChartSeries[] = [];
  for (let c = r.c1 + 1; c <= r.c2; c++) {
    const name = firstRowIsHeader ? formatValue(value(r.r1, c)) || cellKey(r.r1, c) : cellKey(r.r1, c).replace(/\d+$/, '');
    const values = rows.map(row => {
      const v = value(row, c);
      return typeof v === 'number' && Number.isFinite(v) ? v : null;
    });
    const labels = rows.map(row => cellDisplay(doc, sheet, row, c, value(row, c)));
    series.push({ name, values, labels });
  }
  if (!series.some(s => s.values.some(v => v !== null))) {
    return { categories, series, error: 'No numbers in the value columns' };
  }
  return { categories, series };
}

/** Rounded "nice" axis ticks covering [min, max] (includes 0 for bar-like charts). */
export function niceTicks(min: number, max: number, target = 5): number[] {
  if (min === max) {
    const pad = Math.abs(min) || 1;
    min -= pad;
    max += pad;
  }
  const rawStep = (max - min) / Math.max(1, target);
  const mag = 10 ** Math.floor(Math.log10(rawStep));
  const norm = rawStep / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Number(v.toPrecision(12)));
  return out;
}

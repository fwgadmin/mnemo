import { describe, expect, it } from 'vitest';
import { sheetFromDelimited, sheetsFromXlsx, xlsxFromPayload } from './sheetConvert';
import { createEvaluator, formatValue } from '../shared/sheetFormula';
import type { SheetExportPayload } from '../shared/sheet';

describe('sheet file import/export', () => {
  it('round-trips values, formulas, multiple sheets, and column widths through XLSX', async () => {
    const payload: SheetExportPayload = {
      format: 'xlsx',
      title: 'Budget',
      sheets: [
        {
          name: 'Q1: totals?',
          cells: [
            [{ raw: 'Item', value: 'Item' }, { raw: 'Cost', value: 'Cost' }],
            [{ raw: 'Bolts', value: 'Bolts' }, { raw: '12.5', value: 12.5 }],
            [{ raw: 'Total', value: 'Total' }, { raw: '=SUM(B2:B2)', value: 12.5 }],
            [{ raw: 'Flag', value: 'Flag' }, { raw: 'TRUE', value: true }],
          ],
          colWidths: { '0': 140 },
        },
        { name: 'Notes', cells: [[{ raw: '007 agent', value: '007 agent' }]], colWidths: {} },
      ],
    };
    const sheets = await sheetsFromXlsx(await xlsxFromPayload(payload));
    expect(sheets.map(s => s.name)).toEqual(['Q1  totals', 'Notes']);
    expect(sheets[0]!.cells).toEqual({ A1: 'Item', B1: 'Cost', A2: 'Bolts', B2: '12.5', A3: 'Total', B3: '=SUM(B2:B2)', A4: 'Flag', B4: 'TRUE' });
    expect(sheets[0]!.colWidths?.['0']).toBe(140);
    expect(sheets[1]!.cells).toEqual({ A1: '007 agent' });
    const ev = createEvaluator({ mnemoSheet: 1, sheets });
    expect(formatValue(ev.value(sheets[0]!.name, 2, 1))).toBe('12.5');
  });

  it('imports CSV text into a sheet', () => {
    expect(sheetFromDelimited('a,b\n"x, y",2\n', 'Data').cells).toEqual({ A1: 'a', B1: 'b', A2: 'x, y', B2: '2' });
  });
});

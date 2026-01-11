import { describe, expect, test } from 'vitest';
import { calculateNormalizedDividends } from '../src/services/dividendNormalization.js';

describe('dividendNormalization (ETF/CCETF)', () => {
  test('DJIA-like year-end extra distribution: prior monthly stays Monthly; extra payment is Special', () => {
    const divs = [
      { id: 1, ticker: 'DJIA', ex_date: '2025-10-24', div_cash: 0.50, adj_amount: 0.50 },
      { id: 2, ticker: 'DJIA', ex_date: '2025-11-25', div_cash: 0.50, adj_amount: 0.50 },
      { id: 3, ticker: 'DJIA', ex_date: '2025-12-22', div_cash: 0.50, adj_amount: 0.50 }, // regular monthly
      { id: 4, ticker: 'DJIA', ex_date: '2025-12-30', div_cash: 0.20, adj_amount: 0.20 }, // special (cap-gain-like)
      { id: 5, ticker: 'DJIA', ex_date: '2026-01-24', div_cash: 0.50, adj_amount: 0.50 },
    ];

    const res = calculateNormalizedDividends(divs);
    const byDate = new Map(res.map((r) => [divs.find((d) => d.id === r.id)!.ex_date, r]));

    expect(byDate.get('2025-12-22')!.pmt_type).toBe('Regular');
    expect(byDate.get('2025-12-22')!.frequency_num).toBe(12);

    expect(byDate.get('2025-12-30')!.pmt_type).toBe('Special');
  });

  test('Monthly -> Weekly cadence change: first weekly payment is Regular (not Special); last monthly stays Monthly', () => {
    const divs = [
      { id: 1, ticker: 'ULTY', ex_date: '2025-02-06', div_cash: 0.4653, adj_amount: 4.653 },
      { id: 2, ticker: 'ULTY', ex_date: '2025-03-06', div_cash: 0.4653, adj_amount: 4.653 }, // monthly
      { id: 3, ticker: 'ULTY', ex_date: '2025-03-13', div_cash: 0.1025, adj_amount: 1.025 }, // weekly starts
      { id: 4, ticker: 'ULTY', ex_date: '2025-03-20', div_cash: 0.1025, adj_amount: 1.025 },
      { id: 5, ticker: 'ULTY', ex_date: '2025-03-27', div_cash: 0.1025, adj_amount: 1.025 },
    ];

    const res = calculateNormalizedDividends(divs);
    const byDate = new Map(res.map((r) => [divs.find((d) => d.id === r.id)!.ex_date, r]));

    expect(byDate.get('2025-03-06')!.frequency_num).toBe(12);
    expect(byDate.get('2025-03-13')!.pmt_type).toBe('Regular');
    expect(byDate.get('2025-03-13')!.frequency_num).toBe(52);
  });

  test('Non-December extra distribution still classifies as Special (GIAX-like)', () => {
    const divs = [
      { id: 1, ticker: 'GIAX', ex_date: '2024-09-27', div_cash: 0.40, adj_amount: 0.40 },
      { id: 2, ticker: 'GIAX', ex_date: '2024-10-29', div_cash: 0.40, adj_amount: 0.40 },
      { id: 3, ticker: 'GIAX', ex_date: '2024-11-26', div_cash: 0.40, adj_amount: 0.40 }, // regular monthly
      { id: 4, ticker: 'GIAX', ex_date: '2024-11-28', div_cash: 0.15, adj_amount: 0.15 }, // extra distribution in same month
      { id: 5, ticker: 'GIAX', ex_date: '2024-12-27', div_cash: 0.40, adj_amount: 0.40 },
    ];

    const res = calculateNormalizedDividends(divs);
    const byDate = new Map(res.map((r) => [divs.find((d) => d.id === r.id)!.ex_date, r]));

    expect(byDate.get('2024-11-26')!.pmt_type).toBe('Regular');
    expect(byDate.get('2024-11-26')!.frequency_num).toBe(12);
    expect(byDate.get('2024-11-28')!.pmt_type).toBe('Special');
  });

  test('Tiny special right before regular payment is flagged Special', () => {
    // Add a prior regular so the tiny payment isn't the "Initial" row.
    const divs2 = [
      { id: 1, ticker: 'ULTY', ex_date: '2025-03-01', div_cash: 0.4866, adj_amount: 4.866 },
      { id: 2, ticker: 'ULTY', ex_date: '2025-03-28', div_cash: 0.0003, adj_amount: 0.0003 },
      { id: 3, ticker: 'ULTY', ex_date: '2025-04-01', div_cash: 0.4866, adj_amount: 4.866 },
    ];
    const res2 = calculateNormalizedDividends(divs2);
    const byDate = new Map(res2.map((r) => [divs2.find((d) => d.id === r.id)!.ex_date, r]));
    expect(byDate.get('2025-03-28')!.pmt_type).toBe('Special');
  });
});



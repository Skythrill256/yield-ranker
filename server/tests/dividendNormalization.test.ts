import { describe, expect, test } from 'vitest';
import {
  calculateNormalizedDividends,
  getFrequencyFromDays,
  getFrequencyFromDaysStrict,
  isHolidayDrift,
  getDominantFrequencyFromGaps,
  getFrequencyWithHistoryAware
} from '../src/services/dividendNormalization.js';

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

  // ============================================================================
  // NEW TESTS: CCD-like short gap and holiday drift scenarios (Copilot Rules)
  // ============================================================================

  test('CCD-like: 18-day December gap with unchanged amount stays Monthly (not Weekly)', () => {
    // CCD is a monthly payer, but December payment had gap of 18 days.
    // Because amount is unchanged and prior pattern was monthly, it should stay Monthly.
    const divs = [
      { id: 1, ticker: 'CCD', ex_date: '2024-09-25', div_cash: 0.08, adj_amount: 0.08 },
      { id: 2, ticker: 'CCD', ex_date: '2024-10-25', div_cash: 0.08, adj_amount: 0.08 }, // 30 days
      { id: 3, ticker: 'CCD', ex_date: '2024-11-22', div_cash: 0.08, adj_amount: 0.08 }, // 28 days
      { id: 4, ticker: 'CCD', ex_date: '2024-12-10', div_cash: 0.08, adj_amount: 0.08 }, // 18 days (short gap!)
      { id: 5, ticker: 'CCD', ex_date: '2025-01-24', div_cash: 0.08, adj_amount: 0.08 }, // 45 days
    ];

    const res = calculateNormalizedDividends(divs);
    const byDate = new Map(res.map((r) => [divs.find((d) => d.id === r.id)!.ex_date, r]));

    // The 12/10 dividend should be Monthly (12), NOT Weekly (52)
    // because amount is unchanged and fund has stable monthly history
    const dec10 = byDate.get('2024-12-10')!;
    expect(dec10.pmt_type).toBe('Regular');
    expect(dec10.frequency_num).toBe(12); // CRITICAL: Should be Monthly, not Weekly

    // All regular dividends should be Monthly
    expect(byDate.get('2024-10-25')!.frequency_num).toBe(12);
    expect(byDate.get('2024-11-22')!.frequency_num).toBe(12);
  });

  test('Monthly with 35-40 day holiday drift gap stays Monthly', () => {
    // Holiday can cause ~35-40 day gaps for monthly payers
    const divs = [
      { id: 1, ticker: 'TEST', ex_date: '2024-10-25', div_cash: 0.10, adj_amount: 0.10 },
      { id: 2, ticker: 'TEST', ex_date: '2024-11-22', div_cash: 0.10, adj_amount: 0.10 }, // 28 days
      { id: 3, ticker: 'TEST', ex_date: '2024-12-20', div_cash: 0.10, adj_amount: 0.10 }, // 28 days
      { id: 4, ticker: 'TEST', ex_date: '2025-01-27', div_cash: 0.10, adj_amount: 0.10 }, // 38 days (holiday drift!)
      { id: 5, ticker: 'TEST', ex_date: '2025-02-25', div_cash: 0.10, adj_amount: 0.10 }, // 29 days
    ];

    const res = calculateNormalizedDividends(divs);
    const byDate = new Map(res.map((r) => [divs.find((d) => d.id === r.id)!.ex_date, r]));

    // All should be Monthly (12) - the 38-day gap should NOT trigger a frequency change
    expect(byDate.get('2024-11-22')!.frequency_num).toBe(12);
    expect(byDate.get('2024-12-20')!.frequency_num).toBe(12);
    expect(byDate.get('2025-01-27')!.frequency_num).toBe(12); // 38-day gap should still be Monthly
    expect(byDate.get('2025-02-25')!.frequency_num).toBe(12);
  });
});

// ============================================================================
// NEW TESTS: Frequency detection helper functions
// ============================================================================

describe('getFrequencyFromDays (updated ranges)', () => {
  test('strict weekly range: 5-9 days', () => {
    expect(getFrequencyFromDays(5)).toBe(52);
    expect(getFrequencyFromDays(7)).toBe(52);
    expect(getFrequencyFromDays(9)).toBe(52);
  });

  test('weekly holiday drift: 10-13 days', () => {
    expect(getFrequencyFromDays(10)).toBe(52);
    expect(getFrequencyFromDays(11)).toBe(52);
    expect(getFrequencyFromDays(13)).toBe(52);
  });

  test('short-month monthly: 14-25 days (NOT weekly!)', () => {
    // This is the critical fix for CCD
    expect(getFrequencyFromDays(14)).toBe(12); // NOT 52!
    expect(getFrequencyFromDays(18)).toBe(12); // CCD case - NOT 52!
    expect(getFrequencyFromDays(20)).toBe(12);
    expect(getFrequencyFromDays(25)).toBe(12);
  });

  test('strict monthly range: 26-34 days', () => {
    expect(getFrequencyFromDays(26)).toBe(12);
    expect(getFrequencyFromDays(30)).toBe(12);
    expect(getFrequencyFromDays(34)).toBe(12);
  });

  test('monthly holiday drift: 35-59 days', () => {
    expect(getFrequencyFromDays(35)).toBe(12);
    expect(getFrequencyFromDays(40)).toBe(12);
    expect(getFrequencyFromDays(50)).toBe(12);
  });

  test('quarterly range: 60-100+ days', () => {
    expect(getFrequencyFromDays(80)).toBe(4);
    expect(getFrequencyFromDays(90)).toBe(4);
    expect(getFrequencyFromDays(100)).toBe(4);
  });
});

describe('getFrequencyFromDaysStrict', () => {
  test('returns null for ambiguous gaps', () => {
    expect(getFrequencyFromDaysStrict(11)).toBeNull(); // between weekly and drift
    expect(getFrequencyFromDaysStrict(18)).toBeNull(); // between drift and monthly
    expect(getFrequencyFromDaysStrict(38)).toBeNull(); // between monthly and drift
    expect(getFrequencyFromDaysStrict(50)).toBeNull(); // between monthly and quarterly
  });

  test('returns frequency for core ranges', () => {
    expect(getFrequencyFromDaysStrict(7)).toBe(52);
    expect(getFrequencyFromDaysStrict(30)).toBe(12);
    expect(getFrequencyFromDaysStrict(90)).toBe(4);
  });
});

describe('isHolidayDrift', () => {
  test('weekly drift: 10-13 days', () => {
    expect(isHolidayDrift(10, 52)).toBe(true);
    expect(isHolidayDrift(11, 52)).toBe(true);
    expect(isHolidayDrift(13, 52)).toBe(true);
    expect(isHolidayDrift(14, 52)).toBe(false);
  });

  test('monthly drift: 20-25 (short) or 35-40 (holiday)', () => {
    expect(isHolidayDrift(20, 12)).toBe(true);
    expect(isHolidayDrift(23, 12)).toBe(true);
    expect(isHolidayDrift(25, 12)).toBe(true);
    expect(isHolidayDrift(35, 12)).toBe(true);
    expect(isHolidayDrift(38, 12)).toBe(true);
    expect(isHolidayDrift(40, 12)).toBe(true);
    expect(isHolidayDrift(30, 12)).toBe(false); // this is core range, not drift
  });

  test('quarterly drift: 70-79 days', () => {
    expect(isHolidayDrift(70, 4)).toBe(true);
    expect(isHolidayDrift(75, 4)).toBe(true);
    expect(isHolidayDrift(79, 4)).toBe(true);
    expect(isHolidayDrift(80, 4)).toBe(false); // core range
  });
});

describe('getDominantFrequencyFromGaps', () => {
  test('returns null for insufficient data', () => {
    expect(getDominantFrequencyFromGaps([])).toBeNull();
    expect(getDominantFrequencyFromGaps([30])).toBeNull();
    expect(getDominantFrequencyFromGaps([30, 28])).toBeNull();
  });

  test('returns monthly for consistent monthly gaps', () => {
    expect(getDominantFrequencyFromGaps([30, 28, 31, 29])).toBe(12);
    expect(getDominantFrequencyFromGaps([28, 30, 27, 32])).toBe(12);
  });

  test('returns weekly for consistent weekly gaps', () => {
    expect(getDominantFrequencyFromGaps([7, 7, 7, 7])).toBe(52);
    expect(getDominantFrequencyFromGaps([7, 8, 7, 6])).toBe(52);
  });

  test('returns null for mixed pattern without clear majority', () => {
    // 2 weekly, 2 monthly - no clear majority
    expect(getDominantFrequencyFromGaps([7, 30, 7, 28])).toBeNull();
  });
});

describe('getFrequencyWithHistoryAware', () => {
  test('uses strict range when gap is in core range', () => {
    const result = getFrequencyWithHistoryAware(30, [30, 28, 31], 0.08, 0.08);
    expect(result).toBe(12);
  });

  test('uses holiday drift with unchanged amount', () => {
    // 18-day gap, but prior pattern is monthly and amount unchanged
    const priorGaps = [30, 28, 31, 29]; // clear monthly pattern
    const result = getFrequencyWithHistoryAware(18, priorGaps, 0.08, 0.08);
    expect(result).toBe(12); // should stay Monthly, not become Weekly
  });

  test('respects dominant pattern for ambiguous gaps', () => {
    // 15-day gap (ambiguous), but strong monthly history
    const priorGaps = [30, 28, 31, 29, 30]; // clear monthly pattern
    const result = getFrequencyWithHistoryAware(15, priorGaps, 0.08, 0.08);
    expect(result).toBe(12); // should stay Monthly
  });
});

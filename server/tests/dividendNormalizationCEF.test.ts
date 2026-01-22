import { describe, expect, test } from 'vitest';
import { calculateNormalizedDividendsForCEFs } from '../src/services/dividendNormalization.js';

describe('dividendNormalization (CEF) - NIE 12/29 special detection', () => {
  test('NIE 12/29 year-end special dividend with SAME amount should be Regular (per user requirement: BOTH off-cadence AND > 3× median required)', () => {
    // Simulate NIE's pattern: regular monthly payments, then a year-end payment on 12/29
    // Per user requirement: Special requires BOTH conditions:
    // 1. Off-cadence (outside 20-35 day range) ✓ (2 days < 20)
    // 2. Amount > 3× median ✗ ($0.15 is same as median, NOT > 3× = $0.45)
    // Since condition 2 is not met, this should be REGULAR
    const divs = [
      { id: 1, ticker: 'NIE', ex_date: '2024-10-28', div_cash: 0.15, adj_amount: 0.15 },
      { id: 2, ticker: 'NIE', ex_date: '2024-11-27', div_cash: 0.15, adj_amount: 0.15 },
      { id: 3, ticker: 'NIE', ex_date: '2024-12-27', div_cash: 0.15, adj_amount: 0.15 }, // regular monthly
      { id: 4, ticker: 'NIE', ex_date: '2024-12-29', div_cash: 0.15, adj_amount: 0.15 }, // 2 days later, same amount - Regular per new rule
      { id: 5, ticker: 'NIE', ex_date: '2025-01-28', div_cash: 0.15, adj_amount: 0.15 },
    ];

    const res = calculateNormalizedDividendsForCEFs(divs);
    const byDate = new Map(res.map((r) => [divs.find((d) => d.id === r.id)!.ex_date, r]));

    const dec29 = byDate.get('2024-12-29');
    expect(dec29).toBeDefined();

    // Per user requirement: BOTH conditions must be met for Special
    // $0.15 is NOT > 3× median ($0.15 × 3 = $0.45), so this should be REGULAR
    expect(dec29!.pmt_type).toBe('Regular');
    expect(dec29!.days_since_prev).toBe(2);

    // The 12/27 dividend should remain Regular
    const dec27 = byDate.get('2024-12-27');
    expect(dec27!.pmt_type).toBe('Regular');
  });

  test('NIE 12/29 year-end special dividend with HIGH amount should be Special (off-cadence + > 3× median)', () => {
    // Simulate NIE's pattern with a year-end SPECIAL distribution > 3× regular
    // Per user requirement: Special requires BOTH conditions:
    // 1. Off-cadence (outside 20-35 day range) ✓ (2 days < 20)
    // 2. Amount > 3× median ✓ ($0.60 > 3 × $0.15 = $0.45)
    const divs = [
      { id: 1, ticker: 'NIE', ex_date: '2024-10-28', div_cash: 0.15, adj_amount: 0.15 },
      { id: 2, ticker: 'NIE', ex_date: '2024-11-27', div_cash: 0.15, adj_amount: 0.15 },
      { id: 3, ticker: 'NIE', ex_date: '2024-12-27', div_cash: 0.15, adj_amount: 0.15 }, // regular monthly
      { id: 4, ticker: 'NIE', ex_date: '2024-12-29', div_cash: 0.60, adj_amount: 0.60 }, // 2 days later, > 3× median - Special
      { id: 5, ticker: 'NIE', ex_date: '2025-01-28', div_cash: 0.15, adj_amount: 0.15 },
    ];

    const res = calculateNormalizedDividendsForCEFs(divs);
    const byDate = new Map(res.map((r) => [divs.find((d) => d.id === r.id)!.ex_date, r]));

    const dec29 = byDate.get('2024-12-29');
    expect(dec29).toBeDefined();

    // Both conditions met: off-cadence (2 days) AND > 3× median ($0.60 > $0.45)
    expect(dec29!.pmt_type).toBe('Special');
    expect(dec29!.days_since_prev).toBe(2);

    // The 12/27 dividend should remain Regular
    const dec27 = byDate.get('2024-12-27');
    expect(dec27!.pmt_type).toBe('Regular');
  });
});

describe('dividendNormalization (CEF) - BUI/BST special dividend detection', () => {
  test('BUI: Off-cadence dividend > 3× median should be marked SPECIAL', () => {
    // BUI pattern: regular monthly payments around $0.1063, then an off-cadence special
    // Special requirements: off-cadence (not within 20-35 days) AND > 3× median of last 12
    const divs = [
      { id: 1, ticker: 'BUI', ex_date: '2024-01-18', div_cash: 0.1063, adj_amount: 0.1063 },
      { id: 2, ticker: 'BUI', ex_date: '2024-02-15', div_cash: 0.1063, adj_amount: 0.1063 },
      { id: 3, ticker: 'BUI', ex_date: '2024-03-14', div_cash: 0.1063, adj_amount: 0.1063 },
      { id: 4, ticker: 'BUI', ex_date: '2024-04-18', div_cash: 0.1063, adj_amount: 0.1063 },
      { id: 5, ticker: 'BUI', ex_date: '2024-05-16', div_cash: 0.1063, adj_amount: 0.1063 },
      { id: 6, ticker: 'BUI', ex_date: '2024-06-13', div_cash: 0.1063, adj_amount: 0.1063 },
      { id: 7, ticker: 'BUI', ex_date: '2024-07-18', div_cash: 0.1063, adj_amount: 0.1063 },
      { id: 8, ticker: 'BUI', ex_date: '2024-08-15', div_cash: 0.1063, adj_amount: 0.1063 },
      { id: 9, ticker: 'BUI', ex_date: '2024-09-12', div_cash: 0.1063, adj_amount: 0.1063 },
      { id: 10, ticker: 'BUI', ex_date: '2024-10-17', div_cash: 0.1063, adj_amount: 0.1063 },
      { id: 11, ticker: 'BUI', ex_date: '2024-11-14', div_cash: 0.1063, adj_amount: 0.1063 },
      { id: 12, ticker: 'BUI', ex_date: '2024-12-12', div_cash: 0.1063, adj_amount: 0.1063 }, // Regular monthly
      // Off-cadence (5 days later, gap < 20) AND > 3× median ($0.40 > 3 × $0.1063 = $0.3189)
      { id: 13, ticker: 'BUI', ex_date: '2024-12-17', div_cash: 0.40, adj_amount: 0.40 }, // SPECIAL: off-cadence + > 3× median
      { id: 14, ticker: 'BUI', ex_date: '2025-01-16', div_cash: 0.1063, adj_amount: 0.1063 },
    ];

    const res = calculateNormalizedDividendsForCEFs(divs);
    const byDate = new Map(res.map((r) => [divs.find((d) => d.id === r.id)!.ex_date, r]));

    const dec17 = byDate.get('2024-12-17');
    expect(dec17).toBeDefined();
    expect(dec17!.pmt_type).toBe('Special');
    expect(dec17!.days_since_prev).toBe(5); // off-cadence (< 20 days)

    // Regular payment should remain Regular
    const dec12 = byDate.get('2024-12-12');
    expect(dec12!.pmt_type).toBe('Regular');
  });

  test('BST: Off-cadence dividend > 3× median should be marked SPECIAL', () => {
    // BST pattern: regular monthly payments, then an off-cadence special distribution
    const divs = [
      { id: 1, ticker: 'BST', ex_date: '2024-01-18', div_cash: 0.20, adj_amount: 0.20 },
      { id: 2, ticker: 'BST', ex_date: '2024-02-15', div_cash: 0.20, adj_amount: 0.20 },
      { id: 3, ticker: 'BST', ex_date: '2024-03-14', div_cash: 0.20, adj_amount: 0.20 },
      { id: 4, ticker: 'BST', ex_date: '2024-04-18', div_cash: 0.20, adj_amount: 0.20 },
      { id: 5, ticker: 'BST', ex_date: '2024-05-16', div_cash: 0.20, adj_amount: 0.20 },
      { id: 6, ticker: 'BST', ex_date: '2024-06-13', div_cash: 0.20, adj_amount: 0.20 },
      { id: 7, ticker: 'BST', ex_date: '2024-07-18', div_cash: 0.20, adj_amount: 0.20 },
      { id: 8, ticker: 'BST', ex_date: '2024-08-15', div_cash: 0.20, adj_amount: 0.20 },
      { id: 9, ticker: 'BST', ex_date: '2024-09-12', div_cash: 0.20, adj_amount: 0.20 },
      { id: 10, ticker: 'BST', ex_date: '2024-10-17', div_cash: 0.20, adj_amount: 0.20 },
      { id: 11, ticker: 'BST', ex_date: '2024-11-14', div_cash: 0.20, adj_amount: 0.20 },
      { id: 12, ticker: 'BST', ex_date: '2024-12-12', div_cash: 0.20, adj_amount: 0.20 }, // Regular monthly
      // Off-cadence (5 days later) AND > 3× median ($0.75 > 3 × $0.20 = $0.60)
      { id: 13, ticker: 'BST', ex_date: '2024-12-17', div_cash: 0.75, adj_amount: 0.75 }, // SPECIAL
      { id: 14, ticker: 'BST', ex_date: '2025-01-16', div_cash: 0.20, adj_amount: 0.20 },
    ];

    const res = calculateNormalizedDividendsForCEFs(divs);
    const byDate = new Map(res.map((r) => [divs.find((d) => d.id === r.id)!.ex_date, r]));

    const dec17 = byDate.get('2024-12-17');
    expect(dec17).toBeDefined();
    expect(dec17!.pmt_type).toBe('Special');
    expect(dec17!.days_since_prev).toBe(5); // off-cadence (< 20 days)
  });

  test('On-cadence dividend > 3× median should remain REGULAR', () => {
    // User requirement: BOTH conditions must be true
    // If on-cadence, even > 3× median should be Regular
    const divs = [
      { id: 1, ticker: 'TEST', ex_date: '2024-01-15', div_cash: 0.10, adj_amount: 0.10 },
      { id: 2, ticker: 'TEST', ex_date: '2024-02-14', div_cash: 0.10, adj_amount: 0.10 },
      { id: 3, ticker: 'TEST', ex_date: '2024-03-14', div_cash: 0.10, adj_amount: 0.10 },
      { id: 4, ticker: 'TEST', ex_date: '2024-04-15', div_cash: 0.10, adj_amount: 0.10 },
      { id: 5, ticker: 'TEST', ex_date: '2024-05-14', div_cash: 0.10, adj_amount: 0.10 },
      { id: 6, ticker: 'TEST', ex_date: '2024-06-13', div_cash: 0.10, adj_amount: 0.10 },
      { id: 7, ticker: 'TEST', ex_date: '2024-07-15', div_cash: 0.10, adj_amount: 0.10 },
      { id: 8, ticker: 'TEST', ex_date: '2024-08-14', div_cash: 0.10, adj_amount: 0.10 },
      { id: 9, ticker: 'TEST', ex_date: '2024-09-12', div_cash: 0.10, adj_amount: 0.10 },
      { id: 10, ticker: 'TEST', ex_date: '2024-10-14', div_cash: 0.10, adj_amount: 0.10 },
      { id: 11, ticker: 'TEST', ex_date: '2024-11-14', div_cash: 0.10, adj_amount: 0.10 },
      // On-cadence (28 days = within 20-35) but > 3× median ($0.50 > 3 × $0.10 = $0.30)
      // Should be REGULAR because on-cadence (even though amount is high)
      { id: 12, ticker: 'TEST', ex_date: '2024-12-12', div_cash: 0.50, adj_amount: 0.50 },
      { id: 13, ticker: 'TEST', ex_date: '2025-01-13', div_cash: 0.10, adj_amount: 0.10 },
    ];

    const res = calculateNormalizedDividendsForCEFs(divs);
    const byDate = new Map(res.map((r) => [divs.find((d) => d.id === r.id)!.ex_date, r]));

    const dec12 = byDate.get('2024-12-12');
    expect(dec12).toBeDefined();
    // On-cadence (28 days is within 20-35), so even though amount is > 3× median, it should be Regular
    expect(dec12!.pmt_type).toBe('Regular');
    expect(dec12!.days_since_prev).toBe(28); // on-cadence (within 20-35 days)
  });

  test('Off-cadence dividend NOT > 3× median should remain REGULAR (non-December)', () => {
    // User requirement: BOTH conditions must be true
    // If amount is not > 3× median, even off-cadence should be Regular
    // NOTE: This test uses a non-December off-cadence scenario because
    // second December dividends have a separate rule that marks them as Special
    // when amount differs from regular pattern (see NIE 12/29 special detection)
    const divs = [
      { id: 1, ticker: 'TEST', ex_date: '2024-01-15', div_cash: 0.10, adj_amount: 0.10 },
      { id: 2, ticker: 'TEST', ex_date: '2024-02-14', div_cash: 0.10, adj_amount: 0.10 },
      { id: 3, ticker: 'TEST', ex_date: '2024-03-14', div_cash: 0.10, adj_amount: 0.10 },
      { id: 4, ticker: 'TEST', ex_date: '2024-04-15', div_cash: 0.10, adj_amount: 0.10 },
      { id: 5, ticker: 'TEST', ex_date: '2024-05-14', div_cash: 0.10, adj_amount: 0.10 },
      { id: 6, ticker: 'TEST', ex_date: '2024-06-13', div_cash: 0.10, adj_amount: 0.10 },
      { id: 7, ticker: 'TEST', ex_date: '2024-07-15', div_cash: 0.10, adj_amount: 0.10 },
      { id: 8, ticker: 'TEST', ex_date: '2024-08-14', div_cash: 0.10, adj_amount: 0.10 },
      { id: 9, ticker: 'TEST', ex_date: '2024-09-12', div_cash: 0.10, adj_amount: 0.10 },
      { id: 10, ticker: 'TEST', ex_date: '2024-10-14', div_cash: 0.10, adj_amount: 0.10 },
      { id: 11, ticker: 'TEST', ex_date: '2024-11-14', div_cash: 0.10, adj_amount: 0.10 },
      { id: 12, ticker: 'TEST', ex_date: '2024-12-12', div_cash: 0.10, adj_amount: 0.10 },
      { id: 13, ticker: 'TEST', ex_date: '2025-01-14', div_cash: 0.10, adj_amount: 0.10 },
      // Off-cadence (5 days, in February) but NOT > 3× median ($0.20 < 3 × $0.10 = $0.30)
      // Should be REGULAR because amount is not > 3× median
      { id: 14, ticker: 'TEST', ex_date: '2025-02-19', div_cash: 0.20, adj_amount: 0.20 },
      { id: 15, ticker: 'TEST', ex_date: '2025-03-14', div_cash: 0.10, adj_amount: 0.10 },
    ];

    const res = calculateNormalizedDividendsForCEFs(divs);
    const byDate = new Map(res.map((r) => [divs.find((d) => d.id === r.id)!.ex_date, r]));

    const feb19 = byDate.get('2025-02-19');
    expect(feb19).toBeDefined();
    // Off-cadence (5 days from Jan 14) but amount ($0.20) is only 2× median ($0.10), not > 3×
    // Should be Regular because both conditions are NOT met
    expect(feb19!.pmt_type).toBe('Regular');
  });

  test('Second December dividend with different amount should be SPECIAL (NIE-style)', () => {
    // Second December dividend rule: Even if amount is NOT > 3× median,
    // having two dividends in December is inherently unusual and indicates a special distribution.
    // Real-world example: NIE 2025-12-29 ($0.526) is officially a "special year-end distribution"
    // even though it's only 5.2% more than the regular $0.50 quarterly amount.
    const divs = [
      { id: 1, ticker: 'TEST', ex_date: '2024-01-15', div_cash: 0.10, adj_amount: 0.10 },
      { id: 2, ticker: 'TEST', ex_date: '2024-02-14', div_cash: 0.10, adj_amount: 0.10 },
      { id: 3, ticker: 'TEST', ex_date: '2024-03-14', div_cash: 0.10, adj_amount: 0.10 },
      { id: 4, ticker: 'TEST', ex_date: '2024-04-15', div_cash: 0.10, adj_amount: 0.10 },
      { id: 5, ticker: 'TEST', ex_date: '2024-05-14', div_cash: 0.10, adj_amount: 0.10 },
      { id: 6, ticker: 'TEST', ex_date: '2024-06-13', div_cash: 0.10, adj_amount: 0.10 },
      { id: 7, ticker: 'TEST', ex_date: '2024-07-15', div_cash: 0.10, adj_amount: 0.10 },
      { id: 8, ticker: 'TEST', ex_date: '2024-08-14', div_cash: 0.10, adj_amount: 0.10 },
      { id: 9, ticker: 'TEST', ex_date: '2024-09-12', div_cash: 0.10, adj_amount: 0.10 },
      { id: 10, ticker: 'TEST', ex_date: '2024-10-14', div_cash: 0.10, adj_amount: 0.10 },
      { id: 11, ticker: 'TEST', ex_date: '2024-11-14', div_cash: 0.10, adj_amount: 0.10 },
      { id: 12, ticker: 'TEST', ex_date: '2024-12-12', div_cash: 0.10, adj_amount: 0.10 }, // First December
      // Second December dividend, 5 days later, with different amount (2× median)
      // Should be SPECIAL because it's a second December dividend with different amount
      { id: 13, ticker: 'TEST', ex_date: '2024-12-17', div_cash: 0.20, adj_amount: 0.20 },
      { id: 14, ticker: 'TEST', ex_date: '2025-01-16', div_cash: 0.10, adj_amount: 0.10 },
    ];

    const res = calculateNormalizedDividendsForCEFs(divs);
    const byDate = new Map(res.map((r) => [divs.find((d) => d.id === r.id)!.ex_date, r]));

    const dec17 = byDate.get('2024-12-17');
    expect(dec17).toBeDefined();
    // Second December dividend with different amount = Special
    expect(dec17!.pmt_type).toBe('Special');

    // First December should remain Regular
    const dec12 = byDate.get('2024-12-12');
    expect(dec12!.pmt_type).toBe('Regular');
  });

  test('Median should use last 12 dividends, not last 6', () => {
    // Test that median calculation uses last 12 dividends
    // Create a scenario where last 6 and last 12 would give different medians
    const divs = [
      // First 6 dividends at $0.10
      { id: 1, ticker: 'TEST', ex_date: '2023-07-15', div_cash: 0.10, adj_amount: 0.10 },
      { id: 2, ticker: 'TEST', ex_date: '2023-08-15', div_cash: 0.10, adj_amount: 0.10 },
      { id: 3, ticker: 'TEST', ex_date: '2023-09-15', div_cash: 0.10, adj_amount: 0.10 },
      { id: 4, ticker: 'TEST', ex_date: '2023-10-15', div_cash: 0.10, adj_amount: 0.10 },
      { id: 5, ticker: 'TEST', ex_date: '2023-11-15', div_cash: 0.10, adj_amount: 0.10 },
      { id: 6, ticker: 'TEST', ex_date: '2023-12-15', div_cash: 0.10, adj_amount: 0.10 },
      // Last 6 dividends at $0.20
      { id: 7, ticker: 'TEST', ex_date: '2024-01-15', div_cash: 0.20, adj_amount: 0.20 },
      { id: 8, ticker: 'TEST', ex_date: '2024-02-15', div_cash: 0.20, adj_amount: 0.20 },
      { id: 9, ticker: 'TEST', ex_date: '2024-03-15', div_cash: 0.20, adj_amount: 0.20 },
      { id: 10, ticker: 'TEST', ex_date: '2024-04-15', div_cash: 0.20, adj_amount: 0.20 },
      { id: 11, ticker: 'TEST', ex_date: '2024-05-15', div_cash: 0.20, adj_amount: 0.20 },
      { id: 12, ticker: 'TEST', ex_date: '2024-06-15', div_cash: 0.20, adj_amount: 0.20 },
      // Median of last 6: $0.20
      // Median of last 12: $0.15 (sorted: 0.10×6, 0.20×6 → median between index 5 and 6)
      // Test dividend: $0.50
      // If using last 6: 3 × $0.20 = $0.60 → $0.50 < $0.60 → Regular
      // If using last 12: 3 × $0.15 = $0.45 → $0.50 > $0.45 → Special (if also off-cadence)
      { id: 13, ticker: 'TEST', ex_date: '2024-06-20', div_cash: 0.50, adj_amount: 0.50 }, // off-cadence (5 days)
      { id: 14, ticker: 'TEST', ex_date: '2024-07-15', div_cash: 0.20, adj_amount: 0.20 },
    ];

    const res = calculateNormalizedDividendsForCEFs(divs);
    const byDate = new Map(res.map((r) => [divs.find((d) => d.id === r.id)!.ex_date, r]));

    const jun20 = byDate.get('2024-06-20');
    expect(jun20).toBeDefined();
    // If using last 12 (median $0.15), $0.50 > 3 × $0.15 = $0.45 → Special
    // If using last 6 (median $0.20), $0.50 < 3 × $0.20 = $0.60 → Regular
    // With the fix (using last 12), this should be Special
    expect(jun20!.pmt_type).toBe('Special');
    expect(jun20!.days_since_prev).toBe(5); // off-cadence
  });
});


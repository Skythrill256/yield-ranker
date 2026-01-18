/**
 * Test script for BUI/BST Special Dividend Detection
 * 
 * This script validates that the day-of-month based off-cadence detection
 * correctly classifies December 2025 special dividends for BUI and BST.
 * 
 * Run with: npx tsx scripts/test_bui_bst_special.ts
 */

import { calculateNormalizedDividendsForCEFs, type DividendInput, type NormalizedDividendCEF } from '../src/services/dividendNormalization.js';

// Enable debug logging
process.env.DEBUG_DIVIDEND_NORMALIZATION = 'true';

/**
 * Generate simulated BUI dividend history based on web-verified data
 * Pattern: Monthly payments on 14th-16th, regular amount $0.136
 * December 2025 special: Dec 22nd, $1.1743 (includes $1.0383 special)
 */
function generateBUIHistory(): DividendInput[] {
    const dividends: DividendInput[] = [];
    let id = 1;

    // Generate 12 months of regular dividends (Dec 2024 - Nov 2025)
    const regularDates = [
        '2024-12-16', // Dec 2024
        '2025-01-15', // Jan 2025
        '2025-02-14', // Feb 2025
        '2025-03-14', // Mar 2025
        '2025-04-15', // Apr 2025
        '2025-05-15', // May 2025
        '2025-06-13', // Jun 2025
        '2025-07-15', // Jul 2025
        '2025-08-15', // Aug 2025
        '2025-09-12', // Sep 2025
        '2025-10-15', // Oct 2025
        '2025-11-14', // Nov 2025
    ];

    for (const date of regularDates) {
        dividends.push({
            id: id++,
            ticker: 'BUI',
            ex_date: date,
            div_cash: 0.136,
            adj_amount: 0.136,
        });
    }

    // Add December 2025 special dividend (ex-date 22nd, total $1.1743)
    dividends.push({
        id: id++,
        ticker: 'BUI',
        ex_date: '2025-12-22',
        div_cash: 1.1743,
        adj_amount: 1.1743,
    });

    return dividends;
}

/**
 * Generate simulated BST dividend history based on web-verified data
 * Pattern: Monthly payments on 13th-15th, regular amount $0.25
 * December 2025 special: Dec 22nd, $1.4515 (includes $1.2015 special)
 */
function generateBSTHistory(): DividendInput[] {
    const dividends: DividendInput[] = [];
    let id = 100;

    // Generate 12 months of regular dividends (Dec 2024 - Nov 2025)
    const regularDates = [
        '2024-12-13', // Dec 2024
        '2025-01-15', // Jan 2025
        '2025-02-14', // Feb 2025
        '2025-03-14', // Mar 2025
        '2025-04-15', // Apr 2025
        '2025-05-15', // May 2025
        '2025-06-13', // Jun 2025
        '2025-07-15', // Jul 2025
        '2025-08-15', // Aug 2025
        '2025-09-15', // Sep 2025
        '2025-10-15', // Oct 2025
        '2025-11-14', // Nov 2025
    ];

    for (const date of regularDates) {
        dividends.push({
            id: id++,
            ticker: 'BST',
            ex_date: date,
            div_cash: 0.25,
            adj_amount: 0.25,
        });
    }

    // Add December 2025 special dividend (ex-date 22nd, total $1.4515)
    dividends.push({
        id: id++,
        ticker: 'BST',
        ex_date: '2025-12-22',
        div_cash: 1.4515,
        adj_amount: 1.4515,
    });

    return dividends;
}

function runTest(ticker: string, dividends: DividendInput[], expectedSpecialDate: string): boolean {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing ${ticker} Special Dividend Detection`);
    console.log(`${'='.repeat(60)}`);

    // Run the normalization function
    const results = calculateNormalizedDividendsForCEFs(dividends);

    // Display results
    console.log(`\nDividend History (${results.length} payments):`);
    for (const result of results) {
        const div = dividends.find(d => d.id === result.id);
        if (!div) continue;

        const marker = result.pmt_type === 'Special' ? ' ✓ SPECIAL' : '';
        console.log(`  ${div.ex_date}: $${div.adj_amount?.toFixed(4)} → ${result.pmt_type}${marker}`);
    }

    // Find the December 2025 dividend and check classification
    const dec2025Div = dividends.find(d => d.ex_date === expectedSpecialDate);
    const dec2025Result = results.find(r => r.id === dec2025Div?.id);

    if (!dec2025Result) {
        console.error(`\n❌ ERROR: Could not find December 2025 result for ${ticker}`);
        return false;
    }

    if (dec2025Result.pmt_type === 'Special') {
        console.log(`\n✓ ${ticker} December 2025 correctly classified as SPECIAL`);
        return true;
    } else {
        console.error(`\n❌ FAILED: ${ticker} December 2025 classified as ${dec2025Result.pmt_type} instead of Special`);
        return false;
    }
}

// Run tests
async function main() {
    console.log('BUI/BST Special Dividend Detection Test');
    console.log('Based on web-verified dividend data from dividend.com, dividendinvestor.com');

    const buiDividends = generateBUIHistory();
    const bstDividends = generateBSTHistory();

    const buiPassed = runTest('BUI', buiDividends, '2025-12-22');
    const bstPassed = runTest('BST', bstDividends, '2025-12-22');

    console.log(`\n${'='.repeat(60)}`);
    console.log('Test Summary');
    console.log(`${'='.repeat(60)}`);
    console.log(`BUI: ${buiPassed ? '✓ PASSED' : '❌ FAILED'}`);
    console.log(`BST: ${bstPassed ? '✓ PASSED' : '❌ FAILED'}`);

    if (buiPassed && bstPassed) {
        console.log('\n✓ All tests passed!');
        process.exit(0);
    } else {
        console.log('\n❌ Some tests failed!');
        process.exit(1);
    }
}

main().catch(console.error);

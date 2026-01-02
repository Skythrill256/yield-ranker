/**
 * Dividend Normalization Service
 * 
 * Calculates normalized dividend values to handle ETF payment frequency changes.
 * This service can be used during EOD ingestion or on-demand when fetching dividends.
 * 
 * Logic Rules (from requirements):
 * 1. DAYS: days_since_prev = current_ex_date - previous_ex_date
 * 2. TYPE (pmt_type):
 *    - null days → "Initial" (first dividend for ticker)
 *    - 1-4 days → "Special" (paid 1-4 days after last dividend, likely special dividend)
 *    - >4 days → "Regular"
 * 3. FREQUENCY (frequency_num): Backward confirmation rule
 *    IMPORTANT: Since we're dealing with end-of-day data, we cannot know the frequency
 *    of a payment until we see when the next one arrives. By looking at the gap between
 *    the newest payment and the one immediately before it, we "confirm" the frequency
 *    for that period.
 *    
 *    - For each dividend (except the last): Look AHEAD to next dividend to determine frequency
 *    - For the last dividend: Use gap from previous dividend (since no next dividend yet)
 *    
 *    Frequency mapping:
 *    - 7-10 days → 52 (Weekly)
 *    - 25-35 days → 12 (Monthly)
 *    - 80-100 days → 4 (Quarterly)
 *    - else → 1 (Annual/Irregular)
 * 4. ANNUALIZED: adj_amount × frequency_num (only for Regular dividends)
 * 5. NORMALIZED: annualized / 52 = (adj_amount × frequency_num) / 52 (weekly equivalent rate)
 *    Only for Regular dividends. This normalizes all payments to weekly equivalent for line chart comparison.
 */

export interface DividendInput {
    id: number;
    ticker: string;
    ex_date: string;
    div_cash: number;
    adj_amount: number | null;
}

export interface NormalizedDividend {
    id: number;
    days_since_prev: number | null;
    pmt_type: 'Regular' | 'Special' | 'Initial';
    frequency_num: number;
    annualized: number | null;
    normalized_div: number | null;
}

/**
 * Determine frequency based on days between payments
 * Using ranges to account for weekends/holidays
 * Based on CEO specification: 7-10 days = weekly (52), 25-35 days = monthly (12)
 */
export function getFrequencyFromDays(days: number): number {
    // Clear weekly pattern: 5-10 days (standard weekly pattern)
    if (days >= 5 && days <= 10) return 52;    // Weekly
    
    // Clear monthly pattern: 25-35 days
    if (days >= 25 && days <= 35) return 12;   // Monthly  
    
    // Clear quarterly pattern: 80-100 days
    if (days >= 80 && days <= 100) return 4;   // Quarterly
    
    // Clear semi-annual pattern: 170-200 days
    if (days >= 170 && days <= 200) return 2;  // Semi-annual
    
    // Clear annual pattern: > 200 days
    if (days > 200) return 1;                   // Annual or irregular

    // Edge cases for irregular gaps
    // 11-14 days: can occur during frequency transitions (monthly to weekly)
    // Treat as weekly when it's part of a weekly sequence, but this needs context
    if (days >= 11 && days <= 14) return 52;   // Transition periods (monthly to weekly)
    
    // 15-24 days: bi-weekly/irregular, treat as monthly (between weekly and monthly)
    if (days >= 15 && days < 25) return 12;     // Bi-weekly/irregular, treat as monthly
    
    // 36-79 days: closer to monthly than quarterly, default to monthly
    if (days > 35 && days < 80) return 12;     // Irregular monthly pattern
    
    // 101-169 days: closer to quarterly than semi-annual
    if (days > 100 && days < 170) return 4;    // Irregular quarterly pattern

    // Default to monthly for any other case
    return 12;
}

/**
 * Determine payment type based on days gap from last REGULAR dividend
 * Special dividend: paid 1-4 days after last regular dividend
 * OR: tiny amount (< 1% of next dividend) that comes 1-4 days before next dividend
 * This catches cases like ULTY where a tiny special div ($0.0003) comes right before
 * the regular monthly payment ($0.4866)
 */
export function getPaymentType(
    daysSincePrev: number | null,
    daysSinceLastRegular: number | null = null,
    currentAmount: number | null = null,
    nextAmount: number | null = null,
    daysToNext: number | null = null
): 'Regular' | 'Special' | 'Initial' {
    if (daysSincePrev === null) return 'Initial';
    
    // Special case: If current dividend is tiny (< 1% of next) and comes 1-4 days before next,
    // it's likely a special dividend (e.g., $0.0003 before $0.4866)
    if (currentAmount !== null && currentAmount > 0 && 
        nextAmount !== null && nextAmount > 0 && 
        daysToNext !== null && daysToNext >= 1 && daysToNext <= 4) {
        const ratio = currentAmount / nextAmount;
        if (ratio < 0.01) { // Current is less than 1% of next
            return 'Special';
        }
    }
    
    // If we have days since last regular, use that (more accurate)
    if (daysSinceLastRegular !== null) {
        if (daysSinceLastRegular >= 1 && daysSinceLastRegular <= 4) return 'Special';
        return 'Regular';
    }
    
    // Fallback: use days since previous (less accurate but works for first pass)
    if (daysSincePrev >= 1 && daysSincePrev <= 4) return 'Special';
    return 'Regular';
}

/**
 * Find the last Regular dividend before the given index
 * Used when we need to look back past Special dividends for frequency calculation
 */
function findLastRegularDividend(
    dividends: DividendInput[],
    currentIndex: number,
    calculatedTypes: ('Regular' | 'Special' | 'Initial')[]
): { dividend: DividendInput; index: number } | null {
    for (let i = currentIndex - 1; i >= 0; i--) {
        if (calculatedTypes[i] === 'Regular') {
            return { dividend: dividends[i], index: i };
        }
    }
    return null;
}

/**
 * Calculate normalized dividend values for a list of dividends
 * Input dividends should be sorted by date ASCENDING (oldest first)
 */
export function calculateNormalizedDividends(dividends: DividendInput[]): NormalizedDividend[] {
    if (!dividends || dividends.length === 0) {
        return [];
    }

    // Ensure sorted by date ascending
    const sortedDividends = [...dividends].sort(
        (a, b) => new Date(a.ex_date).getTime() - new Date(b.ex_date).getTime()
    );

    const results: NormalizedDividend[] = [];
    const calculatedTypes: ('Regular' | 'Special' | 'Initial')[] = [];

    for (let i = 0; i < sortedDividends.length; i++) {
        const current = sortedDividends[i];
        const previous = i > 0 ? sortedDividends[i - 1] : null;

        // Calculate days since previous dividend
        let daysSincePrev: number | null = null;
        if (previous) {
            const currentDate = new Date(current.ex_date);
            const prevDate = new Date(previous.ex_date);
            daysSincePrev = Math.round((currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
        }

        // Find last Regular dividend to calculate days since last regular
        // Special dividend rule: paid 1-4 days after LAST REGULAR dividend (not just previous)
        let daysSinceLastRegular: number | null = null;
        const lastRegular = findLastRegularDividend(sortedDividends, i, calculatedTypes);
        if (lastRegular) {
            const currentDate = new Date(current.ex_date);
            const lastRegularDate = new Date(lastRegular.dividend.ex_date);
            daysSinceLastRegular = Math.round((currentDate.getTime() - lastRegularDate.getTime()) / (1000 * 60 * 60 * 24));
        } else if (daysSincePrev !== null) {
            // No regular dividend found yet, use days since previous as fallback
            daysSinceLastRegular = daysSincePrev;
        }

        // Get next dividend info for amount-based special detection
        const next = i < sortedDividends.length - 1 ? sortedDividends[i + 1] : null;
        let daysToNext: number | null = null;
        if (next) {
            const currentDate = new Date(current.ex_date);
            const nextDate = new Date(next.ex_date);
            daysToNext = Math.round((nextDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
        }
        const currentAmount = current.adj_amount ?? current.div_cash;
        const nextAmount = next ? (next.adj_amount ?? next.div_cash) : null;

        // Determine payment type: Special if 1-4 days after last Regular dividend
        // OR if tiny amount (< 1% of next) that comes 1-4 days before next
        const pmtType = getPaymentType(daysSincePrev, daysSinceLastRegular, currentAmount, nextAmount, daysToNext);
        calculatedTypes.push(pmtType);

        // Determine frequency using backward confirmation rule:
        // IMPORTANT: Frequency is determined by looking AHEAD to the NEXT dividend.
        // The gap from current to next determines the current dividend's frequency.
        // This is the "backward confirmation" rule: we confirm a dividend's frequency
        // by seeing when the next one arrives.
        // EXCEPTION: At frequency transition points, use the frequency from the PREVIOUS gap
        // (the gap that brought us here), not the gap to next.
        let frequencyNum = 12; // Default to monthly

        if (i < sortedDividends.length - 1) {
            // Not the last dividend: use gap to next (backward confirmation rule)
            const nextDiv = sortedDividends[i + 1];
            const nextDate = new Date(nextDiv.ex_date);
            const currentDate = new Date(current.ex_date);
            const daysToNext = Math.round(
                (nextDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24)
            );
            
            // Try to find the next Regular dividend (skip Special dividends)
            let nextRegularDiv: DividendInput | null = null;
            let daysToNextRegular: number | null = null;
            for (let j = i + 1; j < sortedDividends.length; j++) {
                const testDiv = sortedDividends[j];
                const testPrev = j > 0 ? sortedDividends[j - 1] : null;
                let testDaysSincePrev: number | null = null;
                if (testPrev) {
                    const testDate = new Date(testDiv.ex_date);
                    const testPrevDate = new Date(testPrev.ex_date);
                    testDaysSincePrev = Math.round((testDate.getTime() - testPrevDate.getTime()) / (1000 * 60 * 60 * 24));
                }
                const testPmtType = getPaymentType(testDaysSincePrev);
                if (testPmtType === 'Regular') {
                    nextRegularDiv = testDiv;
                    const testDate = new Date(testDiv.ex_date);
                    daysToNextRegular = Math.round((testDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
                    break;
                }
            }
            
            // Check for frequency transition: if previous gap indicates one frequency
            // and next gap indicates a different frequency, we're at a transition point
            // At transitions, use the frequency from the PREVIOUS gap (the one that brought us here)
            // This is CRITICAL: The last payment of the old frequency should keep the old frequency
            if (daysSincePrev !== null && daysSincePrev > 4) {
                const freqFromPrev = getFrequencyFromDays(daysSincePrev);
                
                // Determine frequency from next gap (prefer Regular dividend if found)
                let freqFromNext: number | null = null;
                if (daysToNext > 4) {
                    freqFromNext = daysToNextRegular !== null && daysToNextRegular > 4
                        ? getFrequencyFromDays(daysToNextRegular)
                        : getFrequencyFromDays(daysToNext);
                }
                
                // If we have both previous and next gaps, check for transition
                if (freqFromNext !== null && freqFromPrev !== freqFromNext) {
                    // TRANSITION DETECTED: Use frequency from PREVIOUS gap (the pattern that brought us here)
                    // This ensures the last payment of the old frequency keeps the old frequency
                    frequencyNum = freqFromPrev;
                } else if (freqFromNext !== null) {
                    // No transition: use gap to next (backward confirmation rule)
                    frequencyNum = freqFromNext;
                } else {
                    // No valid next gap: use previous gap
                    frequencyNum = freqFromPrev;
                }
            } else if (nextRegularDiv && daysToNextRegular !== null && daysToNextRegular > 4) {
                // Use gap to next Regular to determine frequency (backward confirmation rule)
                frequencyNum = getFrequencyFromDays(daysToNextRegular);
            } else if (daysToNext > 5) {
                // Use gap to immediate next dividend (backward confirmation rule)
                frequencyNum = getFrequencyFromDays(daysToNext);
            }
        } else if (i > 0 && daysSincePrev !== null && daysSincePrev > 4) {
            // Last dividend: use gap from previous (no next dividend available)
            frequencyNum = getFrequencyFromDays(daysSincePrev);
        }
        
        // Update the PREVIOUS dividend's frequency based on gap FROM previous TO current
        // This happens when we process the current dividend and can confirm the previous one's frequency
        // IMPORTANT: At frequency transition points, don't overwrite the previous dividend's frequency
        // if it was already set correctly based on gap to next
        if (i > 0 && previous !== null && daysSincePrev !== null && daysSincePrev > 4) {
            const prevFrequencyNum = getFrequencyFromDays(daysSincePrev);
            const prevResult = results[results.length - 1];
            
            // Check if previous dividend was at a frequency transition point
            // The previous dividend's frequency was already set based on gap to next (current dividend)
            // If that frequency differs from what we'd assign based on gap from prevPrev to previous,
            // then previous was at a transition and should keep its original frequency (from gap to next)
            let shouldUpdatePrevFrequency = true;
            if (i > 1) {
                const prevPrev = sortedDividends[i - 2];
                const prevPrevDate = new Date(prevPrev.ex_date);
                const prevDate = new Date(previous.ex_date);
                const prevPrevDays = Math.round((prevDate.getTime() - prevPrevDate.getTime()) / (1000 * 60 * 60 * 24));
                
                if (prevPrevDays > 4) {
                    const prevPrevFreq = getFrequencyFromDays(prevPrevDays);
                    // Compare: frequency already set for previous (based on gap to current) vs frequency from prevPrev gap
                    // If they differ, previous was at a transition point - keep the already-set frequency
                    if (prevPrevFreq !== prevResult.frequency_num) {
                        shouldUpdatePrevFrequency = false;
                    }
                }
            }
            
            if (shouldUpdatePrevFrequency) {
                prevResult.frequency_num = prevFrequencyNum;
                
                // Recalculate annualized and normalized for previous dividend with updated frequency
                if (prevResult.pmt_type === 'Regular') {
                    const prevAmount = previous.adj_amount !== null && previous.adj_amount > 0
                        ? Number(previous.adj_amount)
                        : null;
                    if (prevAmount !== null && prevAmount > 0) {
                        const annualizedRaw = prevAmount * prevFrequencyNum;
                        prevResult.annualized = Number(annualizedRaw.toFixed(2));
                        prevResult.normalized_div = Number((annualizedRaw / 52).toFixed(9));
                    }
                }
            }
        }

        // Calculate annualized and normalized values
        // CRITICAL: For normalization, we MUST use adj_amount (adjusted dividends) for ETFs that split
        // Never fall back to div_cash (unadjusted) as it will give wrong results after splits
        // If adj_amount is null or 0, we cannot calculate normalized values correctly
        const amount = current.adj_amount !== null && current.adj_amount > 0
            ? Number(current.adj_amount)
            : null; // Don't use div_cash - must have adj_amount for proper normalization

        let annualized: number | null = null;
        let normalizedDiv: number | null = null;

        // Only calculate for Regular dividends with valid adjusted amounts
        // Must have adj_amount (not div_cash) for proper normalization after splits
        if (pmtType === 'Regular' && amount !== null && amount > 0) {
            // Calculate annualized: Amount × Frequency
            const annualizedRaw = amount * frequencyNum;
            // Round annualized to 2 decimals for storage/display
            annualized = Number(annualizedRaw.toFixed(2));
            
            // Normalized value: convert to weekly equivalent rate for line chart
            // IMPORTANT: Calculate from the UNROUNDED annualized value, then round result
            // Formula: normalizedDiv = (amount × frequency) / 52
            // This ensures consistency: 0.694 × 12 = 8.328 → 8.328 / 52 = 0.160153846... ≈ 0.16015
            // The spreadsheet uses the unrounded annualized value for normalization calculation
            normalizedDiv = annualizedRaw / 52;
        }

        results.push({
            id: current.id,
            days_since_prev: daysSincePrev,
            pmt_type: pmtType,
            frequency_num: frequencyNum,
            annualized: annualized !== null ? Number(annualized.toFixed(2)) : null,
            normalized_div: normalizedDiv !== null ? Number(normalizedDiv.toFixed(9)) : null, // Use 9 decimals to match spreadsheet precision
        });
    }

    return results;
}

/**
 * Calculate normalized values for dividends returned from API
 * Works with the dividend response format from tiingo.ts
 */
export function calculateNormalizedForResponse(
    dividends: Array<{
        exDate: string;
        amount: number;
        adjAmount: number;
        type?: string;
        frequency?: string;
    }>
): Array<{
    pmtType: 'Regular' | 'Special' | 'Initial';
    frequencyNum: number;
    daysSincePrev: number | null;
    annualized: number | null;
    normalizedDiv: number | null;
}> {
    if (!dividends || dividends.length === 0) {
        return [];
    }

    // Sort by date ascending for proper calculation
    const sorted = [...dividends].sort(
        (a, b) => new Date(a.exDate).getTime() - new Date(b.exDate).getTime()
    );

    const results: Array<{
        pmtType: 'Regular' | 'Special' | 'Initial';
        frequencyNum: number;
        daysSincePrev: number | null;
        annualized: number | null;
        normalizedDiv: number | null;
    }> = [];

    const calculatedTypes: ('Regular' | 'Special' | 'Initial')[] = [];

    for (let i = 0; i < sorted.length; i++) {
        const current = sorted[i];
        const previous = i > 0 ? sorted[i - 1] : null;

        // Calculate days since previous dividend
        let daysSincePrev: number | null = null;
        if (previous) {
            const currentDate = new Date(current.exDate);
            const prevDate = new Date(previous.exDate);
            daysSincePrev = Math.round(
                (currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24)
            );
        }

        // Find last Regular dividend to calculate days since last regular
        // Special dividend rule: paid 1-4 days after LAST REGULAR dividend (not just previous)
        let daysSinceLastRegular: number | null = null;
        const lastRegular = findLastRegularDividend(
            sorted.map(d => ({ id: 0, ticker: '', ex_date: d.exDate, div_cash: d.amount, adj_amount: d.adjAmount })),
            i,
            calculatedTypes
        );
        if (lastRegular) {
            const currentDate = new Date(current.exDate);
            const lastRegularDate = new Date(lastRegular.dividend.ex_date);
            daysSinceLastRegular = Math.round((currentDate.getTime() - lastRegularDate.getTime()) / (1000 * 60 * 60 * 24));
        } else if (daysSincePrev !== null) {
            // No regular dividend found yet, use days since previous as fallback
            daysSinceLastRegular = daysSincePrev;
        }

        // Get next dividend info for amount-based special detection
        const next = i < sorted.length - 1 ? sorted[i + 1] : null;
        let daysToNext: number | null = null;
        if (next) {
            const currentDate = new Date(current.exDate);
            const nextDate = new Date(next.exDate);
            daysToNext = Math.round((nextDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
        }
        const currentAmount = current.adjAmount ?? current.amount;
        const nextAmount = next ? (next.adjAmount ?? next.amount) : null;

        // Determine payment type: Special if 1-4 days after last Regular dividend
        // OR if tiny amount (< 1% of next) that comes 1-4 days before next
        const pmtType = getPaymentType(daysSincePrev, daysSinceLastRegular, currentAmount, nextAmount, daysToNext);
        calculatedTypes.push(pmtType);

        // Determine frequency using backward confirmation rule:
        // IMPORTANT: Frequency is determined by looking AHEAD to the NEXT dividend.
        // The gap from current to next determines the current dividend's frequency.
        // This is the "backward confirmation" rule: we confirm a dividend's frequency
        // by seeing when the next one arrives.
        // EXCEPTION: At frequency transition points, use the frequency from the PREVIOUS gap
        // (the gap that brought us here), not the gap to next.
        let frequencyNum = 12; // Default to monthly

        if (i < sorted.length - 1) {
            // Not the last dividend: use gap to next (backward confirmation rule)
            const nextDiv = sorted[i + 1];
            const nextDate = new Date(nextDiv.exDate);
            const currentDate = new Date(current.exDate);
            const daysToNext = Math.round(
                (nextDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24)
            );
            
            // Try to find the next Regular dividend (skip Special dividends)
            let nextRegularDiv: typeof current | null = null;
            let daysToNextRegular: number | null = null;
            for (let j = i + 1; j < sorted.length; j++) {
                const testDiv = sorted[j];
                const testPrev = j > 0 ? sorted[j - 1] : null;
                let testDaysSincePrev: number | null = null;
                if (testPrev) {
                    const testDate = new Date(testDiv.exDate);
                    const testPrevDate = new Date(testPrev.exDate);
                    testDaysSincePrev = Math.round((testDate.getTime() - testPrevDate.getTime()) / (1000 * 60 * 60 * 24));
                }
                const testPmtType = getPaymentType(testDaysSincePrev);
                if (testPmtType === 'Regular') {
                    nextRegularDiv = testDiv;
                    const testDate = new Date(testDiv.exDate);
                    daysToNextRegular = Math.round((testDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
                    break;
                }
            }
            
            // Check for frequency transition: if previous gap indicates one frequency
            // and next gap indicates a different frequency, we're at a transition point
            // At transitions, use the frequency from the PREVIOUS gap (the one that brought us here)
            // This is CRITICAL: The last payment of the old frequency should keep the old frequency
            if (daysSincePrev !== null && daysSincePrev > 4) {
                const freqFromPrev = getFrequencyFromDays(daysSincePrev);
                
                // Determine frequency from next gap (prefer Regular dividend if found)
                let freqFromNext: number | null = null;
                if (daysToNext > 4) {
                    freqFromNext = daysToNextRegular !== null && daysToNextRegular > 4
                        ? getFrequencyFromDays(daysToNextRegular)
                        : getFrequencyFromDays(daysToNext);
                }
                
                // If we have both previous and next gaps, check for transition
                if (freqFromNext !== null && freqFromPrev !== freqFromNext) {
                    // TRANSITION DETECTED: Use frequency from PREVIOUS gap (the pattern that brought us here)
                    // This ensures the last payment of the old frequency keeps the old frequency
                    frequencyNum = freqFromPrev;
                } else if (freqFromNext !== null) {
                    // No transition: use gap to next (backward confirmation rule)
                    frequencyNum = freqFromNext;
                } else {
                    // No valid next gap: use previous gap
                    frequencyNum = freqFromPrev;
                }
            } else if (nextRegularDiv && daysToNextRegular !== null && daysToNextRegular > 4) {
                // Use gap to next Regular to determine frequency (backward confirmation rule)
                frequencyNum = getFrequencyFromDays(daysToNextRegular);
            } else if (daysToNext > 5) {
                // Use gap to immediate next dividend (backward confirmation rule)
                frequencyNum = getFrequencyFromDays(daysToNext);
            }
        } else if (i > 0 && daysSincePrev !== null && daysSincePrev > 4) {
            // Last dividend: use gap from previous (no next dividend available)
            frequencyNum = getFrequencyFromDays(daysSincePrev);
        }
        
        // Update the PREVIOUS dividend's frequency based on gap FROM previous TO current
        // This happens when we process the current dividend and can confirm the previous one's frequency
        // IMPORTANT: At frequency transition points, don't overwrite the previous dividend's frequency
        // if it was already set correctly based on gap to next
        if (i > 0 && previous !== null && daysSincePrev !== null && daysSincePrev > 4) {
            const prevFrequencyNum = getFrequencyFromDays(daysSincePrev);
            const prevResult = results[results.length - 1];
            
            // Check if previous dividend was at a frequency transition point
            // The previous dividend's frequency was already set based on gap to next (current dividend)
            // If that frequency differs from what we'd assign based on gap from prevPrev to previous,
            // then previous was at a transition and should keep its original frequency (from gap to next)
            let shouldUpdatePrevFrequency = true;
            if (i > 1) {
                const prevPrev = sorted[i - 2];
                const prevPrevDate = new Date(prevPrev.exDate);
                const prevDate = new Date(previous.exDate);
                const prevPrevDays = Math.round((prevDate.getTime() - prevPrevDate.getTime()) / (1000 * 60 * 60 * 24));
                
                if (prevPrevDays > 4) {
                    const prevPrevFreq = getFrequencyFromDays(prevPrevDays);
                    // Compare: frequency already set for previous (based on gap to current) vs frequency from prevPrev gap
                    // If they differ, previous was at a transition point - keep the already-set frequency
                    if (prevPrevFreq !== prevResult.frequencyNum) {
                        shouldUpdatePrevFrequency = false;
                    }
                }
            }
            
            if (shouldUpdatePrevFrequency) {
                prevResult.frequencyNum = prevFrequencyNum;
                
                // Recalculate annualized and normalized for previous dividend with updated frequency
                if (prevResult.pmtType === 'Regular') {
                    const prevAmount = previous.adjAmount > 0 ? previous.adjAmount : null;
                    if (prevAmount !== null && prevAmount > 0) {
                        const annualizedRaw = prevAmount * prevFrequencyNum;
                        prevResult.annualized = Number(annualizedRaw.toFixed(2));
                        prevResult.normalizedDiv = Number((annualizedRaw / 52).toFixed(6));
                    }
                }
            }
        }

        // Calculate annualized and normalized values
        // CRITICAL: For normalization, we MUST use adjAmount (adjusted dividends) for ETFs that split
        // Never fall back to amount (unadjusted) as it will give wrong results after splits
        // If adjAmount is 0 or missing, we cannot calculate normalized values correctly
        const amount = current.adjAmount > 0 ? current.adjAmount : null; // Don't use unadjusted amount

        let annualized: number | null = null;
        let normalizedDiv: number | null = null;

        // Only calculate for Regular dividends with valid adjusted amounts
        // Must have adjAmount (not unadjusted amount) for proper normalization after splits
        if (pmtType === 'Regular' && amount !== null && amount > 0) {
            // Calculate annualized: Amount × Frequency
            const annualizedRaw = amount * frequencyNum;
            // Round annualized to 2 decimals for storage/display
            annualized = Number(annualizedRaw.toFixed(2));
            
            // Normalized value: convert to weekly equivalent rate for line chart
            // IMPORTANT: Calculate from the UNROUNDED annualized value
            // Formula: normalizedDiv = (amount × frequency) / 52
            // This ensures consistency: 0.694 × 12 = 8.328 → 8.328 / 52 = 0.160153846... ≈ 0.16015
            normalizedDiv = annualizedRaw / 52;
        }

        results.push({
            pmtType,
            frequencyNum,
            daysSincePrev,
            annualized: annualized !== null ? Number(annualized.toFixed(2)) : null,
            normalizedDiv: normalizedDiv !== null ? Number(normalizedDiv.toFixed(6)) : null,
        });
    }

    // Results are in ascending order but dividends endpoint returns descending
    // Return in same order as input (descending - most recent first)
    return results.reverse();
}

export default {
    calculateNormalizedDividends,
    calculateNormalizedForResponse,
    getFrequencyFromDays,
    getPaymentType,
};

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
 *    - ≤5 days → "Special" (too close to previous, likely special dividend)
 *    - >5 days → "Regular"
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
 * Determine payment type based on days gap
 */
export function getPaymentType(daysSincePrev: number | null): 'Regular' | 'Special' | 'Initial' {
    if (daysSincePrev === null) return 'Initial';
    if (daysSincePrev <= 5) return 'Special';
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

        // Determine payment type
        const pmtType = getPaymentType(daysSincePrev);
        calculatedTypes.push(pmtType);

        // Determine frequency using backward confirmation rule:
        // IMPORTANT: Frequency is assigned to the PREVIOUS dividend based on the gap FROM previous TO current
        // When we process dividend[i], we calculate days from dividend[i-1] to dividend[i],
        // and assign that frequency to dividend[i-1] (the previous one)
        let frequencyNum = 12; // Default to monthly (temporary, will be updated)

        if (i > 0 && daysSincePrev !== null && daysSincePrev > 5) {
            // Calculate frequency from gap between previous and current
            // This frequency will be assigned to the PREVIOUS dividend
            frequencyNum = getFrequencyFromDays(daysSincePrev);
            
            // Update the previous dividend's frequency
            const prevResult = results[results.length - 1];
            prevResult.frequency_num = frequencyNum;
            
            // Recalculate annualized and normalized for previous dividend with updated frequency
            if (prevResult.pmt_type === 'Regular' && previous) {
                const prevAmount = previous.adj_amount !== null && previous.adj_amount > 0
                    ? Number(previous.adj_amount)
                    : null;
                if (prevAmount !== null && prevAmount > 0) {
                    const annualizedRaw = prevAmount * frequencyNum;
                    prevResult.annualized = Number(annualizedRaw.toFixed(2));
                    prevResult.normalized_div = Number((annualizedRaw / 52).toFixed(9));
                }
            }
        }
        
        // For the current dividend, determine its frequency:
        // CRITICAL FIX: When there's a frequency change, use the frequency from the PREVIOUS gap
        // (the gap that brought us to this dividend), not the gap to the next dividend.
        // This ensures the last payment of the old frequency keeps the old frequency.
        // Example: Last monthly payment (28 days from previous) before switching to weekly
        // should be monthly (12), not weekly (52) based on the 7-day gap to next.
        if (i < sortedDividends.length - 1) {
            // Not the last dividend: check for frequency transition
            const nextDiv = sortedDividends[i + 1];
            const nextDate = new Date(nextDiv.ex_date);
            const currentDate = new Date(current.ex_date);
            const daysToNext = Math.round(
                (nextDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24)
            );
            
            if (daysSincePrev !== null && daysSincePrev > 5 && daysToNext > 5) {
                // Both gaps are valid - check if there's a frequency change
                const prevFreq = getFrequencyFromDays(daysSincePrev);
                const nextFreq = getFrequencyFromDays(daysToNext);
                
                if (prevFreq !== nextFreq) {
                    // Frequency transition detected: use the PREVIOUS frequency
                    // This ensures the last payment of the old frequency keeps the old frequency
                    frequencyNum = prevFreq;
                } else {
                    // No frequency change: use gap to next (will be finalized when next dividend is processed)
                    frequencyNum = nextFreq;
                }
            } else if (daysToNext > 5) {
                // Only next gap is valid
                frequencyNum = getFrequencyFromDays(daysToNext);
            } else if (daysSincePrev !== null && daysSincePrev > 5) {
                // Only previous gap is valid
                frequencyNum = getFrequencyFromDays(daysSincePrev);
            }
        } else if (i > 0) {
            // Last dividend: use gap from previous
            if (daysSincePrev !== null && daysSincePrev > 5) {
                frequencyNum = getFrequencyFromDays(daysSincePrev);
            }
        } else {
            // First and only dividend: use gap to next if available, otherwise default
            if (sortedDividends.length > 1) {
                const nextDiv = sortedDividends[i + 1];
                const nextDate = new Date(nextDiv.ex_date);
                const currentDate = new Date(current.ex_date);
                const daysToNext = Math.round(
                    (nextDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24)
                );
                if (daysToNext > 5) {
                    frequencyNum = getFrequencyFromDays(daysToNext);
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

        // Determine payment type
        const pmtType = getPaymentType(daysSincePrev);
        calculatedTypes.push(pmtType);

        // Determine frequency using backward confirmation rule:
        // IMPORTANT: Frequency is assigned to the PREVIOUS dividend based on the gap FROM previous TO current
        // When we process dividend[i], we calculate days from dividend[i-1] to dividend[i],
        // and assign that frequency to dividend[i-1] (the previous one)
        let frequencyNum = 12; // Default to monthly (temporary, will be updated)

        if (i > 0 && daysSincePrev !== null && daysSincePrev > 5) {
            // Calculate frequency from gap between previous and current
            // This frequency will be assigned to the PREVIOUS dividend
            frequencyNum = getFrequencyFromDays(daysSincePrev);
            
            // Update the previous dividend's frequency
            const prevResult = results[results.length - 1];
            prevResult.frequencyNum = frequencyNum;
            
            // Recalculate annualized and normalized for previous dividend with updated frequency
            if (prevResult.pmtType === 'Regular' && previous) {
                const prevAmount = previous.adjAmount > 0 ? previous.adjAmount : null;
                if (prevAmount !== null && prevAmount > 0) {
                    const annualizedRaw = prevAmount * frequencyNum;
                    prevResult.annualized = Number(annualizedRaw.toFixed(2));
                    prevResult.normalizedDiv = Number((annualizedRaw / 52).toFixed(6));
                }
            }
        }
        
        // For the current dividend, determine its frequency:
        // - If not the last dividend: use gap to next (will be finalized when next dividend is processed)
        // - If last dividend: use gap from previous
        if (i < sorted.length - 1) {
            // Not the last dividend: use gap to next as temporary frequency
            const nextDiv = sorted[i + 1];
            const nextDate = new Date(nextDiv.exDate);
            const currentDate = new Date(current.exDate);
            const daysToNext = Math.round(
                (nextDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24)
            );
            if (daysToNext > 5) {
                frequencyNum = getFrequencyFromDays(daysToNext);
            }
        } else if (i > 0) {
            // Last dividend: use gap from previous
            if (daysSincePrev !== null && daysSincePrev > 5) {
                frequencyNum = getFrequencyFromDays(daysSincePrev);
            }
        } else {
            // First and only dividend: use gap to next if available, otherwise default
            if (sorted.length > 1) {
                const nextDiv = sorted[i + 1];
                const nextDate = new Date(nextDiv.exDate);
                const currentDate = new Date(current.exDate);
                const daysToNext = Math.round(
                    (nextDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24)
                );
                if (daysToNext > 5) {
                    frequencyNum = getFrequencyFromDays(daysToNext);
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

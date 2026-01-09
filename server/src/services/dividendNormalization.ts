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
 * 4. ANNUALIZED: adj_amount × frequency_num (for Regular and Initial dividends)
 * 5. NORMALIZED: annualized / 52 = (adj_amount × frequency_num) / 52 (weekly equivalent rate)
 *    Calculated for Regular and Initial dividends (not Special). 
 *    This normalizes all payments to weekly equivalent for line chart comparison.
 *    Initial dividends (first dividend with no previous) also get normalized using default frequency.
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

// ============================================================================
// CEF-Specific Normalization (Frequency + Special detection)
// ============================================================================

export type CEFDividendFrequencyLabel =
    | 'Weekly'
    | 'Monthly'
    | 'Quarterly'
    | 'Semi-Annual'
    | 'Annual'
    | 'Irregular';

export interface NormalizedDividendCEF {
    id: number;
    days_since_prev: number | null;
    pmt_type: 'Regular' | 'Special' | 'Initial';
    frequency_num: number | null; // null = Irregular/unknown
    frequency_label: CEFDividendFrequencyLabel;
    annualized: number | null;
    normalized_div: number | null;
}

/**
 * CEF dividend frequency mapping (Gap Days → Frequency)
 *
 * Gap (days)   Frequency
 * 5–13         Weekly
 * 20–45        Monthly
 * 46–100       Quarterly
 * 101–200      Semiannual
 * 201–400      Annual
 * > 400        Irregular / Special
 */
export function getCEFFrequencyFromDays(days: number): { label: CEFDividendFrequencyLabel; frequencyNum: number | null } {
    if (!isFinite(days) || days <= 0) return { label: 'Irregular', frequencyNum: null };

    if (days >= 5 && days <= 13) return { label: 'Weekly', frequencyNum: 52 };
    if (days >= 20 && days <= 45) return { label: 'Monthly', frequencyNum: 12 };
    if (days >= 46 && days <= 100) return { label: 'Quarterly', frequencyNum: 4 };
    if (days >= 101 && days <= 200) return { label: 'Semi-Annual', frequencyNum: 2 };
    if (days >= 201 && days <= 400) return { label: 'Annual', frequencyNum: 1 };
    if (days > 400) return { label: 'Irregular', frequencyNum: null };

    // Gaps outside known ranges (e.g. 14–19, 1–4) start as "Irregular" and may be overridden by history rules
    return { label: 'Irregular', frequencyNum: null };
}

function median(values: number[]): number | null {
    const nums = values.filter(v => typeof v === 'number' && isFinite(v) && v > 0).sort((a, b) => a - b);
    if (nums.length === 0) return null;
    const mid = Math.floor(nums.length / 2);
    if (nums.length % 2 === 1) return nums[mid];
    return (nums[mid - 1] + nums[mid]) / 2;
}

function isApproximatelyEqual(a: number, b: number, relTol: number): boolean {
    if (!isFinite(a) || !isFinite(b)) return false;
    const scale = Math.max(Math.abs(a), Math.abs(b), 1e-9);
    return Math.abs(a - b) <= scale * relTol;
}

function isRoundNumberSpecial(amount: number): boolean {
    // Rule 3: Round-number specials (common for year-end / cap gains)
    // Compare after rounding to cents to avoid float noise
    const rounded = Math.round(amount * 100) / 100;
    const rounds = [0.25, 0.5, 1.0, 2.0, 3.0];
    return rounds.some(r => Math.abs(rounded - r) < 1e-9);
}

function determinePatternFrequencyLabel(recentGapsToNext: number[]): CEFDividendFrequencyLabel | null {
    // Use the last 3–6 gaps (to next) of NON-special dividends to infer a "dominant" frequency
    const labels = recentGapsToNext
        .filter(d => typeof d === 'number' && isFinite(d) && d > 0)
        .slice(-6)
        .map(d => getCEFFrequencyFromDays(d).label)
        .filter(l => l !== 'Irregular');

    if (labels.length < 3) return null;

    const counts = new Map<CEFDividendFrequencyLabel, number>();
    for (const l of labels) counts.set(l, (counts.get(l) || 0) + 1);

    // Winner must be majority of observed labels
    let best: { label: CEFDividendFrequencyLabel; count: number } | null = null;
    for (const [label, count] of counts.entries()) {
        if (!best || count > best.count) best = { label, count };
    }

    if (!best) return null;
    return best.count >= Math.ceil(labels.length * 0.6) ? best.label : null; // >=60% dominance
}

/**
 * CEF-only: Calculate normalized dividend fields with:
 * - Frequency primarily by gap-days table (above)
 * - Holiday-adjusted weekly/monthly for ambiguous 14–19 day gaps when amount is unchanged
 * - Special dividends detected by AMOUNT deviation (not date)
 *
 * Notes:
 * - We still use a "look-ahead" gap (to next dividend) to label a dividend's frequency for history,
 *   but the newest dividend (last in series) is classified strictly by days since previous.
 * - For CEFs we prefer `adj_amount` if present, otherwise `div_cash` for amount-based rules.
 */
export function calculateNormalizedDividendsForCEFs(
    dividends: DividendInput[],
    options?: {
        specialMultiplier?: number;         // Rule 1
        roundNumberMultiplier?: number;      // Rule 3
        amountStabilityRelTol?: number;      // "unchanged" threshold
    }
): NormalizedDividendCEF[] {
    const specialMultiplier = options?.specialMultiplier ?? 1.75;
    const roundNumberMultiplier = options?.roundNumberMultiplier ?? 1.5;
    const amountStabilityRelTol = options?.amountStabilityRelTol ?? 0.02; // 2% default

    if (!dividends || dividends.length === 0) return [];

    // Ensure oldest -> newest
    const sorted = [...dividends].sort((a, b) => a.ex_date.localeCompare(b.ex_date));

    const results: NormalizedDividendCEF[] = [];

    // Rolling history of "regular-like" amounts and gaps (we exclude specials once detected)
    const rollingRegularAmounts: number[] = [];
    const rollingRegularGapsToNext: number[] = [];

    for (let i = 0; i < sorted.length; i++) {
        const current = sorted[i];
        const prev = i > 0 ? sorted[i - 1] : null;
        const next = i < sorted.length - 1 ? sorted[i + 1] : null;

        const currentDate = new Date(current.ex_date);
        const prevDate = prev ? new Date(prev.ex_date) : null;
        const nextDate = next ? new Date(next.ex_date) : null;

        const daysSincePrev =
            prevDate ? Math.round((currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24)) : null;

        // Per requirement: classify newest dividend strictly by gap days (look-back).
        // For earlier dividends, use look-ahead to next dividend to label that period.
        const gapDays =
            nextDate ? Math.round((nextDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24))
                : (daysSincePrev !== null ? daysSincePrev : 0);

        const amount = (current.adj_amount !== null && current.adj_amount > 0)
            ? Number(current.adj_amount)
            : (current.div_cash > 0 ? Number(current.div_cash) : 0);

        const medianAmount = median(rollingRegularAmounts.slice(-6));

        // Step 1: Strict frequency from gap table (initial classification)
        const raw = getCEFFrequencyFromDays(gapDays);
        let frequencyLabel: CEFDividendFrequencyLabel = raw.label;
        let frequencyNum: number | null = raw.frequencyNum;

        // Step 2: If amount is stable (matches historical pattern), use dominant historical frequency
        // CRITICAL: When amount is unchanged across dividends, they should have CONSISTENT frequency
        // This prevents frequency jumping (Monthly → Quarterly → Semi-Annual) when gaps vary but amount stays same
        const amountStable = medianAmount !== null && amount > 0 && isApproximatelyEqual(amount, medianAmount, amountStabilityRelTol);
        if (amountStable && rollingRegularGapsToNext.length >= 3) {
            const historicalPattern = determinePatternFrequencyLabel(rollingRegularGapsToNext);
            if (historicalPattern && historicalPattern !== 'Irregular') {
                // Override gap-based frequency with historical pattern when amount is stable
                // This ensures all $0.4625 dividends get the same frequency, not different ones based on gaps
                frequencyLabel = historicalPattern;
                frequencyNum = historicalPattern === 'Weekly' ? 52
                    : historicalPattern === 'Monthly' ? 12
                    : historicalPattern === 'Quarterly' ? 4
                    : historicalPattern === 'Semi-Annual' ? 2
                    : historicalPattern === 'Annual' ? 1
                    : null;
            }
        }

        // Step 3: History-based holiday adjustment for ambiguous short gaps (14–19)
        // If amount is unchanged and the prior 3–6 dividends were monthly/weekly, treat as holiday-adjusted.
        if (frequencyLabel === 'Irregular' && gapDays >= 14 && gapDays <= 19 && medianAmount !== null && amount > 0) {
            const pattern = determinePatternFrequencyLabel(rollingRegularGapsToNext);
            const amountStableForHoliday = isApproximatelyEqual(amount, medianAmount, amountStabilityRelTol);
            if (amountStableForHoliday && (pattern === 'Monthly' || pattern === 'Weekly')) {
                frequencyLabel = pattern;
                frequencyNum = pattern === 'Monthly' ? 12 : 52;
            }
        }

        // Step 4: Special detection by AMOUNT deviation (not date)
        let pmtType: 'Regular' | 'Special' | 'Initial' = 'Regular';
        if (daysSincePrev === null) {
            pmtType = 'Initial';
        } else if (medianAmount !== null && medianAmount > 0 && amount > 0) {
            const amountStable = isApproximatelyEqual(amount, medianAmount, amountStabilityRelTol);

            // Rule 1 — Amount spike vs median
            if (amount > specialMultiplier * medianAmount) {
                pmtType = 'Special';
            }

            // Rule 2 — Irregular gap + different amount
            // (If gap is irregular AND amount deviates, it's likely special)
            if (pmtType !== 'Special' && frequencyLabel === 'Irregular' && !amountStable) {
                pmtType = 'Special';
            }

            // Rule 3 — Round-number specials
            if (pmtType !== 'Special' && isRoundNumberSpecial(amount) && amount > roundNumberMultiplier * medianAmount) {
                pmtType = 'Special';
            }
        }

        // If it’s Special, we don’t want to annualize/normalize it (per CEF requirement).
        let annualized: number | null = null;
        let normalizedDiv: number | null = null;

        if (pmtType !== 'Special' && amount > 0 && frequencyNum !== null && frequencyNum > 0) {
            const annualizedRaw = amount * frequencyNum;
            annualized = Number(annualizedRaw.toFixed(6));
            normalizedDiv = Number((annualizedRaw / 52).toFixed(6));
        }

        results.push({
            id: current.id,
            days_since_prev: daysSincePrev,
            pmt_type: pmtType,
            frequency_num: pmtType === 'Special' ? null : frequencyNum,
            frequency_label: pmtType === 'Special' ? 'Irregular' : frequencyLabel,
            annualized,
            normalized_div: normalizedDiv,
        });

        // Update rolling history only for non-special dividends (so specials don't distort median/pattern)
        if (pmtType !== 'Special' && amount > 0) {
            rollingRegularAmounts.push(amount);
            // For pattern detection we want "gap to next" (frequency confirmation). Only add if next exists.
            if (nextDate && gapDays > 0) {
                rollingRegularGapsToNext.push(gapDays);
            }
        }
    }

    return results;
}

/**
 * Determine frequency based on days between payments
 * Using ranges to account for weekends/holidays
 * Based on DAYS FORMULA specification:
 * - Weekly: 5-10 days
 * - Monthly: 20-40 days
 * - Quarterly: 60-110 days
 * - Semi-Annually: 150-210 days
 * - Annually: 300-380 days
 * - Irregular/Special: Outside these ranges OR 1-4 days from last regular dividend
 */
export function getFrequencyFromDays(days: number): number {
    // Weekly: 5-10 days
    if (days >= 5 && days <= 10) return 52;    // Weekly

    // Monthly: 20-40 days
    if (days >= 20 && days <= 40) return 12;   // Monthly  

    // Quarterly: 60-110 days
    if (days >= 60 && days <= 110) return 4;   // Quarterly

    // Semi-Annually: 150-210 days
    if (days >= 150 && days <= 210) return 2;  // Semi-annual

    // Annually: 300-380 days
    if (days >= 300 && days <= 380) return 1;   // Annual

    // Edge cases for gaps outside standard ranges but within reasonable bounds
    // 11-19 days: between weekly and monthly, treat as weekly (transition periods)
    if (days >= 11 && days < 20) return 52;   // Transition periods (monthly to weekly)

    // 41-59 days: between monthly and quarterly, treat as monthly
    if (days > 40 && days < 60) return 12;     // Irregular monthly pattern

    // 111-149 days: between quarterly and semi-annual, treat as quarterly
    if (days > 110 && days < 150) return 4;    // Irregular quarterly pattern

    // 211-299 days: between semi-annual and annual, treat as semi-annual
    if (days > 210 && days < 300) return 2;    // Irregular semi-annual pattern

    // > 380 days: beyond annual range, treat as annual (irregular)
    if (days > 380) return 1;                   // Irregular annual pattern

    // Default to monthly for any other case (shouldn't happen with valid data)
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

        // Determine frequency using backward confirmation rule with transition detection:
        // At frequency transition points (e.g., monthly to weekly), the last payment of the old
        // frequency should use the gap FROM the previous dividend, not the gap TO the next dividend.
        // This ensures the 3/6 monthly payment shows normalized value of 1.07, not 4.65.
        let frequencyNum = 12; // Default to monthly

        if (i < sortedDividends.length - 1) {
            // Not the last dividend: check for frequency transition
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

            // CRITICAL FIX: Always prioritize the gap TO the next dividend for frequency determination
            // The "backward confirmation rule" means we confirm frequency by looking ahead
            // If the gap to next is clearly in a frequency range (5-10 = weekly, 20-40 = monthly, etc.),
            // use that frequency regardless of transition detection
            // Transition detection should only apply for ambiguous gaps (11-19 days, etc.)
            
            // PRIORITY 1: If gap to next is clearly weekly (5-10 days), ALWAYS use Weekly
            // This ensures 7 days = Weekly, not Monthly
            if (daysToNext >= 5 && daysToNext <= 10) {
                frequencyNum = 52; // Weekly - clear and unambiguous
            }
            // PRIORITY 2: If gap to next is clearly monthly (20-40 days), ALWAYS use Monthly
            else if (daysToNext >= 20 && daysToNext <= 40) {
                frequencyNum = 12; // Monthly - clear and unambiguous
            }
            // PRIORITY 3: Check for frequency transition only for ambiguous gaps (11-19 days, etc.)
            else if (daysSincePrev !== null && daysSincePrev > 4 && daysToNext > 4) {
                const freqFromPrev = getFrequencyFromDays(daysSincePrev);
                const freqFromNext = daysToNextRegular !== null && daysToNextRegular > 4
                    ? getFrequencyFromDays(daysToNextRegular)
                    : getFrequencyFromDays(daysToNext);

                // For ambiguous gaps, check if there's a clear transition
                // Only use previous frequency if:
                // 1. Previous gap is clearly in a frequency range (not ambiguous)
                // 2. Next gap is ambiguous (11-19 days, 41-59 days, etc.)
                // 3. Previous frequency is clearly established
                const prevIsClear = (daysSincePrev >= 5 && daysSincePrev <= 10) || 
                                   (daysSincePrev >= 20 && daysSincePrev <= 40) ||
                                   (daysSincePrev >= 60 && daysSincePrev <= 110);
                const nextIsAmbiguous = (daysToNext >= 11 && daysToNext < 20) ||
                                       (daysToNext > 40 && daysToNext < 60);
                
                if (prevIsClear && nextIsAmbiguous && freqFromPrev !== freqFromNext) {
                    // Use previous frequency for ambiguous transition periods
                    frequencyNum = freqFromPrev;
                } else {
                    // Use gap to next (backward confirmation rule)
                    if (nextRegularDiv && daysToNextRegular !== null && daysToNextRegular > 4) {
                        frequencyNum = getFrequencyFromDays(daysToNextRegular);
                    } else {
                        frequencyNum = getFrequencyFromDays(daysToNext);
                    }
                }
            } else if (nextRegularDiv && daysToNextRegular !== null && daysToNextRegular > 4) {
                // Use gap to next Regular to determine frequency (backward confirmation rule)
                frequencyNum = getFrequencyFromDays(daysToNextRegular);
            } else if (daysToNext > 4) {
                // Use gap to immediate next dividend (backward confirmation rule)
                frequencyNum = getFrequencyFromDays(daysToNext);
            } else if (daysToNext <= 4 && lastRegular) {
                // Small gap (Special dividend): look back to last Regular dividend to determine frequency
                const currentDate2 = new Date(current.ex_date);
                const lastRegularDate = new Date(lastRegular.dividend.ex_date);
                const daysFromLastRegular = Math.round((currentDate2.getTime() - lastRegularDate.getTime()) / (1000 * 60 * 60 * 24));
                if (daysFromLastRegular > 4) {
                    frequencyNum = getFrequencyFromDays(daysFromLastRegular);
                }
            }
        } else {
            // Last dividend: use gap from last Regular dividend if available, otherwise from previous
            if (lastRegular) {
                const currentDate2 = new Date(current.ex_date);
                const lastRegularDate = new Date(lastRegular.dividend.ex_date);
                const daysFromLastRegular = Math.round((currentDate2.getTime() - lastRegularDate.getTime()) / (1000 * 60 * 60 * 24));
                if (daysFromLastRegular > 4) {
                    frequencyNum = getFrequencyFromDays(daysFromLastRegular);
                } else if (i > 0 && daysSincePrev !== null && daysSincePrev > 4) {
                    frequencyNum = getFrequencyFromDays(daysSincePrev);
                }
            } else if (i > 0 && daysSincePrev !== null && daysSincePrev > 4) {
                frequencyNum = getFrequencyFromDays(daysSincePrev);
            }
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
            // FIX: At transition points, prevPrevFreq will differ from prevFrequencyNum (the incoming update).
            // When they differ, we should NOT update - keep the already-set frequency from the transition detection.
            let shouldUpdatePrevFrequency = true;
            if (i > 1) {
                const prevPrev = sortedDividends[i - 2];
                const prevPrevDate = new Date(prevPrev.ex_date);
                const prevDate = new Date(previous.ex_date);
                const prevPrevDays = Math.round((prevDate.getTime() - prevPrevDate.getTime()) / (1000 * 60 * 60 * 24));

                if (prevPrevDays > 4) {
                    const prevPrevFreq = getFrequencyFromDays(prevPrevDays);
                    // FIX: Compare prevPrevFreq with the INCOMING update (prevFrequencyNum), not the already-set value
                    // If they differ, we're at a transition point - the previous dividend should keep its 
                    // frequency based on its own previous gap (prevPrevFreq), NOT get overwritten to prevFrequencyNum
                    if (prevPrevFreq !== prevFrequencyNum) {
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

        // Calculate for Regular AND Initial dividends with valid adjusted amounts
        // Initial = first dividend (no previous to compare), should still be normalized
        // Only skip Special dividends (tiny amounts paid 1-4 days after regular)
        // Must have adj_amount (not div_cash) for proper normalization after splits
        if ((pmtType === 'Regular' || pmtType === 'Initial') && amount !== null && amount > 0 && frequencyNum > 0) {
            // Calculate annualized: Amount × Frequency (DAYS column = frequency_num = payments per year)
            const annualizedRaw = amount * frequencyNum;
            // Round annualized to 2 decimals for storage/display
            annualized = Number(annualizedRaw.toFixed(2));

            // Normalized value: convert to weekly equivalent rate for line chart
            // EXACT FORMULA: NORMLZD = (ADJ_DIV × DAYS) / 52
            // Where ADJ_DIV = adj_amount, DAYS = frequency_num (payments per year)
            // IMPORTANT: Calculate from the UNROUNDED annualized value, then round result
            // Example: $4.6530 × 12 = $55.836 → $55.836 / 52 = $1.073769231
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
        // IMPORTANT: For Special dividends (small gaps), look back to last Regular dividend
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

            // SIMPLE RULE: Use gap to next Regular dividend if available, otherwise use gap to immediate next
            // This ensures frequency is based on actual dates, not complex transition logic
            // IMPORTANT: For Special dividends (small gaps <= 4 days), look back to last Regular dividend
            if (nextRegularDiv && daysToNextRegular !== null && daysToNextRegular > 4) {
                // Use gap to next Regular to determine frequency (backward confirmation rule)
                frequencyNum = getFrequencyFromDays(daysToNextRegular);
            } else if (daysToNext > 4) {
                // Use gap to immediate next dividend (backward confirmation rule)
                frequencyNum = getFrequencyFromDays(daysToNext);
            } else if (daysToNext <= 4 && lastRegular) {
                // Small gap (Special dividend): look back to last Regular dividend to determine frequency
                // This handles cases like 12/29 (Special) where gap to next is 1 day, but gap from last Regular (12/23) is 6 days = Weekly
                const currentDate2 = new Date(current.exDate);
                const lastRegularDate = new Date(lastRegular.dividend.ex_date);
                const daysFromLastRegular = Math.round((currentDate2.getTime() - lastRegularDate.getTime()) / (1000 * 60 * 60 * 24));
                if (daysFromLastRegular > 4) {
                    frequencyNum = getFrequencyFromDays(daysFromLastRegular);
                }
            }
        } else {
            // Last dividend: use gap from last Regular dividend if available, otherwise from previous
            if (lastRegular) {
                const currentDate2 = new Date(current.exDate);
                const lastRegularDate = new Date(lastRegular.dividend.ex_date);
                const daysFromLastRegular = Math.round((currentDate2.getTime() - lastRegularDate.getTime()) / (1000 * 60 * 60 * 24));
                if (daysFromLastRegular > 4) {
                    frequencyNum = getFrequencyFromDays(daysFromLastRegular);
                } else if (i > 0 && daysSincePrev !== null && daysSincePrev > 4) {
                    frequencyNum = getFrequencyFromDays(daysSincePrev);
                }
            } else if (i > 0 && daysSincePrev !== null && daysSincePrev > 4) {
                frequencyNum = getFrequencyFromDays(daysSincePrev);
            }
        }

        // Update the PREVIOUS dividend's frequency based on gap FROM previous TO current
        // This happens when we process the current dividend and can confirm the previous one's frequency
        // IMPORTANT: At frequency transition points, don't overwrite the previous dividend's frequency
        // if it was already set correctly based on gap to next
        if (i > 0 && previous !== null && daysSincePrev !== null && daysSincePrev > 4) {
            const prevFrequencyNum = getFrequencyFromDays(daysSincePrev);
            const prevResult = results[results.length - 1];

            // SIMPLE: Just update previous dividend's frequency based on gap from previous to current
            // Only update if previous dividend's frequency wasn't already set from gap to next
            if (prevResult.frequencyNum === 12 || prevResult.frequencyNum === prevFrequencyNum) {
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

        // Calculate for Regular AND Initial dividends with valid adjusted amounts
        // Initial = first dividend (no previous to compare), should still be normalized
        // Only skip Special dividends (tiny amounts paid 1-4 days after regular)
        // Must have adjAmount (not unadjusted amount) for proper normalization after splits
        if ((pmtType === 'Regular' || pmtType === 'Initial') && amount !== null && amount > 0 && frequencyNum > 0) {
            // Calculate annualized: Amount × Frequency (DAYS column = frequency_num = payments per year)
            const annualizedRaw = amount * frequencyNum;
            // Round annualized to 2 decimals for storage/display
            annualized = Number(annualizedRaw.toFixed(2));

            // Normalized value: convert to weekly equivalent rate for line chart
            // EXACT FORMULA: NORMLZD = (ADJ_DIV × DAYS) / 52
            // Where ADJ_DIV = adjAmount, DAYS = frequencyNum (payments per year)
            // IMPORTANT: Calculate from the UNROUNDED annualized value
            // Example: $4.6530 × 12 = $55.836 → $55.836 / 52 = $1.073769231
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

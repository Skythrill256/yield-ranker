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

function expectedMinGapDays(frequencyNum: number | null | undefined): number | null {
    if (!frequencyNum) return null;
    if (frequencyNum >= 52) return 5;
    if (frequencyNum >= 12) return 20;
    if (frequencyNum >= 4) return 60;
    if (frequencyNum >= 2) return 150;
    return 300;
}

function isInClearGapRange(days: number | null): boolean {
    if (days === null) return false;
    return (
        (days >= 5 && days <= 10) ||   // weekly
        (days >= 20 && days <= 40) ||  // monthly
        (days >= 60 && days <= 110) || // quarterly
        (days >= 150 && days <= 210) || // semi-annual
        (days >= 300 && days <= 380)   // annual
    );
}

function getMedianAmount(values: number[]): number | null {
    return median(values);
}

function modeFrequencyFromGaps(gaps: number[]): number | null {
    const usable = gaps.filter(g => typeof g === 'number' && isFinite(g) && g > 0).slice(-8);
    if (usable.length < 3) return null;
    const counts = new Map<number, number>();
    for (const g of usable) {
        const f = getFrequencyFromDays(g);
        counts.set(f, (counts.get(f) || 0) + 1);
    }
    let best: { f: number; count: number } | null = null;
    for (const [f, count] of counts.entries()) {
        if (!best || count > best.count) best = { f, count };
    }
    if (!best) return null;
    // Require a clear majority to avoid locking onto noise during regime changes
    return best.count >= Math.ceil(usable.length * 0.6) ? best.f : null;
}

function shouldTreatAsSpecialByCadence(
    {
        dominantFrequencyNum,
        daysSinceLastRegularLike,
        daysToNext,
        currentAmount,
        nextAmount,
        medianAmount,
        currentExDate,
    }: {
        dominantFrequencyNum: number | null;
        daysSinceLastRegularLike: number | null;
        daysToNext: number | null;
        currentAmount: number | null;
        nextAmount: number | null;
        medianAmount: number | null;
        currentExDate: string;
    }
): boolean {
    if (daysSinceLastRegularLike === null || daysSinceLastRegularLike <= 0) return false;

    // If we don't have a stable dominant cadence yet, don't be aggressive.
    if (!dominantFrequencyNum) return false;

    // Weekly regimes naturally have short gaps; special detection is handled by tiny-amount rule.
    if (dominantFrequencyNum >= 52) return false;

    // If the NEXT gap is clearly weekly, we're in (or entering) a weekly regime.
    // Do NOT force "Special" off cadence heuristics in that case; it creates chain-break false positives
    // during monthly→weekly transitions (e.g., ULTY/CC ETFs around Mar/Apr 2025).
    // One-off specials are typically 1–4 days from the adjacent regular payment, not ~7 days.
    const nextLooksWeekly = daysToNext !== null && daysToNext >= 5 && daysToNext <= 10;
    if (nextLooksWeekly) return false;

    const expectedMin = expectedMinGapDays(dominantFrequencyNum);
    if (!expectedMin) return false;

    const shortGapThreshold = Math.max(5, Math.floor(expectedMin * 0.75)); // e.g. monthly(20) => 15
    const isTooSoon = daysSinceLastRegularLike < shortGapThreshold;
    if (!isTooSoon) return false;

    // If it repeats next period (timing + amount), it's likely a real cadence change (monthly -> weekly),
    // not a one-off special distribution.
    const repeatsNextTol = nextLooksWeekly ? 0.25 : 0.06; // weekly payouts vary more; allow more wiggle
    const repeatsNext =
        daysToNext !== null &&
        daysToNext > 0 &&
        daysToNext < shortGapThreshold &&
        currentAmount !== null &&
        currentAmount > 0 &&
        nextAmount !== null &&
        nextAmount > 0 &&
        isApproximatelyEqual(currentAmount, nextAmount, repeatsNextTol); // allow modest variation
    if (repeatsNext) return false;

    // If amount is an outlier vs recent regular median, classify special.
    if (medianAmount !== null && medianAmount > 0 && currentAmount !== null && currentAmount > 0) {
        const deviationRel = Math.abs(currentAmount - medianAmount) / Math.max(medianAmount, 1e-9);
        if (deviationRel >= 0.12) return true; // 12%+ divergence
    }

    // Year-end extra distributions (often cap-gains): if it's "too soon" for the dominant cadence,
    // treat as special even when amount isn't wildly different.
    const dt = new Date(currentExDate);
    if (!isNaN(dt.getTime()) && dt.getMonth() === 11) return true; // December

    // Otherwise be conservative and do not force special without an amount signal.
    return false;
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
    // CEF-only: optional split for “Regular + Special” combined payments (e.g., year-end cap gains)
    regular_component: number | null;
    special_component: number | null;
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
    // Quarterly CEFs can show larger gaps than “~90 days” (e.g. Jan→Apr→Jul→Nov is ~120 days),
    // so we treat 46–149 as Quarterly to avoid misclassifying true quarterly payers as Semi-Annual.
    // This mirrors the more forgiving ranges in `getFrequencyFromDays()` used elsewhere.
    if (days >= 46 && days <= 149) return { label: 'Quarterly', frequencyNum: 4 };
    if (days >= 150 && days <= 249) return { label: 'Semi-Annual', frequencyNum: 2 };
    if (days >= 250 && days <= 400) return { label: 'Annual', frequencyNum: 1 };
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

        const nextAmount = next
            ? ((next.adj_amount !== null && next.adj_amount > 0) ? Number(next.adj_amount) : (next.div_cash > 0 ? Number(next.div_cash) : 0))
            : null;

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
        // Date-only rules (e.g. "1–4 days after previous") create false positives for
        // weekly payers, holiday shifts, and cadence transitions. Specials are primarily amount-driven.
        let pmtType: 'Regular' | 'Special' | 'Initial' = 'Regular';
        if (daysSincePrev === null) {
            pmtType = 'Initial';
        } else if (medianAmount !== null && medianAmount > 0 && amount > 0) {
            const amountStable = isApproximatelyEqual(amount, medianAmount, amountStabilityRelTol);

            // Guardrail: If a “spike” repeats in the next payment(s), it’s usually a REGULAR step-change,
            // not a special one-off (e.g., SRV’s persistent 0.45 monthly distributions).
            // We use a looser tolerance here because fund distributions can vary a bit month to month.
            const repeatsNext = nextAmount !== null && nextAmount > 0 && isApproximatelyEqual(amount, nextAmount, 0.06);
            const deviationRel = Math.abs(amount - medianAmount) / Math.max(medianAmount, 1e-9);

            // Rule 1 — Amount spike vs median (one-off)
            if (!repeatsNext && amount > specialMultiplier * medianAmount) {
                pmtType = 'Special';
            }

            // Rule 2: one-off outlier (higher OR lower) vs recent median
            if (pmtType !== 'Special' && !repeatsNext && !amountStable && deviationRel >= 0.25) {
                pmtType = 'Special';
            }

            // Rule 3 — Round-number specials (one-off)
            if (pmtType !== 'Special' && !repeatsNext && isRoundNumberSpecial(amount) && amount > roundNumberMultiplier * medianAmount) {
                pmtType = 'Special';
            }
        }

        // CRITICAL: Override frequency for Special dividends
        // Specials should NEVER show as "Annual", "Monthly", etc. - they're one-time events
        // Force frequency_num = 1 and frequency_label = 'Irregular' for all Specials
        if (pmtType === 'Special') {
            frequencyNum = 1;
            frequencyLabel = 'Irregular';
        }

        // Step 5: If Special, optionally split into (regular_component + special_component).
        // NOTE: This does NOT create a second database row (unique constraint on ticker+ex_date).
        // Instead we store the components for display/analysis.
        let regularComponent: number | null = null;
        let specialComponent: number | null = null;

        if (pmtType === 'Special' && medianAmount !== null && medianAmount > 0 && amount > 0) {
            // Positive special (spike): split using the established regular cadence amount as baseline.
            // Negative “specials” (one-off low payment): do not invent a larger regular component than paid.
            if (amount >= medianAmount) {
                regularComponent = Number(medianAmount);
                specialComponent = Number(Math.max(0, amount - medianAmount));
            } else {
                regularComponent = Number(amount);
                specialComponent = 0;
            }
        } else if (amount > 0) {
            // Non-special: entire amount is regular component
            regularComponent = Number(amount);
            specialComponent = 0;
        }

        // Step 6: Annualized/Normalized for CEFs
        // Annualized = (per-payment amount) × (payments per year)
        // Normalized (for CEFs) = per-payment amount for the detected cadence (i.e., annualized / frequency_num)
        //
        // This matches product expectation:
        // - Monthly: normalized = monthly payment amount (e.g., 0.25)
        // - Weekly: normalized = weekly payment amount (e.g., 0.1098)
        //
        // For Special: normalize/annualize ONLY the regular component (run-rate), not the special spike.
        let annualized: number | null = null;
        let normalizedDiv: number | null = null;

        const annualizeBase =
            pmtType === 'Special'
                ? (regularComponent !== null && regularComponent > 0 ? regularComponent : null)
                : (amount > 0 ? amount : null);

        if (annualizeBase !== null && frequencyNum !== null && frequencyNum > 0) {
            const annualizedRaw = annualizeBase * frequencyNum;
            annualized = Number(annualizedRaw.toFixed(6));
            // Per-payment normalized value for CEFs
            normalizedDiv = Number((annualizedRaw / frequencyNum).toFixed(6)); // == annualizeBase
        }

        results.push({
            id: current.id,
            days_since_prev: daysSincePrev,
            pmt_type: pmtType,
            // Keep cadence frequency even for specials (e.g., BST cap-gains paid on monthly schedule)
            frequency_num: frequencyNum,
            frequency_label: frequencyLabel,
            annualized,
            normalized_div: normalizedDiv,
            regular_component: regularComponent,
            special_component: specialComponent,
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
    const sortedDividends = [...dividends].sort((a, b) => new Date(a.ex_date).getTime() - new Date(b.ex_date).getTime());

    // PASS 1: classify payment types using rolling history (so specials don't distort cadence inference)
    const types: Array<'Regular' | 'Special' | 'Initial'> = [];
    const rollingRegularAmounts: number[] = [];
    const rollingRegularGaps: number[] = []; // gaps between regular-like dividends (non-special)
    let lastRegularLikeIndex: number | null = null;

    for (let i = 0; i < sortedDividends.length; i++) {
        const current = sortedDividends[i];
        const prev = i > 0 ? sortedDividends[i - 1] : null;
        const next = i < sortedDividends.length - 1 ? sortedDividends[i + 1] : null;

        const currentDate = new Date(current.ex_date);
        const prevDate = prev ? new Date(prev.ex_date) : null;

        const daysSincePrev = prevDate ? Math.round((currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24)) : null;

        const lastReg = lastRegularLikeIndex !== null ? sortedDividends[lastRegularLikeIndex] : null;
        const lastRegDate = lastReg ? new Date(lastReg.ex_date) : null;
        const daysSinceLastRegularLike =
            lastRegDate ? Math.round((currentDate.getTime() - lastRegDate.getTime()) / (1000 * 60 * 60 * 24)) : null;

        const nextDate = next ? new Date(next.ex_date) : null;
        const daysToNext = nextDate ? Math.round((nextDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24)) : null;

        const currentAmount = (current.adj_amount ?? current.div_cash) || 0;
        const nextAmount = next ? ((next.adj_amount ?? next.div_cash) || 0) : null;

        if (daysSincePrev === null) {
            // If the very first row is a tiny "stub" payment right before a much larger one,
            // treat it as Special (not Initial) so it doesn't distort cadence and doesn't cause
            // the next payment to be mislabeled as Special.
            if (
                currentAmount > 0 &&
                nextAmount !== null &&
                nextAmount > 0 &&
                daysToNext !== null &&
                daysToNext >= 1 &&
                daysToNext <= 4 &&
                (currentAmount / nextAmount) < 0.01
            ) {
                types.push('Special');
                continue;
            }

            types.push('Initial');
            lastRegularLikeIndex = i;
            if (currentAmount > 0) rollingRegularAmounts.push(Number(currentAmount));
            continue;
        }

        // Existing "tiny special right before regular" rule (ULTY-type cases)
        if (
            currentAmount > 0 &&
            nextAmount !== null &&
            nextAmount > 0 &&
            daysToNext !== null &&
            daysToNext >= 1 &&
            daysToNext <= 4 &&
            (currentAmount / nextAmount) < 0.01
        ) {
            types.push('Special');
            continue;
        }

        const dominantFrequencyNum =
            modeFrequencyFromGaps(rollingRegularGaps) ??
            (rollingRegularGaps.length > 0 ? getFrequencyFromDays(rollingRegularGaps[rollingRegularGaps.length - 1]!) : null);
        const medianAmount = getMedianAmount(rollingRegularAmounts.slice(-6));

        const cadenceSpecial = shouldTreatAsSpecialByCadence({
            dominantFrequencyNum,
            daysSinceLastRegularLike: daysSinceLastRegularLike ?? daysSincePrev,
            daysToNext,
            currentAmount,
            nextAmount,
            medianAmount,
            currentExDate: current.ex_date,
        });

        if (cadenceSpecial) {
            types.push('Special');
            continue;
        }

        // NOTE: We intentionally do NOT tag "Special" purely because the gap is 1–4 days.
        // That heuristic creates false positives for holiday shifts and cadence transitions.
        // Specials are handled by (a) tiny-stub rule and (b) cadence+amount checks above.

        types.push('Regular');
        // Update rolling history only for non-special dividends
        if (currentAmount > 0) rollingRegularAmounts.push(Number(currentAmount));
        if (lastRegularLikeIndex !== null) {
            const gap = daysSinceLastRegularLike;
            if (gap !== null && gap > 0) rollingRegularGaps.push(gap);
        }
        lastRegularLikeIndex = i;
    }

    // PASS 2: compute frequency using "next non-special" for confirmation, with transition guard:
    // if the current dividend has a clear look-back gap, keep that frequency (prevents regime-change overwrites).
    const results: NormalizedDividend[] = [];

    const nextNonSpecialIndex = (fromIndex: number): number | null => {
        for (let j = fromIndex + 1; j < sortedDividends.length; j++) {
            if (types[j] !== 'Special') return j;
        }
        return null;
    };
    const prevNonSpecialIndex = (fromIndex: number): number | null => {
        for (let j = fromIndex - 1; j >= 0; j--) {
            if (types[j] !== 'Special') return j;
        }
        return null;
    };

    for (let i = 0; i < sortedDividends.length; i++) {
        const current = sortedDividends[i];
        const prev = i > 0 ? sortedDividends[i - 1] : null;
        const currentDate = new Date(current.ex_date);
        const prevDate = prev ? new Date(prev.ex_date) : null;

        const daysSincePrev =
            prevDate ? Math.round((currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24)) : null;

        const pmtType = types[i];

        let frequencyNum = 12; // default
        const lookbackClear = isInClearGapRange(daysSincePrev);

        if (pmtType !== 'Special' && lookbackClear && daysSincePrev !== null) {
            // Transition guard: trust the dividend's own look-back when it's clearly weekly/monthly/quarterly/etc.
            frequencyNum = getFrequencyFromDays(daysSincePrev);
        } else {
            const nextIdx = nextNonSpecialIndex(i);
            if (nextIdx !== null) {
                const nextDate = new Date(sortedDividends[nextIdx].ex_date);
                const gapToNextNonSpecial = Math.round((nextDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
                if (gapToNextNonSpecial > 0) {
                    frequencyNum = getFrequencyFromDays(gapToNextNonSpecial);
                }
            } else {
                const prevIdx = prevNonSpecialIndex(i);
                if (prevIdx !== null) {
                    const prevNSDate = new Date(sortedDividends[prevIdx].ex_date);
                    const gapFromPrevNonSpecial = Math.round((currentDate.getTime() - prevNSDate.getTime()) / (1000 * 60 * 60 * 24));
                    if (gapFromPrevNonSpecial > 0) {
                        frequencyNum = getFrequencyFromDays(gapFromPrevNonSpecial);
                    }
                } else if (daysSincePrev !== null && daysSincePrev > 0) {
                    frequencyNum = getFrequencyFromDays(daysSincePrev);
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

    // Re-use the ETF normalization logic by mapping into DividendInput and then mapping back.
    // Note: this preserves the improved Special handling (e.g., year-end extra distributions).
    const mapped: DividendInput[] = dividends.map((d, idx) => ({
        id: idx,
        ticker: '',
        ex_date: d.exDate,
        div_cash: d.amount,
        adj_amount: Number.isFinite(d.adjAmount) ? d.adjAmount : null,
    }));

    const normalizedAsc = calculateNormalizedDividends(mapped); // sorted ascending by ex_date
    const idToExDate = new Map<number, string>();
    mapped.forEach(m => idToExDate.set(m.id, m.ex_date));
    const byExDate = new Map<string, NormalizedDividend>();
    normalizedAsc.forEach(n => {
        // In practice ex_date is unique per ticker; use date key.
        const ex = idToExDate.get(n.id);
        if (ex) byExDate.set(ex, n);
    });

    // Return in descending order (to match dividends endpoint)
    const sortedDesc = [...dividends].sort((a, b) => new Date(b.exDate).getTime() - new Date(a.exDate).getTime());
    return sortedDesc.map((d) => {
        const n = byExDate.get(d.exDate);
        return {
            pmtType: (n?.pmt_type ?? 'Regular') as 'Regular' | 'Special' | 'Initial',
            frequencyNum: n?.frequency_num ?? 12,
            daysSincePrev: n?.days_since_prev ?? null,
            annualized: n?.annualized ?? null,
            normalizedDiv: n?.normalized_div ?? null,
        };
    });
}

export default {
    calculateNormalizedDividends,
    calculateNormalizedForResponse,
    getFrequencyFromDays,
    getPaymentType,
};

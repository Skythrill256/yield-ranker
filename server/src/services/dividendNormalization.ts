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
  pmt_type: "Regular" | "Special" | "Initial";
  frequency_num: number;
  annualized: number | null;
  normalized_div: number | null;
}

function expectedMinGapDays(
  frequencyNum: number | null | undefined
): number | null {
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
    (days >= 5 && days <= 10) || // weekly
    (days >= 20 && days <= 40) || // monthly
    (days >= 60 && days <= 110) || // quarterly
    (days >= 150 && days <= 210) || // semi-annual
    (days >= 300 && days <= 380) // annual
  );
}

function getMedianAmount(values: number[]): number | null {
  return median(values);
}

function modeFrequencyFromGaps(gaps: number[]): number | null {
  const usable = gaps
    .filter((g) => typeof g === "number" && isFinite(g) && g > 0)
    .slice(-8);
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

function shouldTreatAsSpecialByCadence({
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
}): boolean {
  if (daysSinceLastRegularLike === null || daysSinceLastRegularLike <= 0)
    return false;

  // If we don't have a stable dominant cadence yet, don't be aggressive.
  if (!dominantFrequencyNum) return false;

  // Weekly regimes naturally have short gaps; special detection is handled by tiny-amount rule.
  if (dominantFrequencyNum >= 52) return false;

  // If the NEXT gap is clearly weekly, we're in (or entering) a weekly regime.
  // Do NOT force "Special" off cadence heuristics in that case; it creates chain-break false positives
  // during monthly→weekly transitions (e.g., ULTY/CC ETFs around Mar/Apr 2025).
  // One-off specials are typically 1–4 days from the adjacent regular payment, not ~7 days.
  const nextLooksWeekly =
    daysToNext !== null && daysToNext >= 5 && daysToNext <= 10;
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
  if (
    medianAmount !== null &&
    medianAmount > 0 &&
    currentAmount !== null &&
    currentAmount > 0
  ) {
    const deviationRel =
      Math.abs(currentAmount - medianAmount) / Math.max(medianAmount, 1e-9);
    if (deviationRel >= 0.12) return true; // 12%+ divergence
  }

  // REMOVED: Automatic December special detection
  // For EOD processing, December dividends should be treated as Regular unless there's a clear special signal
  // (e.g., second December payment, extreme amount difference). The CEF-specific December rules handle this.

  // Otherwise be conservative and do not force special without an amount signal.
  return false;
}

// ============================================================================
// CEF-Specific Normalization (Frequency + Special detection)
// ============================================================================

export type CEFDividendFrequencyLabel =
  | "Weekly"
  | "Monthly"
  | "Quarterly"
  | "Semi-Annual"
  | "Annual"
  | "Irregular";

export interface NormalizedDividendCEF {
  id: number;
  days_since_prev: number | null;
  pmt_type: "Regular" | "Special" | "Initial";
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
 * 5–10         Weekly
 * 20–45        Monthly
 * 46–100       Quarterly
 * 101–200      Semiannual
 * 201–400      Annual
 * > 400        Irregular / Special
 */
export function getCEFFrequencyFromDays(days: number): {
  label: CEFDividendFrequencyLabel;
  frequencyNum: number | null;
} {
  if (!isFinite(days) || days <= 0)
    return { label: "Irregular", frequencyNum: null };

  // Weekly is intentionally narrow to avoid year-end clustering (e.g., 11–13 day gaps)
  // being misclassified as a weekly regime.
  if (days >= 5 && days <= 10) return { label: "Weekly", frequencyNum: 52 };
  if (days >= 20 && days <= 45) return { label: "Monthly", frequencyNum: 12 };
  // Quarterly CEFs can show larger gaps than “~90 days” (e.g. Jan→Apr→Jul→Nov is ~120 days),
  // so we treat 46–149 as Quarterly to avoid misclassifying true quarterly payers as Semi-Annual.
  // This mirrors the more forgiving ranges in `getFrequencyFromDays()` used elsewhere.
  if (days >= 46 && days <= 149) return { label: "Quarterly", frequencyNum: 4 };
  if (days >= 150 && days <= 249)
    return { label: "Semi-Annual", frequencyNum: 2 };
  if (days >= 250 && days <= 400) return { label: "Annual", frequencyNum: 1 };
  if (days > 400) return { label: "Irregular", frequencyNum: null };

  // Gaps outside known ranges (e.g. 14–19, 1–4) start as "Irregular" and may be overridden by history rules
  return { label: "Irregular", frequencyNum: null };
}

function median(values: number[]): number | null {
  const nums = values
    .filter((v) => typeof v === "number" && isFinite(v) && v > 0)
    .sort((a, b) => a - b);
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
  return rounds.some((r) => Math.abs(rounded - r) < 1e-9);
}

function determinePatternFrequencyLabel(
  recentGapsToNext: number[]
): CEFDividendFrequencyLabel | null {
  // Use the last 3–6 gaps (to next) of NON-special dividends to infer a "dominant" frequency
  const labels = recentGapsToNext
    .filter((d) => typeof d === "number" && isFinite(d) && d > 0)
    .slice(-6)
    .map((d) => getCEFFrequencyFromDays(d).label)
    .filter((l) => l !== "Irregular");

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
 * Compute the expected ex-dividend day-of-month range based on historical patterns.
 * Returns [minDay, maxDay] representing the typical calendar days for dividend ex-dates.
 * Used for off-cadence detection: if current day falls outside this range, it's off-cadence.
 */
function computeExpectedDayOfMonthRange(
  recentExDates: string[]
): { minDay: number; maxDay: number } | null {
  const daysOfMonth = recentExDates
    .map((d) => {
      const date = new Date(d);
      return !isNaN(date.getTime()) ? date.getDate() : NaN;
    })
    .filter((d) => !isNaN(d) && d >= 1 && d <= 31);

  if (daysOfMonth.length < 3) return null;

  const sorted = [...daysOfMonth].sort((a, b) => a - b);
  const minDay = sorted[0];
  const maxDay = sorted[sorted.length - 1];

  // Add tolerance of ±2 days for holiday shifts
  return {
    minDay: Math.max(1, minDay - 2),
    maxDay: Math.min(31, maxDay + 2),
  };
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
    specialMultiplier?: number; // Rule 1
    roundNumberMultiplier?: number; // Rule 3
    amountStabilityRelTol?: number; // "unchanged" threshold
  }
): NormalizedDividendCEF[] {
  // "Golden logic": only call something Special on a very strong amount signal by default (>= 230% of median).
  // Lowered from 2.5× to 2.3× to catch borderline cases like BSTZ 12/22/25 ($0.517 = 2.37× median)
  const specialMultiplier = options?.specialMultiplier ?? 2.3;
  const roundNumberMultiplier = options?.roundNumberMultiplier ?? 1.5;
  const amountStabilityRelTol = options?.amountStabilityRelTol ?? 0.02; // 2% default

  if (!dividends || dividends.length === 0) return [];

  // Ensure oldest -> newest
  const sorted = [...dividends].sort((a, b) =>
    a.ex_date.localeCompare(b.ex_date)
  );

  const results: NormalizedDividendCEF[] = [];

  // Rolling history of "regular-like" amounts and gaps (we exclude specials once detected)
  const rollingRegularAmounts: number[] = [];
  const rollingRegularGapsToNext: number[] = [];
  const rollingRegularExDates: string[] = []; // Track ex-dates for day-of-month calculation

  // Track newest regular frequency as we process dividends (for normalized calculation)
  let newestRegularFrequency: number | null = null;

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    const prev = i > 0 ? sorted[i - 1] : null;
    const next = i < sorted.length - 1 ? sorted[i + 1] : null;

    const currentDate = new Date(current.ex_date);
    const prevDate = prev ? new Date(prev.ex_date) : null;
    const nextDate = next ? new Date(next.ex_date) : null;

    const daysSincePrev = prevDate
      ? Math.round(
        (currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24)
      )
      : null;

    // GOLDEN LOGIC: CEF cadence should be based on the *look-back* gap (ex-date to previous ex-date).
    // Using look-ahead (to next) can misclassify December clusters where a regular payment is followed
    // by a special just a few days later (e.g., DJIA/BST/SPE).
    const daysToNext = nextDate
      ? Math.round(
        (nextDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24)
      )
      : null;

    const gapDays =
      daysSincePrev !== null && daysSincePrev > 0
        ? daysSincePrev
        : daysToNext !== null && daysToNext > 0
          ? daysToNext
          : 0;

    const amount =
      current.adj_amount !== null && current.adj_amount > 0
        ? Number(current.adj_amount)
        : current.div_cash > 0
          ? Number(current.div_cash)
          : 0;

    const prevAmount = prev
      ? prev.adj_amount !== null && prev.adj_amount > 0
        ? Number(prev.adj_amount)
        : prev.div_cash > 0
          ? Number(prev.div_cash)
          : 0
      : null;

    const nextAmount = next
      ? next.adj_amount !== null && next.adj_amount > 0
        ? Number(next.adj_amount)
        : next.div_cash > 0
          ? Number(next.div_cash)
          : 0
      : null;

    // Get next 2 payments for lookahead check (for MDP funds)
    const next2 = i < sorted.length - 2 ? sorted[i + 2] : null;
    const next2Amount = next2
      ? next2.adj_amount !== null && next2.adj_amount > 0
        ? Number(next2.adj_amount)
        : next2.div_cash > 0
          ? Number(next2.div_cash)
          : 0
      : null;

    const medianAmount = median(rollingRegularAmounts.slice(-12));

    // Step 1: Strict frequency from gap table (initial classification)
    const raw = getCEFFrequencyFromDays(gapDays);
    let frequencyLabel: CEFDividendFrequencyLabel = raw.label;
    let frequencyNum: number | null = raw.frequencyNum;

    // Step 2: If amount is stable (matches historical pattern), use dominant historical frequency
    // CRITICAL: When amount is unchanged across dividends, they should have CONSISTENT frequency
    // This prevents frequency jumping (Monthly → Quarterly → Semi-Annual) when gaps vary but amount stays same
    const amountStable =
      medianAmount !== null &&
      amount > 0 &&
      isApproximatelyEqual(amount, medianAmount, amountStabilityRelTol);
    
    // Also check if amount is "reasonably close" (within 15%) for year-end adjustments
    // This handles cases like NIE where $0.526 is a small adjustment from $0.50 regular quarterly
    const amountReasonablyClose =
      medianAmount !== null &&
      amount > 0 &&
      medianAmount > 0 &&
      Math.abs(amount - medianAmount) / medianAmount <= 0.15; // 15% tolerance for small adjustments
    
    if ((amountStable || amountReasonablyClose) && rollingRegularGapsToNext.length >= 3) {
      const historicalPattern = determinePatternFrequencyLabel(
        rollingRegularGapsToNext
      );
      if (historicalPattern && historicalPattern !== "Irregular") {
        // Override gap-based frequency with historical pattern when amount is stable or reasonably close
        // This ensures all $0.50 quarterly dividends get Quarterly frequency, even if gap is off-cadence (e.g., 18 days)
        frequencyLabel = historicalPattern;
        frequencyNum =
          historicalPattern === "Weekly"
            ? 52
            : historicalPattern === "Monthly"
              ? 12
              : historicalPattern === "Quarterly"
                ? 4
                : historicalPattern === "Semi-Annual"
                  ? 2
                  : historicalPattern === "Annual"
                    ? 1
                    : null;
      }
    }

    // Step 3: History-based holiday adjustment for ambiguous short gaps (14–19)
    // If amount is unchanged and the prior 3–6 dividends were monthly/weekly, treat as holiday-adjusted.
    if (
      frequencyLabel === "Irregular" &&
      gapDays >= 14 &&
      gapDays <= 19 &&
      medianAmount !== null &&
      amount > 0
    ) {
      const pattern = determinePatternFrequencyLabel(rollingRegularGapsToNext);
      const amountStableForHoliday = isApproximatelyEqual(
        amount,
        medianAmount,
        amountStabilityRelTol
      );
      if (
        amountStableForHoliday &&
        (pattern === "Monthly" || pattern === "Weekly")
      ) {
        frequencyLabel = pattern;
        frequencyNum = pattern === "Monthly" ? 12 : 52;
      }
    }

    // Step 4: Special detection (Golden logic)
    // Priority 1: Cadence is the look-back gap (gapDays).
    // Priority 2: If amount is exactly the same as previous payment, it MUST be Regular.
    // Priority 3: Special priority for year-end clustering:
    // - If it's OFF-CADENCE for the dominant pattern AND amount is a meaningful spike AND it doesn't repeat -> Special.
    // - If it's an extreme spike (>= specialMultiplier, default 3x) and doesn't repeat -> Special.
    // - December dividends with amount different from regular pattern -> Special
    let pmtType: "Regular" | "Special" | "Initial" = "Regular";
    if (daysSincePrev === null) {
      pmtType = "Initial";
    } else if (amount > 0) {
      const currentDate = new Date(current.ex_date);
      const isDecember =
        !isNaN(currentDate.getTime()) && currentDate.getMonth() === 11; // month 11 = December
      const isJanuary =
        !isNaN(currentDate.getTime()) && currentDate.getMonth() === 0; // month 0 = January

      // CRITICAL: Check for extreme spikes (250%+ rule) WITH cadence check
      // Per user requirement: Special requires BOTH off-cadence AND > 2.5× median
      // On-cadence extreme spikes should remain Regular
      if (medianAmount !== null && medianAmount > 0) {
        const isExtremeSpike = amount >= specialMultiplier * medianAmount; // default 2.5x (250%)
        if (isExtremeSpike) {
          // Check if off-cadence using GAP-DAYS (not day-of-month)
          // For monthly payers: gap should be 20-35 days. If gap < 20 or > 35, it's off-cadence
          let isOffCadenceForSpike = false;
          if (daysSincePrev !== null && daysSincePrev > 0) {
            isOffCadenceForSpike = daysSincePrev < 20 || daysSincePrev > 35;
          }

          // For extreme spikes (250%+), ONLY mark as Special if ALSO off-cadence
          // This ensures on-cadence extreme spikes remain Regular per user requirement
          const repeatsNext =
            nextAmount !== null &&
            nextAmount > 0 &&
            isApproximatelyEqual(amount, nextAmount, 0.05);

          if (!repeatsNext && isOffCadenceForSpike) {
            pmtType = "Special";
          }
        }
      }

      // NEW COMBINED RULE: Off-cadence + > 2.5× median of last 12 (for BUI/BST/NIE/BDJ type CEFs)
      // User Requirement: Mark as Special if BOTH conditions are true:
      // 1. Gap days is NOT within the monthly range (20-35 days)
      // 2. Dividend amount is > 2.5× the median of the last 12 dividends
      if (pmtType !== "Special") {
        // Check if off-cadence using GAP-DAYS (not day-of-month)
        // For monthly payers: gap should be 20-35 days. If gap < 20 or > 35, it's off-cadence
        let isOffCadence = false;
        if (daysSincePrev !== null && daysSincePrev > 0) {
          // Check if gap is outside monthly range (20-35 days)
          // This works for any frequency pattern, not just when dominantLabel is "Monthly"
          isOffCadence = daysSincePrev < 20 || daysSincePrev > 35;
        }

        // Check if amount > 2.5× median of last 12
        const isExtremeSpikeVsLast12 =
          medianAmount !== null &&
          medianAmount > 0 &&
          amount > specialMultiplier * medianAmount;

        // Debug logging
        if (process.env.DEBUG_DIVIDEND_NORMALIZATION === 'true') {
          console.log(`[DEBUG] ${current.ticker} ${current.ex_date}:`);
          console.log(`  - daysSincePrev: ${daysSincePrev}`);
          console.log(`  - isOffCadence (gap-days < 20 or > 35): ${isOffCadence}`);
          console.log(`  - medianLast12: ${medianAmount?.toFixed(4)}`);
          console.log(`  - amount: ${amount.toFixed(4)}`);
          console.log(`  - ${specialMultiplier}× median: ${(medianAmount ? medianAmount * specialMultiplier : 0).toFixed(4)}`);
          console.log(`  - isExtremeSpikeVsLast12 (> ${specialMultiplier}×): ${isExtremeSpikeVsLast12}`);
          console.log(`  - BOTH conditions met: ${isOffCadence && isExtremeSpikeVsLast12}`);
        }

        // Apply combined rule: BOTH off-cadence AND > 2.5× median_last_12
        if (isOffCadence && isExtremeSpikeVsLast12) {
          const repeatsNext =
            nextAmount !== null &&
            nextAmount > 0 &&
            isApproximatelyEqual(amount, nextAmount, 0.05);

          if (!repeatsNext) {
            pmtType = "Special";
            if (process.env.DEBUG_DIVIDEND_NORMALIZATION === 'true') {
              console.log(`  => MARKED AS SPECIAL (off-cadence + > ${specialMultiplier}× median of last 12)`);
            }
          }
        }
      }

      // Priority 2: exact same amount as previous => Regular (even if gap is a bit off)
      // BUT: Don't override if we already detected an extreme spike
      // BUT: Don't apply this rule for very short gaps (1-4 days) - those are likely clustered payments
      //      which should be handled by the clustered payment rule below (checking lookahead)
      // CRITICAL: This must override December and other rules if amount matches previous
      // This prevents back-to-back specials when amounts are the same (e.g., 12/29/09 and 12/3/09 both $0.0525)
      let amountMatchesPrevious = false;
      const isClusteredGap = daysSincePrev !== null && daysSincePrev >= 1 && daysSincePrev <= 4;
      if (pmtType !== "Special" && prevAmount !== null && prevAmount > 0 && !isClusteredGap) {
        // For non-clustered gaps, same amount = Regular
        const a = Number(amount.toFixed(6));
        const b = Number(prevAmount.toFixed(6));
        if (a === b) {
          pmtType = "Regular";
          amountMatchesPrevious = true; // Flag to skip other special detection rules
        }
      }

      // January override: Early January payments that match next payments are Regular (for MDP funds)
      // This MUST run before clustered payments rule to catch January payments close to December
      // This handles MDP funds where January represents a new regular rate for the year
      if (
        !amountMatchesPrevious &&
        isJanuary &&
        daysSincePrev !== null &&
        daysSincePrev >= 1 &&
        daysSincePrev <= 35 // Allow up to 35 days (covers early January payments)
      ) {
        // Check if amount matches next 2 payments (lookahead for MDP funds)
        const matchesNext2 =
          (nextAmount !== null &&
            nextAmount > 0 &&
            isApproximatelyEqual(amount, nextAmount, amountStabilityRelTol)) ||
          (next2Amount !== null &&
            next2Amount > 0 &&
            isApproximatelyEqual(amount, next2Amount, amountStabilityRelTol));

        if (matchesNext2) {
          // January amount matches next payments → Regular (new rate for the year)
          // This handles cases like ASGI where $0.1600 is the new regular rate for early 2024
          pmtType = "Regular";
          amountMatchesPrevious = true; // Flag to prevent other rules from overriding
        } else if (medianAmount !== null && medianAmount > 0) {
          // If next payments don't match, check if it's a reasonable amount (not a huge spike)
          // For January, be lenient - only mark as Special if it's clearly a spike (>= 3x median)
          // This handles cases where next payments don't exist yet or are different
          const isExtremeSpike = amount >= specialMultiplier * medianAmount; // default 2.5x (250%)
          if (!isExtremeSpike) {
            // January payment with reasonable amount → Regular (likely new rate for the year)
            // This handles ASGI where $0.1600 is new rate but next payments might not exist yet
            pmtType = "Regular";
            amountMatchesPrevious = true; // Flag to prevent other rules from overriding
          }
          // If it IS an extreme spike, let other rules handle it (don't override)
        }
      }

      // Clustered payments (1–4 days) are Special UNLESS amount matches recent regular pattern OR next payments (lookahead)
      // For EOD: If amount matches recent pattern or next payments, it's Regular even if 1-4 days apart
      // This handles cases like ASGI where January payment is close to December but matches regular pattern (MDP funds)
      // BUT: Skip this rule for January payments (already handled by January override)
      if (
        pmtType !== "Special" &&
        !isJanuary && // Skip for January payments (already handled by January override)
        daysSincePrev !== null &&
        daysSincePrev >= 1 &&
        daysSincePrev <= 4
      ) {
        // Check if amount matches next 2 payments first (lookahead for MDP funds)
        const matchesNext2 =
          (nextAmount !== null &&
            nextAmount > 0 &&
            isApproximatelyEqual(amount, nextAmount, amountStabilityRelTol)) ||
          (next2Amount !== null &&
            next2Amount > 0 &&
            isApproximatelyEqual(amount, next2Amount, amountStabilityRelTol));

        if (matchesNext2) {
          // Amount matches next payments → Regular (even if 1-4 days apart)
          // This handles MDP funds where amount increases (e.g., ASGI $0.1600 in early 2024)
          pmtType = "Regular";
        } else {
          // Check if amount matches recent regular pattern before marking as Special
          const recentAmounts = rollingRegularAmounts.slice(-3); // Last 3 regular amounts
          const recentMedian = median(recentAmounts);

          if (
            recentMedian !== null &&
            recentMedian > 0 &&
            recentAmounts.length >= 2
          ) {
            const matchesRecent = isApproximatelyEqual(
              amount,
              recentMedian,
              amountStabilityRelTol
            );
            if (matchesRecent) {
              // Amount matches recent pattern → Regular (even if 1-4 days apart)
              // This handles cases where payment timing is close but amount is regular
              pmtType = "Regular";
            } else {
              // Amount doesn't match recent pattern → Special
              pmtType = "Special";
            }
          } else {
            // No recent pattern to compare → mark as Special (conservative approach)
            pmtType = "Special";
          }
        }
      }

      // December override: Rules for December dividends
      // UPDATED per user requirement: December dividends follow the same BOTH conditions rule:
      // 1. Off-cadence (outside 20-35 day range for monthly payers)
      // 2. Amount > 2.5× median
      // Special case: Second (or later) December dividend in same year -> Special (regardless of cadence)
      //               because it's inherently off-cadence (two dividends in one month)
      // BUT: Skip if amount matches previous (already handled above to prevent back-to-back specials)
      if (!amountMatchesPrevious && isDecember) {
        const currentYear = currentDate.getFullYear();

        // Rule 1: Check if this is a second (or later) December dividend in the same year
        // Second December dividend is inherently off-cadence AND likely a special distribution
        const decemberDividendsThisYear = sorted
          .slice(0, i + 1)
          .filter((d) => {
            const dDate = new Date(d.ex_date);
            return (
              !isNaN(dDate.getTime()) &&
              dDate.getFullYear() === currentYear &&
              dDate.getMonth() === 11
            );
          })
          .sort((a, b) => a.ex_date.localeCompare(b.ex_date));

        if (decemberDividendsThisYear.length > 1) {
          const firstDecember = decemberDividendsThisYear[0];
          if (current.ex_date !== firstDecember.ex_date) {
            // Second December dividend is inherently off-cadence
            // Check if also > 2.5× median to match user requirement
            const isExtremeSpikeForDec =
              medianAmount !== null &&
              medianAmount > 0 &&
              amount > specialMultiplier * medianAmount;

            if (isExtremeSpikeForDec) {
              const repeatsNext =
                nextAmount !== null &&
                nextAmount > 0 &&
                isApproximatelyEqual(amount, nextAmount, 0.05);

              if (!repeatsNext) {
                pmtType = "Special";
              }
            }
          }
        }

        // Rule 2: For first December dividend, apply the standard combined rule
        // Check if off-cadence AND > 2.5× median
        if (pmtType !== "Special" && medianAmount !== null && medianAmount > 0) {
          // Check if off-cadence using GAP-DAYS (not day-of-month)
          // For monthly payers: gap should be 20-35 days. If gap < 20 or > 35, it's off-cadence
          let isOffCadenceForDec = false;
          if (daysSincePrev !== null && daysSincePrev > 0) {
            isOffCadenceForDec = daysSincePrev < 20 || daysSincePrev > 35;
          }

          const isExtremeSpikeForDec = amount > specialMultiplier * medianAmount;

          // BOTH conditions required: off-cadence AND > 2.5× median
          if (isOffCadenceForDec && isExtremeSpikeForDec) {
            const repeatsNext =
              nextAmount !== null &&
              nextAmount > 0 &&
              isApproximatelyEqual(amount, nextAmount, 0.05);

            if (!repeatsNext) {
              pmtType = "Special";
            }
          }
        }
      }

      // Spike after repetition: If amount has been stable/repeating, then a different amount appears -> Special
      // UPDATED per user requirement: ONLY mark as Special if BOTH:
      // 1. Off-cadence (outside 20-35 day range for monthly payers)
      // 2. Amount > 2.5× median (specialMultiplier)
      // This catches cases like STK/CSQ year-end specials while respecting the combined requirement
      // BUT: Skip this rule for January payments (handled by January override for MDP funds)
      if (
        pmtType !== "Special" &&
        !amountMatchesPrevious &&
        !isJanuary && // Skip for January payments (handled by January override)
        medianAmount !== null &&
        medianAmount > 0
      ) {
        // Check if off-cadence using GAP-DAYS (not day-of-month)
        // For monthly payers: gap should be 20-35 days. If gap < 20 or > 35, it's off-cadence
        let isOffCadenceForRepetition = false;
        if (daysSincePrev !== null && daysSincePrev > 0) {
          isOffCadenceForRepetition = daysSincePrev < 20 || daysSincePrev > 35;
        }

        // Check if we have enough history OR if previous amount was stable
        const hasEnoughHistory = rollingRegularAmounts.length >= 3;
        const prevWasStable =
          prevAmount !== null &&
          prevAmount > 0 &&
          isApproximatelyEqual(prevAmount, medianAmount, amountStabilityRelTol);

        // If we have enough history, check recent amounts for repetition pattern
        if (hasEnoughHistory) {
          const recentAmounts = rollingRegularAmounts.slice(-4); // Last 4 regular amounts
          const allMatchMedian = recentAmounts.every((amt) =>
            isApproximatelyEqual(amt, medianAmount, amountStabilityRelTol)
          );

          // If recent amounts were stable/repeating, and current amount is SIGNIFICANTLY different -> Special
          // UPDATED: Use 2.5× median (specialMultiplier) to match user requirement
          if (
            allMatchMedian &&
            !isApproximatelyEqual(amount, medianAmount, amountStabilityRelTol)
          ) {
            // Check if the change is > 2.5× median (user requirement)
            const isExtremeChange = amount >= specialMultiplier * medianAmount;

            // BOTH conditions required: off-cadence AND > 2.5× median
            if (isOffCadenceForRepetition && isExtremeChange) {
              // Check if it doesn't repeat next (to avoid false positives on frequency changes or MDP rate increases)
              const repeatsNext =
                (nextAmount !== null &&
                  nextAmount > 0 &&
                  isApproximatelyEqual(
                    amount,
                    nextAmount,
                    amountStabilityRelTol
                  )) ||
                (next2Amount !== null &&
                  next2Amount > 0 &&
                  isApproximatelyEqual(
                    amount,
                    next2Amount,
                    amountStabilityRelTol
                  ));

              if (!repeatsNext) {
                pmtType = "Special";
              }
            }
          }
        } else if (
          prevWasStable &&
          !isApproximatelyEqual(amount, medianAmount, amountStabilityRelTol)
        ) {
          // Fallback: If previous amount was stable and current is different
          // UPDATED: Use 2.5× median (specialMultiplier) AND require off-cadence
          const isExtremeChange = amount >= specialMultiplier * medianAmount;

          // BOTH conditions required: off-cadence AND > 2.5× median
          if (isOffCadenceForRepetition && isExtremeChange) {
            const repeatsNext =
              (nextAmount !== null &&
                nextAmount > 0 &&
                isApproximatelyEqual(
                  amount,
                  nextAmount,
                  amountStabilityRelTol
                )) ||
              (next2Amount !== null &&
                next2Amount > 0 &&
                isApproximatelyEqual(amount, next2Amount, amountStabilityRelTol));

            if (!repeatsNext) {
              pmtType = "Special";
            }
          }
        }
      }

      // Priority 3: cadence-break + meaningful spike (for smaller spikes that are off-cadence)
      // This handles year-end clustering like ACV/STK
      if (pmtType !== "Special" && medianAmount !== null && medianAmount > 0) {
        const repeatsNext =
          nextAmount !== null &&
          nextAmount > 0 &&
          isApproximatelyEqual(amount, nextAmount, 0.05);

        const dominantLabel = determinePatternFrequencyLabel(
          rollingRegularGapsToNext
        );
        const expectedMinDays =
          dominantLabel === "Weekly"
            ? 5
            : dominantLabel === "Monthly"
              ? 20
              : dominantLabel === "Quarterly"
                ? 46
                : dominantLabel === "Semi-Annual"
                  ? 150
                  : dominantLabel === "Annual"
                    ? 250
                    : null;

        // Cadence break means "too soon" or "too late" relative to the dominant regular cadence.
        // For monthly: broaden window to 20-35 days (allows holiday shifts and early-January ex-dates).
        // For other frequencies: use standard thresholds.
        let cadenceBreakThreshold: number | null = null;
        let cadenceBreakMax: number | null = null;
        if (expectedMinDays !== null) {
          if (dominantLabel === "Monthly") {
            // Monthly: 20-35 days is on-cadence (broader window for MDP funds)
            cadenceBreakThreshold = 20;
            cadenceBreakMax = 35;
          } else {
            // Other frequencies: use standard threshold (too soon = off-cadence)
            cadenceBreakThreshold = Math.max(5, expectedMinDays);
            cadenceBreakMax = null;
          }
        }

        const isCadenceBreak =
          cadenceBreakThreshold !== null &&
          gapDays > 0 &&
          (gapDays < cadenceBreakThreshold ||
            (cadenceBreakMax !== null && gapDays > cadenceBreakMax)) &&
          dominantLabel !== "Weekly"; // weekly regimes naturally have short gaps

        // For MDP funds: check if amount matches next 2 payments (lookahead)
        // If amount matches subsequent payments, it's Regular even if off-cadence
        const matchesNext2 =
          (nextAmount !== null &&
            nextAmount > 0 &&
            isApproximatelyEqual(amount, nextAmount, amountStabilityRelTol)) ||
          (next2Amount !== null &&
            next2Amount > 0 &&
            isApproximatelyEqual(amount, next2Amount, amountStabilityRelTol));

        // Use 2.5× median (specialMultiplier) to match user requirement
        // Previously used 1.5× which was too aggressive and conflicted with user's 2.5× requirement
        const isMeaningfulSpike = amount >= specialMultiplier * medianAmount; // used only when off-cadence

        // Rule 5.4.3: If off-cadence BUT amount matches subsequent payments → Regular (for MDP funds)
        if (isCadenceBreak && matchesNext2) {
          // Amount matches next payments → Regular (even if off-cadence)
          pmtType = "Regular";
        } else if (!repeatsNext && isCadenceBreak && isMeaningfulSpike) {
          // Off-cadence + > 2.5× median + doesn't repeat → Special
          pmtType = "Special";
        }
      }
    }

    // Step 5: If Special, optionally split into (regular_component + special_component).
    // NOTE: This does NOT create a second database row (unique constraint on ticker+ex_date).
    // Instead we store the components for display/analysis.
    let regularComponent: number | null = null;
    let specialComponent: number | null = null;

    if (
      pmtType === "Special" &&
      medianAmount !== null &&
      medianAmount > 0 &&
      amount > 0
    ) {
      // Positive special (spike): split using the established regular cadence amount as baseline.
      // Negative "specials" (one-off low payment): do not invent a larger regular component than paid.
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

    // CRITICAL: Override frequency for Special dividends
    // Specials should NEVER show as "Annual", "Monthly", etc. - they're one-time events
    // Force frequency_num = 1 and frequency_label = 'Irregular' for all Specials
    // BUT: We need the dominant frequency for annualized calculation (regular component × dominant frequency)
    let dominantFrequencyNum: number | null = null;
    if (pmtType === "Special") {
      // Get dominant frequency for annualized calculation
      const dominantLabel = determinePatternFrequencyLabel(
        rollingRegularGapsToNext
      );
      dominantFrequencyNum =
        dominantLabel === "Weekly"
          ? 52
          : dominantLabel === "Monthly"
            ? 12
            : dominantLabel === "Quarterly"
              ? 4
              : dominantLabel === "Semi-Annual"
                ? 2
                : dominantLabel === "Annual"
                  ? 1
                  : 12; // Default to Monthly (12) for CEFs if pattern unclear

      frequencyNum = 1;
      frequencyLabel = "Irregular";
    }

    // Step 6: Annualized/Normalized for CEFs
    // Annualized = (per-payment amount) × (payments per year)
    // Normalized (for CEFs) = per-payment amount for the detected cadence (i.e., annualized / frequency_num)
    //
    // This matches product expectation:
    // - Monthly: normalized = monthly payment amount (e.g., 0.25)
    // - Weekly: normalized = weekly payment amount (e.g., 0.1098)
    //
    // For Special: annualized = (regularComponent × dominantFrequency) + specialComponent
    // normalizedDiv = regularComponent (the run-rate component)
    let annualized: number | null = null;
    let normalizedDiv: number | null = null;

    if (pmtType === "Special") {
      // CRITICAL: For ALL specials, annualized and normalized should be blank/null
      // Specials should not be included in forward yield calculations
      annualized = null;
      normalizedDiv = null;
    } else {
      // For Regular/Initial: standard calculation
      const annualizeBase = amount > 0 ? amount : null;
      if (annualizeBase !== null && frequencyNum !== null && frequencyNum > 0) {
        const annualizedRaw = annualizeBase * frequencyNum;
        annualized = Number(annualizedRaw.toFixed(6));
        // Normalized will be recalculated in second pass using newest regular frequency
        // Store annualized for now, normalized will be calculated after we know newest regular frequency
        normalizedDiv = null;
      }
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
    if (pmtType !== "Special" && amount > 0) {
      rollingRegularAmounts.push(amount);
      rollingRegularExDates.push(current.ex_date); // Track ex-dates for day-of-month calculation
      // For pattern detection we want "gap to next" (frequency confirmation),
      // but skip clustered short gaps (likely specials) so they don't poison cadence.
      if (daysToNext !== null && daysToNext > 0) {
        const labelToNext = getCEFFrequencyFromDays(daysToNext).label;
        if (labelToNext !== "Irregular") {
          rollingRegularGapsToNext.push(daysToNext);
        }
      }

      // Track newest regular frequency (for normalized calculation)
      // Since we process oldest to newest, the last regular dividend's frequency is the newest
      if (
        frequencyNum !== null &&
        frequencyNum > 0 &&
        frequencyLabel !== "Irregular"
      ) {
        newestRegularFrequency = frequencyNum;
      }
    }
  }

  // Second pass: Recalculate normalized for all dividends using newest regular frequency
  // CRITICAL: All dividends should use the same newest regular frequency for normalized calculation
  // - If newest is Monthly (12): normalized = annualized / 12 for ALL dividends
  // - If newest is Quarterly (4): normalized = annualized / 4 for ALL dividends
  // - If newest is Weekly (52): normalized = annualized / 52 for ALL dividends
  // Default to 12 (Monthly) if no regular frequency found
  const frequencyForNormalized =
    newestRegularFrequency !== null && newestRegularFrequency > 0
      ? newestRegularFrequency
      : 12; // Default to Monthly (12) if no regular frequency found

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    // Only recalculate for Regular/Initial dividends (not Specials)
    if (result.pmt_type !== "Special" && result.annualized !== null) {
      result.normalized_div = Number(
        (result.annualized / frequencyForNormalized).toFixed(6)
      );
    }
  }

  return results;
}

/**
 * ETF Dividend Frequency: Gap-Day Guidelines (Copilot Rules)
 * 
 * Core Ranges (strict):
 * - Weekly: 5-9 days (≥3 of last 4 gaps must be in range)
 * - Monthly: 26-34 days (≥3 of last 4 gaps must be in range)
 * - Quarterly: 80-100 days (≥2 of last 3 gaps must be in range)
 * - Semi-Annual: 160-200 days (≥2 of last 3 gaps must be in range)
 * - Annual: 350-380 days (last 2 gaps must be in range)
 * 
 * Holiday Drift Allowances (when amount unchanged):
 * - Weekly: 10-13 days (holiday drift around Thanksgiving/Christmas)
 * - Monthly: 20-25 days (short-month drift) or 35-40 days (holiday drift)
 * - Quarterly: 70-79 days (short quarter drift)
 */

// Core strict ranges for frequency classification
const FREQUENCY_RANGES = {
  WEEKLY: { min: 5, max: 9 },
  WEEKLY_DRIFT: { min: 10, max: 13 }, // Holiday drift
  MONTHLY: { min: 26, max: 34 },
  MONTHLY_SHORT: { min: 20, max: 25 }, // Short-month drift (Feb, 30-day months)
  MONTHLY_DRIFT: { min: 35, max: 40 }, // Holiday drift
  QUARTERLY: { min: 80, max: 100 },
  QUARTERLY_SHORT: { min: 70, max: 79 }, // Short quarter drift
  SEMIANNUAL: { min: 160, max: 200 },
  SEMIANNUAL_SHORT: { min: 140, max: 159 }, // Short semi-annual
  ANNUAL: { min: 350, max: 380 },
  ANNUAL_SHORT: { min: 300, max: 349 }, // Short annual
} as const;

/**
 * Determine frequency based on days between payments (strict core ranges only)
 * Returns null for ambiguous gaps that require historical analysis
 */
export function getFrequencyFromDaysStrict(days: number): number | null {
  if (!isFinite(days) || days <= 0) return null;

  // Weekly: 5-9 days (strict)
  if (days >= FREQUENCY_RANGES.WEEKLY.min && days <= FREQUENCY_RANGES.WEEKLY.max) return 52;

  // Monthly: 26-34 days (strict)
  if (days >= FREQUENCY_RANGES.MONTHLY.min && days <= FREQUENCY_RANGES.MONTHLY.max) return 12;

  // Quarterly: 80-100 days (strict)
  if (days >= FREQUENCY_RANGES.QUARTERLY.min && days <= FREQUENCY_RANGES.QUARTERLY.max) return 4;

  // Semi-Annual: 160-200 days (strict)
  if (days >= FREQUENCY_RANGES.SEMIANNUAL.min && days <= FREQUENCY_RANGES.SEMIANNUAL.max) return 2;

  // Annual: 350-380 days (strict)
  if (days >= FREQUENCY_RANGES.ANNUAL.min && days <= FREQUENCY_RANGES.ANNUAL.max) return 1;

  // Gap is outside core ranges - needs historical analysis
  return null;
}

/**
 * Check if a gap is within holiday/short-period drift range for a given frequency
 */
export function isHolidayDrift(days: number, priorFrequency: number): boolean {
  if (!isFinite(days) || days <= 0) return false;

  switch (priorFrequency) {
    case 52: // Weekly - allow 10-13 day gaps as holiday drift
      return days >= FREQUENCY_RANGES.WEEKLY_DRIFT.min && days <= FREQUENCY_RANGES.WEEKLY_DRIFT.max;
    case 12: // Monthly - allow 20-25 (short-month) or 35-40 (holiday drift)
      return (days >= FREQUENCY_RANGES.MONTHLY_SHORT.min && days <= FREQUENCY_RANGES.MONTHLY_SHORT.max) ||
        (days >= FREQUENCY_RANGES.MONTHLY_DRIFT.min && days <= FREQUENCY_RANGES.MONTHLY_DRIFT.max);
    case 4: // Quarterly - allow 70-79 day gaps
      return days >= FREQUENCY_RANGES.QUARTERLY_SHORT.min && days <= FREQUENCY_RANGES.QUARTERLY_SHORT.max;
    case 2: // Semi-Annual - allow 140-159 day gaps
      return days >= FREQUENCY_RANGES.SEMIANNUAL_SHORT.min && days <= FREQUENCY_RANGES.SEMIANNUAL_SHORT.max;
    case 1: // Annual - allow 300-349 day gaps
      return days >= FREQUENCY_RANGES.ANNUAL_SHORT.min && days <= FREQUENCY_RANGES.ANNUAL_SHORT.max;
    default:
      return false;
  }
}

/**
 * Determine dominant frequency from a series of gaps using majority voting
 * Requires minimum number of gaps based on frequency type
 * Returns null if no clear majority (≥60%) is found
 */
export function getDominantFrequencyFromGaps(gaps: number[]): number | null {
  if (!gaps || gaps.length < 3) return null;

  // Use last 4-6 gaps for analysis
  const recentGaps = gaps.filter(g => typeof g === 'number' && isFinite(g) && g > 0).slice(-6);
  if (recentGaps.length < 3) return null;

  // Count frequencies using strict ranges
  const counts = new Map<number, number>();
  for (const gap of recentGaps) {
    const freq = getFrequencyFromDaysStrict(gap);
    if (freq !== null) {
      counts.set(freq, (counts.get(freq) || 0) + 1);
    }
  }

  // Find the dominant frequency (must have ≥60% of classified gaps)
  let best: { freq: number; count: number } | null = null;
  let totalClassified = 0;
  for (const [freq, count] of counts.entries()) {
    totalClassified += count;
    if (!best || count > best.count) {
      best = { freq, count };
    }
  }

  if (!best || totalClassified < 3) return null;

  // Require ≥60% dominance for confidence
  const dominanceRatio = best.count / totalClassified;
  return dominanceRatio >= 0.6 ? best.freq : null;
}

/**
 * History-aware frequency detection with holiday drift support
 * 
 * Logic:
 * 1. If gap is in a core strict range, use that frequency
 * 2. If gap is in a drift range AND amount is unchanged from prior pattern, keep prior frequency
 * 3. If neither, determine dominant frequency from historical gaps
 * 4. A frequency change requires 2+ consecutive gaps in new band (not explainable by drift)
 */
export function getFrequencyWithHistoryAware(
  currentGap: number,
  priorGaps: number[],
  currentAmount: number | null,
  priorMedianAmount: number | null,
  amountTolerance: number = 0.02 // 2% default
): number {
  // Step 1: Check if current gap is in a strict core range
  const strictFreq = getFrequencyFromDaysStrict(currentGap);
  if (strictFreq !== null) {
    return strictFreq;
  }

  // Step 2: Get the dominant historical frequency
  const dominantFreq = getDominantFrequencyFromGaps(priorGaps);

  // Step 3: Check if this is holiday drift (gap is in drift range AND amount unchanged)
  if (dominantFreq !== null) {
    const isDrift = isHolidayDrift(currentGap, dominantFreq);

    // Check if amount is stable (within tolerance of median)
    const amountUnchanged =
      currentAmount !== null &&
      priorMedianAmount !== null &&
      priorMedianAmount > 0 &&
      Math.abs(currentAmount - priorMedianAmount) / priorMedianAmount <= amountTolerance;

    if (isDrift && amountUnchanged) {
      // Holiday/short-period drift with unchanged amount - keep prior frequency
      return dominantFreq;
    }

    // Even if amount changed, if we have a clear dominant pattern, prefer it
    // over arbitrary classification for ambiguous gaps (e.g., 15-25 days)
    // This prevents the "Weekly" misclassification for monthly payers with short gaps
    if (dominantFreq !== null && priorGaps.length >= 4) {
      // Check if this could be a frequency CHANGE (need 2+ consecutive gaps in new band)
      // For now, trust the dominant pattern unless we see evidence of a real change
      return dominantFreq;
    }
  }

  // Step 4: Fallback - use extended ranges (less strict but covers edge cases)
  return getFrequencyFromDays(currentGap);
}

/**
 * Legacy function: Determine frequency based on days between payments
 * This function is kept for backward compatibility but uses extended ranges
 * that are more forgiving than strict ranges.
 * 
 * IMPORTANT: This function should NOT be used for new frequency detection.
 * Use getFrequencyWithHistoryAware() instead when historical data is available.
 */
export function getFrequencyFromDays(days: number): number {
  // First try strict ranges
  const strict = getFrequencyFromDaysStrict(days);
  if (strict !== null) return strict;

  // Extended ranges for edge cases (with defaults that err toward Monthly)
  // Weekly holiday drift: 10-13 days
  if (days >= 10 && days <= 13) return 52;

  // Short-month monthly: 14-25 days → Monthly (NOT Weekly!)
  // This fixes the CCD issue where 18-day gaps were being classified as Weekly
  if (days >= 14 && days <= 25) return 12;

  // Monthly extended: 35-59 days
  if (days >= 35 && days <= 59) return 12;

  // Quarterly extended: 60-79 days (before strict range starts)
  if (days >= 60 && days < 80) return 4;
  // Quarterly extended: 101-159 days (after strict range ends)
  if (days > 100 && days < 160) return 4;

  // Semi-Annual extended: 201-349 days
  if (days > 200 && days < 350) return 2;

  // Beyond annual range: treat as annual
  if (days > 380) return 1;

  // Default to monthly for any unhandled case
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
): "Regular" | "Special" | "Initial" {
  if (daysSincePrev === null) return "Initial";

  // Special case: If current dividend is tiny (< 1% of next) and comes 1-4 days before next,
  // it's likely a special dividend (e.g., $0.0003 before $0.4866)
  if (
    currentAmount !== null &&
    currentAmount > 0 &&
    nextAmount !== null &&
    nextAmount > 0 &&
    daysToNext !== null &&
    daysToNext >= 1 &&
    daysToNext <= 4
  ) {
    const ratio = currentAmount / nextAmount;
    if (ratio < 0.01) {
      // Current is less than 1% of next
      return "Special";
    }
  }

  // If we have days since last regular, use that (more accurate)
  if (daysSinceLastRegular !== null) {
    if (daysSinceLastRegular >= 1 && daysSinceLastRegular <= 4)
      return "Special";
    return "Regular";
  }

  // Fallback: use days since previous (less accurate but works for first pass)
  if (daysSincePrev >= 1 && daysSincePrev <= 4) return "Special";
  return "Regular";
}

/**
 * Find the last Regular dividend before the given index
 * Used when we need to look back past Special dividends for frequency calculation
 */
function findLastRegularDividend(
  dividends: DividendInput[],
  currentIndex: number,
  calculatedTypes: ("Regular" | "Special" | "Initial")[]
): { dividend: DividendInput; index: number } | null {
  for (let i = currentIndex - 1; i >= 0; i--) {
    if (calculatedTypes[i] === "Regular") {
      return { dividend: dividends[i], index: i };
    }
  }
  return null;
}

/**
 * Calculate normalized dividend values for a list of dividends
 * Input dividends should be sorted by date ASCENDING (oldest first)
 */
export function calculateNormalizedDividends(
  dividends: DividendInput[]
): NormalizedDividend[] {
  if (!dividends || dividends.length === 0) {
    return [];
  }

  // Ensure sorted by date ascending
  const sortedDividends = [...dividends].sort(
    (a, b) => new Date(a.ex_date).getTime() - new Date(b.ex_date).getTime()
  );

  // PASS 1: classify payment types using rolling history (so specials don't distort cadence inference)
  const types: Array<"Regular" | "Special" | "Initial"> = [];
  const rollingRegularAmounts: number[] = [];
  const rollingRegularGaps: number[] = []; // gaps between regular-like dividends (non-special)
  let lastRegularLikeIndex: number | null = null;

  for (let i = 0; i < sortedDividends.length; i++) {
    const current = sortedDividends[i];
    const prev = i > 0 ? sortedDividends[i - 1] : null;
    const next = i < sortedDividends.length - 1 ? sortedDividends[i + 1] : null;

    const currentDate = new Date(current.ex_date);
    const prevDate = prev ? new Date(prev.ex_date) : null;

    const daysSincePrev = prevDate
      ? Math.round(
        (currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24)
      )
      : null;

    const lastReg =
      lastRegularLikeIndex !== null
        ? sortedDividends[lastRegularLikeIndex]
        : null;
    const lastRegDate = lastReg ? new Date(lastReg.ex_date) : null;
    const daysSinceLastRegularLike = lastRegDate
      ? Math.round(
        (currentDate.getTime() - lastRegDate.getTime()) /
        (1000 * 60 * 60 * 24)
      )
      : null;

    const nextDate = next ? new Date(next.ex_date) : null;
    const daysToNext = nextDate
      ? Math.round(
        (nextDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24)
      )
      : null;

    const currentAmount = (current.adj_amount ?? current.div_cash) || 0;
    const nextAmount = next ? (next.adj_amount ?? next.div_cash) || 0 : null;

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
        currentAmount / nextAmount < 0.01
      ) {
        types.push("Special");
        continue;
      }

      types.push("Initial");
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
      currentAmount / nextAmount < 0.01
    ) {
      types.push("Special");
      continue;
    }

    const dominantFrequencyNum =
      modeFrequencyFromGaps(rollingRegularGaps) ??
      (rollingRegularGaps.length > 0
        ? getFrequencyFromDays(
          rollingRegularGaps[rollingRegularGaps.length - 1]!
        )
        : null);
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
      types.push("Special");
      continue;
    }

    // NOTE: We intentionally do NOT tag "Special" purely because the gap is 1–4 days.
    // That heuristic creates false positives for holiday shifts and cadence transitions.
    // Specials are handled by (a) tiny-stub rule and (b) cadence+amount checks above.

    types.push("Regular");
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

  // Track newest regular frequency (for normalized calculation)
  let newestRegularFrequency: number | null = null;

  const nextNonSpecialIndex = (fromIndex: number): number | null => {
    for (let j = fromIndex + 1; j < sortedDividends.length; j++) {
      if (types[j] !== "Special") return j;
    }
    return null;
  };
  const prevNonSpecialIndex = (fromIndex: number): number | null => {
    for (let j = fromIndex - 1; j >= 0; j--) {
      if (types[j] !== "Special") return j;
    }
    return null;
  };

  for (let i = 0; i < sortedDividends.length; i++) {
    const current = sortedDividends[i];
    const prev = i > 0 ? sortedDividends[i - 1] : null;
    const currentDate = new Date(current.ex_date);
    const prevDate = prev ? new Date(prev.ex_date) : null;

    const daysSincePrev = prevDate
      ? Math.round(
        (currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24)
      )
      : null;

    const pmtType = types[i];

    let frequencyNum = 12; // default
    const lookbackClear = isInClearGapRange(daysSincePrev);

    if (pmtType !== "Special" && lookbackClear && daysSincePrev !== null) {
      // Transition guard: trust the dividend's own look-back when it's clearly weekly/monthly/quarterly/etc.
      frequencyNum = getFrequencyFromDays(daysSincePrev);
    } else {
      const nextIdx = nextNonSpecialIndex(i);
      if (nextIdx !== null) {
        const nextDate = new Date(sortedDividends[nextIdx].ex_date);
        const gapToNextNonSpecial = Math.round(
          (nextDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (gapToNextNonSpecial > 0) {
          frequencyNum = getFrequencyFromDays(gapToNextNonSpecial);
        }
      } else {
        const prevIdx = prevNonSpecialIndex(i);
        if (prevIdx !== null) {
          const prevNSDate = new Date(sortedDividends[prevIdx].ex_date);
          const gapFromPrevNonSpecial = Math.round(
            (currentDate.getTime() - prevNSDate.getTime()) /
            (1000 * 60 * 60 * 24)
          );
          if (gapFromPrevNonSpecial > 0) {
            frequencyNum = getFrequencyFromDays(gapFromPrevNonSpecial);
          }
        } else if (daysSincePrev !== null && daysSincePrev > 0) {
          frequencyNum = getFrequencyFromDays(daysSincePrev);
        }
      }
    }

    // SPECIAL OTHER RULE (ETF/general path):
    // Once a dividend is marked Special, it must NOT be assigned Weekly/Monthly/etc.
    // Force frequency_num=1 so downstream code cannot "hallucinate" yield by multiplying specials.
    if (pmtType === "Special") {
      frequencyNum = 1;
    }

    // Calculate annualized and normalized values
    // CRITICAL: For normalization, we MUST use adj_amount (adjusted dividends) for ETFs that split
    // Never fall back to div_cash (unadjusted) as it will give wrong results after splits
    // If adj_amount is null or 0, we cannot calculate normalized values correctly
    const amount =
      current.adj_amount !== null && current.adj_amount > 0
        ? Number(current.adj_amount)
        : null; // Don't use div_cash - must have adj_amount for proper normalization

    let annualized: number | null = null;
    let normalizedDiv: number | null = null;

    // Calculate for Regular AND Initial dividends with valid adjusted amounts
    // Initial = first dividend (no previous to compare), should still be normalized
    // Only skip Special dividends (tiny amounts paid 1-4 days after regular)
    // Must have adj_amount (not div_cash) for proper normalization after splits
    if (
      (pmtType === "Regular" || pmtType === "Initial") &&
      amount !== null &&
      amount > 0 &&
      frequencyNum > 0
    ) {
      // Calculate annualized: Amount × Frequency (DAYS column = frequency_num = payments per year)
      const annualizedRaw = amount * frequencyNum;
      // Round annualized to 2 decimals for storage/display
      annualized = Number(annualizedRaw.toFixed(2));

      // Normalized will be recalculated in second pass using newest regular frequency
      // Store annualized for now, normalized will be calculated after we know newest regular frequency
      normalizedDiv = null;

      // Track newest regular frequency (for normalized calculation)
      // Since we process oldest to newest, the last regular dividend's frequency is the newest
      if (frequencyNum > 0 && frequencyNum !== 1) {
        // Exclude specials (frequencyNum = 1)
        newestRegularFrequency = frequencyNum;
      }
    }

    results.push({
      id: current.id,
      days_since_prev: daysSincePrev,
      pmt_type: pmtType,
      frequency_num: frequencyNum,
      annualized: annualized !== null ? Number(annualized.toFixed(2)) : null,
      normalized_div: normalizedDiv, // Will be calculated in second pass
    });
  }

  // Second pass: Recalculate normalized for all dividends using newest regular frequency
  // CRITICAL: All dividends should use the same newest regular frequency for normalized calculation
  // - If newest is Monthly (12): normalized = annualized / 12 for ALL dividends
  // - If newest is Quarterly (4): normalized = annualized / 4 for ALL dividends
  // - If newest is Weekly (52): normalized = annualized / 52 for ALL dividends
  // Default to 12 (Monthly) if no regular frequency found
  const frequencyForNormalized =
    newestRegularFrequency !== null && newestRegularFrequency > 0
      ? newestRegularFrequency
      : 12; // Default to Monthly (12) if no regular frequency found

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    // Only recalculate for Regular/Initial dividends (not Specials)
    if (result.pmt_type !== "Special" && result.annualized !== null) {
      result.normalized_div = Number(
        (result.annualized / frequencyForNormalized).toFixed(9)
      );
    }
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
  pmtType: "Regular" | "Special" | "Initial";
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
    ticker: "",
    ex_date: d.exDate,
    div_cash: d.amount,
    adj_amount: Number.isFinite(d.adjAmount) ? d.adjAmount : null,
  }));

  const normalizedAsc = calculateNormalizedDividends(mapped); // sorted ascending by ex_date
  const idToExDate = new Map<number, string>();
  mapped.forEach((m) => idToExDate.set(m.id, m.ex_date));
  const byExDate = new Map<string, NormalizedDividend>();
  normalizedAsc.forEach((n) => {
    // In practice ex_date is unique per ticker; use date key.
    const ex = idToExDate.get(n.id);
    if (ex) byExDate.set(ex, n);
  });

  // Return in descending order (to match dividends endpoint)
  const sortedDesc = [...dividends].sort(
    (a, b) => new Date(b.exDate).getTime() - new Date(a.exDate).getTime()
  );
  return sortedDesc.map((d) => {
    const n = byExDate.get(d.exDate);
    return {
      pmtType: (n?.pmt_type ?? "Regular") as "Regular" | "Special" | "Initial",
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

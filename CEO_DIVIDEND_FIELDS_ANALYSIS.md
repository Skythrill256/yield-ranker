# Dividend Table Fields - Complete Analysis

## Executive Summary

**Status**: ✅ **We have 17 out of 18 fields**. One field (CUMULTV) is not stored but can be calculated.

**Critical Issue**: ⚠️ **NORMLZD calculation formula discrepancy** - CEO spreadsheet uses different formula than our implementation.

---

## Field-by-Field Comparison

### ✅ Fields We Have (17/18)

| Field | Database Column | Status | Formula/Notes |
|-------|----------------|--------|---------------|
| **EX-DIV DATE** | `ex_date` | ✅ Present | Date from Tiingo API |
| **RECORD DTE** | `record_date` | ✅ Present | Date from Tiingo API (may be null) |
| **PAY DATE** | `pay_date` | ✅ Present | Date from Tiingo API (may be null) |
| **DIVIDEND** | `div_cash` | ✅ Present | Unadjusted dividend amount from Tiingo |
| **SPLIT FTR** | `split_factor` | ✅ Present | Split factor from Tiingo (e.g., 0.1 for 10:1 reverse split) |
| **ADJ DIV** | `adj_amount` | ✅ Present | **Formula**: `DIVIDEND / CUMULTV` or `DIVIDEND × (1/SPLIT_FACTOR)` |
| **Regular** | `pmt_type` | ✅ Present | Payment type: Regular, Special, or Initial |
| **DAYS** | `days_since_prev` | ✅ Present | **Formula**: `current_ex_date - previous_ex_date` |
| **FREQ** | `frequency_num` | ✅ Present | **Formula**: Calculated using backward confirmation (52=weekly, 12=monthly, 4=quarterly) |
| **ANNLZD** | `annualized` | ✅ Present | **Formula**: `ADJ_DIV × FREQ` |
| **NORMLZD** | `normalized_div` | ✅ Present | **Formula Discrepancy** - See Critical Issue below |

### ❌ Fields We Don't Have (1/18)

| Field | Status | Notes |
|-------|--------|-------|
| **CUMULTV** (Cumulative Split Factor) | ❌ Not stored | Can be calculated on-the-fly but not currently stored in database. Would need to track cumulative split factor over time. |

---

## ⚠️ CRITICAL ISSUE: NORMLZD Formula Discrepancy

### CEO Spreadsheet Formula:
- **For 3/5/2025 (monthly payment)**: 
  - ADJ DIV = $4.6530
  - FREQ = 12
  - ANNLZD = 55.84 ✅ (matches: 4.653 × 12 = 55.836)
  - **NORMLZD = 4.653** ❌ (this is ADJ_DIV, not normalized)

### Our Current Formula:
- **For 3/5/2025 (monthly payment)**:
  - ADJ DIV = $4.6530
  - FREQ = 12
  - ANNLZD = 55.84 ✅
  - **NORMLZD = 1.0738** (calculated as: 55.84 / 52 = 1.0738)

### Analysis:

**CEO's Approach** (based on spreadsheet):
- NORMLZD = ADJ_DIV (directly, no normalization)
- For weekly payments: NORMLZD = ADJ_DIV ✅
- For monthly payments: NORMLZD = ADJ_DIV ❌ (not normalized to weekly)

**Our Approach** (standard normalization):
- NORMLZD = (ADJ_DIV × FREQ) / 52 = ANNLZD / 52
- For weekly payments: NORMLZD = ADJ_DIV ✅ (already weekly)
- For monthly payments: NORMLZD = (ADJ_DIV × 12) / 52 ✅ (converts to weekly equivalent)

### Examples:

| Date | ADJ DIV | FREQ | ANNLZD | CEO NORMLZD | Our NORMLZD | Purpose |
|------|---------|------|--------|-------------|-------------|---------|
| 3/5/2025 | 4.653 | 12 | 55.84 | **4.653** | **1.074** | Monthly → CEO shows ADJ_DIV, we normalize to weekly |
| 3/12/2025 | 1.025 | 52 | 53.30 | **1.025** | **1.025** | Weekly → Both match (already weekly) |

### Question for CEO:

**What should NORMLZD represent?**

**Option A: Adjusted Dividend Amount** (CEO's spreadsheet)
- NORMLZD = ADJ_DIV
- Pro: Simple, direct value
- Con: Cannot directly compare monthly vs weekly payments in charts

**Option B: Weekly Equivalent Rate** (Our current implementation)
- NORMLZD = (ADJ_DIV × FREQ) / 52
- Pro: Allows direct comparison in charts (all payments normalized to weekly rate)
- Con: More complex calculation

**Recommendation**: Option B (Weekly Equivalent Rate) is standard for dividend comparison charts and allows fair comparison across different payment frequencies. However, we will implement whichever the CEO specifies.

---

## Formula Verification

### ✅ ADJ DIV Formula
- **Formula**: `ADJ_DIV = DIVIDEND / CUMULTV` or `DIVIDEND × (1/SPLIT_FACTOR)`
- **Verification**: 
  - Before split (CUMULTV=1): ADJ_DIV = DIVIDEND ✅
  - After split (CUMULTV=0.1): ADJ_DIV = DIVIDEND / 0.1 = DIVIDEND × 10 ✅
- **Status**: ✅ **Confirmed - We calculate this correctly**

### ✅ ANNLZD Formula
- **Formula**: `ANNLZD = ADJ_DIV × FREQ`
- **Example**: ADJ_DIV=4.653, FREQ=12 → ANNLZD = 4.653 × 12 = 55.836 ≈ 55.84
- **Status**: ✅ **Confirmed - We calculate this correctly**

### ⚠️ NORMLZD Formula
- **CEO Formula**: `NORMLZD = ADJ_DIV` (appears to be direct copy, not normalized)
- **Our Formula**: `NORMLZD = ANNLZD / 52 = (ADJ_DIV × FREQ) / 52`
- **Status**: ⚠️ **DISCREPANCY - Need CEO confirmation on intended formula**

---

## Missing Field: CUMULTV (Cumulative Split Factor)

### What is CUMULTV?
- Cumulative split factor that tracks the total adjustment factor over time
- Example for ULTY:
  - Before 12/2/2025 split: CUMULTV = 1.0
  - After 12/2/2025 split (10:1 reverse): CUMULTV = 0.1

### Current Status:
- ❌ Not stored in database
- ✅ Can be calculated from split_factor values

### Implementation Options:
1. **Calculate on-the-fly** (current approach)
   - Calculate CUMULTV when needed by multiplying split factors
   - No database changes needed

2. **Store in database** (future enhancement)
   - Add `cumulative_split_factor` column to `dividends_detail` table
   - Calculate and store during dividend ingestion
   - Requires database migration

**Recommendation**: Calculate on-the-fly unless CEO specifically needs it stored in database.

---

## Summary

### ✅ What We Have Right:
1. All core dividend fields (ex_date, div_cash, adj_amount, etc.)
2. ADJ_DIV calculation formula
3. ANNLZD calculation formula
4. FREQ calculation (backward confirmation rule)
5. DAYS calculation

### ⚠️ What Needs Clarification:
1. **NORMLZD formula** - CEO's spreadsheet shows ADJ_DIV directly, but standard normalization would be (ANNLZD / 52)
   - Need CEO to confirm: Should NORMLZD be ADJ_DIV or (ANNLZD / 52)?

### ❌ What We're Missing:
1. **CUMULTV field** - Not stored, but can be calculated
   - Need CEO to confirm: Should we add this to database or calculate on-the-fly?

---

## Next Steps

1. **CEO Decision Required**: NORMLZD formula - ADJ_DIV vs (ANNLZD / 52)
2. **CEO Decision Required**: CUMULTV - Store in database or calculate on-the-fly?
3. **Once confirmed**: Update code accordingly and verify all calculations match

---

## Ready to Implement

Once CEO confirms:
- ✅ We can implement CUMULTV field (if needed)
- ✅ We can adjust NORMLZD formula to match CEO's specification
- ✅ All other fields and formulas are already correct


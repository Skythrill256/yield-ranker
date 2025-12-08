# Dividend Volatility Index (DVI) Rating System

## Overview

The Dividend Volatility Index (DVI) measures the consistency of dividend payments using the Coefficient of Variation (CV). Lower DVI values indicate more stable, predictable dividends, while higher values indicate more volatile, unpredictable dividends.

## Rating Scale

| DVI Score Range | Rating | Description | Color Code |
|----------------|--------|-------------|------------|
| 0.0% - 5.0% | **A+ (Excellent)** | Very Low Volatility - Highly stable dividends with minimal variation | Green |
| 5.1% - 10.0% | **A (Very Good)** | Low Volatility - Stable dividends with occasional minor variations | Light Green |
| 10.1% - 15.0% | **B+ (Good)** | Moderate-Low Volatility - Generally stable with some variation | Yellow-Green |
| 15.1% - 20.0% | **B (Fair)** | Moderate Volatility - Noticeable variation in dividend payments | Yellow |
| 20.1% - 30.0% | **C (Below Average)** | High Volatility - Significant variation in dividend amounts | Orange |
| 30.1% - 50.0% | **D (Poor)** | Very High Volatility - Large swings in dividend payments | Red |
| 50.1%+ | **F (Very Poor)** | Extremely High Volatility - Highly unpredictable dividends | Dark Red |

## Calculation Method

DVI is calculated using the Coefficient of Variation (CV) formula:

1. **Annualize each dividend payment** based on its frequency (weekly=52x, monthly=12x, quarterly=4x, etc.)
2. **Calculate the mean** of all annualized dividend amounts over the last 12 months
3. **Calculate the standard deviation** of the annualized amounts
4. **DVI = (Standard Deviation / Mean) × 100**

This method normalizes for frequency changes (e.g., monthly to weekly) to ensure accurate volatility measurement.

## Interpretation

- **A+ to B+ (0-15%)**: Suitable for income-focused investors seeking stable dividend income
- **B to C (15-30%)**: Moderate risk - dividends may fluctuate but generally predictable
- **D to F (30%+)**: High risk - significant dividend volatility, may not be suitable for income-focused strategies

## Examples

- **DVI = 3.5%** → Rating: **A+ (Excellent)** - Very stable dividends
- **DVI = 8.2%** → Rating: **A (Very Good)** - Low volatility
- **DVI = 12.5%** → Rating: **B+ (Good)** - Moderate-low volatility
- **DVI = 18.0%** → Rating: **B (Fair)** - Moderate volatility
- **DVI = 25.0%** → Rating: **C (Below Average)** - High volatility
- **DVI = 35.0%** → Rating: **D (Poor)** - Very high volatility
- **DVI = 55.0%** → Rating: **F (Very Poor)** - Extremely high volatility

## Implementation Notes

- Ratings are automatically calculated from DVI percentages
- Display shows both the rating and percentage for transparency
- Ratings are color-coded for quick visual assessment
- N/A is shown when insufficient dividend history exists (< 2 payments)


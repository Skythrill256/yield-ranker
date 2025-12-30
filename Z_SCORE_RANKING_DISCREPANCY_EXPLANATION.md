# Z-Score Ranking Discrepancy Explanation

## Summary

**The website's Z-score ranking is CORRECT.** The CEO's manual ranking has errors in the order.

## The Issue

When sorting by Z-score from **lowest (most negative) to highest**, the correct order should be:

1. **FFA**: -3.04 → Rank 1 ✓ (CEO matches)
2. **CSQ**: -2.12 → Rank 2 ✓ (CEO matches)
3. **GOF**: -1.97 → Rank 3 ✓ (CEO matches)
4. **UTF**: -1.65 → Rank 4 ✓ (CEO matches)
5. **FOF**: -1.62 → Rank 5 ✗ (CEO shows rank 8 - **WRONG**)
6. **PCN**: -1.57 → Rank 6 ✗ (CEO shows rank 5 - **WRONG**)
7. **BTO**: -1.31 → Rank 7 ✓ (CEO matches)
8. **UTG**: -0.82 → Rank 8 ✗ (CEO shows rank 6 - **WRONG**)
9. **BME**: -0.36 → Rank 9 ✗ (CEO shows rank 10 - **WRONG**)
10. **DNP**: -0.31 → Rank 10 ✗ (CEO shows rank 9 - **WRONG**)
11. **IGR**: -0.13 → Rank 11 ✓ (CEO matches)
12. **GAB**: 0.95 → Rank 12 ✓ (CEO matches)

## Why the Website is Correct

**Z-score ranking rule**: Lower (more negative) Z-score = Better rank (rank 1 = best)

- **FOF** has Z-score **-1.62** (more negative)
- **PCN** has Z-score **-1.57** (less negative)
- Therefore, **FOF should rank HIGHER** (lower rank number) than PCN
- Website correctly shows: FOF = Rank 5, PCN = Rank 6
- CEO incorrectly shows: FOF = Rank 8, PCN = Rank 5

## Specific Errors in CEO's Ranking

### Error 1: FOF vs PCN
- **FOF**: -1.62 (better Z-score) → Should be rank 5, CEO shows rank 8 ❌
- **PCN**: -1.57 (worse Z-score) → Should be rank 6, CEO shows rank 5 ❌
- **Issue**: CEO has these reversed

### Error 2: UTG Position
- **UTG**: -0.82 → Should be rank 8, CEO shows rank 6 ❌
- **Issue**: UTG is ranked too high in CEO's list (should be after BTO at rank 7)

### Error 3: BME vs DNP
- **BME**: -0.36 (worse Z-score) → Should be rank 9, CEO shows rank 10 ❌
- **DNP**: -0.31 (better Z-score) → Should be rank 10, CEO shows rank 9 ❌
- **Issue**: CEO has these reversed (DNP's -0.31 is closer to 0, so it's worse than BME's -0.36)

## Correct Z-Score Ranking Order

When sorted from **lowest to highest** (most negative to least negative):

| Rank | Ticker | Z-Score | CEO's Rank | Match |
|------|--------|---------|------------|-------|
| 1    | FFA    | -3.04   | 1          | ✓     |
| 2    | CSQ    | -2.12   | 2          | ✓     |
| 3    | GOF    | -1.97   | 3          | ✓     |
| 4    | UTF    | -1.65   | 4          | ✓     |
| 5    | FOF    | -1.62   | 8          | ✗     |
| 6    | PCN    | -1.57   | 5          | ✗     |
| 7    | BTO    | -1.31   | 7          | ✓     |
| 8    | UTG    | -0.82   | 6          | ✗     |
| 9    | BME    | -0.36   | 10         | ✗     |
| 10   | DNP    | -0.31   | 9          | ✗     |
| 11   | IGR    | -0.13   | 11         | ✓     |
| 12   | GAB    | 0.95    | 12         | ✓     |

## Conclusion

**The website's Z-score ranking is mathematically correct.** The CEO's manual ranking has 5 errors where the order doesn't match the Z-score values.

**What to tell the CEO:**
1. The website correctly sorts Z-scores from lowest (most negative) to highest
2. Lower Z-score = Better rank (rank 1 = best)
3. The CEO's ranking has FOF/PCN, UTG, and BME/DNP in the wrong order
4. The website's ranking matches the actual Z-score values from the database


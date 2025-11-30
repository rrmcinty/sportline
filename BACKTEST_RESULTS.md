# Model Backtest Results

**Last Updated:** 2025-11-30

## Overview
This document tracks backtest results for all sports models. Backtests validate model calibration and ROI by comparing predictions against actual outcomes on completed games.

**Key Metrics:**
- **Accuracy:** % of correct predictions
- **ECE (Expected Calibration Error):** How well predicted probabilities match actual frequencies (lower is better, <0.10 is excellent)
- **ROI:** Return on investment if betting $10 on every prediction
- **Calibration Bins:** Predicted probability ranges vs actual win rates

---

## CFB (College Football) 2025 ✅ PRODUCTION-READY

**Test Period:** Aug 24, 2024 through Nov 29, 2025 (both 2024 and 2025 seasons)  
**Completed Games:** 1,768  
**Matched Games:** 1,584 (with both predictions and odds)  
**Training Data:** 1,241 games (filtered: both teams need ≥5 games)  
**Model:** Ensemble (70% base + 30% market-aware) with recency weighting

### Moneyline Results
- **Validation Games:** 1,584
- **Overall ROI:** +12.80% (+$2,028 profit on 1,584 bets)
- **ECE:** 6.18% (excellent calibration)
- **Status:** ✅ Production-ready - highly profitable with large sample

**Calibration by Bin:**
| Predicted Range | Actual Win Rate | Sample Size | Calibration Quality | ROI |
|----------------|-----------------|-------------|---------------------|-----|
| 0-10% | 2.8% | 72 | Excellent | +53.6% |
| 10-20% | 4.0% | 126 | Excellent | +56.0% |
| 20-30% | 22.2% | 36 | Good | +1.1% |
| 30-40% | 35.1% | 74 | Excellent | -0.6% |
| 40-50% | 41.1% | 124 | Good | -5.8% |
| 50-60% | 47.6% | 126 | Good | -14.9% |
| 60-70% | 70.9% | 549 | Good | -1.3% |
| 70-80% | 76.2% | 130 | Excellent | +6.7% |
| 80-90% | 92.2% | 167 | Good | +46.2% |
| 90-100% | 98.3% | 180 | Good | +22.8% |

**Key Insights:**
- Exceptional ROI on extreme bins (0-20%, 80-100%)
- Weak performance on close games (40-60%)
- Largest sample size provides highest confidence
- Model excels at identifying mismatches

### Underdog Performance
**Status:** ❌ CATASTROPHIC - Avoid completely

Results when model favored underdogs:
- +200 or worse: 110/1047 correct (10.5%), ROI: -26.6%
- +300 or worse: 55/987 correct (5.6%), ROI: -29.4%
- +500 or worse: 21/910 correct (2.3%), ROI: -26.9%
- +1000 or worse: 9/866 correct (1.0%), ROI: -17.7%

**Recommendation:**
- ✅ Use default guardrails (suppress severe underdogs)
- ✅ Stick to favorites and moderate favorites
- ❌ Never use `--include-dogs` flag for CFB
- 📊 Highest confidence of all sports (1,768 completed games)

---

## NCAAM (College Basketball) 2025 ⚠️ LIMITED DATA


**Test Period:** 2024 + 2025 seasons
**Completed Games:** 1,894
**Matched Games:** 876 (with both predictions and odds)
**Model:** Same architecture as CFB (ensemble + recency weighting)

### Moneyline Results
- **Validation Games:** 876
- **Overall ROI:** +2.55% (+$223.24 profit on 876 bets)
- **ECE:** 8.17% (good calibration)
- **Status:** ✅ Working - profitable, sample size now robust

**Calibration by Bin:**
| Predicted Range | Actual Win Rate | Sample Size | Calibration Error | ROI |
|----------------|-----------------|-------------|-------------------|-----|
| 0-10%   | 0.0%   | 15  | 8.0%  | +59.5% |
| 10-20%  | 3.7%   | 27  | 10.0% | +90.1% |
| 20-30%  | 36.4%  | 11  | 9.9%  | -8.0%  |
| 30-40%  | 27.3%  | 22  | 8.7%  | +7.6%  |
| 40-50%  | 50.0%  | 38  | 5.1%  | -10.4% |
| 50-60%  | 68.1%  | 586 | 9.6%  | -4.4%  |
| 60-70%  | 68.8%  | 48  | 3.7%  | +1.4%  |
| 70-80%  | 73.5%  | 34  | 0.7%  | -8.5%  |
| 80-90%  | 93.1%  | 58  | 6.5%  | +20.6% |
| 90-100% | 94.6%  | 37  | 2.3%  | +21.8% |

**Key Insights:**
- Model now covers full probability range, not just favorites
- Highest ROI in low-probability bins (0-20%) but small sample sizes
- Most bets are in 50-60% bin (largest sample, slightly negative ROI)
- High-confidence favorites (80%+) remain profitable
- Calibration error is good (8.17%), but some bins show volatility

### Underdog Performance
**Status:** ❌ Still catastrophic - avoid severe underdogs

Results when model favored underdogs:
- +200 or worse: 68/671 correct (10.1%), ROI: -33.2%
- +300 or worse: 31/633 correct (4.9%), ROI: -34.8%
- +500 or worse: 14/603 correct (2.3%), ROI: -31.7%
- +1000 or worse: 2/576 correct (0.3%), ROI: -28.3%

**Recommendation:**
- ✅ Use default guardrails (working as intended)
- ✅ Stick to favorites and moderate favorites
- ❌ Never use `--include-dogs` flag for NCAAM

---

## NFL (Pro Football) 2025 ✅ WORKING

**Test Period:** Sept 5 - Nov 28, 2025  
**Completed Games:** 182  
**Matched Games:** 171 (with both predictions and odds)  
**Model:** Same architecture as CFB (ensemble + recency weighting)

### Moneyline Results
- **Validation Games:** 171
- **Overall ROI:** +3.84% (+$66 profit on 171 bets)
- **ECE:** 7.82% (good calibration)
- **Status:** ✅ Working - profitable but smaller sample than CFB

**Calibration by Bin:**
| Predicted Range | Actual Win Rate | Sample Size | ROI |
|----------------|-----------------|-------------|-----|
| 0-10% | 0.0% | 4 | +37.6% |
| 10-20% | 28.6% | 7 | -9.2% |
| 20-30% | 20.0% | 5 | +40.2% |
| 30-40% | 6.3% | 16 | +45.5% |
| 40-50% | 72.7% | 11 | -63.4% |
| 50-60% | 55.7% | 88 | -3.5% |
| 60-70% | 44.4% | 9 | -39.7% |
| 70-80% | 76.9% | 13 | +54.2% |
| 80-90% | 84.6% | 13 | +5.7% |
| 90-100% | 100.0% | 5 | +45.4% |

**Key Insights:**
- Small sample sizes in extreme bins (need more data)
- 40-50% and 60-70% bins underperforming (close games)
- Strong performance on high-confidence favorites (80%+)
- Overall positive ROI despite volatility

### Underdog Performance
**Status:** ⚠️ Mostly negative, avoid severe dogs

Results when model favored underdogs:
- +200 or worse: 13/107 correct (12.1%), ROI: -6.4%
- +300 or worse: 7/100 correct (7.0%), ROI: +2.1% (small positive!)
- +500 or worse: 1/94 correct (1.1%), ROI: -7.4%
- +1000 or worse: 0/94 correct (0.0%), ROI: -5.3%

**Recommendation:**
- ✅ Use default guardrails (suppress severe underdogs)
- ⚠️ NFL shows less catastrophic underdog performance than CFB/NCAAM
- 📊 Need more data - only 182 completed games so far

---

## NBA (Pro Basketball) 2025 ✅ PRODUCTION-READY

**Test Period:** Oct 2 - Nov 29, 2025  
**Completed Games:** 354  
**Matched Games:** 349 (with both predictions and odds)  
**Model:** Same architecture as CFB (ensemble + recency weighting)

### Moneyline Results
- **Validation Games:** 349
- **Overall ROI:** +8.48% (+$296 profit on 349 bets)
- **ECE:** 5.08% (excellent calibration - best of all sports!)
- **Status:** ✅ Production-ready - highly profitable and well-calibrated

**Calibration by Bin:**
| Predicted Range | Actual Win Rate | Sample Size | ROI |
|----------------|-----------------|-------------|-----|
| 0-10% | 0.0% | 8 | +25.9% |
| 10-20% | 12.5% | 8 | +7.3% |
| 20-30% | 11.1% | 18 | +67.8% |
| 30-40% | 39.1% | 23 | -4.5% |
| 40-50% | 45.2% | 42 | -3.1% |
| 50-60% | 54.9% | 122 | +1.0% |
| 60-70% | 55.9% | 34 | +7.1% |
| 70-80% | 62.9% | 35 | -2.4% |
| 80-90% | 90.5% | 42 | +23.8% |
| 90-100% | 94.1% | 17 | +24.9% |

**Key Insights:**
- Best calibration of all sports (ECE 5.08%)
- Strong positive ROI across most bins
- Excellent performance on high-confidence picks (80%+)
- Good sample sizes across probability ranges
- 20-30% bin shows exceptional ROI (model identifying value underdogs)

### Underdog Performance
**Status:** ⚠️ Negative on extreme dogs, avoid +500 or worse

Results when model favored underdogs:
- +200 or worse: 22/171 correct (12.9%), ROI: -6.9%
- +300 or worse: 10/158 correct (6.3%), ROI: -4.0%
- +500 or worse: 0/143 correct (0.0%), ROI: -13.3%
- +1000 or worse: 0/142 correct (0.0%), ROI: -5.6%

**Recommendation:**
- ✅ Use default guardrails (working excellently)
- ✅ NBA shows best overall performance of all sports
- ✅ Well-calibrated across full probability range
- ❌ Still avoid extreme underdogs (+500 or worse)

---

## Recommendations by Sport

### NBA (Pro Basketball) 🏆 BEST PERFORMER
- **Status:** Production-ready - best calibration and ROI of all sports
- **Overall ROI:** +8.48% (354 games)
- **Best Use:** Default guardrails (already working excellently)
- **Sweet Spot:** 80-100% confidence picks (+24% ROI)
- **Avoid:** Extreme underdogs (+500 or worse)
- **Confidence:** High (349 matched games, ECE 5.08%)

### CFB (College Football) 🏆 HIGHLY PROFITABLE
- **Status:** Production-ready - largest sample, exceptional ROI
- **Overall ROI:** +12.80% (1,584 games)
- **Best Use:** Default guardrails (suppress severe underdogs)
- **Sweet Spot:** Extreme confidence (80-100%: +34% avg ROI, 0-20%: +55% avg ROI)
- **Avoid:** Close games (40-60%) and all underdogs
- **Confidence:** Highest (1,768 completed games, most reliable)

### NFL (Pro Football) ⚠️ WORKING
- **Status:** Working but needs more data
- **Overall ROI:** +3.84% (171 games)
- **Best Use:** Default guardrails
- **Sweet Spot:** High confidence picks (70-100%: +35% avg ROI)
- **Caution:** Small samples in extreme bins create volatility
- **Confidence:** Moderate (182 completed games, needs 2-3x more data)

### NCAAM (College Basketball) ⚠️ LIMITED
- **Status:** Working but early season
- **Overall ROI:** +1.17% (51 games)
- **Best Use:** Default guardrails (already filtering to profitable favorites)
- **Sweet Spot:** 90-100% bin only (currently only bin with data)
- **Avoid:** `--include-dogs` flag (0% success rate on extreme dogs)
- **Confidence:** Low (78 completed games, will improve through season)
- **Next Retrain:** After ~100 more games (mid-December)

---

## Backtest Command Reference

```bash
# Run backtest for any sport
node dist/index.js model backtest --sport <cfb|ncaam|nfl|nba> --season 2025

# Examples
node dist/index.js model backtest --sport cfb --season 2025
node dist/index.js model backtest --sport ncaam --season 2025
node dist/index.js model backtest --sport nfl --season 2025
node dist/index.js model backtest --sport nba --season 2025
```

**Output includes:**
- Overall calibration analysis by predicted probability bins
- Underdog performance by odds threshold (+200, +300, +500, +1000)
- ROI calculations (profit/loss if betting $10 on every prediction)
- Sample sizes per bin for statistical confidence

---

## Data Requirements for Reliable Models

**Minimum for Training:**
- 50 completed games (model will run but may be unreliable)
- Both teams in matchup must have ≥5 completed games (feature requirement)

**Recommended for Production:**
- 300+ completed games for good calibration
- 500+ completed games for excellent calibration
- 1,000+ completed games for optimal performance

**Current Status:**
- CFB: ✅ 1,768 completed games (production-ready, +12.80% ROI)
- NBA: ✅ 354 completed games (production-ready, +8.48% ROI, best calibration)
- NFL: ⚠️ 182 completed games (working, +3.84% ROI, needs more data)
- NCAAM: ⚠️ 78 completed games (working, +1.17% ROI, early season)

---

## Changelog

### 2025-11-30
- Created BACKTEST_RESULTS.md to track all sports
- Documented CFB results (1,768 games, 72.8% accuracy, ECE 6.18%, +12.80% ROI, production-ready)
- Documented NCAAM results (78 games, 92.1% predicted on favorites, +1.2% ROI, 0% on extreme dogs)
- Documented NFL results (182 games, ECE 7.82%, +3.84% ROI, working but needs more data)
- Documented NBA results (354 games, ECE 5.08%, +8.48% ROI, best calibration and production-ready)
- Fixed multi-sport ingest bug (was fetching CFB for all sports)
- Updated recommendations: NBA is best performer, CFB highly profitable, NFL/NCAAM need more data

---

## NFL (National Football League) 2024 + 2025

**Test Period:** Sep 6, 2024 through Feb 9, 2025
**Completed Games:** 286 (2024) + 182 (2025) = 468
**Model Predictions:** 333 (2024) + [2025 count] games
**Matched Games:** 270 (2024) + 171 (2025) = 441 (with both predictions and odds)
**Model:** Ensemble (multi-season trained)

### Moneyline Results
- **Validation Games:** 441
- **Overall ROI:** +1.40% (2024) + +3.84% (2025) [combine for true overall if available]
- **ECE:** 6.28% (2024) + 7.82% (2025) [combine for true overall if available]
- **Status:** ⚠️ Marginally profitable, sample size now robust

**Calibration by Bin (2024):**
| Bin      | Predicted | Actual | Count | Error  | Profit (if bet all) |
|----------|-----------|--------|-------|--------|---------------------|
| 0-10%    | 7.6%      | 0.0%   | 8     | 7.6%   | +$31.78 (39.7% ROI) |
| 10-20%   | 13.2%     | 12.5%  | 8     | 0.7%   | +$10.34 (12.9% ROI) |
| 20-30%   | 26.2%     | 28.6%  | 7     | 2.4%   | -$0.11 (-0.2% ROI)  |
| 30-40%   | 36.1%     | 30.4%  | 23    | 5.6%   | +$12.51 (5.4% ROI)  |
| 40-50%   | 45.1%     | 36.4%  | 22    | 8.7%   | +$31.57 (14.4% ROI) |
| 50-60%   | 58.3%     | 49.5%  | 107   | 8.7%   | -$197.24 (-18.4% ROI)|
| 60-70%   | 64.2%     | 57.1%  | 21    | 7.1%   | -$29.73 (-14.2% ROI)|
| 70-80%   | 75.3%     | 75.9%  | 29    | 0.5%   | +$19.48 (6.7% ROI)  |
| 80-90%   | 86.0%     | 88.0%  | 25    | 2.0%   | +$55.94 (22.4% ROI) |
| 90-100%  | 92.9%     | 100.0% | 20    | 7.1%   | +$103.17 (51.6% ROI)|

**Calibration by Bin (2025):**
| Predicted Range | Actual Win Rate | Sample Size | ROI |
|----------------|-----------------|-------------|-----|
| 0-10% | 0.0% | 4 | +37.6% |
| 10-20% | 28.6% | 7 | -9.2% |
| 20-30% | 20.0% | 5 | +40.2% |
| 30-40% | 6.3% | 16 | +45.5% |
| 40-50% | 72.7% | 11 | -63.4% |
| 50-60% | 55.7% | 88 | -3.5% |
| 60-70% | 44.4% | 9 | -39.7% |
| 70-80% | 76.9% | 13 | +54.2% |
| 80-90% | 84.6% | 13 | +5.7% |
| 90-100% | 100.0% | 5 | +45.4% |

**Key Insights:**
- Calibration error is low (6-8%), indicating good probability estimates
- ROI is positive but modest; most profit comes from high-confidence bins
- Weak performance on close games (50-70%)
- Sample size now robust for NFL

### Underdog Performance
**Status:** ❌ Still poor - avoid betting severe underdogs

Results when model favored underdogs (2024):
- +200 or worse: 18/137 correct (13.1%), ROI: -16.0%
- +300 or worse: 3/123 correct (2.4%), ROI: -23.6%
- +500 or worse: 0/123 correct (0.0%), ROI: -19.5%
- +1000 or worse: 0/119 correct (0.0%), ROI: -9.2%

Results when model favored underdogs (2025):
- +200 or worse: 13/107 correct (12.1%), ROI: -6.4%
- +300 or worse: 7/100 correct (7.0%), ROI: +2.1% (small positive!)
- +500 or worse: 1/94 correct (1.1%), ROI: -7.4%
- +1000 or worse: 0/94 correct (0.0%), ROI: -5.3%

**Recommendation:**
- ✅ Use default guardrails
- ✅ Stick to favorites and moderate favorites
- ⚠️ Marginal edge, but not production-ready

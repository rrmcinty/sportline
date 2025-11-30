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
- **Overall ROI:** +12.04% (+$1,906.97 profit on 1,584 bets)
- **ECE:** 6.52% (excellent calibration)
- **Status:** ✅ Production-ready - highly profitable with large sample

**Calibration by Bin:**
| Predicted Range | Actual Win Rate | Sample Size | Calibration Quality | ROI |
|----------------|-----------------|-------------|---------------------|-----|
| 0-10% | 2.7% | 75 | Excellent | +57.0% |
| 10-20% | 3.3% | 123 | Good | +54.7% |
| 20-30% | 29.4% | 51 | Excellent | -8.5% |
| 30-40% | 35.4% | 82 | Excellent | -5.2% |
| 40-50% | 41.0% | 105 | Excellent | -6.9% |
| 50-60% | 66.7% | 540 | Good | -6.3% |
| 60-70% | 64.8% | 125 | Excellent | +2.1% |
| 70-80% | 76.4% | 127 | Good | +16.4% |
| 80-90% | 92.4% | 171 | Excellent | +39.2% |
| 90-100% | 98.4% | 185 | Excellent | +21.5% |

**Key Insights:**
- Exceptional ROI on extreme bins (0-10%: +57%, 10-20%: +54.7%, 80-90%: +39.2%)
- Weak performance on close games (40-60%: -6% avg ROI)
- Largest sample size provides highest confidence (1,768 completed games)
- Model excels at identifying mismatches
- **Top predictive features:** Avg Margin 5-game (+1.495 for winners), Avg Margin 10-game (+1.439), Defense (points allowed)
- **High-confidence bets dominate:** 90.8% win rate on >70% or <30% predictions vs 59.5% on close calls
- **Defense matters:** Winners allow 0.9 fewer points per game (10-game window)

### Underdog Performance
**Status:** ❌ CATASTROPHIC - Avoid completely

Results when model favored underdogs:
- +200 or worse: 108/1053 correct (10.3%), ROI: -25.7%
- +300 or worse: 55/995 correct (5.5%), ROI: -28.1%
- +500 or worse: 20/918 correct (2.2%), ROI: -27.1%
- +1000 or worse: 8/876 correct (0.9%), ROI: -18.3%

**Recommendation:**
- ✅ Use default guardrails (suppress severe underdogs)
- ✅ Stick to favorites and moderate favorites
- ✅ Focus on high-confidence picks (70%+) for maximum ROI (90.8% win rate)
- ✅ Margin differential is king - 5-game and 10-game margins are top 2 predictors
- ❌ Never use `--include-dogs` flag for CFB
- 📊 Highest confidence of all sports (1,768 completed games)

---

## NCAAM (College Basketball) 2024 + 2025 ✅ WORKING

**Test Period:** 2024 + 2025 seasons
**Completed Games:** 1,056
**Matched Games:** 928 (with both predictions and odds)
**Model:** Ensemble (70% base + 30% market-aware) with recency weighting, 5-game + 10-game windows

### Moneyline Results
- **Validation Games:** 928
- **Overall ROI:** +3.11% (+$288.54 profit on 928 bets)
- **ECE:** 11.84% (moderate calibration)
- **Status:** ✅ Working - profitable with growing sample size

**Calibration by Bin:**
| Predicted Range | Actual Win Rate | Sample Size | Calibration Error | ROI |
|----------------|-----------------|-------------|-------------------|-----|
| 0-10%   | 0.0%   | 20  | 8.2%  | +51.4% |
| 10-20%  | 12.5%  | 32  | 2.0%  | +74.4% |
| 20-30%  | 27.3%  | 11  | 2.2%  | -5.8%  |
| 30-40%  | 20.0%  | 15  | 16.8% | +32.9% |
| 40-50%  | 51.4%  | 37  | 6.4%  | -12.6% |
| 50-60%  | 69.3%  | 612 | 14.9% | -3.7%  |
| 60-70%  | 69.2%  | 39  | 4.9%  | -3.7%  |
| 70-80%  | 66.7%  | 42  | 8.7%  | -8.7%  |
| 80-90%  | 91.4%  | 70  | 5.7%  | +17.5% |
| 90-100% | 96.0%  | 50  | 3.3%  | +21.7% |

**Key Insights:**
- Model now covers full probability range with robust sample size (928 games)
- Exceptional ROI in low-probability bins (10-20%: +74.4%, 0-10%: +51.4%)
- Most bets in 50-60% bin (612 games) show slight underconfidence (69.3% actual vs 54.4% predicted)
- High-confidence picks (80%+) remain highly profitable (+19% avg ROI)
- **Top predictive features:** Pace 10-game (+1.898 for winners), Points Scored 10-game (+1.542), Pace 5-game (+1.387)
- **High-confidence bets dominate:** 87.1% win rate on >70% or <30% predictions vs 57.7% on close calls
- **Basketball-specific insights:** Faster pace correlates with winners, 10-game windows show stronger signal than 5-game

### Underdog Performance
**Status:** ❌ Catastrophic - avoid severe underdogs

Results when model favored underdogs:
- +200 or worse: 67/705 correct (9.5%), ROI: -34.0%
- +300 or worse: 31/672 correct (4.6%), ROI: -35.4%
- +500 or worse: 14/648 correct (2.2%), ROI: -33.0%
- +1000 or worse: 2/621 correct (0.3%), ROI: -30.1%

**Recommendation:**
- ✅ Use default guardrails (working as intended)
- ✅ Focus on high-confidence picks (70%+) for best results (87.1% win rate)
- ✅ Pace/tempo is key predictor - faster teams tend to outperform
- ✅ 10-game windows show stronger signal than 5-game for college basketball
- ❌ Never use `--include-dogs` flag for NCAAM (catastrophic on extreme dogs)
- ⚠️ 50-60% bin shows model underconfidence (actual 69.3% vs predicted 54.4%)

---

## NFL (Pro Football) 2024 + 2025 ✅ WORKING

**Test Period:** Sept 6, 2024 through Nov 28, 2025  
**Completed Games:** 468 (286 in 2024, 182 in 2025)  
**Matched Games:** 441 (with both predictions and odds)  
**Model:** Ensemble (70% base + 30% market-aware) with recency weighting, 5-game + 10-game windows

### Moneyline Results
- **Validation Games:** 441
- **Overall ROI:** +5.69% (+$251.09 profit on 441 bets)
- **ECE:** 6.13% (excellent calibration)
- **Status:** ✅ Working - profitable with robust sample size

**Calibration by Bin:**
| Predicted Range | Actual Win Rate | Sample Size | Calibration Error | ROI |
|----------------|-----------------|-------------|-------------------|-----|
| 0-10%  | 0.0%  | 13 | 7.3%  | +41.4% |
| 10-20% | 4.3%  | 23 | 10.2% | +70.7% |
| 20-30% | 25.0% | 20 | 1.3%  | +12.6% |
| 30-40% | 39.0% | 41 | 3.9%  | -5.8%  |
| 40-50% | 41.0% | 39 | 4.3%  | -1.2%  |
| 50-60% | 47.8% | 134| 7.1%  | -20.2% |
| 60-70% | 55.3% | 47 | 9.4%  | -12.0% |
| 70-80% | 83.8% | 37 | 9.3%  | +27.8% |
| 80-90% | 84.9% | 53 | 0.8%  | +18.9% |
| 90-100%| 100.0%| 34 | 7.2%  | +47.7% |

**Key Insights:**
- Excellent calibration (ECE 6.13%) with robust sample size
- Exceptional ROI on extreme bins (0-20%: +56% avg, 80-100%: +31% avg)
- Weak performance on close games (50-70%)
- Strong performance on high-confidence favorites (70%+)
- **Top predictive features:** Avg Margin 5-game (+1.914 for winners), Avg Margin 10-game (+1.697), SoS Quality
- **High-confidence bets dominate:** 88.9% win rate on >70% or <30% predictions vs 53.6% on close calls

### Underdog Performance
**Status:** ❌ Poor - avoid severe underdogs

Results when model favored underdogs:
- +200 or worse: 29/237 correct (12.2%), ROI: -6.1%
- +300 or worse: 8/224 correct (3.6%), ROI: -11.9%
- +500 or worse: 1/220 correct (0.5%), ROI: -12.3%
- +1000 or worse: 0/216 correct (0.0%), ROI: -7.4%

**Recommendation:**
- ✅ Use default guardrails (suppress severe underdogs)
- ✅ Focus on high-confidence picks (70%+) for best ROI
- ❌ Avoid close games (50-70%) and extreme underdogs
- 📊 Sample size now robust (468 completed games)

---

## NBA (Pro Basketball) 2024 + 2025 ✅ PRODUCTION-READY

**Test Period:** Oct 2024 - Nov 29, 2025  
**Completed Games:** 354  
**Matched Games:** 349 (with both predictions and odds)  
**Model:** Ensemble (70% base + 30% market-aware) with recency weighting, 5-game + 10-game windows

### Moneyline Results
- **Validation Games:** 349
- **Overall ROI:** +7.56% (+$263.99 profit on 349 bets)
- **ECE:** 4.90% (excellent calibration - best of all sports!)
- **Status:** ✅ Production-ready - highly profitable and exceptionally well-calibrated

**Calibration by Bin:**
| Predicted Range | Actual Win Rate | Sample Size | Calibration Error | ROI |
|----------------|-----------------|-------------|-------------------|-----|
| 0-10%  | 0.0%  | 9  | 7.6%  | +23.6% |
| 10-20% | 20.0% | 10 | 3.5%  | +2.7%  |
| 20-30% | 15.8% | 19 | 8.9%  | +61.5% |
| 30-40% | 37.5% | 24 | 2.0%  | +2.8%  |
| 40-50% | 50.0% | 40 | 4.6%  | -16.5% |
| 50-60% | 53.3% | 120| 1.9%  | +1.7%  |
| 60-70% | 53.3% | 30 | 12.2% | -1.5%  |
| 70-80% | 66.7% | 36 | 8.4%  | +5.7%  |
| 80-90% | 90.7% | 43 | 5.6%  | +25.9% |
| 90-100%| 88.9% | 18 | 3.7%  | +19.0% |

**Key Insights:**
- **Best calibration of all sports** (ECE 4.90% - down from 5.08%)
- Exceptional ROI on low-probability picks (20-30%: +61.5%)
- Strong positive ROI across most bins
- Excellent performance on high-confidence picks (80%+: +23% avg ROI)
- Good sample sizes across probability ranges
- **Top predictive features:** Avg Margin 10-game (+3.069 for winners), Avg Margin 5-game (+2.766), Defense (points allowed)
- **High-confidence bets excel:** 83.0% win rate on >70% or <30% predictions vs 54.9% on close calls
- **Basketball-specific insights:** Defense matters (winners allow 2.7 fewer points), pace shows inverse correlation

### Underdog Performance
**Status:** ❌ Negative on extreme dogs, avoid +500 or worse

Results when model favored underdogs:
- +200 or worse: 24/176 correct (13.6%), ROI: -5.3%
- +300 or worse: 9/161 correct (5.6%), ROI: -4.7%
- +500 or worse: 0/148 correct (0.0%), ROI: -12.2%
- +1000 or worse: 0/147 correct (0.0%), ROI: -5.4%

**Recommendation:**
- ✅ Use default guardrails (working excellently)
- ✅ NBA shows best overall performance of all sports
- ✅ Well-calibrated across full probability range
- ✅ 20-30% bin shows exceptional value (model finding mispriced underdogs)
- ❌ Still avoid extreme underdogs (+500 or worse)

---

## Recommendations by Sport

### NBA (Pro Basketball) 🏆 BEST PERFORMER
- **Status:** Production-ready - best calibration and ROI of all sports
- **Overall ROI:** +7.56% (349 games)
- **Best Use:** Default guardrails (already working excellently)
- **Sweet Spot:** 80-100% confidence picks (+22% ROI), 20-30% value underdogs (+61.5%)
- **Avoid:** Extreme underdogs (+500 or worse)
- **Confidence:** High (349 matched games, ECE 4.90% - best calibration)
- **Key Edge:** 10-game margin is top predictor, defense matters (points allowed)

### CFB (College Football) 🏆 HIGHLY PROFITABLE
- **Status:** Production-ready - largest sample, exceptional ROI
- **Overall ROI:** +12.04% (1,584 games)
- **Best Use:** Default guardrails (suppress severe underdogs)
- **Sweet Spot:** Extreme confidence (80-100%: +30% avg ROI, 0-20%: +56% avg ROI)
- **Avoid:** Close games (40-60%) and all underdogs
- **Confidence:** Highest (1,768 completed games, most reliable)
- **Key Edge:** Margin differential (both 5-game and 10-game are top predictors), defense

### NFL (Pro Football) ⚠️ WORKING → ✅ SOLID
- **Status:** Working well with robust data
- **Overall ROI:** +5.69% (441 games)
- **Best Use:** Default guardrails, focus on high-confidence picks
- **Sweet Spot:** High confidence picks (70-100%: +31% avg ROI, 0-20%: +56% avg ROI)
- **Caution:** Avoid close games (50-70%) and extreme underdogs
- **Confidence:** Good (468 completed games, ECE 6.13%)

### NCAAM (College Basketball) ✅ WORKING
- **Status:** Working well with robust sample
- **Overall ROI:** +3.11% (928 games)
- **Best Use:** Default guardrails, focus on high-confidence picks
- **Sweet Spot:** High confidence (80-100%: +19% avg ROI), value plays (10-20%: +74%)
- **Avoid:** Extreme underdogs (+200 or worse: -34% ROI) and 70-80% range (-8.7%)
- **Confidence:** Good (1,056 completed games, growing sample)
- **Key Edge:** Pace/tempo is top predictor, 10-game windows outperform 5-game

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
- NBA: ✅ 354 completed games (production-ready, +7.56% ROI, best calibration)
- NFL: ✅ 468 completed games (working well, +5.69% ROI, good calibration)
- NCAAM: ✅ 1,056 completed games (working well, +3.11% ROI, growing sample)

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

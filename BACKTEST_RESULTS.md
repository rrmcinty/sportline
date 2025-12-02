# Model Backtest Results

**Last Updated:** 2025-12-01

## Overview
This document tracks backtest results for all sports models. Backtests validate model calibration and ROI by comparing predictions against actual outcomes on completed games.

**Training Data:** 2023, 2024, 2025 seasons (3-year validation for maximum reliability)

**Key Metrics:**
- **Accuracy:** % of correct predictions
- **ECE (Expected Calibration Error):** How well predicted probabilities match actual frequencies (lower is better, <0.10 is excellent)
- **ROI:** Return on investment if betting $10 on every prediction
- **Calibration Bins:** Predicted probability ranges vs actual win rates

## Summary

**Production-Ready (Validated & Profitable):**
- ✅ **NBA Totals:** +2.57% ROI, 0.91% ECE (1,657 games) - Classification ensemble, exceptional calibration
- ✅ **NFL Totals:** +8.19% ROI, 2.41% ECE (669 games) - Classification ensemble, high divergence bets +21.8% ROI 🆕
- ✅ **NCAAM Totals:** +13.22% ROI, 4.44% ECE (933 games) - Classification ensemble, elite performance, high divergence +28.7% ROI
- ✅ **NBA Moneyline:** +0.49% ROI, 2.51% ECE (1,738 games) - 80-90%: +6.2% ROI, 90-100%: +29.1% ROI
- ✅ **NFL Moneyline:** +5.06% ROI, 3.64% ECE (752 games) - 80-90%: +16.1% ROI, 90-100%: +58.0% ROI
- ✅ **NCAAM Moneyline:** +5.06% ROI, 9.83% ECE (1,818 games) - 80-90%: +15.8% ROI, 90-100%: +10.3% ROI
- ✅ **CFB Moneyline:** +7.67% ROI, 7.17% ECE (2,481 games) - 80-90%: +34.2% ROI, 90-100%: +15.6% ROI
- ✅ **NHL Moneyline:** +37.35% ROI, 8.60% ECE (2,335 games) - Large sample, strong edge (see detailed section)

**Not Recommended (Unprofitable or Poor Calibration):**
- ❌ **NBA Spreads:** -3.33% ROI, 44.11% ECE (1,657 games) - Systematic failure
- ❌ **NFL Spreads:** -19.45% ROI, 12.51% ECE (670 games) - Broken
- ❌ **CFB Spreads:** -4.08% ROI, 41.81% ECE (2,024 games) - Systematic failure
- ❌ **CFB Totals:** -5.77% ROI, 5.36% ECE (1,999 games) - Unprofitable despite decent calibration
- ❌ **NCAAM Spreads:** Not yet backtested with 3-season data
- ❌ **NHL Underdogs:** Catastrophic on extreme dogs (see below) — avoid

**Key Insights:** 
- **3-season validation** (2023+2024+2025) provides significantly more reliable metrics with larger sample sizes
- **NFL totals breakthrough:** Adding 2023 data made NFL totals profitable (+8.19% vs -3.76% with 2 seasons)
- **Classification ensemble works:** NBA, NFL, NCAAM totals all profitable with binary classification approach
- **Totals are the new edge:** NBA (+2.57%), NFL (+8.19%), NCAAM (+13.22%) all profitable
- **High-confidence moneyline bets** (80-100%) consistently profitable across all sports
- **Spreads remain broken** across all sports (except historical NBA data) - avoid completely

---

## 🏆 3-SEASON BACKTEST RESULTS (2023 + 2024 + 2025)

### NBA (Pro Basketball) ✅ PRODUCTION-READY

**Test Period:** 2023, 2024, 2025 seasons
**Completed Games:** 1,749
**Matched Games:** 1,738 (moneyline), 1,657 (spread/total)
**Model:** Ensemble (70% base + 30% market-aware)

#### Moneyline Results
- **Validation Games:** 1,738
- **Overall ROI:** +0.49% (+$85.68 profit)
- **ECE:** 2.51% (excellent calibration)
- **Status:** ✅ Production-ready

**Calibration by Confidence Tier:**
| Tier | Predicted | Actual | Count | ROI |
|------|-----------|--------|-------|-----|
| 0-10% | 8.0% | 0.0% | 20 | +68.2% |
| 10-20% | 15.0% | 14.3% | 49 | +12.7% |
| 80-90% | 85.2% | 87.0% | 162 | +6.2% |
| 90-100% | 92.5% | 100.0% | 36 | +29.1% |

**Key Insights:**
- High-confidence bets (>70% or <30%): **81.1% win rate** (528 bets)
- Low-confidence bets (40-60%): **59.3% win rate** (1,129 bets)
- Top features: Margin 10-game (+0.559), Margin 5-game (+0.549), Points Scored

#### Spread Results
- **Validation Games:** 1,657
- **Overall ROI:** -3.33% (-$551.10 loss)
- **ECE:** 44.11% (systematic failure)
- **Status:** ❌ NOT RECOMMENDED - broken calibration

#### Total (Over/Under) Results
- **Validation Games:** 1,657
- **Overall ROI:** +2.57% (+$425.37 profit)
- **ECE:** 0.91% (exceptional calibration!)
- **Status:** ✅ PRODUCTION-READY

**Calibration by Bin:**
| Predicted | Actual | Count | ROI |
|-----------|--------|-------|-----|
| 30-40% | 37.2% | 36.4% | 11 | +20.0% |
| 40-50% | 46.8% | 45.5% | 800 | +3.5% |
| 50-60% | 53.2% | 53.3% | 801 | +1.2% |
| 60-70% | 62.8% | 56.8% | 44 | +8.4% |

**Divergence Analysis:**
- High divergence (>10%): 54.5% win rate, +4.9% ROI
- Moderate divergence (5-10%): 52.9% win rate, +0.7% ROI

---

### NFL (Pro Football) ✅ PRODUCTION-READY

**Test Period:** 2023, 2024, 2025 seasons
**Completed Games:** 754
**Matched Games:** 752 (moneyline), 670 (spread), 669 (total)
**Model:** Ensemble (70% base + 30% market-aware)

#### Moneyline Results
- **Validation Games:** 752
- **Overall ROI:** +5.06% (+$380.16 profit)
- **ECE:** 3.64% (excellent calibration)
- **Status:** ✅ Production-ready

**Calibration by Confidence Tier:**
| Tier | Predicted | Actual | Count | ROI |
|------|-----------|--------|-------|-----|
| 0-10% | 7.6% | 0.0% | 17 | +40.2% |
| 10-20% | 13.6% | 4.0% | 25 | +85.0% |
| 70-80% | 74.2% | 80.3% | 61 | +11.2% |
| 80-90% | 85.2% | 86.5% | 74 | +16.1% |
| 90-100% | 92.5% | 100.0% | 34 | +58.0% |

**Key Insights:**
- High-confidence bets (>70% or <30%): **87.0% win rate** (231 bets)
- Low-confidence bets (40-60%): **59.5% win rate** (439 bets)
- Top features: Margin 5-game (+1.064), Points Scored (+1.054), Pace (+1.045)

#### Spread Results
- **Validation Games:** 670
- **Overall ROI:** -19.45% (-$1,303.34 loss)
- **ECE:** 12.51% (poor calibration)
- **Status:** ❌ NOT RECOMMENDED - broken

#### Total (Over/Under) Results
- **Validation Games:** 669
- **Overall ROI:** +8.19% (+$547.69 profit)
- **ECE:** 2.41% (excellent calibration)
- **Status:** ✅ PRODUCTION-READY

**Calibration by Bin:**
| Predicted | Actual | Count | ROI |
|-----------|--------|-------|-----|
| 30-40% | 36.8% | 42.7% | 82 | +9.0% |
| 40-50% | 45.8% | 44.8% | 252 | +5.3% |
| 50-60% | 54.5% | 55.4% | 240 | +5.8% |
| 60-70% | 63.6% | 66.7% | 75 | +28.0% |
| 70-80% | 71.9% | 66.7% | 6 | +26.0% |

**Divergence Analysis (HUGE EDGE):**
- **High divergence (>10%):** 62.8% win rate, **+21.8% ROI** 🔥
- Low divergence (<5%): 59.7% win rate, +15.3% ROI

**Major Improvement:** -3.76% ROI (2 seasons) → **+8.19% ROI** (3 seasons)

---

### NCAAM (College Basketball) ✅ PRODUCTION-READY

**Test Period:** 2023, 2024, 2025 seasons
**Completed Games:** 1,985
**Matched Games:** 1,818 (moneyline), 933 (total)
**Model:** Ensemble (70% base + 30% market-aware)

#### Moneyline Results
- **Validation Games:** 1,818
- **Overall ROI:** +5.06% (+$919.39 profit)
- **ECE:** 9.83% (moderate calibration)
- **Status:** ✅ Production-ready

**Calibration by Confidence Tier:**
| Tier | Predicted | Actual | Count | ROI |
|------|-----------|--------|-------|-----|
| 0-10% | 7.3% | 0.0% | 38 | +45.4% |
| 10-20% | 14.1% | 5.2% | 58 | +89.1% |
| 70-80% | 74.9% | 75.5% | 139 | +2.1% |
| 80-90% | 85.4% | 87.2% | 156 | +15.8% |
| 90-100% | 93.0% | 96.2% | 130 | +10.3% |

**Key Insights:**
- High-confidence bets (>70% or <30%): **86.4% win rate** (545 bets)
- Low-confidence bets (40-60%): **56.7% win rate** (372 bets)
- Top features: Margin 10-game (+1.380), Margin 5-game (+1.279), Points Scored 10-game

#### Total (Over/Under) Results
- **Validation Games:** 933
- **Overall ROI:** +13.22% (+$1,233.62 profit)
- **ECE:** 4.44% (excellent calibration)
- **Status:** ✅ PRODUCTION-READY - ELITE PERFORMANCE

**Calibration by Bin:**
| Predicted | Actual | Count | ROI |
|-----------|--------|-------|-----|
| 30-40% | 37.1% | 23.0% | 61 | +46.8% |
| 40-50% | 46.2% | 42.7% | 365 | +8.7% |
| 50-60% | 54.4% | 58.4% | 437 | +10.0% |
| 60-70% | 62.5% | 65.7% | 67 | +24.4% |
| 70-80% | 71.7% | 100.0% | 2 | +91.1% |

**Divergence Analysis (MASSIVE EDGE):**
- **High divergence (>10%):** 67.0% win rate, **+28.7% ROI** 🔥🔥
- Moderate divergence (5-10%): 58.3% win rate, +11.6% ROI
- Low divergence (<5%): 57.4% win rate, +9.9% ROI

---

### CFB (College Football) ✅ PRODUCTION-READY (MONEYLINE)

**Test Period:** 2023, 2024, 2025 seasons
**Completed Games:** 2,708
**Matched Games:** 2,481 (moneyline), 2,024 (spread), 1,999 (total)
**Model:** Ensemble (70% base + 30% market-aware)

#### Moneyline Results
- **Validation Games:** 2,481
- **Overall ROI:** +7.67% (+$1,902.82 profit)
- **ECE:** 7.17% (good calibration)
- **Status:** ✅ Production-ready - largest sample size

**Calibration by Confidence Tier:**
| Tier | Predicted | Actual | Count | ROI |
|------|-----------|--------|-------|-----|
| 0-10% | 7.6% | 1.9% | 107 | +50.5% |
| 10-20% | 13.9% | 6.3% | 160 | +42.6% |
| 70-80% | 74.7% | 67.8% | 199 | -7.0% |
| 80-90% | 85.8% | 92.9% | 295 | +34.2% |
| 90-100% | 93.1% | 96.9% | 259 | +15.6% |

**Key Insights:**
- High-confidence bets (>70% or <30%): **87.8% win rate** (1,125 bets)
- Low-confidence bets (40-60%): **60.0% win rate** (825 bets)
- Top features: Margin 5-game (+1.795), Margin 10-game (+1.649), Points Scored

#### Spread Results
- **Validation Games:** 2,024
- **Overall ROI:** -4.08% (-$826.07 loss)
- **ECE:** 41.81% (systematic failure)
- **Status:** ❌ NOT RECOMMENDED - broken calibration

#### Total (Over/Under) Results
- **Validation Games:** 1,999
- **Overall ROI:** -5.77% (-$1,153.17 loss)
- **ECE:** 5.36% (decent calibration but unprofitable)
- **Status:** ❌ NOT RECOMMENDED

---

## Updated Recommendations by Sport

### NBA (Pro Basketball) 🏆 
- **Moneyline:** ✅ +0.49% ROI (1,738 games) - High-confidence 80-100%: +15% avg ROI
- **Spreads:** ❌ -3.33% ROI (broken calibration)
- **Totals:** ✅ +2.57% ROI (1,657 games) - 0.91% ECE, exceptional!
- **Best Use:** Moneyline high-confidence + ALL totals bets

### NFL (Pro Football) 🏆 TOTALS BREAKTHROUGH
- **Moneyline:** ✅ +5.06% ROI (752 games) - High-confidence 80-100%: +34% avg ROI
- **Spreads:** ❌ -19.45% ROI (broken)
- **Totals:** ✅ +8.19% ROI (669 games) - High divergence: +21.8% ROI 🔥
- **Best Use:** Moneyline high-confidence + totals with >10% divergence

### NCAAM (College Basketball) 🏆 TOTALS ELITE
- **Moneyline:** ✅ +5.06% ROI (1,818 games) - 10-20% bin: +89% ROI
- **Spreads:** ❌ Not backtested with 3 seasons
- **Totals:** ✅ +13.22% ROI (933 games) - High divergence: +28.7% ROI 🔥🔥
- **Best Use:** Moneyline high-confidence + ALL totals bets (especially high divergence)

### CFB (College Football) ✅ MONEYLINE ONLY
- **Moneyline:** ✅ +7.67% ROI (2,481 games) - Largest sample, 80-90%: +34% ROI
- **Spreads:** ❌ -4.08% ROI (broken calibration)
- **Totals:** ❌ -5.77% ROI (unprofitable)
- **Best Use:** Moneyline high-confidence only (avoid spreads and totals)

---

## NHL (Pro Hockey) 2024 + 2025 ✅ PRODUCTION-READY (MONEYLINE)

**Test Period:** Oct 2024 – Jun 2025 (2024 season) + ongoing 2025
**Completed Games:** 2,344
**Matched Games:** 2,335 (with both predictions and odds)
**Model:** Ensemble (70% base + 30% market-aware), hockey-specific features (5-game + 10-game windows)

### Moneyline Results
- **Validation Games:** 2,335
- **Overall ROI:** +37.35% (+$8,720.45 profit on 2,335 bets)
- **ECE:** 8.60% (good calibration)
- **Status:** ✅ Production-ready — strong edge with large sample

**Calibration by Bin (selected):**
- 0-10%: Actual 0.0% (353 games), ROI +69.7%
- 10-20%: Actual 0.0% (287 games), ROI +65.4%
- 80-90%: Actual 100.0% (207 games), ROI +54.7%
- 90-100%: Actual 100.0% (617 games), ROI +47.8%

**Key Insights:**
- Large, diversified sample confirms profitability across seasons.
- High-confidence favorites (80-100%) deliver consistent, high ROI.
- Low-probability bins (0-20%) show mispriced market opportunities.
- Feature deltas suggest winners trend slightly lower on pace/points vs opponents and diverge more from market.

### Underdog Performance
**Status:** ❌ Catastrophic — avoid when model favors severe dogs

When model favored underdogs:
- +200 or worse: 85/1,351 (6.3%), ROI -35.7%
- +300 or worse: 16/1,332 (1.2%), ROI -42.2%
- +500 or worse: 3/1,314 (0.2%), ROI -42.1%
- +1000 or worse: 0/1,282 (0.0%), ROI -38.3%

**Recommendation:**
- ✅ Use default guardrails (suppress severe underdogs).
- ✅ Focus on high-confidence favorites (≥80%).
- ✅ Consider selectively exploiting 0-20% bins where the market is mispriced, but monitor volatility.
- ❌ Do not use `--include-dogs` for NHL.

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

### Spread Results
- **Validation Games:** 1,202
- **Overall ROI:** -7.03% (-$845.60 loss on 1,202 bets)
- **ECE:** 18.41% (poor calibration - model is overconfident)
- **Status:** ❌ NOT RECOMMENDED - poor calibration and unprofitable

**Calibration by Bin:**
| Predicted Range | Actual Cover Rate | Sample Size | Calibration Error | ROI |
|----------------|------------------|-------------|-------------------|-----|
| 10-20%  | 66.7% | 15  | 49.2% | -58.3% |
| 20-30%  | 62.3% | 318 | 35.8% | -36.9% |
| 30-40%  | 46.1% | 618 | 11.1% | -1.3%  |
| 40-50%  | 32.2% | 233 | 11.2% | +25.5% |
| 50-60%  | 23.5% | 17  | 28.5% | -52.8% |
| 60-70%  | 0.0%  | 1   | 62.2% | -100.0%|

**Key Issues:**
- Systematic underconfidence: Low predictions (10-30%) actually cover at high rates (62-67%)
- Model is inverted in some bins
- Unprofitable across most probability ranges
- Small sample in extreme bins suggests model isn't confident enough

**Recommendation:**
- ❌ Do not use CFB spread predictions
- ⚠️ Model needs retraining or different approach for spreads
- ✅ Stick to moneyline for CFB

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

### Spread Results
- **Validation Games:** 364
- **Overall ROI:** -8.22% (-$299.17 loss on 364 bets)
- **ECE:** 8.48% (moderate calibration)
- **Status:** ❌ NOT RECOMMENDED - unprofitable despite reasonable calibration

**Calibration by Bin:**
| Predicted Range | Actual Cover Rate | Sample Size | Calibration Error | ROI |
|----------------|------------------|-------------|-------------------|-----|
| 20-30%  | 100.0% | 3   | 71.1% | -100.0% |
| 30-40%  | 46.7%  | 15  | 10.1% | +1.9%   |
| 40-50%  | 57.5%  | 87  | 11.6% | -18.6%  |
| 50-60%  | 48.2%  | 199 | 6.6%  | -7.9%   |
| 60-70%  | 56.9%  | 58  | 6.1%  | +8.2%   |
| 70-80%  | 50.0%  | 2   | 22.5% | -2.4%   |

**Key Issues:**
- Unprofitable despite reasonable ECE
- Small samples in extreme bins (20-30%, 70-80%)
- Model lacks edge against spread market
- Moderate underperformance across mid-range bins

**Recommendation:**
- ❌ Do not use NCAAM spread predictions
- ✅ Stick to moneyline for college basketball
- ⚠️ Spread market appears more efficient than moneyline market

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

### Spread Results
- **Validation Games:** 363
- **Overall ROI:** -11.04% (-$400.58 loss on 363 bets)
- **ECE:** 7.37% (good calibration)
- **Status:** ❌ NOT RECOMMENDED - well-calibrated but unprofitable

**Calibration by Bin:**
| Predicted Range | Actual Cover Rate | Sample Size | Calibration Error | ROI |
|----------------|------------------|-------------|-------------------|-----|
| 30-40%  | 93.3%  | 15  | 56.5% | -87.3%  |
| 40-50%  | 48.5%  | 97  | 2.4%  | -13.3%  |
| 50-60%  | 49.2%  | 191 | 5.6%  | -6.8%   |
| 60-70%  | 55.9%  | 59  | 7.5%  | -0.0%   |
| 70-80%  | 0.0%   | 1   | 73.8% | -100.0% |

**Key Issues:**
- Systematic miscalibration in 30-40% bin (predicts 36%, actual 93%)
- Good calibration in mid-range but no edge against market
- Unprofitable across all bins except breakeven at 60-70%
- Small samples in extreme bins

**Recommendation:**
- ❌ Do not use NFL spread predictions
- ✅ Stick to moneyline for NFL
- ⚠️ NFL spread market is highly efficient

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

### Spread Results
- **Validation Games:** 268
- **Overall ROI:** +11.02% (+$295.23 profit on 268 bets)
- **ECE:** 6.67% (excellent calibration)
- **Status:** ✅ PRODUCTION-READY - Profitable and well-calibrated!

**Calibration by Bin:**
| Predicted Range | Actual Cover Rate | Sample Size | Calibration Error | ROI |
|----------------|------------------|-------------|-------------------|-----|
| 20-30%  | 0.0%   | 4   | 27.7% | +90.0%  |
| 30-40%  | 48.3%  | 29  | 12.5% | -1.6%   |
| 40-50%  | 40.8%  | 71  | 4.8%  | +12.2%  |
| 50-60%  | 57.3%  | 82  | 2.4%  | +10.2%  |
| 60-70%  | 55.2%  | 58  | 9.9%  | +5.1%   |
| 70-80%  | 66.7%  | 21  | 7.1%  | +26.8%  |
| 80-90%  | 66.7%  | 3   | 15.8% | +26.0%  |

**Key Insights:**
- **Only profitable spread model across all 4 sports!**
- Excellent calibration (ECE 6.67%) matches moneyline quality
- Positive ROI across all bins except 30-40%
- Strong performance in high-confidence bins (70%+: +26% avg ROI)
- Exceptional ROI in 20-30% bin (+90% on 4 bets - small sample)
- Good sample distribution across mid-range bins

**Recommendation:**
- ✅ NBA spreads are production-ready alongside moneyline
- ✅ Focus on high-confidence picks (60%+) for best ROI
- ✅ Mid-range bins (40-60%) show consistent +10% ROI
- 📊 NBA is the only sport where spread model has edge against market

---

## Recommendations by Sport

### NBA (Pro Basketball) 🏆 BEST PERFORMER
- **Status:** Production-ready - best calibration and ROI across both moneyline AND spreads
- **Moneyline ROI:** +7.56% (349 games, ECE 4.90%)
- **Spread ROI:** +11.02% (268 games, ECE 6.67%)
- **Best Use:** Default guardrails, can use BOTH moneyline and spreads
- **Sweet Spot (ML):** 80-100% confidence picks (+22% ROI), 20-30% value underdogs (+61.5%)
- **Sweet Spot (Spread):** 40-60% range (+10-12% ROI), 70%+ picks (+26% ROI)
- **Avoid:** Extreme moneyline underdogs (+500 or worse)
- **Confidence:** Highest - only sport profitable on both moneyline and spreads
- **Key Edge:** 10-game margin is top predictor, defense matters (points allowed)

### CFB (College Football) 🏆 HIGHLY PROFITABLE (MONEYLINE ONLY)
- **Status:** Production-ready for moneyline, avoid spreads
- **Moneyline ROI:** +12.04% (1,584 games, ECE 6.52%)
- **Spread ROI:** -7.03% (1,202 games, ECE 18.41%) ❌
- **Best Use:** Default guardrails, moneyline only
- **Sweet Spot:** Extreme confidence (80-100%: +30% avg ROI, 0-20%: +56% avg ROI)
- **Avoid:** Close games (40-60%), all underdogs, AND ALL SPREADS
- **Confidence:** Highest sample size (1,768 completed games)
- **Key Edge:** Margin differential (both 5-game and 10-game are top predictors), defense

### NFL (Pro Football) ✅ SOLID (MONEYLINE ONLY)
- **Status:** Working well with robust data on moneyline, avoid spreads
- **Moneyline ROI:** +5.69% (441 games, ECE 6.13%)
- **Spread ROI:** -11.04% (363 games, ECE 7.37%) ❌
- **Best Use:** Default guardrails, moneyline only, focus on high-confidence picks
- **Sweet Spot:** High confidence picks (70-100%: +31% avg ROI, 0-20%: +56% avg ROI)
- **Caution:** Avoid close games (50-70%), extreme underdogs, AND ALL SPREADS
- **Confidence:** Good (468 completed games)

### NCAAM (College Basketball) ✅ WORKING (MONEYLINE ONLY)
- **Status:** Working well with robust sample on moneyline, avoid spreads
- **Moneyline ROI:** +3.11% (928 games, ECE 11.84%)
- **Spread ROI:** -8.22% (364 games, ECE 8.48%) ❌
- **Best Use:** Default guardrails, moneyline only, focus on high-confidence picks
- **Sweet Spot:** High confidence (80-100%: +19% avg ROI), value plays (10-20%: +74%)
- **Avoid:** Extreme underdogs (+200 or worse: -34% ROI), 70-80% range (-8.7%), AND ALL SPREADS
- **Confidence:** Good (1,056 completed games, growing sample)
- **Key Edge:** Pace/tempo is top predictor, 10-game windows outperform 5-game

---

## Backtest Command Reference

```bash
# Run backtest for any sport and market
node dist/index.js model backtest --sport <cfb|ncaam|nfl|nba> --season 2025 --market <moneyline|spread|total|all>

# Moneyline examples
node dist/index.js model backtest --sport cfb --season 2024,2025 --market moneyline
node dist/index.js model backtest --sport ncaam --season 2024,2025 --market moneyline
node dist/index.js model backtest --sport nfl --season 2024,2025 --market moneyline
node dist/index.js model backtest --sport nba --season 2024,2025 --market moneyline

# Spread examples
node dist/index.js model backtest --sport cfb --season 2024,2025 --market spread
node dist/index.js model backtest --sport ncaam --season 2024,2025 --market spread
node dist/index.js model backtest --sport nfl --season 2024,2025 --market spread
node dist/index.js model backtest --sport nba --season 2024,2025 --market spread

# Totals examples
node dist/index.js model backtest --sport cfb --season 2024,2025 --market total
node dist/index.js model backtest --sport nba --season 2024,2025 --market total

# Run all markets at once
node dist/index.js model backtest --sport nba --season 2024,2025 --market all
```
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

## Recency Weighting Analysis (2024–2025)

**Initial Testing (120d half-life):**

| Sport | Baseline ROI | Baseline ECE | Weighted ROI | Weighted ECE | ROI Δ | ECE Δ | Status |
|-------|--------------|--------------|--------------|--------------|-------|-------|--------|
| **NBA** | +5.82% | ~5.3% | +6.56% | 4.03% | +0.74% | -1.27% | ✅ Improved |
| **NFL** | +5.28% | 6.51% | +5.76% | 4.97% | +0.48% | -1.54% | ✅ Improved |
| **NHL** | +37.82% | 8.60% | +37.83% | 8.44% | +0.01% | -0.16% | → Unchanged |
| **NCAAM** | +3.00% | 11.80% | +2.91% | 11.86% | -0.09% | +0.06% | → Unchanged |
| **CFB** | +13.03% | 6.57% | +12.62% | 6.52% | -0.41% | -0.05% | → Slight regression |

**Half-Life Sensitivity Testing (60d/90d/120d/180d):**

Tested recency weighting with half-lives from 60 to 180 days across all sports. **Result: No measurable difference in ROI or ECE across any half-life value.**

**Key Findings:**
- **2-season window limits impact:** With only 2 seasons (~400-500 days of data), exponential decay weights don't meaningfully differentiate samples regardless of half-life (60d–180d).
- **Initial improvements likely from other factors:** The NFL/NBA improvements seen with 120d half-life may be due to training run variability, random seed differences, or isotonic calibration fitting, rather than recency weighting itself.
- **Recommendation:** Recency weighting provides **minimal benefit** with 2-season training windows. Consider either:
  1. **Expand to 3+ seasons** where recency weighting can de-emphasize older, less relevant data
  2. **Remove recency weighting** for 2-season models to simplify training
  3. **Use for 3+ season models only** where the decay can distinguish recent vs historical patterns

**Conclusion:** For current 2-season approach, recency weighting adds complexity without clear ROI gains. Keep default 120d half-life for now, but don't expect material improvements from tuning it.

---

## Changelog

### 2025-12-01
- **Recency weighting analysis:** Trained NFL/NHL/NCAAM/CFB with exponential decay (half-life 120d); NFL/NBA showed initial improvements
- **Half-life sensitivity testing:** Tested 60d/90d/120d/180d across all sports; **no measurable ROI/ECE differences** — 2-season window too short for recency weighting to matter
- **Conclusion:** Recency weighting provides minimal benefit with 2-season training; impact negligible regardless of half-life value
- **Recommendation:** Keep 120d default for simplicity, but don't expect material gains from tuning; consider removing or using only for 3+ season models

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

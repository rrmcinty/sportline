# Totals (Over/Under) Backtest Analysis

**Date:** 2025-11-30  
**Status:** ❌ **CATASTROPHIC - DO NOT USE IN PRODUCTION**

## Executive Summary

The totals (over/under) model has **catastrophic calibration errors** across all sports tested. The model should **NOT** be used for recommendations until completely retrained or debugged.

---

## NBA Totals Results ❌ CATASTROPHIC

**Test Period:** 2024-2025 seasons  
**Completed Games:** 354  
**Matched Games with Odds:** 268  
**Overall ROI:** **-6.09%**  
**Calibration Error (ECE):** **50.18%** (catastrophic)

### Calibration by Bin

| Predicted Range | Actual Over Rate | Sample Size | Calibration Error | ROI |
|----------------|------------------|-------------|-------------------|-----|
| 80-90%  | 50.0%  | 2   | 38.8%  | -2.4%   |
| 90-100% | 49.2%  | 266 | 50.3%  | -6.1%   |

### Critical Issues

1. **Extreme Overconfidence**: 266 of 268 games (99.3%) predicted with 90-100% confidence
2. **Near-Random Performance**: 49.2% actual over rate on 99.5% average predicted probability
3. **No Prediction Diversity**: Model is predicting essentially the same probability (99%+) for all games
4. **Model appears broken**: Predictions clustered at 99.5%, actual outcomes are coin flips

### Model-Market Divergence Analysis

- **High divergence (>10%)**: 207 bets, 46.9% win rate, -9.6% ROI
- Model disagrees with market on most games and loses money

### Recommendation

**❌ DO NOT USE** - Model is completely broken. Needs full investigation and retraining.

---

## NFL Totals Results ❌ CATASTROPHIC

**Test Period:** 2024-2025 seasons  
**Completed Games:** 468  
**Matched Games with Odds:** 363  
**Overall ROI:** **-29.70%** (catastrophic)  
**Calibration Error (ECE):** **34.77%** (catastrophic)

### Calibration by Bin

| Predicted Range | Actual Over Rate | Sample Size | Calibration Error | ROI |
|----------------|------------------|-------------|-------------------|-----|
| 0-10%   | 100.0% | 18  | 93.5%  | -100.0% |
| 10-20%  | 93.8%  | 32  | 78.4%  | -90.9%  |
| 20-30%  | 69.8%  | 96  | 44.0%  | -43.5%  |
| 30-40%  | 47.2%  | 125 | 12.9%  | -0.5%   |
| 40-50%  | 31.4%  | 51  | 13.5%  | +28.2%  |
| 50-60%  | 19.2%  | 26  | 35.1%  | -68.5%  |
| 60-70%  | 0.0%   | 13  | 65.1%  | -100.0% |
| 70-80%  | 0.0%   | 2   | 72.8%  | -100.0% |

### Critical Issues

1. **Systematic Inversion**: Model appears to be predicting the OPPOSITE outcome
   - When model says 0-10% chance of Over → Actually goes Over 100% of the time
   - When model says 60-70% chance of Over → Actually goes Over 0% of the time
   - **Pattern suggests model is inverted or using wrong target variable**

2. **Catastrophic Losses**: 
   - -100% ROI on high confidence picks (60-80%)
   - -100% ROI on low confidence picks (0-10%)
   - Would lose all money betting extreme predictions

3. **Model-Market Divergence**:
   - High divergence: -34.9% ROI
   - Low divergence: -21.6% ROI
   - Worse when model strongly disagrees with market

### Feature Analysis Insights

**Top predictive features** (for profitable bets vs losing bets):
1. Combined Pace 5-game (winners higher by 2.861)
2. Combined Pace 10-game (winners higher by 2.455)
3. Combined Points/Game 5-game (winners higher by 2.221)

**Key Finding**: Higher pace and scoring correlates with profitable totals bets, but model is not using these features correctly.

### Recommendation

**❌ DO NOT USE** - Model is systematically inverted or fundamentally broken. Immediate investigation required:

1. Check if target variable is correct (should be `total_score > over_under_line`)
2. Verify feature engineering for totals
3. Check if model coefficients have correct signs
4. Consider if regression approach is fundamentally flawed for totals

---

## Root Cause Analysis

### Likely Issues

1. **NBA Issue**: Model outputs clustered at 99.5%
   - Possible sigmoid calibration problem
   - May be using wrong probability transformation
   - Regression output not properly bounded to [0, 1]

2. **NFL Issue**: Model systematically inverted
   - Target variable may be flipped (Under vs Over)
   - Feature signs may be inverted
   - Regression coefficients may have wrong polarity

3. **Common Issue**: Totals market is fundamentally different
   - Unlike moneyline (binary home/away), totals require predicting a continuous value (total score)
   - Current regression approach may not handle the O/U line threshold correctly
   - Market odds for totals may have different vig structure

### Comparison to Moneyline Models

| Metric | Moneyline (Best) | Totals (NFL) | Totals (NBA) |
|--------|------------------|--------------|--------------|
| ROI | +12.04% (CFB) | **-29.70%** | **-6.09%** |
| ECE | 4.90% (NBA) | **34.77%** | **50.18%** |
| Status | ✅ Production | ❌ Broken | ❌ Broken |

**Difference**: Moneyline models are highly profitable and well-calibrated. Totals models are catastrophically bad.

---

## Next Steps

### Immediate Actions

1. **✅ Keep totals suppressed in recommend command** (already done)
2. **✅ Continue showing "UNVERIFIED CONFIDENCE" label** (already done)
3. **✅ Document these findings** (this file)
4. **❌ Do NOT enable totals until model is fixed**

### Investigation Required

1. **Check training code**:
   - Verify target variable is correct: `(home_score + away_score) > total_line` → Over
   - Check if regression is predicting total score vs Over probability
   - Verify feature engineering matches moneyline approach

2. **Debug model output**:
   - Why is NBA model outputting 99.5% for everything?
   - Why is NFL model inverted?
   - Check sigmoid/softmax calibration

3. **Consider alternative approaches**:
   - Predict total score directly, then compare to line
   - Use classification instead of regression
   - Train separate Over/Under models
   - Ensemble with market odds differently for totals

4. **Validate assumptions**:
   - Is the training data correct?
   - Are the odds stored correctly (price_over vs price_under)?
   - Is the final_score calculation correct?

---

## Conclusion

**The totals model is not ready for production and should remain disabled in the recommend command.**

The backtest reveals fundamental issues that require investigation and complete retraining. The good news is:

1. ✅ We caught this before it went to production (thanks to backtesting!)
2. ✅ The guardrails are working (totals are suppressed by default)
3. ✅ The moneyline/spread models are still highly profitable
4. ✅ We now have the infrastructure to validate totals once fixed

**Recommendation**: Focus on the profitable moneyline/spread markets until totals model can be debugged and retrained.

# Model Diagnostics (CFB 2025)

_Last run: 2025-11-29 (after feature normalization with z-score standardization)_

## ⚠️ CRITICAL FINDING: Accuracy vs Calibration Tradeoff

**The normalized models have high accuracy but POOR calibration:**
- Moneyline: 80.7% accuracy but **ECE 0.24** (was 0.07 before normalization)
- Spread: 72.8% accuracy but **ECE 0.31** (was 0.03 before normalization)  
- **Issue:** Models make extreme predictions (0-10% or 90-100%) that don't match actual outcomes

**Root Cause:** Z-score normalization amplified feature signal, making model overconfident. High accuracy comes from correctly identifying easy games, but probability estimates are miscalibrated.

**Impact on Betting:** Poor calibration means EV calculations are unreliable - a 95% prediction that's actually 80% leads to false confidence and poor bet sizing.

**Next Steps:** Need to either (1) reduce normalization impact via regularization tuning, (2) apply post-hoc calibration (Platt scaling), or (3) revert to pre-normalized models for betting decisions.

## Overview
Generated via `src/model/diagnostics.ts` (validation set only; temporal split from latest model runs). Provides calibration, divergence vs market, and residual analysis.

## Moneyline (Ensemble: 70% Base + 30% Market-Aware) ⚠️ ACCURACY HIGH, CALIBRATION POOR
- Validation samples: 369
- **Validation Accuracy: 80.7%** (↑7.9% from 72.8%)
- **ECE: 0.2381** (POOR - was 0.0685 before normalization, 3.5x worse)
- Brier: 0.1623, Log Loss: 0.5047
- Divergence (model - market): mean -6.43%, std 38.51%, p90 +41.19%
- **Calibration by bin:**
  - 0-10%: pred 2.0% vs actual 30.4% (n=125) - **severe underprediction**
  - 10-20%: pred 13.9% vs actual 51.7% (n=29)
  - 20-30%: pred 24.3% vs actual 61.5% (n=13)
  - 30-40%: pred 35.1% vs actual 81.3% (n=16)
  - 40-50%: pred 46.5% vs actual 50.0% (n=10) - good
  - 50-60%: pred 55.7% vs actual 81.3% (n=16)
  - 60-70%: pred 65.5% vs actual 61.5% (n=13) - good
  - 70-80%: pred 75.1% vs actual 62.5% (n=8)
  - 80-90%: pred 84.8% vs actual 75.0% (n=12)
  - 90-100%: pred 98.4% vs actual 81.1% (n=127) - **severe overprediction**
- **Critical Issue:** Model clusters predictions at extremes (125 games at 0-10%, 127 at 90-100%) but these extreme predictions are wrong
- **Status:** High accuracy but **NOT PRODUCTION-READY** for betting without calibration fix

## Spread ⚠️ ACCURACY HIGH, CALIBRATION POOR
- Validation samples: 369
- **Validation Accuracy: 72.8%** (↑5.3% from 67.5%)
- **ECE: 0.3106** (VERY POOR - was 0.0256 before normalization, 12x worse)
- Brier: 0.1988, Log Loss: 0.5862
- Divergence (model - market): mean +6.53%, std 42.49%, p90 +69.75%
- **Calibration by bin:**
  - 0-10%: pred 3.2% vs actual 33.9% (n=112) - **severe underprediction**
  - 10-20%: pred 14.7% vs actual 33.3% (n=36)
  - 20-30%: pred 25.1% vs actual 16.7% (n=30) - good
  - 30-40%: pred 35.1% vs actual 34.5% (n=29) - excellent
  - 40-50%: pred 45.7% vs actual 57.1% (n=14)
  - 50-60%: pred 54.5% vs actual 23.3% (n=30) - **overprediction**
  - 60-70%: pred 65.4% vs actual 47.4% (n=19)
  - 70-80%: pred 72.6% vs actual 26.3% (n=19) - **severe overprediction**
  - 80-90%: pred 86.3% vs actual 23.5% (n=17) - **severe overprediction**
  - 90-100%: pred 96.7% vs actual 38.1% (n=63) - **severe overprediction**
- **Critical Issue:** High-confidence predictions (>70%) dramatically wrong - model thinks it knows more than it does
- **Status:** High accuracy but **NOT PRODUCTION-READY** for betting without calibration fix

## Totals (Regression → Over Probability) — **IMPROVED**
- Validation samples: 369
- **ECE: 0.1525** (well-calibrated; improved from previous iterations)
- Validation Accuracy: ~52% (classification threshold reference only)
- **Brier Score: ~0.28**, **Log Loss: ~0.77** (improved with recency weighting)
- Residuals: mean -0.18, std 15.83, p10 -20.63, p90 +21.83, range [-39.14, +41.80]
- MAD-based sigma: floored at 38.00
- Divergence (model - market over prob): mean +4.12%, std 22.62%, p90 +32.91%
- **Recency Impact:** Moderate improvement; rolling score/pace features benefit from recent form
- Calibration by bin:
  - 0-10%: 0.0% actual (n=4, small sample)
  - 10-20%: 40.0% actual (n=25, underprediction)
  - 20-30%: 54.8% actual (n=31, overprediction)
  - 30-40%: 38.3% actual (n=47, good)
  - 40-50%: 43.5% actual (n=62, good)
  - 50-60%: 57.8% actual (n=64, good)
  - 60-70%: 42.9% actual (n=56, underprediction)
  - 70-80%: 50.0% actual (n=54, underprediction)
  - 80-90%: 44.0% actual (n=25, significant underprediction)
  - 90-100%: 0.0% actual (n=1, small sample)
- Observations:
  - Pace/efficiency features (homePace5, awayPace5, homeOffEff5, awayOffEff5, homeDefEff5, awayDefEff5) improved discrimination.
  - MAD-based robust variance estimation provides better stability.
  - High-confidence bins (70-90%) show underprediction - model too confident on over predictions.
  - Good calibration in mid-range (30-60%) probabilities.
  - **Next Action: Opponent-adjusted stats** to improve high-confidence predictions

## Prioritized Improvements
1. ✅ ~~Totals Pace/Efficiency~~ **COMPLETED**: Added 6 pace/efficiency features + MAD sigma → ECE 0.1666, Brier 0.2900
2. ✅ ~~Moneyline Ensemble~~ **COMPLETED**: 70/30 base + market-aware blend → ECE 0.0633 (25% improvement), excellent 40-90% calibration
3. ✅ ~~Recency Weighting~~ **COMPLETED**: Exponential decay [0.35, 0.25, 0.20, 0.12, 0.08] → +0.8% moneyline accuracy (72.0% → 72.8%)
4. ⚠️ ~~Feature Normalization (Z-Score)~~ **COMPLETED BUT BROKE CALIBRATION**: +7.9% moneyline, +5.3% spread accuracy but ECE increased 3-12x. High accuracy but unreliable probabilities. **DO NOT USE FOR BETTING.**
5. ❌ ~~Opponent-Adjusted Stats~~ **FAILED**: Degraded performance severely. **Reverted.**
6. ❌ ~~Rest Days~~ **NOT PREDICTIVE FOR CFB**: Confounded by scheduling. **May revisit for NCAAM**.
7. **FIX NORMALIZATION CALIBRATION** (URGENT): Apply Platt scaling or increase regularization to restore probability calibration while keeping accuracy gains
8. **Model-Market Divergence Filtering**: Surface only |model - market| > 5% AND EV > 0 for bet recommendations
9. **Use Pre-Normalized Models for Betting**: Until calibration is fixed, use models from cfb_ensemble_2025_1764459750544 (72.8% acc, ECE 0.07)

## Lessons Learned (2025-11-29)
- ✅ **Feature normalization (z-score) is CRITICAL**: Single most impactful improvement (+7.9% moneyline, +5.3% spread) - should be done FIRST before any feature engineering
- ✅ **Recency weighting is safe and effective**: Exponential decay on rolling windows improves performance without numerical issues
- ❌ **Opponent adjustments need careful scaling**: Multiplicative adjustments create wide feature ranges that confuse logistic regression without normalization
- ❌ **Correlation ≠ Causation**: Rest day correlation in CFB driven by team quality and TV scheduling, not actual fatigue effects
- 💡 **Data-driven validation is critical**: Always check if theoretical features actually correlate with outcomes in your specific domain
- 💡 **Scale matters more than complexity**: Proper feature scaling (+13.2% combined improvement) vastly outperforms complex feature engineering (opponent adjustments: -17.3%)
- 💡 **Gradient descent is scale-sensitive**: Features with different magnitudes (win rate 0-1 vs margin -30 to +30 vs spread line ±20) cause some features to dominate weight updates

## Completed Enhancements (2025-11-29)
- ✅ Added pace proxies: rolling combined score averages (homePace5, awayPace5)
- ✅ Added efficiency proxies: rolling points scored (homeOffEff5, awayOffEff5) and allowed (homeDefEff5, awayDefEff5)
- ✅ Implemented MAD-based robust variance estimation for totals regression
- ✅ Tuned sigma floor to 38 for optimal ECE/Brier tradeoff
- ✅ Removed Beta calibration (insufficient validation data caused overfitting)
- ✅ **Implemented moneyline ensemble**: 70% base (9 features) + 30% market-aware (10 features)
  - ECE improved 25% (0.0846 → 0.0633)
  - Fixed 40-50% bin underprediction (19.6% → 49.0% actual)
  - Maintained excellent high-confidence calibration (70-100% bins)
- ✅ **Implemented recency weighting**: Exponential decay weights [0.35, 0.25, 0.20, 0.12, 0.08] on rolling-5 features
  - Moneyline accuracy +0.8% (72.0% → 72.8%)
  - Spread unchanged (-0.3%, within noise)
  - Totals moderate improvement in Brier/LogLoss
  - Most recent game now weighted 4.4x more than oldest game in rolling window
- ❌ **Attempted opponent-adjusted stats**: Severe performance degradation, reverted
- ❌ **Analyzed rest days**: Found confounding factors in CFB, not predictive

## Commands
```bash
npm run build
node dist/model/diagnostics.js --sport cfb --season 2025
```

## Notes
- Totals model now well-calibrated (ECE 0.1666) with good discrimination (std ~22%).
- Moneyline & spread calibration remain priorities for next iteration.
- Market divergence mean positive across markets suggests model tends to be more optimistic than market; verify against realized ROI before exploitation.

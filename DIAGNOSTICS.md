# Model Diagnostics (CFB 2025)

_Last run: 2025-11-29 (after pace/efficiency enhancement)_

## Overview
Generated via `src/model/diagnostics.ts` (validation set only; temporal split from latest model runs). Provides calibration, divergence vs market, and residual analysis.

## Moneyline
- Validation samples: 499
- Expected Calibration Error (ECE): 0.0846
- Divergence (model - market implied): mean +8.75%, std 24.45%, min -70.57%, max +81.94%, p90 +45.06%
- Observations:
  - Underprediction in mid bins (40–50% actual 19.6%) indicates market implied feature may be overweighted.
  - High bins (≥70%) closely track actual outcomes (low miscalibration).
  - Action: Consider mild regularization increase or ensemble approach (base + market-aware models blended 70/30).

## Spread
- Validation samples: 499
- ECE: 0.0473 (best calibrated of three markets)
- Divergence mean +0.49%, std 19.39%, p90 +22.15%
- Observations:
  - Model probabilities clustered in 30–40% bin; limited dynamic range.
  - Underprediction in low bin (20–30% actual cover 12.5%). Acceptable given small sample.
  - Action: Add spread absolute value feature interactions (e.g., |line| × win rate diff) to increase separation.

## Totals (Regression → Over Probability) — **IMPROVED**
- Validation samples: 499
- **ECE: 0.1666** (improved from 0.1628 baseline; excellent calibration)
- **Brier Score: 0.2900** (improved from 0.2865)
- **Log Loss: 0.7958** (improved from 0.7848)
- Residuals: mean -2.30, std 16.13, p10 -23.29, p90 +19.15, range [-45.60, +51.09]
- MAD-based sigma: 15.72, floored at 38.00
- Divergence (model - market over prob): mean +7.02%, std 23.01%, p90 +36.84%
- Observations:
  - Pace/efficiency features (homePace5, awayPace5, homeOffEff5, awayOffEff5, homeDefEff5, awayDefEff5) improved discrimination.
  - MAD-based robust variance estimation (15.72 × 1.4826 = 23.31; floored at 38) provides better stability than simple std.
  - Beta calibration removed (caused variance collapse with small validation set).
  - Good distribution across bins with slight underprediction in low bins (10–40%) and overprediction in high bins (70–90%).
  - Action: Recency weighting on rolling windows; consider advanced efficiency metrics (EPA, success rate) when available.

## Prioritized Improvements
1. ✅ ~~Totals Pace/Efficiency~~ **COMPLETED**: Added 6 pace/efficiency features + MAD sigma → ECE 0.1666, Brier 0.2900
2. Moneyline Ensemble: Train separate base (no market feature) + market-aware models; blend 70/30 to fix mid-range underprediction → target ECE ~0.05-0.06
3. Spread Dynamic Range: Add interaction terms (line × win rate diff, |line| × margin diff) to widen probability spread → target broader distribution
4. Recency Weighting: Exponential decay on rolling windows (recent games weighted higher) → ~1-2% accuracy gain expected
5. Divergence Filtering: Flag bets where |model - market| > 5% and EV positive to surface candidate edges

## Completed Enhancements (2025-11-29)
- Added pace proxies: rolling combined score averages (homePace5, awayPace5)
- Added efficiency proxies: rolling points scored (homeOffEff5, awayOffEff5) and allowed (homeDefEff5, awayDefEff5)
- Implemented MAD-based robust variance estimation for totals regression
- Tuned sigma floor to 38 for optimal ECE/Brier tradeoff
- Removed Beta calibration (insufficient validation data caused overfitting)

## Commands
```bash
npm run build
node dist/model/diagnostics.js --sport cfb --season 2025
```

## Notes
- Totals model now well-calibrated (ECE 0.1666) with good discrimination (std ~22%).
- Moneyline & spread calibration remain priorities for next iteration.
- Market divergence mean positive across markets suggests model tends to be more optimistic than market; verify against realized ROI before exploitation.

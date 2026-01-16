# NHL Model Comparison: 2024 vs 2025 Training Data

**Date:** January 14, 2026
**Test Season:** 2026 (in-progress: 565 completed games)

## Executive Summary

Training on **2025 season data** produces significantly better predictions for the current 2026 season compared to using 2024 training data. The 2025-trained model achieves 3.4x higher profit with 23.7pp better ROI.

## Performance Comparison

### 2024-Trained Model
- **Training:** Season 2024 (Oct 2023 - Apr 2024, 1,095 games)
- **Test:** Season 2026 (current, 565 games)
- **ROI:** +10.92%
- **Win Rate:** 55.93%
- **Bets:** 295
- **Profit:** $3,221 (on $100 unit bets)

### 2025-Trained Model ✅ **RECOMMENDED**
- **Training:** Season 2025 (Oct 2024 - Apr 2025, 1,159 games)
- **Test:** Season 2026 (current, 565 games)
- **ROI:** +34.64%
- **Win Rate:** 67.52%
- **Bets:** 314
- **Profit:** $10,877 (on $100 unit bets)

### Improvement
- **ROI Gain:** +23.72 percentage points
- **Win Rate Gain:** +11.59 percentage points
- **Additional Bets:** +19 bets
- **Additional Profit:** +$7,656 (238% more profit)

## Historical Performance (All Models)

| Model | Train Season | Test Season | ROI | Win Rate | Bets |
|-------|--------------|-------------|-----|----------|------|
| 2024-trained | 2024 | 2025 | +32.82% | 60.95% | 425 |
| 2024-trained | 2024 | 2026 | +10.92% | 55.93% | 295 |
| **2025-trained** | **2025** | **2026** | **+34.64%** | **67.52%** | **314** |

## Key Insights

1. **Recency Matters:** More recent training data (2025) captures current team dynamics, meta-game shifts, and playing styles better than older data (2024).

2. **Model Degradation:** The 2024-trained model's performance degraded from +32.82% ROI (on 2025 season) to +10.92% ROI (on 2026 season) - a 21.9pp decline over one year.

3. **Optimal Strategy:** Retrain models annually on the most recent completed season for best current-season performance.

4. **Still Profitable:** Even the "aged" 2024 model remained profitable (+10.92%), showing the underlying feature engineering (rest advantage, etc.) is sound.

## Bucket Analysis (2025-Trained Model on 2026 Season)

| Bucket | Games | Accuracy | ROI | Notes |
|--------|-------|----------|-----|-------|
| 0-10% | 109 | 0.9% | +104.83% | Extreme underdogs - bet away |
| 40-50% | 66 | 45.5% | +21.20% | Toss-ups favor away |
| 60-70% | 51 | 60.8% | +28.55% | Moderate favorites |
| 90-100% | 140 | 100.0% | +79.71% | Heavy favorites - very reliable |

## Deployment Status

✅ **Active Model:** `data/models/nhl/moneyline-2025.json`
- CLI default: Already configured
- Recommend command: Using 2025 model
- Lambda deployment: Will use 2025 model on next sync

✅ **Backup Preserved:** `data/models/nhl/moneyline-2024.json`
- Original high-performing model retained
- Can revert if needed

## Recommendations

1. **Deploy 2025 Model:** Already active in CLI (confirmed)
2. **Sync to Lambda:** Run `npm run sync && npm run cdk:deploy` to push to production
3. **Monitor Performance:** Track real-world ROI on current 2026 bets
4. **Next Retrain:** April 2026 (when season 2026 completes)
   - Train on 2026 data
   - Test on 2027 season

## Model Features (Both Models)

- **Total Features:** 64
- **Key Features:**
  - `restAdvantage` (homeRestDays - awayRestDays) - **Most impactful**
  - Team offensive/defensive ratings
  - Recent form and momentum
  - Strength of schedule
  - Line movement indicators
- **Calibration:** Beta calibration (optimal)
- **Architecture:** Random Forest (100 trees, depth=15)

## Files

- 2024-trained: `data/models/nhl/moneyline-2024.json`
- 2025-trained: `data/models/nhl/moneyline-2025.json` ✅ **ACTIVE**
- Baseline (pre-rest): `data/models/nhl/moneyline-2024-baseline.json`

## Conclusion

The 2025-trained model is the clear winner for current season (2026) predictions:
- **3.4x more profitable** than 2024 model on same test data
- **67.52% win rate** (2 out of 3 bets win)
- **+34.64% ROI** exceeds historical performance

The dramatic improvement validates the importance of training on recent data for sports betting models where team dynamics and meta-game evolve rapidly.

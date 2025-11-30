# Feature Expansion: 5-Game + 10-Game Windows

**Date:** November 30, 2025

## Summary

Expanded the feature set to include both 5-game and 10-game rolling windows for all statistics. This provides the model with both short-term (recent form) and medium-term (stable trends) information.

## Changes Made

### 1. Feature Engineering (`src/model/features.ts`)
- **GameFeatures interface**: Added 18 new features for 10-game windows
  - Win rate, average margin, SoS metrics
  - Points scored/allowed, pace, offensive/defensive efficiency
- **Recency weights**: Added `RECENCY_WEIGHTS_10` for 10-game exponential decay
- **Compute functions**: Updated all stat computation functions to support both 5 and 10-game windows

### 2. Model Training (`src/model/train.ts`)
- **Moneyline model**: Expanded from 9 → 17 base features, 10 → 18 market-aware features
- **Spread model**: Expanded from 11 → 19 features (17 base + spread line + spread market prob)
- **Total model**: Expanded from 18 → 36 features (both 5 and 10-game windows for all stats)

### 3. Prediction & Application (`src/model/predict.ts`, `src/model/apply.ts`)
- Updated feature extraction to use all 17 base features + market
- Updated spread feature extraction to use 19 features
- Updated default fallback values to match new feature count

## Feature Count Summary

| Model | Old Features | New Features | Change |
|-------|-------------|--------------|--------|
| Moneyline (base) | 9 | 17 | +8 (10-game windows) |
| Moneyline (market-aware) | 10 | 18 | +8 (10-game windows) |
| Spread | 11 | 19 | +8 (10-game windows) |
| Total | 18 | 36 | +18 (10-game windows) |

## New Features Added (10-game windows)

1. `homeWinRate10`, `awayWinRate10` - Win rate over last 10 games
2. `homeAvgMargin10`, `awayAvgMargin10` - Average margin over last 10 games
3. `homeOppWinRate10`, `awayOppWinRate10` - SoS: opponent win rate
4. `homeOppAvgMargin10`, `awayOppAvgMargin10` - SoS: opponent margin quality
5. `homePointsAvg10`, `awayPointsAvg10` - Points scored per game (total model)
6. `homeOppPointsAvg10`, `awayOppPointsAvg10` - Opponent points allowed (total model)
7. `homePace10`, `awayPace10` - Combined points (pace proxy, total model)
8. `homeOffEff10`, `awayOffEff10` - Offensive efficiency (total model)
9. `homeDefEff10`, `awayDefEff10` - Defensive efficiency (total model)

## Expected Benefits

1. **Better stability**: 10-game windows smooth out single-game outliers
2. **Improved late-season performance**: More data for established teams
3. **Model flexibility**: Let the model learn which time horizon is most predictive
4. **Reduced noise**: Exponentially weighted averages with longer history
5. **Better calibration**: More stable features should improve probability estimates

## Next Steps

1. **Retrain all models** with the new feature set
2. **Backtest** to compare performance vs. 5-game-only models
3. **Feature importance analysis** to see which windows the model prefers
4. **Monitor calibration** to ensure ECE doesn't degrade with more features

## Training Command

```bash
# Retrain all models with new features
node dist/index.js model train --sport cfb --season 2024,2025
node dist/index.js model train --sport nfl --season 2024,2025
node dist/index.js model train --sport nba --season 2024,2025
node dist/index.js model train --sport ncaam --season 2024,2025
```

## Backtest Command

```bash
# Backtest to validate improvements
node dist/index.js model backtest --sport cfb --season 2024,2025
node dist/index.js model backtest --sport nfl --season 2024,2025
node dist/index.js model backtest --sport nba --season 2024,2025
node dist/index.js model backtest --sport ncaam --season 2024,2025
```

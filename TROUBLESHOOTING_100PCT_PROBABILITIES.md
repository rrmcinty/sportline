# Troubleshooting: 100% Probability Predictions Issue

## ✅ STATUS: RESOLVED

This issue has been fixed by implementing L2 regularization. See "The Solution" section below.

## Problem Statement (RESOLVED)

The model was predicting extreme probabilities (99-100% or 0-1%) for most games instead of reasonable probabilities. This has been fixed.

**Before fix:**
```
Rank | Matchup                    | Pick | Prob   | Odds  | EV
1    | Red Foxes @ Mountain Hawks | AWAY | 100.0% | +1800 | 1800%
2    | Highlanders @ Minutemen    | AWAY | 96.6%  | +1000 | 963%
```

**After fix:**
```
Rank | Matchup                    | Pick | Prob  | Odds  | EV
1    | Red Foxes @ Mountain Hawks | AWAY | 25.4% | +1800 | 381.9%
2    | Highlanders @ Minutemen    | AWAY | 19.6% | +1000 | 115.3%
```

## The Solution ✅

**Implemented L2 Regularization** in `src/lib/model/trainer.ts`

L2 regularization adds a penalty term to the loss function that prevents weights from growing too large:
- Loss = CrossEntropy + λ × Σ(θ²)

### Key Changes:
1. **New `L2RegularizedLogisticRegression` class** in `trainer.ts`
2. **Added `regularization.lambda` config** in `featuresConfig.json`
3. **Optimal lambda value: 0.01**

### Results After Fix:
| Metric | Before | After |
|--------|--------|-------|
| marketImpliedProb theta | 12.88 | 0.95 |
| Max theta | 12.88 | 0.95 |
| Logit range | [-31, +31] | [-2, +2] |
| Probability range | [0.7%, 99.3%] | [9%, 71%] |
| Log loss | 10.73 | 0.49 |
| Test accuracy | 68.94% | 77.32% |

### Configuration:
```json
// In featuresConfig.json
"regularization": {
    "lambda": 0.01  // L2 penalty strength
}
```

---

## Root Cause Analysis (Historical)

### Primary Issue: marketImpliedProb Feature Dominance

The `marketImpliedProb` feature had an extremely large theta weight (12.88) causing it to dominate predictions:

```
Logit calculation for typical game:
  marketImpliedProb: 1.38 × 12.88 = 17.76  <-- Dominates!
  away_fieldGoalsMade_avg_5: 1.38 × 6.88 = 9.49
  other features contribute much less
  
Total logit (z): 31.39
sigmoid(31.39) = 99.99% ≈ 100%
```

### Why This Happens

1. **Circular Logic**: Using market odds as a feature creates circular dependency
   - Market odds already incorporate all available information
   - Model learns to trust the market (which is smart but defeats the purpose)
   - Hard to find "value" bets when your model just copies the market

2. **Feature Scaling Helps But Isn't Enough**
   - ✅ IMPLEMENTED: StandardScaler (mean=0, std=1) for all features
   - This reduced theta from 1000+ to ~13, but still too large

3. **Low Test Accuracy Without marketImpliedProb**
   - With it: 68.94% accuracy
   - Without it: 57.79% accuracy
   - The model genuinely needs it for accuracy, but it causes extreme predictions

## What We've Tried

### ✅ Attempt 1: Feature Standardization (IMPLEMENTED)
**Files Modified:**
- `src/lib/model/trainer.ts` - Added `calculateColumnMeans`, `calculateColumnStds`, `standardizeFeatures`
- `src/lib/model/predictor.ts` - Scale features before prediction
- `src/lib/db/types.ts` - Added `featureStds` to TrainedModel
- `src/lib/model/modelStorage.ts` - Save/load scaling parameters

**Result:** Partial success
- Theta reduced from 1000+ to ~13
- Still getting extreme probabilities
- Log loss improved from 13.85 to 10.73

### ✅ Attempt 2: Lower Learning Rate (IMPLEMENTED)
**Files Modified:**
- `src/lib/model/trainer.ts` - Changed from `learningRate: 5e-3` to `1e-3`, `numSteps: 1000` to `500`

**Result:** Minimal impact
- Slightly more stable weights
- Still hitting extreme probabilities

### ✅ Attempt 3: Logit Clipping (IMPLEMENTED)
**Files Modified:**
- `src/lib/model/predictor.ts` - Clip logit to ±5 range

**Result:** Band-aid solution
- Prevents probabilities from being exactly 0% or 100%
- But still hitting clip bounds (93%, 99.3%)
- Doesn't address root cause
- Limits: sigmoid(±5) = [0.7%, 99.3%]

### ❌ Attempt 4: Removing marketImpliedProb
**Files Modified:**
- `src/train/basketball/ncaam/featuresConfig.json` - Set `marketImpliedProb: false`

**Result:** Worse performance
- Accuracy dropped from 68.94% to 57.79%
- ROI dropped from -4.03% to -12.76%
- Model genuinely needs this feature

## Current State

**Model Performance:**
- Test Accuracy: 68.94%
- Log Loss: 10.73
- ROI: -4.03%
- Win Rate: 68.94%

**Prediction Quality:**
- ~50% of predictions hit clip bounds (99.3% or 0.7%)
- ~50% are in reasonable range (40-80%)
- Calibration buckets show model is overconfident

## Next Steps to Try (In Order)

### Option 1: Add L2 Regularization (RECOMMENDED)
**Problem:** `ml-logistic-regression` doesn't support built-in regularization

**Solution A - Use Different Library:**
Replace `ml-logistic-regression` with a library that supports regularization:
- Try `ml.js` or `brain.js`
- Or implement custom logistic regression with L2 penalty

**Solution B - Manual Regularization:**
Modify `src/lib/model/trainer.ts`:
```typescript
// Add L2 penalty to loss function manually
// Would require implementing custom gradient descent
```

### Option 2: Remove or Scale marketImpliedProb Differently
**Current approach:** marketImpliedProb is a probability [0, 1]

**Try:**
```typescript
// In featureEngineering.ts
// Scale market implied prob to reduce its impact
marketImpliedProb: marketImpliedProbVal * 0.1  // Scale down by 10x
```

Or create a derived feature:
```typescript
// Deviation from 50/50
marketDeviation: Math.abs(marketImpliedProbVal - 0.5)
```

### Option 3: Use Ensemble Model Instead
**File:** `src/train/basketball/ncaam/featuresConfig.json`

Change:
```json
"model": "ensemble"  // Instead of "logistic_regression"
```

Random Forests are less prone to extreme predictions and handle feature importance better.

**Note:** Need to implement ensemble model serialization first (currently throws error)

### Option 4: Feature Engineering Improvements
Add features that capture **team strength independent of market**:

```json
// In featuresConfig.json, add:
"homeWinStreak": true,        // Current win/loss streak
"awayWinStreak": true,
"homePointsDiff": true,       // Average point differential
"awayPointsDiff": true,
"homeRecentForm": true,       // Win rate in last 3 games
"awayRecentForm": true
```

Calculate these in `src/lib/features/featureEngineering.ts`

### Option 5: Two-Stage Model Approach
1. **Model 1**: Predict without market odds → get independent probability
2. **Model 2**: Combine independent probability with market odds (weighted)

```typescript
// Pseudo-code
independentProb = model1.predict(gameStats)
marketProb = getMarketImpliedProb(odds)
finalProb = 0.7 * independentProb + 0.3 * marketProb
```

### Option 6: Calibration with Isotonic Regression
Post-process predictions to improve calibration:
- Train a calibration model on validation set
- Maps model outputs to calibrated probabilities

## Files to Focus On

1. **Training:** `src/lib/model/trainer.ts` - Add regularization
2. **Features:** `src/lib/features/featureEngineering.ts` - Better features
3. **Config:** `src/train/basketball/ncaam/featuresConfig.json` - Feature selection
4. **Prediction:** `src/lib/model/predictor.ts` - Already has clipping (temp fix)

## Quick Wins to Test

### Quick Test 1: Reduce marketImpliedProb Impact
```typescript
// In src/lib/features/featureEngineering.ts
// Line ~152 in computeFixedFeatures()
marketImpliedProb: (marketImpliedProbVal ?? 0) * 0.1  // Scale by 0.1
```

### Quick Test 2: Adjust Logit Clip Range
```typescript
// In src/lib/model/predictor.ts
// Try different clip values:
const z_clipped = Math.max(-3, Math.min(3, z));  // [4.7%, 95.3%]
const z_clipped = Math.max(-4, Math.min(4, z));  // [1.8%, 98.2%]
const z_clipped = Math.max(-5, Math.min(5, z));  // [0.7%, 99.3%] (current)
```

### Quick Test 3: Try Ensemble
```json
// In featuresConfig.json
"model": "ensemble"
```

But implement ensemble saving first in `modelStorage.ts`

## Commands to Test Changes

```bash
# After making changes, rebuild and retrain:
npm run build
node dist/cli/index.js train --sport ncaam

# Check recommendations:
node dist/cli/index.js recommend --sport ncaam --date 2024-12-01

# Run full backtest analysis:
node dist/cli/index.js backtest --sport ncaam
```

## Expected Outcomes

**Good Model Calibration:**
- Most predictions in 30-70% range
- Calibration buckets show actual win rate ≈ predicted probability
- Few predictions hit clip bounds

**Current State (Needs Improvement):**
- Most predictions at clip bounds (99.3% or 0.7%)
- Bucket 0-10: 41% accuracy (should be ~5%)
- Bucket 100-110: 78% accuracy (should be ~100%, but hitting clip at 99.3%)

## Notes

- Feature scaling is working correctly (theta values ~13 instead of ~1000)
- Logit clipping is a temporary fix, not a solution
- The fundamental issue is model architecture/regularization
- Consider this a feature engineering and model tuning problem, not a code bug

# NFL Totals Model Investigation

**Date**: December 1, 2025  
**Status**: 🔍 Active Investigation

## Problem Statement

NFL totals model shows **systematic inversion** (43.17% ECE, -38.42% ROI):
- When model predicts 0-10% Over → Actually goes Over 97.4% of time
- When model predicts 90-100% Over → Actually goes Over 11.9% of time

**Full calibration table from backtest:**

| Predicted Range | Actual Over Rate | Sample Size | Calibration Error | ROI |
|----------------|------------------|-------------|-------------------|-----|
| 0-10%   | 97.4% | 39  | 92.6%  | -93.6% |
| 10-20%  | 92.2% | 51  | 76.8%  | -86.5% |
| 20-30%  | 76.7% | 73  | 51.8%  | -51.9% |
| 30-40%  | 58.4% | 77  | 23.2%  | -8.8%  |
| 40-50%  | 32.8% | 64  | 12.3%  | +26.9% |
| 50-60%  | 22.2% | 45  | 32.2%  | -64.1% |
| 60-70%  | 7.1%  | 14  | 57.8%  | -100.0%|

## Investigation Log

### Step 1: Z-Score Formula Verification

**Formula in `src/model/apply.ts:296`:**
```typescript
const z = (line - predictedScore) / model.sigma;
const pOver = 1 - normalCdf(z);
```

**Mathematical Check:**
- Assumption: `ActualScore = PredictedScore + ε` where `ε ~ N(0, σ)`
- Want: `P(ActualScore > Line)`  
- Equals: `P(PredictedScore + ε > Line)`
- Equals: `P(ε > Line - PredictedScore)`
- Equals: `P(ε/σ > (Line - PredictedScore)/σ)`
- Since `ε/σ ~ N(0,1)`: `P(Z > z) = 1 - Φ(z)`

**✅ Formula is mathematically correct!**

### Step 2: Model Architecture Review

**Training (`src/model/train.ts`):**
- Target variable: Actual combined score (`home_score + away_score`)
- Features: 36 features (5-game + 10-game windows)
- Algorithm: Ridge regression (gradient descent, λ=1.0)
- Bias correction: `bias = mean(actual - predicted)`
- Sigma: MAD-based with sport-specific floor (NFL=10 points)

**Prediction (`src/model/apply.ts`):**
- Feature mapping: All 36 features mapped (bug fixed previously)
- Z-score: `z = (line - predictedScore) / sigma`
- Probability: `P(Over) = 1 - Φ(z)`

**Backtest (`src/model/backtest.ts`):**
- Outcome: `wentOver = (home_score + away_score) > line`
- Betting logic: Bet Over if `modelProb > 0.5`, else Under

**✅ All formulas are theoretically correct!**

### Step 3: Comparison to Working NBA Model

| Metric | NBA (Working) | NFL (Broken) |
|--------|---------------|--------------||
| ECE | 6.56% | 43.17% |
| ROI | -1.84% | -38.42% |
| Typical Total | ~220 points | ~45 points |
| Sigma Floor | 38 (17.3%) | 10 (22.2%) |
| Sample Size | 354 games | 468 games |

**Key difference**: NFL has proportionally higher sigma floor (22% vs 17%)

## Hypotheses to Test

### Hypothesis 1: Training Data Issues
- Are NFL scores flipped (home/away swapped)?
- Are NFL total lines stored incorrectly?
- Are there systematic outliers in NFL data?

### Hypothesis 2: Feature Distribution Issues
- Do NFL features have different scales than NBA?
- Is standardization working correctly for NFL?
- Are there NFL-specific feature computation bugs?

### Hypothesis 3: Sigma Floor Too Small
- NFL sigma floor (10) may be too aggressive
- Could cause overconfident predictions that are systematically biased
- Try adjusting to 7.8 (same 17.3% ratio as NBA)

### Hypothesis 4: Model Underfitting/Overfitting
- Ridge lambda (1.0) may be wrong for NFL data
- Training may not be converging properly
- Bias correction may not be working

## Next Steps

1. ✅ Document initial investigation
2. ✅ Create diagnostic script to inspect actual predictions
3. ✅ Run diagnostics on NFL validation set
4. ⏭️ Compare predicted scores vs actual scores
5. ⏭️ Check if model is systematically over/under-predicting
6. ⏭️ Apply fix and retrain
7. ⏭️ Validate with backtest

---

## Diagnostic Results (30 Recent Games)

**Date**: December 1, 2025

### Key Findings

**✅ NO SYSTEMATIC BIAS DETECTED!**

- Average Predicted Score: 46.91
- Average Actual Score: 45.07
- Average Line: 46.73
- **Average Residual: -1.84 points** (within acceptable range)
- **Average Z-Score: -0.01** (perfectly centered!)

**Model Performance:**
- Model P(Over): 49.8% average
- Market P(Over): 48.6% average
- Actual Over Rate: 36.7% (Unders hit 63.3% in this sample)
- Model Accuracy: 43.3% (13/30)

### Critical Observation

**The model is NOT systematically mispredicting scores!**

- Residuals are small (-1.84 avg)
- Z-scores are well-centered
- Predicted scores are reasonable

**So why the catastrophic calibration failure?**

Looking at individual predictions:
- Lines range from 29.5 to 56.5
- Predicted scores range from 42.1 to 50.3
- Model probabilities range from 21.4% to 97.8%

**Hypothesis: The problem is NOT in the predictions themselves, but in how we're EVALUATING them!**

### Sample Cases Analysis

**Case 1: Green Bay @ Minnesota (Line 29.5)**
- Predicted: 47.3, Actual: 29 (UNDER)
- Z-Score: -1.43
- Model P(Over): **97.8%**
- Result: UNDER (✗ WRONG)

**This is suspicious!** Line of 29.5 is extremely low (NFL games rarely go under 30). The predicted score of 47.3 seems reasonable, but something is off with the line itself.

**Case 2: Detroit @ NY Giants (Line 56.5)**
- Predicted: 49.5, Actual: 61 (OVER)
- Z-Score: 0.56
- Model P(Over): **21.4%**
- Result: OVER (✗ WRONG)

**Also suspicious!** Line of 56.5 is very high. Model predicts 49.5, which underestimates the 61 actual score.

### New Hypothesis: Data Quality Issue

**Possible causes of inversion:**

1. **Multiple odds snapshots per game**: We're seeing duplicate games in the output (same event ID, different lines). This suggests we're pulling multiple odds snapshots per game, which could be:
   - Live betting odds (changing during game)
   - Different sportsbooks
   - Pre-game vs game-time odds

2. **Line movement**: If we're training on opening lines but evaluating on closing lines (or vice versa), the model would be systematically wrong.

3. **Outlier lines**: Some lines look unusual:
   - 29.5 for GB @ MIN (typical NFL is 40-50)
   - 56.5 for DET @ NYG (very high)
   
   These could be:
   - Data entry errors
   - Live betting lines mid-game
   - Alternate totals (not main line)

### Action Items

1. **Check odds table schema**: Do we have multiple entries per game?
2. **Filter to pregame odds only**: Add timestamp filter to get only pre-game lines
3. **Validate line reasonableness**: Filter out extreme outliers (< 35 or > 60)
4. **Check for alternate totals**: Some books offer alternate lines that aren't the main market

---

## Step 4: Odds Data Investigation

### Query: Check for duplicate odds per game

```sql
SELECT game_id, COUNT(*) as odds_count, 
       GROUP_CONCAT(DISTINCT line) as lines,
       GROUP_CONCAT(DISTINCT timestamp) as timestamps
FROM odds 
WHERE market = 'total' AND sport = 'nfl'
GROUP BY game_id
HAVING odds_count > 1
ORDER BY odds_count DESC
LIMIT 10;
```

### Results

**🚨 SMOKING GUN FOUND!**

Many NFL games have multiple odds entries with WILDLY different lines:

| Game ID | Odds Count | Lines |
|---------|------------|-------|
| 20372 | 3 | 52.5, 50.5 |
| 23954 | 3 | 45.5, 39.5 |
| 23956 | 3 | 42.5, **26.5** |

### Root Cause: Live Odds Contamination!

Detailed investigation shows three providers per game:
1. **ESPN BET** (pre-game): 42.5
2. **Draft Kings** (pre-game): 42.5  
3. **ESPN Bet - Live Odds** (in-game): **26.5**

**The problem:** Live odds change DURING the game based on the actual score!

**Example from game 23956:**
- Pre-game total: 42.5 points
- Live odds total: 26.5 points (dropped 16 points!)
- This happens when a game is clearly going Under in real-time

**How this breaks the model:**

1. **During training**: If we pick a random odds snapshot, we might train on live odds where the line has already adjusted to the in-game score
2. **During backtesting**: We evaluate against the FIRST odds entry (DESC order), which could be the live odds
3. **Result**: Model trained on pre-game features but evaluated against in-game lines = systematic inversion!

### Verification

When the model predicts 47.3 points and the line is 29.5:
- ✅ If 29.5 is a **pre-game line**: Model is WAY off (should be flagged)
- ❌ If 29.5 is a **live line** mid-game when score is 14-10: Line reflects game state, not a prediction

**Our model predicts final scores based on pre-game features, so it MUST be evaluated against pre-game odds only!**

---

## Fix Required

### Option 1: Filter by Provider (Recommended)
Exclude `provider = 'ESPN Bet - Live Odds'` from:
- Training data selection
- Backtest evaluation
- Prediction application

### Option 2: Filter by Timestamp
Use only the EARLIEST timestamp per game (first odds posted = pre-game)

### Option 3: Provider Priority
Prefer ESPN BET or Draft Kings over Live Odds when multiple exist

---

## Implementation Plan

1. ✅ Identified root cause: Live odds contamination
2. ✅ Update backtest to filter `provider != 'ESPN Bet - Live Odds'`
3. ✅ Update training to exclude live odds
4. ✅ Retrain model with clean data
5. ✅ Re-run backtest to validate fix

---

## Step 5: Results After Filtering Live Odds

**Date**: December 1, 2025

### Training Results
- Temporal split at 2025-10-05
- Train: 269 games, Val: 116 games
- MAD sigma: 12.49 (vs 10 floor)
- Validation accuracy: 50.9%
- Brier: 0.2733, Log Loss: 0.7450

### Backtest Results
- Matched games: 385 (down from 468 - filtered out live odds)
- **Calibration Error: 46.40%** (WORSE than before!)
- **ROI: -42.42%** (WORSE than -38.42%)

### Calibration Table (STILL INVERTED!)

| Predicted Range | Actual Over Rate | Sample Size | Error |
|----------------|------------------|-------------|-------|
| 0-10%   | **100.0%** | 41  | 97.3% ❌ |
| 10-20%  | **94.1%**  | 17  | 78.8% ❌ |
| 20-30%  | **94.4%**  | 18  | 68.4% ❌ |
| 30-40%  | 61.5%      | 39  | 26.5% |
| 40-50%  | 61.7%      | 47  | 16.9% |
| 50-60%  | 60.4%      | 53  | 5.1% ✓ |
| 60-70%  | 55.9%      | 34  | 9.0% ✓ |
| 70-80%  | **25.0%**  | 36  | 49.2% ❌ |
| 80-90%  | **45.7%**  | 35  | 39.1% ❌ |
| 90-100% | **7.7%**   | 65  | 88.6% ❌ |

**❌ SYSTEMATIC INVERSION PERSISTS!**

The mid-range (40-70%) is reasonably calibrated, but extreme predictions are completely backwards.

---

## Step 6: Deep Dive - What's Actually Wrong?

### Observations

1. **Mid-range works** (40-70%): 5-9% calibration error
2. **Extremes fail catastrophically**:
   - Low confidence (0-30%): Predicts Under, actually goes Over
   - High confidence (70-100%): Predicts Over, actually goes Under

### New Hypothesis: Sign Error in Probability Calculation

Let's revisit the formula in `src/model/apply.ts:296`:

```typescript
const z = (line - predictedScore) / model.sigma;
const pOver = 1 - normalCdf(z);
```

**Mathematical verification:**
- If `predictedScore = 50`, `line = 45`, `sigma = 10`
- Then `z = (45 - 50) / 10 = -0.5`
- `normalCdf(-0.5) ≈ 0.31`
- `pOver = 1 - 0.31 = 0.69` (69% chance of Over)

This seems correct: we predict 50, line is 45, so we think it will go Over.

**But wait!** What if the formula needs to account for something else?

### Testing Alternative Formulas

Let me manually check a specific case from backtest:

**Case: 0-10% bin** (41 games, 100% actually went Over)
- Model predicts: ~5% Over probability
- This means: `pOver ≈ 0.05`
- Working backwards: `1 - normalCdf(z) = 0.05`
- So: `normalCdf(z) = 0.95`
- Which means: `z ≈ 1.65`
- Therefore: `(line - predictedScore) / sigma ≈ 1.65`
- So: `line ≈ predictedScore + 1.65 * sigma`

With `sigma = 12.49`:
- `line ≈ predictedScore + 20.6`

**Example:** If line is 45, model predicts ~24.4 points (way too low!)

**This is the problem!** The model is systematically underpredicting scores by ~20 points on average for low-probability predictions.

### Root Cause Analysis

The issue is **NOT** in the probability formula - it's in the **model's score predictions themselves!**

The ridge regression is producing:
- Very low scores when it predicts low P(Over)
- Very high scores when it predicts high P(Over)

But in reality:
- Low predicted scores → games actually go Over (model too pessimistic)
- High predicted scores → games actually go Under (model too optimistic)

**The regression model is broken, not the probability conversion!**

### Possible Causes

1. **Feature signs are wrong**: Maybe some features have inverted relationships
2. **Training is not converging**: Gradient descent might be stuck
3. **Regularization too strong**: Lambda=1.0 might be crushing useful features
4. **Feature standardization issue**: Means/stds might be wrong
5. **Bias term is wrong**: The bias correction might be flipped

---

## Step 7: Debug the Regression Model Itself

Next actions:
1. Check training loss curve (is it converging?)
2. Inspect learned weights (do they make sense?)
3. Check feature means/stds (are they reasonable?)
4. Test without regularization (lambda=0)
5. Try increasing iterations (5000 → 10000)
6. Check if bias is calculated correctly

### Results: Filtering ALL Live Odds (ESPN Bet + Draft Kings)

**Same exact results** - 46.40% ECE, -42.42% ROI, systematic inversion

**Conclusion**: Live odds were NOT the root cause!

---

## Step 8: Feature Analysis Reveals Counter-Intuitive Pattern

From backtest feature analysis:

**Profitable bets vs Losing bets:**
- Combined Pace 5-game: Winners **lower** by 1.27 points
- Away Points/Game 5-game: Winners **lower** by 1.24 points  
- Away Pace 5-game: Winners **lower** by 1.14 points

**This is backwards!** Higher pace/scoring should correlate with Overs, but profitable bets show LOWER pace.

**Hypothesis**: The model is learning inverted relationships because:
1. High-scoring teams → market sets high total → model predicts even higher → but doesn't account for market efficiency
2. The market is already pricing in pace/scoring perfectly
3. Model's "edge" is actually anti-edge (fading public perception)

---

## Fundamental Issue: Regression Approach May Be Wrong

### Why NFL Totals Are Different

**Working models (NBA, Moneyline):**
- Logistic regression for binary outcomes
- Features predict Win/Loss directly
- Market odds used as ensemble feature

**Broken model (NFL Totals):**
- Ridge regression predicts continuous score
- Converts to P(Over) via normal distribution
- NO market feature (intentionally excluded to prevent leakage)

**Key difference**: Totals model doesn't use market odds as a feature!

### Proposed Solutions

#### Option 1: Add Market Odds as Feature (Like Spread Model)
Currently totals model uses 36 features but excludes market odds.  
Spread model uses base features + spread line + market implied probability.

**Try**: Add `totalMarketImpliedProb` as 37th feature

#### Option 2: Switch to Classification
Instead of predicting score, directly predict binary Over/Under:
- Train logistic regression on `(home_score + away_score) > line`
- Use line as a feature (like spread model does)
- Include market odds as feature

#### Option 3: Ensemble Approach
Like moneyline (70% base + 30% market-aware):
- Train base regression (36 features)
- Train market-aware regression (37 features with market odds)
- Blend predictions

#### Option 4: Different Features Entirely
Current features are team-centric (points/pace per team).  
Maybe totals need game-context features:
- Weather (temperature, wind, precipitation)
- Roof/outdoor
- Division rivalry (tend to go Under)
- Playoff implications
- Time of season

---

## Recommendation: Try Option 1 First (Add Market Feature)

This is the simplest fix and aligns with what works for spread/moneyline models.

Implementation:
1. Update `src/model/train.ts` totals training to include market implied prob
2. Update `src/model/apply.ts` totals prediction to include market feature
3. Retrain and backtest
4. If still inverted, try Option 2 (classification approach)

---

## Step 9: Results with Market Feature (Option 1)

**Date**: December 1, 2025

### Implementation
✅ Added `totalMarketImpliedProb` as 37th feature (was 36 features before)  
✅ Updated training code to include market feature  
✅ Updated prediction code to include market feature  
✅ Retrained model

### Training Results
- Features: 37 (36 base + market implied prob)
- Train: 269 games, Val: 116 games
- Validation Brier: 0.2713 (vs 0.2733 before - slightly better)
- Validation Log Loss: 0.7407 (vs 0.7450 before - slightly better)

### Backtest Results  
- Calibration Error: **46.13%** (vs 46.40% before - marginal 0.27% improvement)
- ROI: **-41.92%** (vs -42.42% before - marginal 0.5% improvement)
- **STILL SYSTEMATICALLY INVERTED!**

### Calibration Table (STILL BROKEN)

| Predicted Range | Actual Over Rate | Sample Size | Error |
|----------------|------------------|-------------|-------|
| 0-10%   | **100.0%** | 41  | 97.3% ❌ |
| 10-20%  | **94.1%**  | 17  | 78.8% ❌ |
| 20-30%  | **94.4%**  | 18  | 68.4% ❌ |
| 30-40%  | 60.5%      | 38  | 25.7% |
| 40-50%  | 61.7%      | 47  | 17.1% |
| 50-60%  | 60.0%      | 55  | 4.7% ✓ |
| 60-70%  | 57.6%      | 33  | 7.6% ✓ |
| 70-80%  | **25.7%**  | 35  | 48.4% ❌ |
| 80-90%  | **44.4%**  | 36  | 40.3% ❌ |
| 90-100% | **7.7%**   | 65  | 88.7% ❌ |

**Conclusion**: Adding market feature did NOT fix the inversion. The regression approach itself appears fundamentally broken for NFL totals.

---

## Step 10: Try Option 2 - Classification Approach

Since regression is failing catastrophically, let's try a completely different approach: **direct classification** of Over/Under (like moneyline models do for Win/Loss).

### Proposed Implementation

Instead of:
1. Predicting combined score via regression
2. Converting to P(Over) via normal distribution

Do:
1. Train logistic regression directly on binary target: `(home_score + away_score) > line`
2. Use total line as a feature (like spread model uses spread line)
3. Include market odds as feature

This is closer to how spread/moneyline models work (which are successful).

### Key Changes Needed

**Training (`src/model/train.ts`):**
```typescript
// Target: binary over/under (not continuous score)
const target = (home_score + away_score) > line ? 1 : 0;

// Features: 36 base + line + market = 38 features
const features = [
  ...baseFeatures,
  line,  // Total line (e.g., 45.5)
  totalMarketImpliedProb
];

// Use logistic regression (not ridge regression)
trainLogisticRegression(features, targets);
```

**Prediction (`src/model/apply.ts`):**
```typescript
// Standard logistic prediction (like moneyline)
const z = features.reduce((acc, v, i) => acc + v * weights[i], 0);
const pOver = sigmoid(z);
```

### Advantages of Classification

1. **Simpler**: No need for normal distribution assumption
2. **Proven**: Works for moneyline/spread which are also binary
3. **Market-aware**: Naturally incorporates line and market odds
4. **No inversion risk**: Direct probability prediction

### Next Steps

1. ⏭️ Implement classification approach for totals
2. ⏭️ Retrain NFL totals as classification model
3. ⏭️ Backtest to compare vs regression approach
4. ⏭️ If successful, apply to all sports (NBA, CFB, NCAAM)
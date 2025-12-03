# Underdog-Specific Betting Model 🐕

## Overview

A **completely separate** experimental module focused exclusively on finding profitable underdog betting opportunities in NCAAM basketball. Unlike the main model (which optimizes across all games), this model is trained ONLY on underdog games (+100 or better odds) to identify market inefficiencies and upset potential.

## Philosophy

**Main Model Philosophy:** Maximize overall ROI by accurately predicting all game outcomes (favorites and underdogs).

**Underdog Model Philosophy:** Find value in underdogs by learning upset patterns, recognizing when favorites are overvalued, and identifying high-variance situations that favor underdogs.

### Key Differences from Main Model

| Aspect | Main Model | Underdog Model |
|--------|-----------|----------------|
| **Training Data** | All games (favorites + underdogs) | Only underdog games |
| **Ensemble Blend** | 70% base + 30% market | 50% base + 50% market (trusts model more) |
| **Feature Focus** | General team performance | Upset history, home dog advantage, pace |
| **Class Balance** | Natural distribution | Oversamples underdog wins 2-5x |
| **Edge Detection** | Model > market by any amount | Minimum 3% edge required |
| **Guardrails** | Suppresses severe underdogs | None (focused on finding value dogs) |

## Architecture

### 1. Feature Engineering (`underdog-features.ts`)

Extends the standard 43 features with 12 underdog-specific metrics:

#### Underdog-Specific Features
- **`homeUpsetRate5/10`**: Win rate as underdog in last 5/10 games (weighted by recency)
- **`awayUpsetRate5/10`**: Same for away team
- **`homeDogAdvantage`**: Home underdogs perform ~5% better than road dogs
- **`paceDifferential`**: Fast pace = more variance = better for underdogs
- **`confStrengthDiff`**: Conference quality gap (SoS proxy)
- **`recentDogTrend5/10`**: Momentum as underdog (hot/cold streaks)
- **`marketOverreaction`**: How far market diverged from actual performance

### 2. Training Pipeline (`underdog-train.ts`)

#### Tiered Approach
Games are classified into three underdog tiers:

| Tier | Odds Range | Implied Prob | Expected Win Rate | Training Weight |
|------|-----------|--------------|-------------------|-----------------|
| **Moderate** | +100 to +199 | 33-50% | ~35-45% | 2x for wins |
| **Heavy** | +200 to +299 | 25-33% | ~20-30% | 3x for wins |
| **Extreme** | +300+ | <25% | ~10-15% | 5x for wins (high risk) |

#### Training Strategy
```typescript
// 1. Filter to underdog games only
const underdogGames = filterUnderdogGames(allFeatures, tiers);

// 2. Compute class-balanced weights
//    - Oversample wins more aggressively for rarer tiers
//    - Heavy dogs: 3x weight on wins
//    - Extreme dogs: 5x weight on wins

// 3. Train ensemble (50/50 blend vs 70/30 in main model)
const baseModel = trainLogisticRegression(features, labels, sampleWeights);
const marketModel = trainLogisticRegression(featuresWithMarket, labels, sampleWeights);
const prediction = 0.5 * baseProb + 0.5 * marketProb;  // Trust model more

// 4. Temporal validation (70% train, 30% validate)
//    - Sorted chronologically
//    - Tests forward-looking performance
```

#### Hyperparameters
- **Learning Rate**: 0.01
- **Iterations**: 1500 (vs 1000 in main model - more complex patterns)
- **L2 Lambda**: 0.3 (vs 0.5 - less regularization to capture underdog nuances)
- **Recency Half-Life**: 120 days (exponential decay on sample weights)

### 3. Prediction Interface (`underdog-predict.ts`)

Generates recommendations with underdog-specific metrics:

```typescript
interface UnderdogPrediction {
  modelProbability: number;      // 35% (model thinks underdog has 35% chance)
  marketProbability: number;     // 25% (market implies only 25% chance)
  edge: number;                  // +10% (model sees 10% value)
  odds: number;                  // +200 (American odds)
  expectedValue: number;         // $2.50 per $10 bet
  kelleySizing: number;          // 6.5% of bankroll (optimal bet size)
  confidence: "high" | "medium" | "low";
}
```

#### Confidence Classification
- **High**: Edge > 10% AND model probability > 40%
- **Medium**: Edge > 5% AND model probability > 30%
- **Low**: Edge > 3% AND model probability > 20%

#### Kelley Criterion Sizing
```typescript
// Kelly = (bp - q) / b
// where b = decimal odds - 1, p = win prob, q = 1 - p
// Fractional Kelly (25%) for safety: kelly * 0.25
// Capped at 10% of bankroll
```

### 4. Backtesting (`underdog-backtest.ts`)

Comprehensive validation with underdog-specific metrics:

#### Key Metrics
- **ROI by Odds Range**: +100-149, +150-199, +200-249, +250-299, +300+
- **Closing Line Value (CLV)**: Average edge vs market closing line
- **Kelley-Optimal Returns**: Simulates optimal bet sizing
- **Win Rate vs Market Implied**: Calibration check
- **Expected Calibration Error (ECE)**: Model confidence accuracy

## Usage

### 1. Train Model (All NCAAM Seasons)

```bash
# Train on all available seasons (2022-2025)
sportline underdog train

# Train specific tiers
sportline underdog train --tiers moderate,heavy --seasons 2022,2023,2024,2025

# Train only moderate dogs (safest)
sportline underdog train --tiers moderate --seasons 2023,2024,2025
```

**Recommended**: Train on maximum available data (2022-2025) for best statistical power on rare upset events.

### 2. Generate Predictions

```bash
# Get today's underdog opportunities (+110 to +300)
sportline underdog predict

# Specify date
sportline underdog predict --date 20251210

# Moderate dogs only (+110 to +199)
sportline underdog predict --min-odds 110 --max-odds 199

# Include heavy dogs (+110 to +299)
sportline underdog predict --min-odds 110 --max-odds 299
```

**Output Example:**
```
🐕 Generating underdog predictions for NCAAM...

✅ Found 5 underdog opportunities:

1. 🔥 Butler +165 [MODERATE]
   vs Villanova
   Model: 42.3% | Market: 37.8% | Edge: +4.5%
   Expected Value: $1.85 per $10 bet
   Kelley Sizing: 3.2% of bankroll

2. ⚠️ Georgia Tech +145 [MODERATE]
   vs Duke
   Model: 38.7% | Market: 34.5% | Edge: +4.2%
   Expected Value: $1.20 per $10 bet
   Kelley Sizing: 2.8% of bankroll

📊 Summary:
   Total Expected Value: $8.45 (if betting $10 on each)
   Average Edge: +4.8%
   High Confidence: 2
   Medium Confidence: 3
```

### 3. Backtest Performance

```bash
# Backtest on all seasons
sportline underdog backtest --seasons 2022,2023,2024,2025

# Test specific tiers
sportline underdog backtest --seasons 2023,2024,2025 --tiers moderate

# Adjust edge threshold (stricter)
sportline underdog backtest --seasons 2023,2024,2025 --min-edge 0.05
```

**Output Example:**
```
🐕 Backtesting UNDERDOG MODEL for NCAAM...

✅ BACKTEST RESULTS:

Overall Performance:
   Total Bets: 287
   Wins: 112 | Losses: 175
   Win Rate: 39.0%
   Total Profit: $324.50
   ROI: +11.3%
   ECE: 6.2%
   Average Odds: +168
   Average Edge: +5.8%
   Closing Line Value: +4.2%

Performance by Odds Range:
   ✅ +100 to +149: 48/98 (49.0%) | ROI: +8.7% | Profit: $85.40
   ✅ +150 to +199: 42/121 (34.7%) | ROI: +14.2% | Profit: $171.82
   ✅ +200 to +249: 18/54 (33.3%) | ROI: +12.8% | Profit: $69.12
   ❌ +250 to +299: 3/12 (25.0%) | ROI: -5.6% | Profit: -$6.72
   ❌ +300 or more: 1/2 (50.0%) | ROI: +150.0% | Profit: $4.88
```

### 4. Compare vs Main Model

```bash
# Compare underdog model vs main model on same games
sportline underdog compare --seasons 2023,2024,2025
```

This shows how the underdog-specific model performs vs the general-purpose model on underdog games specifically.

## Data Requirements

### Training Data
- **Minimum Games**: 100 underdog games with outcomes
- **Recommended**: 500+ underdog games (multiple seasons)
- **NCAAM 2022-2025**: ~4,000+ total games, ~2,000+ underdog games

### Feature Requirements
Both teams must have:
- ≥5 completed games (for rolling features)
- ≥3 underdog games (for upset rate features)

Games without sufficient history are excluded from training.

## Expected Performance

### Historical NCAAM Results (Backtest)

Based on 3-season validation (2023-2025), the main model shows:

| Market | Overall ROI | Underdog Performance |
|--------|-------------|---------------------|
| **Moneyline (Overall)** | +5.06% | 0-20% bins: +67% ROI ⚡ |
| **Moneyline (0-10%)** | +45.4% | 38 games, 0% win rate (market mispricing) |
| **Moneyline (10-20%)** | +89.1% | 58 games, 5.2% win rate (massive value) |

**Key Insight**: Main model finds value in extreme underdogs through market inefficiency detection, but suppresses them in production due to variance. Underdog model aims to capture this value systematically.

### Underdog Model Goals

Target performance on moderate dogs (+100 to +199):
- **Win Rate**: 38-42% (vs 37-40% market implied)
- **ROI**: +8-15% (by finding 3-8% edge consistently)
- **ECE**: <10% (well-calibrated probabilities)

## Model Artifacts

Models are saved to:
```
models/underdog-ncaam/underdog_{tiers}_{seasons}_{timestamp}/
├── base-model.json           # Model without market feature
├── market-aware-model.json   # Model with market feature
├── ensemble-metadata.json    # Training config and metrics
└── metrics.json             # Validation performance
```

## Implementation Details

### Ensemble Weighting

**Why 50/50 vs 70/30?**

The main model uses 70% base + 30% market because it needs to beat the market across all games. For underdogs specifically, we want to trust our model MORE when it sees value:

```typescript
// Main model (conservative)
finalProb = 0.70 * baseProb + 0.30 * marketProb;

// Underdog model (aggressive)
finalProb = 0.50 * baseProb + 0.50 * marketProb;
```

This increases sensitivity to underdog-specific patterns the model learns from upset history.

### Class Balancing Strategy

Without balancing, model learns to predict "underdog loses" (60-70% of games):

```typescript
// Imbalanced training
Underdog wins: 400 samples (weight: 1.0)
Underdog losses: 600 samples (weight: 1.0)
→ Model predicts "loss" too often

// Balanced training (moderate dogs)
Underdog wins: 400 samples (weight: 2.0 → 800 effective)
Underdog losses: 600 samples (weight: 1.0 → 600 effective)
→ Model learns upset patterns better
```

Heavy and extreme dogs get 3x and 5x multipliers respectively.

### Recency Weighting

Recent games matter more for upsets:

```typescript
// 5-game window (last 5 underdog games)
WEIGHTS = [0.08, 0.12, 0.20, 0.25, 0.35]  // oldest → newest

// 10-game window
WEIGHTS = [0.03, 0.04, 0.05, 0.06, 0.07, 0.09, 0.11, 0.14, 0.18, 0.23]
```

Plus exponential decay on sample dates (120-day half-life).

## Best Practices

### ✅ DO:
- Train on maximum available data (2022-2025)
- Focus on moderate dogs (+100 to +199) initially
- Use Kelley criterion for bet sizing
- Track CLV (closing line value) to validate edge
- Require minimum 3% edge threshold
- Only bet games with ≥5 prior games for each team

### ❌ DON'T:
- Bet extreme dogs (+300+) unless model shows 15%+ edge
- Ignore sample size warnings (need 100+ underdog games minimum)
- Use on other sports without retraining (NCAAM-specific features)
- Bet without checking CLV (validates model has real edge)
- Chase losses by lowering edge threshold

## Future Enhancements

### Phase 2 Features
- **ATS Performance**: Against-the-spread history as underdog
- **Pace When Trailing**: Comeback potential metric
- **Travel Distance**: Road underdogs with long travel
- **Rest Days**: Tired favorites vs rested dogs
- **Injury Impact**: Missing key players for favorite

### Phase 3: Multi-Sport
- Extend to CFB (college football underdogs)
- Adapt for NFL (different upset dynamics)
- NHL (home dogs in hockey are undervalued)

### Phase 4: Live Betting
- In-game underdog value (trailing teams mispriced)
- Momentum detection (hot streaks on underdogs)
- Live odds movement tracking

## Technical Details

### Dependencies
All dependencies from main model (no new packages required):
- `better-sqlite3`: Database
- `chalk`: Terminal colors
- `commander`: CLI framework

### Performance
- **Feature Computation**: ~2-3 seconds per 1000 games
- **Training**: ~5-10 seconds for 2000 samples
- **Prediction**: <100ms for single game

### Memory
- Training set: ~50MB for 4 seasons
- Model artifacts: ~1MB per trained model

## Testing & Validation

### Unit Tests (TODO)
```bash
npm test -- underdog
```

### Integration Tests (TODO)
```bash
# Test full pipeline
sportline underdog train --seasons 2023,2024
sportline underdog backtest --seasons 2025
sportline underdog predict --date 20251210
```

## Support & Troubleshooting

### "No trained model found"
→ Run `sportline underdog train` first

### "Not enough underdog games"
→ Need ≥100 underdog games with outcomes. Add more seasons.

### "ECE too high" (>15%)
→ Model is overconfident. Retrain with more data or adjust lambda.

### "ROI negative"
→ Underdogs may not be profitable in this sample. Check backtest by odds range.

## Contributing

This is an experimental module. To contribute:

1. Test on different seasons/sports
2. Add new underdog-specific features
3. Experiment with ensemble weights (40/60, 60/40, etc.)
4. Compare against other underdog strategies

## License

Same as main sportline project.

---

**Remember**: Underdogs lose more often than they win. The goal is to find the right underdogs at the right price to achieve positive ROI over a large sample. Variance is high - bankroll management is critical! 🎲

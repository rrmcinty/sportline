# Sportline CLI Usage Guide

## Quick Start

### 1. Build the Project
```bash
npm install
npm run build
```

### 2. Train a Model
```bash
node dist/cli/index.js train --sport ncaam
```

This will:
- Load historical game data from the database
- Extract 112 features per game
- Train a logistic regression model
- Run backtesting to find optimal thresholds
- Save the model to `src/train/basketball/ncaam/models/`

Expected output:
```
🏀 Sportline Model Training

[1/7] Loading configuration...
✓ Loaded config for ncaam moneyline

[2/7] Loading historical games from database...
✓ Loaded 16,584 games

[3/7] Extracting features...
✓ Extracted features for 16,402 games

[4/7] Training model...
[Trainer] Test accuracy: 59.89%
[Trainer] Test log loss: 13.85

[5/7] Generating recommendations...
✓ Generated 3,281 test predictions

[6/7] Running backtest...
✓ Tested 63 threshold combinations

[7/7] Saving model...
✓ Model saved

✅ Training complete!
```

### 3. Get Betting Recommendations
```bash
node dist/cli/index.js recommend --sport ncaam
```

Or for a specific date:
```bash
node dist/cli/index.js recommend --sport ncaam --date 2024-03-15
```

Expected output (when games are available):
```
🎯 NCAAM Betting Recommendations - Saturday Dec 13, 2025

Model: Logistic Regression (trained 2025-12-12, ROI: 8.2%)
Thresholds: min_edge=4.5%, min_ev=1.5%

Rank | Time  | Matchup                        | Pick | Odds  | EV    | Edge  | Provider
-----+-------+--------------------------------+------+-------+-------+-------+-----------
1    | 12:00 | Duke @ North Carolina          | AWAY | +140  | 8.2%  | 6.1%  | DraftKings
2    | 15:30 | Kentucky vs Kansas             | HOME | -110  | 5.3%  | 4.8%  | FanDuel
3    | 19:00 | Gonzaga @ UCLA                 | HOME | +105  | 4.7%  | 4.5%  | BetMGM

Total bets: 3 | Total stake: $300 | Expected profit: $18.40
```

### 4. Run Backtesting Analysis
```bash
node dist/cli/index.js backtest --sport ncaam
```

This provides detailed analysis:
- Top threshold combinations by ROI
- Probability calibration buckets
- Multiple optimization strategies
- Performance insights

## Command Options

### Train Command
```bash
node dist/cli/index.js train [options]
```

Options:
- `--sport <sport>`: Sport to train on (default: "ncaam")
- `--force`: Force retrain even if recent model exists
- `--config <path>`: Path to custom feature config file

### Recommend Command
```bash
node dist/cli/index.js recommend [options]
```

Options:
- `--sport <sport>`: Sport to recommend (default: "ncaam")
- `--date <date>`: Date in YYYY-MM-DD format (default: today)
- `--market <market>`: Market type (default: "moneyline")
- `--min-bets <number>`: Minimum recommendations to show (default: "3")

### Backtest Command
```bash
node dist/cli/index.js backtest [options]
```

Options:
- `--sport <sport>`: Sport to backtest (default: "ncaam")
- `--config <path>`: Path to custom feature config file

## Configuration

Edit `src/train/basketball/ncaam/featuresConfig.json` to customize:

```json
{
  "sport": "ncaam",
  "model": "logistic_regression",  // or "ensemble"
  "market": "moneyline",
  "seasons": [2023, 2024, 2025],
  "features": {
    // Enable/disable specific features
    "fieldGoalsMade": true,
    "threePointFieldGoalPct": true,
    // ... 110+ more features
  },
  "rolling_windows": [5, 10],
  "allowed_providers": [
    "DraftKings",
    "ESPN BET",
    // ... more providers
  ],
  "recency_weighting": {
    "enabled": true,
    "decay": 0.5  // Higher = more recent games weighted more
  },
  "min_edge": 0.03,  // Dynamically optimized during training
  "min_ev": 0.01     // Dynamically optimized during training
}
```

## Understanding the Output

### Expected Value (EV)
The expected profit per dollar wagered. Example:
- EV of 5.3% means you expect to profit $5.30 per $100 bet
- Positive EV = profitable bet (in theory)

### Edge
The difference between your model's probability and the market's implied probability.
- Higher edge = model disagrees more with market
- Edge of 4.5% means model thinks the true probability is 4.5% higher than market

### ROI (Return on Investment)
The overall profitability of the betting strategy.
- ROI of 8.2% means $8.20 profit per $100 wagered (on average)
- Measured through backtesting on historical data

### Thresholds
Minimum edge and EV required for a bet to be recommended.
- Automatically optimized during training
- Higher thresholds = fewer bets but potentially higher quality

## Model Files

Trained models are saved in:
```
src/train/basketball/ncaam/models/ncaam_moneyline_YYYYMMDD.json
```

Each model file contains:
- Model parameters (weights)
- Feature configuration
- Optimal thresholds
- Backtesting metrics
- Training date and metadata

## Troubleshooting

### "No games scheduled for today"
This is normal if there are no upcoming games in the database. Try:
```bash
node dist/cli/index.js recommend --sport ncaam --date 2024-03-15
```

### "No trained model found"
Run the training command first:
```bash
node dist/cli/index.js train --sport ncaam
```

### "Feature config not found"
Make sure you're running from the project root directory.

### Low accuracy / negative ROI
This is normal for a baseline model. Improve by:
1. Adding more relevant features
2. Tuning hyperparameters
3. Using ensemble models
4. Adding more recent data
5. Feature engineering (interactions, transformations)

## Performance Tips

- Training takes 2-3 minutes for 16,000+ games
- Recommend command is instant (once model is trained)
- Backtest command takes 2-3 minutes (full analysis)
- Re-train weekly or when significant data changes occur

## Next Steps

1. **Improve the Model**
   - Experiment with different features in `featuresConfig.json`
   - Try `"model": "ensemble"` for Random Forest
   - Add more historical seasons

2. **Track Performance**
   - Record actual bet outcomes
   - Compare predicted vs actual ROI
   - Adjust thresholds based on real results

3. **Automate**
   - Set up daily training jobs
   - Alert system for high-EV bets
   - Track bankroll and bet sizing

4. **Expand**
   - Add other sports (NBA, NFL, etc.)
   - Implement spread and total markets
   - Build web dashboard

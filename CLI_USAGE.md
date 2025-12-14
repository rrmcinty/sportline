# Sportline CLI Usage Guide

## Quick Start

### 1. Build the Project
```bash
npm install
npm run build

# Optional: Update game data daily
npm run update
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
# Get today's recommendations (defaults to local date)
node dist/cli/index.js recommend --sport ncaam

# Get recommendations for specific date
node dist/cli/index.js recommend --sport ncaam --date 2024-03-15

# Include Kelly Criterion bet sizing
node dist/cli/index.js recommend --sport ncaam --bankroll 1000

# Scale bets to fit daily budget
node dist/cli/index.js recommend --sport ncaam --daily-budget 50
```

Expected output (when games are available):
```
🎯 NCAAM Betting Recommendations - Saturday Dec 14, 2025

Model: Logistic Regression (trained 2025-12-14, ROI: -30.85%)
Thresholds: min_edge=8.0%, min_ev=1.0%, max_ev=15.0%

Rank | Time  | Matchup                        | Pick                | Prob | Odds  | EV    | Edge  | Provider
-----+-------+--------------------------------+---------------------+------+-------+-------+-------+-----------
1    | 12:00 | Butler Bulldogs @ Xavier       | Butler Bulldogs     | 62.5%| -150  | 12.5% | 10.5% | ESPN BET
2    | 15:30 | Kentucky @ Kansas              | Kansas Jayhawks     | 58.2%| +140  | 8.2%  | 8.2%  | DraftKings

Kelly Criterion Bet Sizing (Bankroll: $1,000):
- Butler Bulldogs: $125.00 (12.5% of bankroll)
- Kansas Jayhawks: $82.00 (8.2% of bankroll)

Daily Budget Scaling ($50 daily limit):
- Butler Bulldogs: $25.00 (50% of daily budget)
- Kansas Jayhawks: $25.00 (50% of daily budget)
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
- `--config <path>`: Path to custom feature config file (defaults to sport-specific config)

### Recommend Command
```bash
node dist/cli/index.js recommend [options]
```

**Examples:**
```bash
# Get recommendations for ALL sports (NCAAM + NBA)
node dist/cli/index.js recommend

# Get recommendations for specific sport only
node dist/cli/index.js recommend --sport ncaam
node dist/cli/index.js recommend --sport nba

# Get recommendations for specific date
node dist/cli/index.js recommend --date 2024-12-01
```

Options:
- `--sport <sport>`: Sport to recommend (ncaam, nba, nfl, etc.) - if not specified, shows ALL sports
- `--date <date>`: Date in YYYY-MM-DD format (default: today in local timezone)
- `--market <market>`: Market type (default: "moneyline")
- `--bankroll <amount>`: Total bankroll for Kelly Criterion bet sizing (default: 1000)
- `--daily-budget <amount>`: Fixed daily spending limit (scales Kelly bets proportionally)
- `--min-bets <number>`: Minimum recommendations to show (default: 3)

**Note:** Automatically uses sport-specific config files and organizes recommendations by sport.

### Backtest Command
```bash
node dist/cli/index.js backtest [options]
```

Options:
- `--sport <sport>`: Sport to backtest (default: "ncaam")
- `--config <path>`: Path to custom feature config file (defaults to sport-specific config)

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

## Data Ingestion Scripts

### JSON Data Ingestion (Raw Data Collection)

The system includes specialized scripts for collecting raw JSON data from ESPN APIs:

```bash
# Generic basketball ingestor (supports NCAAM and NBA)
node src/ingest/ingestBasketballToJson.ts <league> [season]

# Examples:
npm run ingest:ncaam:json 2025    # College basketball
npm run ingest:nba:json 2024      # NBA basketball

# Or run directly:
node src/ingest/ingestBasketballToJson.ts ncaam 2025
node src/ingest/ingestBasketballToJson.ts nba 2024
```

**What these scripts collect:**
- Teams data (rosters, basic info)
- Game schedules and results
- Team season statistics
- Game odds (moneyline, spread, totals)
- Box score statistics

**Database Schema Notes:**
- Teams table uses composite primary key `(id, sport)` to allow same team IDs across sports
- All foreign keys properly reference the composite key
- Supports multiple sports (NCAAM, NBA, etc.) in the same database

### Database Ingestion (Processed Data)

Import JSON data collected by the ingestor into the SQLite database:

```bash
# Generic basketball import (supports NCAAM and NBA)
node src/db/importBasketballToDb.ts <sport> [season]

# Examples:
npm run import:ncaam:db 2025    # Import NCAAM 2025 data
npm run import:nba:db 2024      # Import NBA 2024 data

# Full ingestion for all sports
npm run db:ingest:full

# Individual sport ingestion
npm run ingest:nba:full    # NBA seasons 2024-2025 (data collection)
npm run ingest:ncaam:full  # NCAAM seasons 2020-2025

# Database imports
npm run import:nba:full    # Import ALL NBA seasons (2023-2026) to database ✅
npm run import:ncaam:db    # Import NCAAM data to database ✅
npm run import:nba:db      # Import single NBA season to database ✅
```

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
   - ✅ **NBA Support**: Use `ingest:nba:json` and configure NBA features
   - Implement spread and total markets
   - Build web dashboard

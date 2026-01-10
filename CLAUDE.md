# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Prerequisites

- Node.js 20+
- `sqlite3` CLI installed (used by `npm run db:*` helpers)

## Build and Development Commands

```bash
npm ci                 # Install dependencies
npm run build          # Format, lint:fix, and compile TypeScript to dist/
npm run dev            # tsc --watch for development
npm run check          # format:check + lint + tsc (CI validation)
npm test               # Run vitest tests
npm run test:watch     # Run vitest in watch mode
npm link               # (Optional) Create global `sportline` command
```

## Data Pipeline Commands

```bash
# Ingest data from ESPN APIs to JSON files (data/<sport>/<season>/)
npm run ingest:sports:json           # All sports
npm run ingest:nba:json
npm run ingest:ncaam:json
npm run ingest:nfl:json
npm run ingest:cfb:json
npm run ingest:nhl:json

# Initialize/update SQLite database schema
npm run db:init

# Import JSON data into SQLite (data/sportline.db)
npm run import:nba:db -- [season]
npm run import:nba:full              # Import all seasons found on disk
npm run import:ncaam:full
npm run import:nfl:full
npm run import:cfb:full
npm run import:nhl:full

# Database query helpers
npm run db:list:tables               # List all tables
npm run db:schema                    # Show full schema
npm run db:list:seasons              # Show all sport/season combinations
npm run db:query:seasons:nba         # Show NBA seasons
npm run db:query:seasons:ncaam       # Show NCAAM seasons
```

## CLI Usage

After building, the CLI is available at `dist/cli/index.js`:

```bash
node dist/cli/index.js --help
node dist/cli/index.js train nba --season 2024      # Train a model
node dist/cli/index.js recommend nba --min-edge 0.03 --min-prob 0.5
node dist/cli/index.js backtest nba --season 2024
```

Available CLI commands:
- `train` - Train a logistic regression model for a sport/season
- `recommend` - Generate betting recommendations for upcoming games
- `backtest` - Run historical backtests on trained models

## Architecture

### Data Flow
1. **Ingest** (`src/ingest/`) - Fetches teams, games, stats, and odds from ESPN APIs, writes to `data/<sport>/<season>/*.json`
2. **Import** (`src/db/importSportsToDb.ts`) - Loads JSON into SQLite with sport-specific stat handling
3. **Train** (`src/models/trainNbaMoneyline.ts`, `trainNcaamMoneyline.ts`) - Trains logistic regression on completed games
4. **Predict** (`src/models/predict.ts`) - Loads model weights, applies sigmoid to feature vectors
5. **Recommend** (`src/recommend/`) - Compares model probabilities to sportsbook odds, finds value bets

### Project Structure

```
src/
├── betting/          # Odds conversion, EV calculation, Kelly criterion
├── cli/              # CLI entry point and command definitions
│   └── commands/     # train, recommend, backtest commands
├── db/               # Database schema, queries, import scripts
├── ingest/           # ESPN API data fetching to JSON
├── lib/              # Shared utilities (newer modular architecture)
│   ├── backtest/     # Backtester, profitability analyzer
│   ├── db/           # Database query utilities
│   ├── features/     # Feature engineering (basketball, strength of schedule)
│   ├── model/        # Model calibration utilities
│   └── odds/         # Spread grading, EV calculator
├── models/           # Feature extraction, training, prediction, normalization
├── recommend/        # Recommendation generation logic
└── types/            # TypeScript type shims for third-party libraries
```

### Key Modules

- **`src/models/features.ts`** - Feature extraction with 36 features (scoring, shooting %, efficiency, rebounding, defense, recent form, differentials). **CRITICAL:** Feature order in `getFeatureOrder()` must match exactly between training and prediction to prevent misaligned feature vectors.
- **`src/betting/odds.ts`** - Odds conversion (American to decimal/implied probability), EV calculation, Kelly criterion
- **`src/db/queries.ts`** - Database queries for games, odds, team stats, recent games
- **`src/models/advancedFeatures.ts`** - Advanced metrics like win streaks, rest days, back-to-back games, strength of schedule
- **`src/lib/`** - Newer modular architecture with sport-agnostic utilities (partially implemented alongside legacy `src/models/` code)

### Database Schema (`src/db/schema.sql`)

Core tables: `teams`, `games`, `odds`, `season_stats`, `game_stats`. Teams use composite primary key `(id, sport)`. All IDs are ESPN event/team IDs. Stats are stored as text to handle various formats (e.g., "10-20" for FG made-attempted).

### ML Pipeline

Uses `ml-logistic-regression` library. Models are JSON files storing theta weights at `data/models/<sport>/moneyline-<season>.json`. The `TrainedModel` type in `src/models/types.ts` defines the structure.

### Data Leakage Prevention

All feature extraction uses `getTeamStatsBeforeDate()` and `getRecentGames()` with strict date filtering to ensure only data available before game time is used for training/prediction.

## Supported Sports

`ncaam`, `nba`, `nfl`, `cfb`, `nhl` - configured in both ingest and import modules with sport-specific stat handling (e.g., basketball combined stats like "FGM-FGA" are split during import).

## Optimal Betting Strategy

Based on extensive backtesting, the following parameters achieve positive ROI on out-of-sample data:

### NBA
```bash
node dist/cli/index.js recommend nba \
  --min-edge 0.06 \
  --max-ev 0.50 \
  --buckets "40-50,90-100"
```
- **2025 out-of-sample**: +10.80% ROI (141 bets)
- **2024 validation**: +12.84% ROI (180 bets)
- Key insight: Avoid 70-80% probability range (model overconfidence)

### NCAAM
```bash
node dist/cli/index.js recommend ncaam \
  --min-edge 0.08 \
  --max-ev 0.50 \
  --buckets "0-30,80-100"
```
- **2025 out-of-sample**: +2.85% ROI (817 bets)
- Key insight: Bet extremes only (very confident or underdog plays)

### NHL
```bash
node dist/cli/index.js recommend nhl \
  --min-edge 0.08 \
  --max-ev 0.50 \
  --buckets "60-100"
```
- **2025 out-of-sample**: +18.16% ROI (326 bets)
- Key insight: Avoid low confidence bets (50-60% bucket loses money)

### Filter Explanations
- `--max-ev 0.50`: Caps EV at 50% to filter out suspicious outliers/data errors
- `--buckets`: Only bet in probability ranges with historical profitability
- `--kelly-filter`: (Optional) Additional confirmation via Kelly criterion
- Vigorish gate: Built-in, requires 4% edge for high-vig lines (-115 or worse)

## Important Notes

- **Type Shims**: Third-party ML libraries lack TypeScript types; local shims are in `src/types/` (e.g., `ml-logistic-regression.d.ts`)
- **ESM Only**: This project uses ES modules (`"type": "module"` in package.json); use `.js` extensions in imports
- **Excluded Files**: `tsconfig.json` excludes some files in `src/lib/features/` that may be work-in-progress or deprecated
- **Git Branch**: Main branch is `release` (not `main` or `master`)

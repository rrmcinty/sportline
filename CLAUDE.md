# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Prerequisites

- Node.js 20+
- `sqlite3` CLI installed (used by `npm run db:*` helpers)

## Development Workflow (CRITICAL)

**ALWAYS follow these steps when making changes:**

1. **Build after every change**
   ```bash
   npm run build
   ```
   - Do NOT assume TypeScript compiled correctly
   - Check for compilation errors in the output
   - Verify the change appears in `dist/`

2. **Test locally before claiming "fixed"**
   - Run the actual CLI command to verify behavior
   - For Lambda changes: write a local test script (e.g., `test-*.ts`) that mimics Lambda logic
   - For complex bugs: create minimal reproduction scripts
   - NEVER say something is fixed without actually running it

3. **Test script pattern for Lambda debugging**
   ```typescript
   // test-feature.ts - mimics Lambda logic locally
   import fs from 'fs';

   const data = JSON.parse(fs.readFileSync('data/export/features/nba-features.json', 'utf-8'));
   // ... test the exact logic from Lambda
   console.log('Result:', result);
   ```
   Run with: `npx ts-node test-feature.ts`

4. **Verify end-to-end for cloud changes**
   - After deploying Lambda: actually invoke it and check logs
   - Don't trust "it should work" - confirm it does work

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
node dist/cli/index.js train nba --season 2024 --market moneyline
node dist/cli/index.js train nba --season 2024 --market spread
node dist/cli/index.js recommend                    # All sports, sorted by edge
node dist/cli/index.js recommend nhl                # Single sport, sorted by edge
node dist/cli/index.js recommend nba --min-edge 0.06
node dist/cli/index.js backtest nba --season 2024 --market spread --show-buckets
```

Available CLI commands:
- `train` - Train models (supports `--market moneyline|spread`)
- `recommend` - Generate betting recommendations (unified sorted list, shows EST times)
- `backtest` - Run historical backtests with probability bucket analysis

## Architecture

### Data Flow
1. **Ingest** (`src/ingest/`) - Fetches teams, games, stats, and odds from ESPN APIs, writes to `data/<sport>/<season>/*.json`
2. **Import** (`src/db/importSportsToDb.ts`) - Loads JSON into SQLite with sport-specific stat handling
3. **Train** (multiple `train*.ts` files) - Trains models on completed games (separate for moneyline and spread)
4. **Predict** (`src/models/predict.ts`) - Loads model weights, applies activation function to feature vectors
5. **Recommend** (`src/recommend/recommendNba.ts`) - Compares model probabilities to odds, finds value bets
6. **Backtest** (`src/lib/backtest/backtester.ts`) - Evaluates strategies on historical data with spread grading

### Project Structure

```
src/
├── betting/          # Odds conversion, EV calculation, Kelly criterion
├── cli/              # CLI entry point and command definitions
│   └── commands/     # train, recommend, backtest commands
├── db/               # Database schema, queries, import scripts
├── ingest/           # ESPN API data fetching to JSON
├── lib/              # Shared utilities (newer modular architecture)
│   ├── backtest/     # Backtester with spread grading logic
│   ├── db/           # Database query utilities
│   ├── features/     # Feature engineering utilities
│   ├── model/        # Model calibration (beta, temperature scaling)
│   └── odds/         # EV calculators, spread grading
├── models/           # Feature extraction, training, prediction, normalization
├── recommend/        # Recommendation generation (sport-agnostic, uses ValueBet interface)
└── types/            # TypeScript type shims for third-party libraries
```

### Key Modules

- **`src/models/features.ts`** - Feature extraction (varies by sport). **CRITICAL:** Feature order in `getFeatureOrder()` or `getHockeyFeatureOrder()` must match exactly between training and prediction.
- **`src/betting/odds.ts`** - American to implied probability conversion, EV and Kelly criterion calculations
- **`src/db/queries.ts`** - Database queries with `getTeamStatsBeforeDate()` to prevent data leakage
- **`src/models/trainSpread.ts`** - Spread model training with push handling (excludes pushes from training data)
- **`src/cli/commands/backtest.ts`** - Spread grading logic at lines 198-206: `adjustedMargin = actual_margin + spread; home_covered = adjustedMargin > 0`
- **`src/cli/commands/recommend.ts`** - Separate optimal buckets for moneyline (`OPTIMAL_BUCKETS`) and spread (`OPTIMAL_BUCKETS_SPREAD`); displays line for spreads, odds for moneyline

### Database Schema (`src/db/schema.sql`)

Core tables: `teams`, `games`, `odds`, `season_stats`, `game_stats`. Teams use composite key `(id, sport)`. The `odds` table includes `line` column for spreads. Stats stored as text to handle formats like "10-20" (FG made-attempted).

### ML Pipeline

**Moneyline models**: Use `ml-logistic-regression` or Random Forest, stored at `data/models/<sport>/moneyline-<season>.json`
**Spread models**: Use Random Forest, stored at `data/models/<sport>/spread-<season>.json`

Models include calibration metadata (beta or temperature scaling). Training uses walk-forward validation for NBA, standard train/validation split for NCAAM/NHL.

### Spread Model Grading

Home team "covers" if: `(home_score - away_score) + spread > 0`
Example: Home -14.5 wins 105-85 → margin=20, adjustedMargin=20+(-14.5)=5.5 > 0 ✓ covered

Pushes (adjustedMargin == 0) are excluded during training and backtest.

### Data Leakage Prevention

All feature extraction uses `getTeamStatsBeforeDate()` and `getRecentGames()` with strict date filtering. Backtest respects chronological order: train on early games, backtest on later games.

## Supported Sports

`ncaam`, `nba`, `nhl` (primary focus)
`nfl`, `cfb` (ingest/import available, no trained models)

Each sport has configurable stat extraction in `src/db/importSportsToDb.ts` and feature order in `src/models/features.ts`.

## Optimal Betting Strategy

Based on backtesting with separate moneyline and spread models:

### NBA - Moneyline
```bash
node dist/cli/index.js recommend nba \
  --min-edge 0.06 \
  --max-ev 0.50 \
  --buckets "40-50,90-100"
```
- Expected ROI: **10.84%** | Win rate: ~71-78%

### NBA - Spread
- Optimal buckets: 50-60%, 60-70%
- Expected ROI: **65.39%** | Win rate: ~86%
- Note: Test with low --min-edge (0.03) to get sufficient bets

### NCAAM - Moneyline
```bash
node dist/cli/index.js recommend ncaam \
  --min-edge 0.08 \
  --max-ev 0.50 \
  --buckets "0-30,80-100"
```
- Expected ROI: **2.85%** | Win rate: ~70-85%
- Key insight: Bet only extremes (very confident or underdog)

### NCAAM - Spread
- Optimal buckets: 60-70%, 70-80%, 80-90%, 90-100%
- Expected ROI: **36.79%** | Win rate: ~72%
- Note: All models show varied predictions (no training issues)

### NHL - Moneyline
```bash
node dist/cli/index.js recommend nhl \
  --min-edge 0.08 \
  --max-ev 0.50 \
  --buckets "60-100"
```
- Expected ROI: **18.16%** | Win rate: ~70-85%

### NHL - Spread
- Optimal buckets: 70-80%, 80-90%
- Expected ROI: **48.64%** | Win rate: ~77%

### Filter Explanations
- `--min-edge X`: Minimum model edge required (default 3%)
- `--max-ev 0.50`: Caps EV at 50% to filter outliers (recommended)
- `--buckets "A-B,C-D"`: Only bet probability ranges with historical profitability
- Built-in vigorish gate: Requires 4% edge for high-vig lines (-115 or worse)
- `--market moneyline|spread`: Show recommendations for specific market (command shows both by default)

## Important Notes

- **Recommend Output**: Shows unified sorted list (best edge first) with EST times, Market column (ML/SPR), and L/O column (line for spreads, odds for moneyline)
- **Timezone Filtering**: `getUpcomingGames()` uses full ISO timestamp comparison to correctly filter past games across timezones
- **Type Shims**: ML libraries lack types; shims in `src/types/` (e.g., `ml-logistic-regression.d.ts`)
- **ESM Only**: Uses ES modules; import paths require `.js` extensions
- **Feature Order Critical**: Mismatch between training and prediction causes systematic prediction errors. Double-check `getFeatureOrder()` when modifying features.
- **Git Branch**: Main branch is `release` (not `main` or `master`)

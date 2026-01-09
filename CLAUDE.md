# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Development Commands

```bash
npm run build          # Format, lint:fix, and compile TypeScript to dist/
npm run dev            # tsc --watch for development
npm run check          # format:check + lint + tsc (CI validation)
npm test               # Run vitest tests
npm run test:watch     # Run vitest in watch mode
```

## Data Pipeline Commands

```bash
# Ingest data from ESPN APIs to JSON files (data/<sport>/<season>/)
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
```

## CLI Usage

After building, the CLI is available at `dist/cli/index.js`:

```bash
node dist/cli/index.js train nba --season 2024      # Train a model
node dist/cli/index.js recommend nba --min-edge 0.03 # Generate recommendations
```

## Architecture

### Data Flow
1. **Ingest** (`src/ingest/`) - Fetches teams, games, stats, and odds from ESPN APIs, writes to `data/<sport>/<season>/*.json`
2. **Import** (`src/db/importSportsToDb.ts`) - Loads JSON into SQLite with sport-specific stat handling
3. **Train** (`src/models/trainNbaMoneyline.ts`) - Trains logistic regression on completed games
4. **Predict** (`src/models/predict.ts`) - Loads model weights, applies sigmoid to feature vectors
5. **Recommend** (`src/recommend/`) - Compares model probabilities to sportsbook odds, finds value bets

### Key Modules

- **`src/models/features.ts`** - Feature extraction with 36 features (scoring, shooting %, efficiency, rebounding, defense, recent form, differentials). Feature order in `getFeatureOrder()` must match between training and prediction.
- **`src/betting/odds.ts`** - Odds conversion (American to decimal/implied probability), EV calculation, Kelly criterion
- **`src/db/queries.ts`** - Database queries for games, odds, team stats, recent games

### Database Schema (`src/db/schema.sql`)

Core tables: `teams`, `games`, `odds`, `season_stats`, `game_stats`. Teams use composite primary key `(id, sport)`. All IDs are ESPN event/team IDs.

### ML Pipeline

Uses `ml-logistic-regression` library. Models are JSON files storing theta weights at `data/models/<sport>/moneyline-<season>.json`. The `TrainedModel` type in `src/models/types.ts` defines the structure.

## Supported Sports

`ncaam`, `nba`, `nfl`, `cfb`, `nhl` - configured in both ingest and import modules with sport-specific stat handling (e.g., basketball combined stats like "FGM-FGA" are split during import).

## Type Shims

Third-party ML libraries lack TypeScript types; local shims are in `src/types/` (e.g., `ml-logistic-regression.d.ts`).

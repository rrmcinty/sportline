# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Prerequisites

- Node.js 20+
- `sqlite3` CLI installed (used by `npm run db:*` helpers)
- AWS CLI configured for cloud deployment (`aws configure`)

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
node dist/cli/index.js sync                         # Export and sync to S3
```

Available CLI commands:
- `train` - Train models (supports `--market moneyline|spread`)
- `recommend` - Generate betting recommendations (unified sorted list, shows EST times)
- `backtest` - Run historical backtests with probability bucket analysis
- `sync` - Export features/models/predictions and upload to S3 for Lambda

## Cloud Deployment (AWS CDK)

```bash
# One-command setup (dev environment - uses your username)
npm run all

# Production environment
npm run all:prod

# Individual deployment steps
npm run lambda:build      # Build Lambda functions
npm run sync              # Export data and upload to S3
npm run cdk:deploy        # Deploy CDK stack
npm run cdk:deploy:prod   # Deploy to production

# Utilities
npm run cdk:diff          # Show differences before deploying
npm run cdk:destroy       # Delete entire stack
```

The CDK stack creates:
- **S3 bucket** (`sportline-data-{env}`) for models, features, and recommendations
- **Update Lambda** (`Sportline-Update-{env}`) - Runs daily at 8am EST, fetches odds and generates recommendations
- **Dashboard Lambda** (`Sportline-Dashboard-{env}`) - Serves mobile-optimized UI with public Function URL
- **EventBridge rule** - Triggers Update Lambda on cron schedule

See `infrastructure/README.md` for detailed CDK documentation.

## Architecture

### Data Flow
1. **Ingest** (`src/ingest/`) - Fetches teams, games, stats, and odds from ESPN APIs, writes to `data/<sport>/<season>/*.json`
2. **Import** (`src/db/importSportsToDb.ts`) - Loads JSON into SQLite with sport-specific stat handling
3. **Train** (multiple `train*.ts` files) - Trains models on completed games (separate for moneyline and spread)
4. **Predict** (`src/models/predict.ts`) - Loads model weights, applies activation function to feature vectors
5. **Recommend** (`src/recommend/recommendNba.ts`) - Compares model probabilities to odds, finds value bets
6. **Backtest** (`src/lib/backtest/backtester.ts`) - Evaluates strategies on historical data with spread grading
7. **Sync** (`src/cli/commands/sync.ts`) - Exports features and predictions to S3 for cloud Lambda
8. **Cloud Update** (`lambda/update/`) - Lambda fetches fresh odds from ESPN, loads predictions, writes recommendations to S3
9. **Dashboard** (`lambda/dashboard/`) - Lambda serves mobile UI that displays recommendations from S3

### Project Structure

```
src/
├── betting/          # Odds conversion, EV calculation, Kelly criterion
├── cli/              # CLI entry point and command definitions
│   └── commands/     # train, recommend, backtest, sync commands
├── config/           # Optimal bucket configurations
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

lambda/
├── update/           # Update Lambda (fetches odds, generates recommendations)
│   ├── src/
│   │   ├── index.ts  # Lambda handler
│   │   ├── espn.ts   # ESPN API client
│   │   └── s3.ts     # S3 helpers
│   └── dist/         # Built code (deployed to AWS)
└── dashboard/        # Dashboard Lambda (serves mobile UI)
    ├── src/
    │   ├── index.ts  # Lambda handler
    │   ├── html.ts   # HTML template with CSS
    │   └── frontend/
    │       ├── app.ts    # TypeScript dashboard logic
    │       └── types.ts  # Type definitions
    └── dist/         # Built code (deployed to AWS)

infrastructure/
├── bin/
│   └── app.ts                    # CDK app entry point
├── lib/
│   └── sportline-stack.ts        # Main stack definition
└── cdk.json                      # CDK configuration
```

### Key Modules

- **`src/models/features.ts`** - Feature extraction (varies by sport). **CRITICAL:** Feature order in `getFeatureOrder()` or `getHockeyFeatureOrder()` must match exactly between training and prediction.
- **`src/betting/odds.ts`** - American to implied probability conversion, EV and Kelly criterion calculations
- **`src/db/queries.ts`** - Database queries with `getTeamStatsBeforeDate()` to prevent data leakage
- **`src/models/trainSpread.ts`** - Spread model training with push handling (excludes pushes from training data)
- **`src/cli/commands/backtest.ts`** - Spread grading logic: `adjustedMargin = actual_margin + spread; home_covered = adjustedMargin > 0`
- **`src/cli/commands/recommend.ts`** - Separate optimal buckets for moneyline (`OPTIMAL_BUCKETS`) and spread (`OPTIMAL_BUCKETS_SPREAD`); displays line for spreads, odds for moneyline; default max EV is 50%
- **`src/cli/commands/sync.ts`** - Exports team features, models, and pre-computed predictions to S3 for Lambda consumption
- **`lambda/update/src/index.ts`** - Update Lambda handler; uses pre-computed predictions from S3, fetches fresh odds from ESPN, generates recommendations; default max EV is 50%
- **`lambda/dashboard/src/html.ts`** - Dashboard HTML/CSS template with GitHub-inspired dark theme, filter pills, and mobile-optimized layout
- **`lambda/dashboard/src/frontend/app.ts`** - Dashboard frontend logic with filter management, data fetching, and card rendering

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

### Cloud Architecture (Lambda + S3)

The system uses a **sync-then-predict** architecture:

1. **Local CLI** (`sync` command) pre-computes predictions for all upcoming games and exports to S3:
   - `features/teams.json` - Team name mappings
   - `features/config.json` - Optimal bucket configurations
   - `features/{sport}-predictions.json` - Pre-computed moneyline and spread predictions
   - `models/{sport}/moneyline-2025.json` - Trained models (not used by Lambda, only for reference)
   - `models/{sport}/spread-2025.json` - Trained models (not used by Lambda, only for reference)

2. **Update Lambda** (runs daily at 8am EST or on-demand):
   - Loads pre-computed predictions from S3
   - Fetches fresh odds from ESPN API
   - Generates recommendations by comparing predictions to odds
   - Applies filters (min edge, max EV, juice gate, optimal buckets)
   - Writes `daily/recs.json` to S3

3. **Dashboard Lambda** (on-demand via public Function URL):
   - Serves mobile-optimized HTML/CSS/JS
   - Frontend fetches `daily/recs.json` from S3 via `/api/recs` endpoint
   - Supports filtering by sport and market
   - Triggers Update Lambda refresh via `/api/refresh` endpoint

This architecture minimizes Lambda cold start time by avoiding ML computations in Lambda - predictions are pre-computed locally where performance is not critical.

## Supported Sports

`ncaam`, `nba`, `nhl` (primary focus)
`nfl`, `cfb` (ingest/import available, no trained models)

Each sport has configurable stat extraction in `src/db/importSportsToDb.ts` and feature order in `src/models/features.ts`.

## Model Validation & Performance (CRITICAL)

**Last Verified:** January 13, 2026
**Methodology:** Proper out-of-sample testing (train 2024 → test 2025)
**Critical Documentation:** `data/REAL-OUT-OF-SAMPLE-RESULTS.md` and `READY-FOR-PRODUCTION.md`

### ⚠️ CRITICAL LESSON: Avoid In-Sample Testing Mistakes

**What Went Wrong (January 2026):**
Initial backtests trained and tested on the SAME season data (in-sample testing), producing artificially inflated ROI numbers:
- NHL Moneyline appeared to have 83.60% ROI
- NBA Moneyline appeared to have 66.51% ROI
- All 6 models appeared profitable

**The Fix:**
Proper out-of-sample validation was implemented: **train on 2024 season, test on 2025 season**. This revealed the truth:
- **Only 1 of 6 models is actually profitable**
- 5 models lose money when properly validated

**For Future AI: ALWAYS use out-of-sample testing**
```bash
# CORRECT: Train on one season, test on a different season
node dist/cli/index.js train nba --season 2024 --market moneyline
node dist/cli/index.js backtest nba --season 2025 --market moneyline --show-buckets

# WRONG: Training and testing on same data
node dist/cli/index.js train nba --season 2025 --market moneyline
node dist/cli/index.js backtest nba --season 2025 --market moneyline  # ❌ Inflated results
```

### Verified Model Performance (Out-of-Sample)

#### ✅ PROFITABLE: NHL Moneyline ONLY
```bash
node dist/cli/index.js recommend nhl --min-edge 0.07
```
- **ROI:** +13.40% (verified on 425 bets, 2025 season)
- **Win Rate:** 56.71%
- **Optimal Buckets:** 60-70% (+11.93% ROI), 70-80% (+27.76% ROI)
- **Threshold:** 7% minimum edge (production setting)
- **Model:** `data/models/nhl/moneyline-2024.json` (2024 trained, works on 2025)

#### ❌ UNPROFITABLE: Do Not Use
All other models lose money when properly validated (train 2024 → test 2025):

| Sport/Market | Out-of-Sample ROI | Status |
|--------------|-------------------|--------|
| NBA Moneyline | -13.23% | ❌ Loses money |
| NBA Spread | -9.38% | ❌ Loses money |
| NCAAM Moneyline | -7.95% | ❌ Loses money |
| NCAAM Spread | -9.18% | ❌ Loses money |
| NHL Spread | -35.40% | ❌ Worst performer |

### Current Production Configuration

**Lambda Settings** (`lambda/update/src/index.ts`):
- `MIN_EDGE = 0.07` (7%, optimized for NHL ML)
- `MAX_EV = 0.5` (50%, filters outliers)
- Dashboard shows all sports but only NHL ML is profitable

**Optimal Buckets** (`src/config/optimalBuckets.ts`):
- Contains warnings for each unprofitable model
- Only NHL Moneyline buckets are verified profitable
- Other buckets retained for research/tracking only

### Why Most Models Failed

**Sports betting models struggle with:**
1. **Season-to-season changes:** Roster turnover, coaching changes, rule changes
2. **Small sample sizes:** Even full seasons may not capture all patterns
3. **Meta-game shifts:** Playing styles and strategies evolve
4. **Overfitting:** Complex features that work on training data don't generalize

**Why NHL Moneyline works:**
- More games per season (82 vs 30-40 for basketball)
- Less roster volatility
- More predictable playing styles
- Simpler scoring dynamics

### How to Improve Models (Future Work)

#### 1. Better Validation Methodology
```bash
# Use multiple seasons for training
node dist/cli/index.js train nba --season 2023 --market moneyline
# Combine 2023 + 2024 data, then test on 2025

# Walk-forward validation within season (partially implemented for NBA)
# Train on first 70% of games, test on last 30% of same season
```

#### 2. Feature Engineering Improvements
- **Injuries:** Currently not tracked; significant impact on outcomes
- **Rest days:** Back-to-back games affect performance
- **Travel distance:** Cross-country games vs divisional games
- **Referee assignments:** Different officials call games differently
- **Weather:** Outdoor sports (NFL, CFB) affected by conditions
- **Line movement:** Track how odds change over time
- **Public betting percentages:** Fade or follow the public

#### 3. Model Architecture Experiments
```bash
# Current: Random Forest (spread), Logistic Regression (some moneyline)
# Try:
# - XGBoost (better handling of complex interactions)
# - Neural networks (deeper feature learning)
# - Ensemble methods (combine multiple models)
# - Separate models by conference/division (NBA East vs West)
```

#### 4. Calibration Improvements
Current calibration uses temperature scaling or beta calibration. Consider:
- **Isotonic regression:** Non-parametric, more flexible
- **Platt scaling:** Effective for some classifiers
- **Evaluate ECE (Expected Calibration Error):** Current backtests show this but don't optimize for it

#### 5. Live Monitoring & Retraining
```bash
# Track real-world performance
# If ROI drops significantly, retrain immediately

# Monthly retraining schedule
node dist/cli/index.js train nhl --season 2025 --market moneyline --calibrate
node dist/cli/index.js backtest nhl --season 2025 --market moneyline --show-buckets
npm run sync && npm run cdk:deploy
```

#### 6. Odds Shopping
Currently uses ESPN odds only. To improve:
- Scrape multiple sportsbooks (DraftKings, FanDuel, BetMGM, etc.)
- Find line discrepancies between books
- Take best available odds for each bet
- Track which books consistently offer better value

#### 7. Advanced Strategies
- **Arbitrage detection:** Guaranteed profit across different books
- **Middle opportunities:** Bet both sides at different lines
- **Hedging strategies:** Lock in profits before games end
- **Correlation analysis:** Parlay detection (which bets are independent?)

### Testing Checklist for Future Updates

Before claiming models are profitable:

- [ ] Train on season N, test on season N+1 (out-of-sample)
- [ ] Verify sample size (>100 bets minimum per bucket)
- [ ] Check calibration (ECE < 0.10 acceptable, < 0.05 ideal)
- [ ] Test on multiple seasons if available (2023→2024, 2024→2025)
- [ ] Compare to baseline (betting favorites, random selection)
- [ ] Document exact commands and results in `data/` directory
- [ ] Update `src/config/optimalBuckets.ts` with verified buckets
- [ ] Run `npm test` to ensure no regressions
- [ ] Sync and deploy: `npm run sync && npm run cdk:deploy`

### Filter Explanations
- `--min-edge X`: Minimum model edge required (default 3%, production uses 7% for NHL)
- `--max-ev 0.5`: Caps EV at 50% to filter extreme outliers
- `--buckets "A-B,C-D"`: Only bet probability ranges with historical profitability
- Built-in vigorish gate: Requires 4% edge for high-vig lines (-115 or worse)
- `--market moneyline|spread`: Filter to specific market

### References
- **`data/REAL-OUT-OF-SAMPLE-RESULTS.md`** - Comprehensive validation results
- **`READY-FOR-PRODUCTION.md`** - Production deployment summary
- **`data/proper-backtests/`** - All 6 out-of-sample backtest logs
- **`src/config/optimalBuckets.ts`** - Current bucket configurations with warnings

---

## Iterative Model Improvement Protocol

**Purpose:** When tasked with improving unprofitable models (e.g., NCAAM, NBA), follow this protocol to ensure rigorous testing and prevent false positives.

**Context:** We've had false positives from in-sample testing that produced inflated ROI numbers. This protocol prevents repeating that mistake.

### Non-Negotiable Verification Rules

Before claiming ANY improvement, these rules are **mandatory**:

1. **OUT-OF-SAMPLE ONLY**
   - Train on seasons {A, B}, test on season {C}
   - NEVER train and test on the same season
   - Example: Train on 2023+2024, test on 2025

2. **MULTI-SEASON VALIDATION**
   - If claiming success on 2025, MUST also validate on 2024
   - Both test seasons must show positive ROI
   - If only one season is profitable, consider it UNPROFITABLE

3. **CALCULATION AUDIT**
   - Show exact formula: `ROI = (total_profit / total_staked) * 100`
   - Show raw numbers: `ROI = ($342 / $2,850) * 100 = 12.0%`
   - Never round before final percentage

4. **BASELINE COMPARISON**
   - Compare to naive strategies:
     - Betting all favorites
     - Random selection
     - Kelly criterion with uncalibrated model
   - Must beat baseline by at least 5% to be considered meaningful

5. **INDEPENDENT VERIFICATION**
   - Run each backtest TWICE independently
   - Confirm identical results both times
   - If results differ, investigate non-determinism

6. **BUCKET-LEVEL ANALYSIS**
   - Don't just report overall ROI
   - Show bucket-by-bucket breakdown
   - Identify which probability ranges are profitable
   - Flag suspiciously high ROI (>40%) for extra scrutiny

7. **CALIBRATION TRACKING**
   - Monitor ECE (Expected Calibration Error)
   - ECE > 0.15 indicates poor probability estimates
   - ROI without calibration is meaningless

### Results Registry

Maintain a **living document** tracking all experiments. Create `data/experiments-{sport}-{market}.md`:

```markdown
# NCAAM Moneyline Optimization Experiments

**Goal:** Improve from -7.95% ROI (baseline, 2024→2025) to positive ROI

## Experiments

| # | Date | Model | Features | Train | Test | ROI | Win% | Bets | ECE | Verified | Notes |
|---|------|-------|----------|-------|------|-----|------|------|-----|----------|-------|
| 0 | 2026-01-13 | RF | baseline | 2024 | 2025 | -7.95% | 47.2% | 425 | 0.08 | ✓✓ | Baseline |
| 1 | 2026-01-14 | RF | +injuries | 2024 | 2025 | +2.3% | 51.8% | 425 | 0.07 | ✓✓ | Validated 2024: -1.2% ❌ |
| 2 | 2026-01-14 | XGBoost | baseline | 2024 | 2025 | +5.1% | 52.4% | 425 | 0.06 | ✓✓ | Validated 2024: +3.8% ✓ |
| 3 | 2026-01-14 | XGBoost | +rest | 2024 | 2025 | +8.7% | 54.1% | 425 | 0.05 | ✓✓ | Validated 2024: +7.2% ✓ |

**Legend:**
- ✓✓ = Verified (ran backtest twice, identical results)
- ❌ = Failed validation (not profitable on both seasons)
- ✓ = Passed validation (profitable on both seasons)

## Best Model (as of 2026-01-14)
- **Experiment #3**: XGBoost with rest-day features
- **Train**: 2024 season
- **Test 2025**: +8.7% ROI (54.1% win rate, 425 bets)
- **Test 2024**: +7.2% ROI (53.2% win rate, 389 bets)
- **ECE**: 0.05 (well-calibrated)
- **Commands**:
  ```bash
  node dist/cli/index.js train ncaam --season 2024 --market moneyline --calibrate
  node dist/cli/index.js backtest ncaam --season 2025 --market moneyline --show-buckets
  node dist/cli/index.js backtest ncaam --season 2024 --market moneyline --show-buckets
  ```
```

### Verification Checklist (Before Each Claim)

When claiming an improvement, complete this checklist:

- [ ] **Show exact command used**
  ```bash
  node dist/cli/index.js backtest ncaam --season 2025 --market moneyline --show-buckets
  ```

- [ ] **Paste raw terminal output** (not interpreted summary)
  ```
  Backtest Results:
  Total Bets: 425
  Wins: 230 (54.1%)
  Total Staked: $4,250.00
  Total Profit: $369.75
  ROI: 8.70%
  ```

- [ ] **Run same test AGAIN** and confirm identical results
  ```bash
  # Run 2: Same command
  node dist/cli/index.js backtest ncaam --season 2025 --market moneyline --show-buckets
  # Verify ROI matches: 8.70% ✓
  ```

- [ ] **Validate on different season**
  ```bash
  node dist/cli/index.js backtest ncaam --season 2024 --market moneyline --show-buckets
  # Result: ROI = 7.20% ✓ (both seasons profitable)
  ```

- [ ] **Show bucket breakdown** (which probability ranges work?)
  ```
  60-70%: +15.2% ROI (156 bets)
  70-80%: +11.8% ROI (98 bets)
  80-90%: -2.1% ROI (87 bets)
  90-100%: +8.4% ROI (84 bets)
  ```

- [ ] **Compare to baseline**
  ```
  Baseline (Exp #0): -7.95% ROI
  This model (Exp #3): +8.7% ROI
  Improvement: +16.65 percentage points ✓
  ```

- [ ] **Check calibration**
  ```
  ECE: 0.05 (excellent)
  Brier Score: 0.21
  Log Loss: 0.58
  ```

- [ ] **Update results registry** (`data/experiments-ncaam-moneyline.md`)

### Anti-False-Positive Code Implementation

Create `src/lib/verification/verify.ts`:

```typescript
/**
 * Verification utilities to prevent false positive ROI claims
 * MUST be used before reporting any model improvements
 */

interface BacktestResult {
  roi: number;
  winRate: number;
  totalBets: number;
  totalProfit: number;
  totalStaked: number;
  ece: number;
  buckets: Record<string, { roi: number; bets: number }>;
}

export async function verifyBacktestClaim(
  sport: string,
  market: string,
  trainSeasons: number[],
  testSeason: number,
  claimedROI: number
): Promise<{
  confirmed: boolean;
  actualROI: number;
  discrepancy: number;
  validatedOnMultipleSeasons: boolean;
  bucketBreakdown: object;
  timestamp: string;
}> {
  console.log('🔍 VERIFICATION: Running independent backtest...');

  // Run backtest twice to ensure deterministic results
  const result1 = await runBacktest(sport, market, trainSeasons, testSeason);
  const result2 = await runBacktest(sport, market, trainSeasons, testSeason);

  if (Math.abs(result1.roi - result2.roi) > 0.01) {
    throw new Error(`❌ VERIFICATION FAILED: Non-deterministic results!
      Run 1: ${result1.roi.toFixed(2)}%
      Run 2: ${result2.roi.toFixed(2)}%
      These should be identical. Check for randomness in model training.`);
  }

  const discrepancy = Math.abs(claimedROI - result1.roi);
  if (discrepancy > 0.5) {
    throw new Error(`❌ VERIFICATION FAILED: Claimed ROI doesn't match actual!
      Claimed: ${claimedROI.toFixed(2)}%
      Actual:  ${result1.roi.toFixed(2)}%
      Diff:    ${discrepancy.toFixed(2)} percentage points`);
  }

  // Validate on previous season
  const validationSeason = testSeason - 1;
  const validationResult = await runBacktest(sport, market, trainSeasons, validationSeason);
  const validatedOnMultiple = validationResult.roi > 0;

  if (!validatedOnMultiple) {
    console.warn(`⚠️  WARNING: Model is profitable on ${testSeason} (+${result1.roi.toFixed(2)}%) but UNPROFITABLE on ${validationSeason} (${validationResult.roi.toFixed(2)}%). Consider this model UNRELIABLE.`);
  }

  // Check for suspiciously high ROI
  if (result1.roi > 40) {
    console.warn(`⚠️  WARNING: ROI of ${result1.roi.toFixed(2)}% is suspiciously high. Verify:
      - Are we testing on training data?
      - Is sample size too small? (n=${result1.totalBets})
      - Is ECE terrible? (ECE=${result1.ece.toFixed(3)})`);
  }

  return {
    confirmed: true,
    actualROI: result1.roi,
    discrepancy,
    validatedOnMultipleSeasons: validatedOnMultiple,
    bucketBreakdown: result1.buckets,
    timestamp: new Date().toISOString()
  };
}

async function runBacktest(
  sport: string,
  market: string,
  trainSeasons: number[],
  testSeason: number
): Promise<BacktestResult> {
  // Implementation calls actual backtest command
  // This is a placeholder - actual implementation would exec CLI command
  throw new Error('Not implemented - see src/cli/commands/backtest.ts');
}
```

### Iteration Strategy

Follow this systematic approach when improving models:

#### Phase 1: Establish Baseline (MANDATORY FIRST STEP)

```bash
# 1. Run current model on out-of-sample test
node dist/cli/index.js train ncaam --season 2024 --market moneyline --calibrate
node dist/cli/index.js backtest ncaam --season 2025 --market moneyline --show-buckets

# 2. Validate on previous season
node dist/cli/index.js backtest ncaam --season 2024 --market moneyline --show-buckets

# 3. Document in results registry as Experiment #0
# This is the benchmark ALL improvements must beat
```

#### Phase 2: Feature Engineering (Incremental)

Add features **one at a time**, test each:

```bash
# Example: Add injury tracking
# 1. Implement new feature extraction in src/models/features.ts
# 2. Retrain with new features
node dist/cli/index.js train ncaam --season 2024 --market moneyline --calibrate

# 3. Test on both seasons
node dist/cli/index.js backtest ncaam --season 2025 --market moneyline --show-buckets
node dist/cli/index.js backtest ncaam --season 2024 --market moneyline --show-buckets

# 4. Document as Experiment #1
# 5. Only keep feature if BOTH seasons improve
```

**Feature ideas:**
- Injury reports (starters vs bench)
- Rest days (back-to-back games)
- Travel distance (cross-country vs local)
- Home court advantage (venue-specific stats)
- Referee tendencies (foul rates, home bias)
- Momentum features (last 5 games trend)
- Matchup history (head-to-head records)
- Conference strength (opponent adjusted stats)

#### Phase 3: Model Architecture (If Features Plateau)

Test different ML architectures:

```bash
# Try XGBoost (better for complex interactions)
# Modify src/models/trainNcaamMoneyline.ts to use XGBoost
node dist/cli/index.js train ncaam --season 2024 --market moneyline --calibrate

# Try ensemble (blend Random Forest + XGBoost + Logistic Regression)
# Implement ensemble prediction in src/models/predict.ts

# Try neural network (if dataset is large enough, >5000 games)
```

**Architecture options:**
- Random Forest (current default)
- XGBoost (gradient boosting)
- LightGBM (faster gradient boosting)
- Neural network (MLP with 2-3 hidden layers)
- Ensemble (weighted average of multiple models)
- Stacking (meta-learner combines base models)

#### Phase 4: Hyperparameter Tuning

Once architecture is chosen, optimize hyperparameters:

```bash
# Grid search on validation set (2023 data)
# Test final model on held-out set (2024, 2025)

# Random Forest hyperparameters:
# - n_estimators: [100, 200, 500]
# - max_depth: [10, 20, 30, None]
# - min_samples_split: [2, 5, 10]
# - min_samples_leaf: [1, 2, 4]

# XGBoost hyperparameters:
# - learning_rate: [0.01, 0.05, 0.1]
# - max_depth: [3, 5, 7]
# - n_estimators: [100, 200, 500]
# - subsample: [0.8, 0.9, 1.0]
```

#### Phase 5: Calibration Optimization

Improve probability calibration:

```bash
# Try different calibration methods
# See src/lib/model/calibration.ts

# Test isotonic regression, Platt scaling, beta calibration
# Choose method with lowest ECE on validation set
```

### Success Criteria

A model improvement is considered **successful** when:

- [ ] Profitable on test season A (e.g., 2025): ROI > 0%
- [ ] Profitable on test season B (e.g., 2024): ROI > 0%
- [ ] Beats baseline by at least 5 percentage points
- [ ] Sample size is adequate (>100 bets per season)
- [ ] Calibration is reasonable (ECE < 0.10)
- [ ] Backtest is deterministic (ran twice, identical results)
- [ ] Bucket breakdown shows consistency (multiple buckets profitable)
- [ ] Documented in results registry
- [ ] Code changes committed to git

### Failure Modes to Avoid

**Red Flags - Stop and Investigate:**

1. **Too-Good-To-Be-True ROI (>40%)**
   - Likely testing on training data
   - Or sample size too small
   - Or calculation error

2. **Profitable on One Season Only**
   - Model is overfitting to that season's patterns
   - Consider it UNPROFITABLE

3. **Terrible Calibration (ECE > 0.15)**
   - Probabilities are wrong even if ROI looks good
   - Model is likely getting lucky, not skilled

4. **Single Bucket Drives All Profit**
   - If only 90-100% bucket is profitable with huge ROI
   - Likely only a few bets, could be variance

5. **Non-Deterministic Results**
   - If re-running gives different ROI
   - There's randomness in training (set seed!)
   - Or data is leaking from different timestamps

6. **Forgot to Verify on Second Season**
   - ALWAYS validate on multiple seasons
   - One season is never enough

### What to Do When Stuck

If you've tried 10+ experiments and nothing works:

1. **Check for data leakage**
   - Review feature extraction code
   - Ensure `getTeamStatsBeforeDate()` is used correctly
   - Verify no future data leaks into training

2. **Simplify the model**
   - Try logistic regression with just 5-10 features
   - See if basic model can be profitable
   - Complexity might be hurting, not helping

3. **Analyze failure patterns**
   - Which games is the model losing on?
   - Home favorites? Road underdogs?
   - Early season? Late season?
   - Specific conferences?

4. **Consider the sport might not be predictable**
   - NCAAM has 350+ teams with huge talent disparity
   - Roster turnover is massive year-to-year
   - Odds makers might be too efficient
   - Some sports are just harder to beat

5. **Document the negative results**
   - Failed experiments are valuable
   - Update CLAUDE.md with findings
   - Help future iterations avoid same mistakes

### Example Planning Mode Prompt

When starting an improvement task, use this template:

```markdown
# Task: Improve NCAAM Moneyline to Positive ROI

## Context
Current baseline (train 2024, test 2025): -7.95% ROI
Goal: Achieve positive ROI (>0%) validated on multiple seasons

## Constraints
- Follow "Iterative Model Improvement Protocol" in CLAUDE.md
- Use out-of-sample testing ONLY (train 2024, test 2025 AND 2024)
- Document all experiments in data/experiments-ncaam-moneyline.md
- Run verification checks before claiming success
- Must be profitable on BOTH test seasons (2024 and 2025)

## Approach
1. Establish verified baseline (Experiment #0)
2. Try feature engineering (one feature at a time)
3. If features plateau, try model architectures
4. Tune hyperparameters on best model
5. Optimize calibration

## Success Criteria
- ROI > 0% on both 2024 and 2025 test seasons
- Beats baseline by >5 percentage points
- ECE < 0.10
- Sample size >100 bets per season
- All results verified (ran tests 2x)
- Documented in results registry

IMPORTANT: If I claim success, verify by:
1. Running the exact commands I used
2. Confirming results match
3. Checking validation on both seasons
4. Reviewing calibration quality
```

---

## Important Notes

- **Recommend Output**: Shows unified sorted list (best edge first) with EST times, Market column (ML/SPR), and L/O column (line for spreads, odds for moneyline)
- **Timezone Filtering**: `getUpcomingGames()` uses full ISO timestamp comparison to correctly filter past games across timezones
- **Type Shims**: ML libraries lack types; shims in `src/types/` (e.g., `ml-logistic-regression.d.ts`)
- **ESM Only**: Uses ES modules; import paths require `.js` extensions
- **Feature Order Critical**: Mismatch between training and prediction causes systematic prediction errors. Double-check `getFeatureOrder()` when modifying features.
- **Git Branch**: Main branch is `release` (not `main` or `master`)
- **Max EV Default**: Both CLI and Lambda default to 50% max EV (can be overridden with `--max-ev` flag in CLI)
- **Lambda Architecture**: Lambda does NOT perform ML predictions - it loads pre-computed predictions from S3 (generated by `sync` command) and only fetches fresh odds
- **Dashboard UI**: GitHub-inspired dark theme with filter pills (sport/market/date), color-coded edges, and mobile-first design; built with TypeScript + esbuild

### Recent Changes & Critical Operational Notes

- **NBA Spread Disabled**: NBA spread bets are completely filtered out via two mechanisms:
  - Empty bucket config: `src/config/optimalBuckets.ts` has `nba.spread: []`
  - Frontend filter: `lambda/dashboard/src/frontend/app.ts` explicitly filters `rec.sport === 'nba' && rec.market === 'spread'`
  - This is intentional - NBA spread loses money out-of-sample

- **Multi-Day Game Support**: Lambda fetches games for next 3 days:
  - `DAYS_AHEAD = 3` constant in `lambda/update/src/index.ts`
  - Dashboard has date filter pills: All Days / Today / Tomorrow
  - Uses EST timezone for date calculations

- **Odds Availability Limitation**: Sportsbooks typically don't post odds until game day morning
  - Tomorrow's games often show 0 recommendations even though predictions exist
  - This is expected behavior - ESPN API returns "No odds items" until books release lines

- **Deployment Workflow After Config Changes**:
  ```bash
  # 1. Edit config (e.g., src/config/optimalBuckets.ts)
  npm run build

  # 2. Sync updated config to S3 (critical step!)
  node dist/cli/index.js sync

  # 3. Deploy Lambda changes
  npm run lambda:build
  npm run cdk:deploy

  # 4. Trigger Lambda to regenerate recommendations
  aws lambda invoke --function-name Sportline-Update-{env} /tmp/response.json

  # 5. Check logs
  aws logs tail /aws/lambda/Sportline-Update-{env} --since 10m
  ```

- **Defense-in-Depth Filtering**: The dashboard frontend has additional filtering logic beyond bucket config to catch edge cases and provide fail-safe protection against unprofitable bets

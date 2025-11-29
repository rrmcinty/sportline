# sportline Status

**Last Updated:** 2025-11-29  
**Current Phase:** Phase 2 – Model Validation & Market Integration Complete  
**Active Step:** Predictive model operational with temporal validation ✅

---

## Progress Tracker

### ✅ Completed
- [x] Decided on TypeScript/Node stack
- [x] Defined project structure and architecture
- [x] Created PLAN.md and STATUS.md
- [x] Named project "sportline"
- [x] **Step 1: Project Initialization**
  - [x] Create `package.json` with dependencies
  - [x] Create `tsconfig.json`
  - [x] Create `.gitignore`
  - [x] Define `Sport`, `MarketType`, `BetLeg`, `ParlaySpec` in `src/models/types.ts`
  - [x] Add vig removal utility for fair probabilities

- [x] **Step 3: ESPN NCAAM Fetchers**
  - [x] `src/espn/ncaam/events.ts` – fetch events by date
  - [x] `src/espn/ncaam/odds.ts` – fetch and normalize odds with vig removal

- [x] **Step 4: Parlay Logic**
  - [x] `src/parlay/eval.ts` – compute probability, payout, EV
  - [x] Generate all possible parlays with conflict detection

- [x] **Step 5: Caching**
  - [x] File-based caching with TTL (5 min live, 1 hour final)

- [x] **Step 6: CLI**
  - [x] `src/cli/commands.ts` – implement commands
  - [x] `games` command - fetch events by date
  - [x] `odds` command - import odds for specific event
  - [x] `recommend` command - generate ranked parlays
  - [x] `bets` command - single-event EV display
  
- [x] **Step 7: Testing & Validation**
  - [x] Fetch real games for today (2 games found: BCU @ IU, NSU @ ARIZ)
  - [x] Evaluate sample parlays (conflict detection fixed)
  - [x] Confirm EV calculations
  
- [x] **CFB Support**
  - [x] Added `src/espn/cfb/events.ts` (CFB events fetcher)
  - [x] Added `src/espn/cfb/odds.ts` (CFB odds fetcher + normalizer)
  - [x] Added `--sport` flag to all CLI commands
  - [x] Final score ingest from ESPN (via competition score refs) for NCAAM & CFB
  
- [x] **Data Pipeline**
  - [x] Implemented SQLite data ingest pipeline (games/odds → scores persisted)
  - [x] Created SQLite schema (7 tables: teams, games, odds, team_stats, features, model_runs, model_predictions)
  - [x] Ingested full CFB 2025 season: 1662 completed games with scores
  - [x] Ingested NCAAM 2025 season: 78 completed games with scores

- [x] **Feature Engineering**
  - [x] Implemented rolling statistics (5-game windows: win rate, avg margin)
  - [x] Added home advantage feature
  - [x] Added Strength of Schedule (SoS) features: opponent win rate, opponent avg margin
  - [x] Added market implied probability as feature (vig-free)
  - [x] Total: 10 features per game

- [x] **Model Training**
  - [x] Implemented logistic regression with gradient descent
  - [x] Added L2 regularization (lambda=0.1) to prevent overfitting
  - [x] Implemented temporal validation split (70% early games train, 30% recent games validate)
  - [x] Trained CFB model: 74.5% validation accuracy on future games
  - [x] Trained NCAAM model: 96.3% accuracy (limited data)
  - [x] Saved model artifacts (`model.json`, `metrics.json`) under `models/<sport>/<runId>/`

- [x] **Model Evaluation & Metrics**
  - [x] Implemented Brier score calculation (CFB: 0.1716, better than random 0.25)
  - [x] Implemented log loss calculation (CFB: 0.5140)
  - [x] Created calibration curve data (binned predictions vs actual win rates)
  - [x] Temporal validation: split at 2025-09-27 for CFB
  - [x] Verified model generalizes well (2% accuracy drop from train to validation)

- [x] **Model Integration**
  - [x] Wired `model predict` command (prints home win probabilities for date)
  - [x] Integrated model probabilities into `recommend` command
  - [x] Model overrides market probabilities for moneylines when available
  - [x] Added "(model)" tag to show which values are model-derived
  - [x] Enhanced bet display: market type, payout if win, EV explanation

- [x] **Calibration Experiments**
  - [x] Implemented isotonic regression (PAVA algorithm)
  - [x] Tested calibration with various validation set sizes
  - [x] Decided against calibration due to overfitting with current dataset size
  - [x] L2 regularization proved more effective for stability

### 🔄 Current Model Performance (CFB 2025)
- **Training Accuracy:** 75.8% (1163 games before Sept 27)
- **Validation Accuracy:** 74.5% (499 games after Sept 27)
- **Brier Score:** 0.1716 (12% better than stats-only model)
- **Log Loss:** 0.5140 (10% better than stats-only model)
- **Features:** 10 features including market implied probability
- **Regularization:** L2 penalty (lambda=0.1)
- **Calibration:** Disabled (needs 1000+ validation samples)

### 📋 Next Steps
- [ ] Spread prediction model (logistic regression for cover probability)
- [ ] Total prediction model (linear regression for combined score)
- [ ] Add rest days / back-to-back game features
- [ ] Add team efficiency stats (offensive/defensive ratings)
- [ ] Implement recency weighting for features
- [ ] Track actual betting results vs predictions
- [ ] Add model performance dashboard

### 🔮 Future Enhancements
- [ ] Better output formatting (tables)
- [ ] Add filtering options (by market type, provider, minimum probability)
- [ ] Manual odds input option
- [ ] Export recommendations to JSON/CSV
- [ ] Matchup similarity features (cluster teams by style)
- [ ] Power ratings for more sophisticated SoS
- [ ] Cross-validation for model selection
- [ ] Platt scaling as alternative calibration method

---

## Current Model Results Example

```
1. OKST ML +450
   Market: Moneyline (win outright)
   If you win: $55.00 total ($45.00 profit)
   Win chance: 44.8% (model)
   Expected value: +$14.64 average profit per bet (model)
   ✨ This bet has positive expected value!
```

**Key Insight:** Model finds +EV by identifying when bookmaker odds undervalue teams based on stats/SoS. Market-aware approach (using market probability as a feature) significantly improved accuracy from 70.3% → 74.5%.

## Notes
- **Working:** ESPN Core API for NCAAM & CFB events/odds/scores
- **Tested:** CFB recommendations showing reasonable probabilities (14-45% range)
- **Data:** 1662 CFB completed games, 78 NCAAM completed games ingested
- **Model:** Market-aware logistic regression with L2 regularization
- **Validation:** Temporal split ensures model predicts future games accurately
- **Cache:** 5-minute TTL for live games, 1-hour for completed
- **EV Accuracy:** Vig removal + model probabilities = true expected value
- **Display:** Clear explanations of moneyline vs spread, actual payout if win, average profit (EV)
# sportline Status

**Last Updated:** 2025-11-29  
**Current Phase:** Phase 3 – Production-Ready Pipeline with Historical Data & Model Predictions  
**Active Step:** Multi-sport support with cross-sport bet aggregation ✅

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
  - [x] Ingested full CFB 2025 season: 1810 games (1750 completed with scores)
  - [x] Ingested NCAAM 2025 season: 78 completed games with scores
  - [x] Fixed ESPN events fetcher to parse game status (final/in-progress/scheduled) from API
  - [x] Data ingest now updates game status and scores for historical games
  - [x] Daily ingest command (`sportline data daily`) incrementally updates from latest DB date

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
  - [x] Model predictions display in `bets` command with [Model: X.X%] brackets
  - [x] Fixed UTC timezone rollover for games spanning midnight (queries both date and next day)

- [x] **Spread Model & Integration**
  - [x] Extended features with `spreadLine` + `spreadMarketImpliedProb` (11 total)
  - [x] Implemented logistic regression for home cover probability
  - [x] Validation Accuracy (CFB Spread 2025): 68.3%
  - [x] Brier Score: 0.2120 | Log Loss: 0.6143
  - [x] Integrated into `recommend` (model overrides vig-free spread legs)
  - [x] Odds persistence added prior to feature recompute (ensures same-day modeling)

- [x] **Totals Model (Regression) & Integration**
  - [x] Replaced poor-performing classification approach (accuracy 45.7%, Brier 0.5383, log loss 3.53) with regression predicting expected combined score (μ)
  - [x] Derived P(Over) via normal approximation using residual σ with MAD-based robust estimation
  - [x] Added pace/efficiency features: homePace5, awayPace5, homeOffEff5, awayOffEff5, homeDefEff5, awayDefEff5 (rolling combined score and points for/against proxies)
  - [x] Standardized features (means/stds stored with model artifact) + bias term
  - [x] Excluded market implied probability to reduce leakage
  - [x] Latest Validation (CFB 2025): Accuracy 50.9%, Brier 0.2900, Log Loss 0.7958, ECE 0.1666
  - [x] MAD-based sigma 15.72, floored at 38.00 to prevent overconfidence
  - [x] Probabilities now well-calibrated mid-range (≈10–90%, mean ~55%) with good discrimination
  - [x] Integrated regression-based totals probabilities into `recommend` (Over/Under legs tagged '(model)')
  - [x] CLI prints distribution summary (n, mean, std, range) for monitoring
  - [x] Diagnostics tool added: `src/model/diagnostics.ts` (10-bin calibration, ECE, divergence metrics)

- [x] **Team Search & Discovery**
  - [x] Implemented `find` command to search for games by team name
  - [x] Fuzzy matching on team name and abbreviation (case-insensitive)
  - [x] Multi-day search window (default 7 days, configurable with --days)
  - [x] Displays event IDs, dates (human-readable + YYYYMMDD), venues
  - [x] Generates ready-to-run `bets` commands with correct date parameters
  - [x] Works for both CFB and NCAAM sports

- [x] **Multi-Sport Expansion**
  - [x] Added NFL support: `src/espn/nfl/events.ts` and `src/espn/nfl/odds.ts`
  - [x] Added NBA support: `src/espn/nba/events.ts` and `src/espn/nba/odds.ts`
  - [x] Updated Sport type to include "nfl" | "nba"
  - [x] Expanded CLI routing (getFetchers, getFetchEvents) for all 4 sports
  - [x] Tested NFL API: Successfully fetched Giants @ Patriots (12/1/2025)
  - [x] Tested NBA API: Successfully fetched 9 games (12/1/2025)

- [x] **Cross-Sport Bet Aggregation**
  - [x] Modified `recommend` command to accept optional `--sport` parameter
  - [x] When `--sport` omitted, analyzes all sports (ncaam, cfb, nfl, nba)
  - [x] Aggregates bet legs across all sports before ranking by EV
  - [x] Adds [SPORT] tags to bet descriptions for clarity (e.g., "[NFL]", "[NBA]")
  - [x] Maintains backward compatibility with single-sport mode
  - [x] Shows "ALL SPORTS" in header when analyzing multiple sports

- [x] **Calibration Experiments**
  - [x] Implemented isotonic regression (PAVA algorithm)
  - [x] Tested calibration with various validation set sizes
  - [x] Decided against calibration due to overfitting with current dataset size
  - [x] L2 regularization proved more effective for stability

- [x] **Model Backtesting & Validation**
  - [x] Implemented moneyline backtesting across all 4 sports (CFB, NCAAM, NFL, NBA)
  - [x] CFB: 1,584 validated bets, +12.04% ROI, 6.52% ECE (production-ready)
  - [x] NBA: 349 validated bets, +7.56% ROI, 4.90% ECE (best calibration)
  - [x] NFL: 441 validated bets, +5.69% ROI, 6.13% ECE (solid performance)
  - [x] NCAAM: 928 validated bets, +3.11% ROI, 11.84% ECE (working well)
  - [x] Created BACKTEST_RESULTS.md with comprehensive metrics by sport
  - [x] Implemented backtestTotals() function with calibration analysis
  - [x] Investigated totals models: Found critical bug (missing 10-game features)
  - [x] Fixed apply.ts to include all 36 features (was only using 18)
  - [x] Implemented sport-specific sigma floors (NBA/NCAAM: 38, NFL/CFB: 10)
  - [x] NBA totals validated: 6.56% ECE (excellent), -1.84% ROI (slightly unprofitable)
  - [x] NFL/CFB/NCAAM totals still broken (systematic inversion, 40-57% ECE)

- [x] **Betting Guardrails & UX Improvements**
  - [x] Implemented probability display cap at 97% (prevents 99.9% overconfidence)
  - [x] Added market-specific backtest stat lookup (shows historical win rate, ROI)
  - [x] Suppressed ELITE/HIGH confidence labels for unvalidated markets (totals, spreads)
  - [x] Filtered recommend command to only show moneyline bets (backtested only)
  - [x] Added --include-parlays flag (parlays hidden by default, EV compounds negatively)
  - [x] Enhanced bet display with confidence tiers and backtest-based warnings
  - [x] Added divergence analysis tools for model investigation

### 🔄 Current Model Performance (CFB 2025) - After Normalization Revert
**Training Data:** 1,241 games (filtered from 1,750 completed) - excludes games where either team has <5 completed games

**Recency Weighting:** Exponential decay [0.35, 0.25, 0.20, 0.12, 0.08] applied to rolling-5 features (most recent game weighted 0.35, oldest 0.08)

Moneyline Model (Ensemble: 70% Base + 30% Market-Aware):
- **Base Model Validation:** 69.7% accuracy (9 features, no market)
- **Market-Aware Validation:** 76.2% accuracy (10 features, with market)
- **Ensemble Validation:** 72.8% accuracy, **ECE: 0.0685** (excellent calibration), **Brier: 0.1868**, **Log Loss: 0.5562**
- **Features:** Base uses 9 stats-only; Market-Aware adds market implied probability
- **Regularization:** L2 (λ=0.1) on both models
- **Validation Split:** Temporal at 2025-10-11 (833 train, 357 validation)
- **Status:** Production-ready with reliable probability estimates

Spread Model:
- **Training Accuracy:** 66.3% (833 games with reliable features)
- **Validation Accuracy:** 67.5%
- **Brier Score:** 0.2160 | **Log Loss:** 0.6225
- **ECE: 0.0256** (excellent calibration on validation set)
- **Features:** 11 (moneyline set + spread line + spread market implied prob)
- **Regularization:** L2 (λ=0.1)
- **Probability Clipping:** [5%, 95%] to prevent extreme predictions
- **Validation Split:** Temporal at 2025-10-11 (833 train, 357 validation)
- **Status:** Needs backtesting - validation metrics look good but not yet validated on historical odds

Totals Model (Regression):
- **Backtest Results (after bug fix):**
  - NBA: 6.56% ECE (excellent), -1.84% ROI (slightly unprofitable but well-calibrated)
  - NFL: 43.17% ECE (catastrophic inversion), -38.42% ROI
  - CFB: 56.93% ECE (catastrophic inversion), -55.26% ROI  
  - NCAAM: 42.02% ECE (catastrophic inversion), -53.13% ROI
- **Bug Fixed:** Missing 10-game features in apply.ts (18 of 36 features were zero)
- **Sport-Specific Sigma:** NBA/NCAAM: 38 points, NFL/CFB: 10 points
- **Features (36):** Dual-window (5-game + 10-game) with exponential recency weighting
- **Regularization:** Ridge (L2) + MAD-based variance + sport-specific sigma floors
- **Status:** NBA totals validated and working; NFL/CFB/NCAAM show systematic inversion (needs investigation)

### 📋 Next Steps
- [x] **Moneyline Ensemble** ✅ **COMPLETED** - ECE 0.0633 (25% improvement from 0.0846)
- [x] **Recency Weighting** ✅ **COMPLETED** - +0.8% moneyline accuracy, minimal spread change
- [x] **Feature Normalization (Z-Score)** ❌ **COMPLETED BUT REVERTED** - Improved accuracy (+7.9% moneyline) but destroyed calibration (ECE 3-12x worse). Probabilities unreliable for betting decisions. **Reverted to restore calibration.**
- [x] **Opponent-Adjusted Stats** ❌ **FAILED** - Degraded performance (72.8% → 55.5% moneyline), adjustment formula too aggressive
- [x] **Rest Days Analysis** ❌ **NOT PREDICTIVE** - CFB rest differences confounded by scheduling (good teams get Thursday games)
- [x] **Increased Regularization** ❌ **NO EFFECT** - Tried λ=0.5, no change in accuracy or calibration (baseline λ=0.1 already optimal)
- [x] **Interaction Features** ❌ **CATASTROPHIC FAILURE** - Added homeWinRate × spreadLine, awayWinRate × spreadLine, homeMargin × spreadLine, awayMargin × spreadLine. Spread accuracy collapsed from 67.5% to 54.1% (worse than random), ECE exploded from 0.03 to 0.45. Model clustered 231 games at 0-10% probability and 105 at 90-100%, with systematically wrong predictions. **Reverted immediately.**
- [x] **NFL Support** ✅ **COMPLETED** - Created ESPN API integrations for NFL events and odds
- [x] **NBA Support** ✅ **COMPLETED** - Created ESPN API integrations for NBA events and odds  
- [x] **Cross-Sport Aggregation** ✅ **COMPLETED** - Recommend command analyzes all sports when --sport omitted
- [x] **Moneyline Backtesting** ✅ **COMPLETED** - All 4 sports validated with comprehensive ROI/ECE metrics
- [x] **Betting Guardrails** ✅ **COMPLETED** - Probability caps, backtest stats, moneyline-only recommendations
- [x] **Totals Model Investigation** ✅ **COMPLETED** - Found/fixed missing features bug, NBA works but others inverted
- [ ] **Spread Backtesting** 🎯 **NEXT PRIORITY** - Implement backtestSpreads() for all 4 sports
- [ ] **Totals Model Fix** - Investigate NFL/CFB/NCAAM systematic inversion (low predictions → goes Over)
- [ ] **Team Strength Tiers** - Categorical features for Elite/Strong/Average/Weak based on rolling performance
- [ ] Track actual betting results vs predictions (logging + ROI table)
- [ ] Add model performance dashboard (daily snapshot + rolling metrics)
- [ ] Persist individual model predictions (new table) for auditing & backtests

### 📊 Improvement History
| Date | Feature | Moneyline Accuracy | Spread Accuracy | ECE (Moneyline) | Notes |
|------|---------|-------------------|-----------------|-----------------|-------|
| 2025-11-27 | Baseline | 72.0% | 67.8% | 0.0846 | Initial models with basic features |
| 2025-11-28 | Recency Weighting | 72.8% (+0.8%) | 67.5% (-0.3%) | 0.0685 | Exponential decay on rolling-5 windows |
| 2025-11-29 | Opponent Adjustments | 55.5% (-17.3%) | 67.2% (-0.3%) | N/A | FAILED - Reverted due to feature scale mismatch |
| 2025-11-29 | Feature Normalization | 80.7% (+7.9%) | 72.8% (+5.3%) | 0.2381 (3.5x worse) | REVERTED - High accuracy but poor calibration (probabilities unreliable) |
| 2025-11-29 | Revert to Pre-Normalized | **72.8%** | **67.5%** | **0.0685** | **CURRENT - Reliable probabilities for betting decisions** |
| 2025-11-29 | Increased Regularization (λ=0.5) | 72.8% (no change) | 67.5% (no change) | 0.0685 (no change) | No effect - baseline λ=0.1 already optimal |
| 2025-11-29 | Interaction Features | 71.7% (-1.1%) | 54.1% (-13.4%) | 0.18 (2.6x worse) | CATASTROPHIC - Spread ECE exploded to 0.45, reverted immediately |
| 2025-11-29 | Post-Revert Verification | **72.8%** | **67.5%** | **0.0685** | **Baseline fully restored** |

**Key Lesson:** For betting applications, **calibration matters more than accuracy**. A 72.8% model with ECE 0.07 (reliable probabilities) is better than an 80.7% model with ECE 0.24 (overconfident predictions). Feature normalization improved classification but made the model think it knew more than it did, leading to false confidence in probability estimates.

**Second Key Lesson:** Simple 9-11 feature models with strong regularization (λ=0.1) beat complex feature engineering for sparse sports betting data. Interaction features attempted to capture non-linear relationships (e.g., how win rate affects spread covering) but with only 833 training samples, the model catastrophically overfitted - clustering predictions at extremes (0-10% and 90-100%) while being systematically wrong.

### 🔮 Future Enhancements
- [ ] Better output formatting (tables)
- [ ] Multi-day aggregation (e.g., all games this week)
- [ ] Correlation modeling for same-game parlays
- [ ] Player/team props integration
- [ ] Historical performance tracking and ROI analysis

## Notes
- **Working:** ESPN Core API for NCAAM, CFB, NFL, and NBA events/odds/scores with real game status parsing
- **Sports:** Full support for 4 sports - NCAAM (college basketball), CFB (college football), NFL (pro football), NBA (pro basketball)
- **Cross-Sport:** `recommend` command aggregates best bets across all sports when --sport omitted
- **Tested:** NFL API (Giants @ Patriots 12/1/2025), NBA API (9 games 12/1/2025), model predictions across all markets
- **Data:** 1810 CFB games (1750 completed), 78 NCAAM completed games ingested; 1,241 CFB games used for training after filtering
- **Data Quality:** Games excluded when either team has <5 completed games (prevents unreliable rolling-5 features)
- **Model:** Ensemble moneyline (70% base + 30% market-aware), spread logistic regression with clipping, totals regression
- **Validation:** Temporal split ensures model predicts future games accurately (split at 2025-10-11 for CFB)
- **Cache:** 5-minute TTL for live games, 1-hour for completed
- **EV Accuracy:** Vig removal + model probabilities = true expected value
- **Display:** Market probabilities → model predictions [in brackets] | EV calculations with [SPORT] tags for multi-sport views
- **Search:** Team-based game finder with fuzzy matching for easy discovery
- **Data Flow:** Daily incremental ingest → feature computation → model training → predictions
- **Timezone:** Fixed UTC rollover handling for games spanning midnight (e.g., 7:30 PM ET = 00:30 UTC next day)
- **Performance:** Memory-optimized parlay generation (top 50 legs by EV, prevents 66M+ combination overflow)
- **Edge Cases:** FCS teams and early-season games automatically excluded from predictions when insufficient historical data

**Model Insights:**
- **Moneyline Calibration:** Model predictions closely track market probabilities (e.g., 69.5% model vs 70.0% market on favorites), indicating reliable probability estimates
- **Spread Predictions:** Model shows confident but realistic predictions (typically 60-70% range), avoiding the previous 95-99% extremes seen before data quality filtering
- **Totals Model:** Regression-based approach replaced miscalibrated classification. Current metrics: Brier 0.2900, Log Loss 0.7958, ECE 0.1666. Probabilities occupy realistic 10-90% range with good discrimination
- **Value Detection:** Cover probabilities cluster near 35-45% for many favorites; divergence >5% from market suggests potential betting opportunities
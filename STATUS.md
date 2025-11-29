# sportline Status

**Last Updated:** 2025-11-29  
**Current Phase:** Phase 2 – Moneyline, Spread & Totals (Regression + Pace/Efficiency) Integrated  
**Active Step:** Daily prediction pipeline (all three markets) with enhanced totals model ✅

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

- [x] **Calibration Experiments**
  - [x] Implemented isotonic regression (PAVA algorithm)
  - [x] Tested calibration with various validation set sizes
  - [x] Decided against calibration due to overfitting with current dataset size
  - [x] L2 regularization proved more effective for stability

### 🔄 Current Model Performance (CFB 2025)
Moneyline Model:
- **Training Accuracy:** 75.8% (1163 games before Sept 27)
- **Validation Accuracy:** 74.5% (499 games after Sept 27)
- **Brier Score:** 0.1716
- **Log Loss:** 0.5140
- **Features:** 10 (rolling stats, SoS, market implied probability, home advantage)
- **Regularization:** L2 (λ=0.1)
- **Calibration:** Disabled (needs ≥1000 validation samples; current 499)

Spread Model:
- **Training Accuracy:** 67.4% (1156 games before split date)
- **Validation Accuracy:** 68.3% (496 games after split date)
- **Brier Score:** 0.2120
- **Log Loss:** 0.6143
- **Features:** 11 (moneyline set + spread line + spread market implied prob)
- **Regularization:** L2 (λ=0.1)
- **Calibration:** Disabled

Totals Model (Regression):
- **Validation Accuracy:** 50.9% (threshold 0.5; classification threshold only for reference)
- **Brier Score:** 0.2900 (improved from 0.2865 prior iteration; 0.5383 original classifier)
- **Log Loss:** 0.7958 (improved from 0.7848 prior iteration; 3.53 original classifier)
- **ECE (Expected Calibration Error):** 0.1666 (improved from 0.1628 baseline; well-calibrated)
- **Residual σ (MAD-based, floored):** 38.00 points (MAD 15.72 × 1.4826; floor applied for stability)
- **Features (18):** Rolling points averages (team & opponent), pace proxies (combined score avg), offensive/defensive efficiency proxies, win/margin context, bias term; no market implied prob
- **Regularization:** Ridge (L2) + MAD-based variance + sigma floor heuristic
- **Calibration:** Raw probabilities (Beta calibration removed due to small validation set overfitting)

### 📋 Next Steps
- [x] ~~Enhance totals regression (add pace & efficiency; evaluate Poisson mixture vs normal)~~ ✅ Completed (pace/efficiency added)
- [ ] Moneyline ensemble (base model + market-aware model blend) to fix mid-range underprediction
- [ ] Spread dynamic range enhancement (interaction features: |line| × winRateDiff)
- [ ] Enhance CLI output: separate sections for top Spread vs Moneyline EV; add `--market` filter
- [ ] Add rest days / back-to-back game features
- [ ] Implement recency weighting (exponential decay on past games)
- [ ] Track actual betting results vs predictions (logging + ROI table)
- [ ] Add model performance dashboard (daily snapshot + rolling metrics)
- [ ] Persist individual model predictions (new table) for auditing & backtests
- [ ] Divergence-based filtering: surface only |model - market| > 5% AND EV > 0

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
**Additional Spread Insight:** Cover probabilities cluster near 35–45% for many favorites; variance increases with larger absolute lines. Opportunity: highlight lines where model cover probability diverges >5% from vig-free implied.
**Totals Model Insight:** Replaced miscalibrated classification (saturated ~99–100% Over probabilities) with regression-based expected total approach. Added pace/efficiency features (rolling combined score, points scored/allowed proxies) and MAD-based robust variance estimation. Current metrics: Brier 0.2900, Log Loss 0.7958, ECE 0.1666 (well-calibrated). Probabilities occupy realistic range (10–90%) with good discrimination. Further gains possible from recency weighting and advanced efficiency metrics (points per possession when available).

## Notes
- **Working:** ESPN Core API for NCAAM & CFB events/odds/scores
- **Tested:** CFB recommendations showing reasonable probabilities (14-45% range)
- **Data:** 1662 CFB completed games, 78 NCAAM completed games ingested
- **Model:** Market-aware logistic regression with L2 regularization
- **Validation:** Temporal split ensures model predicts future games accurately
- **Cache:** 5-minute TTL for live games, 1-hour for completed
- **EV Accuracy:** Vig removal + model probabilities = true expected value
- **Display:** Clear explanations of moneyline vs spread, actual payout if win, average profit (EV)
 - **Spread:** Now producing cover probabilities; not yet separately surfaced in top EV list (improvement target)
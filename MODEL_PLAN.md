# sportline Modeling Plan (Simple, Interpretable)

## Objectives
- Produce fair, vig-free probabilities for `moneyline`, `spread`, and `total` markets.
- Surface +EV opportunities against posted odds, with simple explanations.
- Keep models lightweight, transparent, and fast to retrain.

## Scope
- Phase A: Current-season NCAAM baseline (from season start to today).  
- Phase B: Current-season CFB baseline (bowl/playoffs focus as applicable).  
- Later: Optionally incorporate prior seasons via flags to enrich features once stable.
- Extend features incrementally: trends → stats → strength of schedule (SoS) → matchup similarity.

## Data Requirements
- Games: date, teams, venue, home/away, final scores.
- Odds: pregame lines per provider (moneyline, spread, total, prices).
- Team stats: pace/tempo, offensive/defensive efficiency, shooting/turnovers (NCAAM); EPA/explosiveness for CFB when available.
- SoS: opponent quality indices (Elo/SRS/SP+-like proxies).

## Storage (SQLite First)
- `games(id, date, sport, home_team_id, away_team_id, home_score, away_score, venue)`
- `odds(game_id, provider, market, line, price_home, price_away, price_over, price_under, timestamp)`
- `teams(id, sport, name, abbreviation)`
- `team_stats(team_id, sport, season, metric_name, metric_value)`
- `features(game_id, market, feature_name, value)`
- `model_runs(run_id, sport, config_json, started_at, finished_at, metrics_json, artifacts_path)`

## Features (Minimal → Incremental)
1. Trends
   - Rolling win rate (last 5/10), average margin, ATS record.
   - Home/away splits; rest days; back-to-back indicator.
2. Stats
   - NCAAM: per-possession off/def efficiency, pace, shooting %, TO rate.
   - CFB: efficiency proxies (EPA/explosive), success rate (if available).
3. Strength of Schedule
   - Weighted opponent quality faced (rolling season-to-date index).
4. Matchup Similarity (later)
   - Team stat vectors → cosine similarity vs current opponent; adjust baseline probs.

## Models (Simple & Interpretable)
- Moneyline: logistic regression predicting home/away win probability.
- Spread cover: logistic/ordinal regression predicting cover probability given line.
- Total: linear regression predicting combined score; convert to Over/Under probabilities.
- Calibration: Platt or isotonic to ensure well-calibrated probabilities.

## Training & Evaluation
- Current-season time-based split (train earlier games → validate on recent games) to reflect current rosters.
- Optional extension: include prior seasons via `--include-past-seasons N` with decay weighting.
- Metrics: log loss, Brier score, calibration curve, ROI vs bookmaker odds (validation window).
- Ablations: trends-only, +stats, +SoS, +similarity to measure incremental value.

## Pipeline
1. Ingest
   - Ingest current-season games/odds/stats into SQLite; nightly updates for new games.
2. Feature Build
   - Compute per-game features and store in `features` table.
3. Train
   - Fit models on current season, perform calibration, save coefficients/artifacts.
4. Predict
   - Score upcoming games; output fair probabilities per market.
5. Recommend
   - Compare fair probs to provider prices; compute EV; rank.

## CLI Additions (Design)
- `data ingest --sport <ncaam|cfb> --season <YYYY> [--from <YYYY-MM-DD> --to <YYYY-MM-DD>]` (defaults to current season range)
- `model train --sport <ncaam|cfb> --season <YYYY> [--include-past-seasons <N>] --markets moneyline,spread,total --calibrate isotonic`
- `model predict --sport <ncaam|cfb> --date <YYYYMMDD>` (uses the latest trained model for the current season)
- `model explain --sport <ncaam|cfb> --event <eventId>` (show feature contributions)

## Artifacts
- `models/<sport>/<timestamp>/model.json` (coefficients/params)
- `models/<sport>/<timestamp>/calibration.json` (calibration mapping)
- `models/<sport>/<timestamp>/metrics.json` (losses, Brier, ROI)

## Milestones
1. Baseline (Week 1)
   - Ingest minimal NCAAM history, trends-only features, logistic baseline for moneyline; calibration.
   - Wire `predict` into `recommend` for EV using fair probs.
2. Stats & SoS (Week 2)
   - Add team stats + SoS features; retrain; backtest ROI.
3. CFB Baseline (Week 3)
   - Port pipeline; limited stats; calibrate.
4. Similarity (Optional, Week 4+)
   - Add embeddings; explain impact on matchups.

## Risks & Mitigations
- Data gaps: start with features we can reliably compute from available sources; expand later.
- Overfitting: keep model simple, regularized; strict time splits; calibration.
- Provider changes: persist odds snapshots and prefer stable providers.

## Definition of Done (Initial)
- Trained baseline model | saved artifacts | documented metrics.
- `predict` producing fair probs for today’s games.
- `recommend` using model-based fair probabilities; explanations available.

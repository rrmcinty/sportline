# sportline Status

**Last Updated:** 2025-11-29  
**Current Phase:** Phase 1 – NCAAM Baseline Complete (CFB Baseline Next)  
**Active Step:** NCAAM model + predictions done; start CFB model ✅

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

  - [x] `src/parlay/eval.ts` – compute probability, payout, EV
  - [x] Generate all possible parlays with conflict detection

- [x] **Step 5: Caching**

- [x] **Step 6: CLI**
  - [x] `src/cli/commands.ts` – implement commands
  - [x] `games` command - fetch events by date
  - [x] `odds` command - import odds for specific event
  - [x] `recommend` command - generate ranked parlays
- [x] **Step 7: Testing & Validation**
  - [x] Fetch real games for today (2 games found: BCU @ IU, NSU @ ARIZ)
  - [x] Evaluate sample parlays (conflict detection fixed)
  - [x] Confirm EV calculations
  - [x] Added `src/espn/cfb/events.ts` (CFB events fetcher)
  - [x] Added `src/espn/cfb/odds.ts` (CFB odds fetcher + normalizer)
  - [x] Added `--sport` flag to all CLI commands (`games`, `odds`, `recommend`, `bets`)
  - [x] Added single-event EV display via new `bets` command
  - [x] Final score ingest from ESPN (via competition score refs) for NCAAM & CFB
  - [x] Implemented SQLite data ingest pipeline (games/odds → scores persisted)
  - [x] Implemented feature engineering (rolling win rate, margin, home advantage)
  - [x] Implemented model training (logistic regression baseline)
  - [x] Saved model artifacts (`model.json`, `metrics.json`) under `models/<sport>/<runId>/`
  - [x] Wired `model predict` command (Commander subcommand fix + implementation)
  - [x] Predictions: prints home win probability for each game/date

 - [x] **Modeling Plan Initiated**
  - [x] Added `MODEL_PLAN.md` outlining simple, interpretable models
  - [x] Defined data/feature/model/evaluation pipeline and CLI design
  - [x] Milestones set for NCAAM baseline → Stats/SoS → CFB baseline
  - [x] Scaffolded CLI: `data ingest`, `model train`, `model predict`
  - [x] Created SQLite schema and db utilities
  - [x] Added better-sqlite3 dependency
  - [x] Added `src/espn/cfb/events.ts` (CFB events fetcher)
  - [x] Added `src/espn/cfb/odds.ts` (CFB odds fetcher + normalizer)
  - [x] Added `--sport` flag to all CLI commands (`games`, `odds`, `recommend`, `bets`)
  - [x] Added single-event EV display via new `bets` command
### 🔄 Next Enhancements (Optional)
- [ ] Better output formatting (tables, colors with chalk)
- [ ] Add filtering options (by market type, provider, minimum probability)
- [ ] Manual odds input option
- [ ] Export recommendations to JSON/CSV
- [ ] Add --no-vig flag to see raw implied probabilities
  - [ ] Create usage guide

### 📋 Up Next
- [ ] CFB Baseline Model
  - [ ] Ingest 2025 CFB season (completed games) with scores
  - [ ] Train logistic regression for CFB (season 2025)
  - [ ] Run `model predict` for upcoming CFB dates
- [ ] Wire predictions into `recommend` (use model probabilities when available)

### 🔮 Future (Phase 2+)
- [ ] Full CFB rollout (bowl games, playoffs)
---


```
Moneylines (vig-free probabilities):
Spreads (vig-free probabilities):
  IU +29.5 (-115) → 51.1%  (was 53.5% with vig)
  BCU -29.5 (-105) → 48.9%  (was 51.2% with vig)

Totals (vig-free probabilities):
  Over 148.5 (-110) → 50.0%  (was 52.4% with vig)
  Under 148.5 (-110) → 50.0%  (was 52.4% with vig)
```

**Key Insight:** Vig-free probabilities now sum to 100% for each market (spreads: 51.1% + 48.9% = 100%, totals: 50% + 50% = 100%). This gives accurate EV calculations showing that most parlays have ~-6.7% ROI, which correctly reflects the bookmaker's edge.

## Notes
- **Working:** ESPN Core API for NCAAM events and odds (ESPN BET, DraftKings both present)
- **Tested:** Successfully fetched 2 games for 2025-11-29 (BCU @ IU, NSU @ ARIZ)
- **NCAAM Model:** Trained on 78 completed games (season 2025), ~89.7% training accuracy. Predictions implemented via `model predict`.
- **Odds Format:** American odds converted to decimal, vig-free implied probabilities calculated
- **Parlay Logic:** Independence assumption, conflict detection prevents same-game contradictory legs
- **Cache:** 5-minute TTL for live games, working correctly
- **EV Accuracy:** Vig removal implemented - probabilities are now fair and show true expected value
**New:** Default date behavior implemented (omitting `--date` uses today's YYYYMMDD).
  - After vig removal: Accurate negative EV shown (typical -6.7% ROI reflects bookmaker edge)
  - Tool now correctly identifies when no positive EV opportunities exist
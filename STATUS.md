# sportline Status

**Last Updated:** 2025-11-29  
**Current Phase:** Phase 1 – NCAAM Setup  
**Active Step:** Complete! ✅

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
  - [x] Create `README.md`
  - [x] Install dependencies (`npm install`)

- [x] **Step 2: Core Models**
  - [x] Define `Sport`, `MarketType`, `BetLeg`, `ParlaySpec` in `src/models/types.ts`
  - [x] Implement odds conversions (American ↔ Decimal, implied probability) in `src/models/probability.ts`
  - [x] Add vig removal utility for fair probabilities

- [x] **Step 3: ESPN NCAAM Fetchers**
  - [x] `src/espn/ncaam/events.ts` – fetch events by date
  - [x] `src/espn/ncaam/odds.ts` – fetch and normalize odds with vig removal

- [x] **Step 4: Parlay EV Engine**
  - [x] `src/parlay/eval.ts` – compute probability, payout, EV
  - [x] Generate all possible parlays with conflict detection

- [x] **Step 5: Caching**
  - [x] `src/cache/index.ts` – simple disk cache with TTL

- [x] **Step 6: CLI**
  - [x] `src/cli/commands.ts` – implement commands
  - [x] `src/index.ts` – wire up CLI entry point
  - [x] `games` command - fetch events by date
  - [x] `odds` command - import odds for specific event
  - [x] `recommend` command - generate ranked parlays

- [x] **Step 7: Testing & Validation**
  - [x] Fetch real games for today (2 games found: BCU @ IU, NSU @ ARIZ)
  - [x] Import odds and validate normalization (ESPN BET odds working)
  - [x] Evaluate sample parlays (conflict detection fixed)
  - [x] Confirm EV calculations
### 🔄 Next Enhancements (Optional)
- [ ] Better output formatting (tables, colors with chalk)
- [ ] Add filtering options (by market type, provider, minimum probability)
- [ ] Manual odds input option
- [ ] Export recommendations to JSON/CSV
- [ ] Add --no-vig flag to see raw implied probabilities
  - [ ] Create usage guide

### 📋 Up Next
- [ ] Improve EV calculations (current implementation shows 0% ROI due to vig)
- [ ] Add manual odds input option
- [ ] Add filtering options (by market type, provider, minimum probability)
- [ ] Better output formatting (tables, colors)

### 🔮 Future (Phase 2+)
- [ ] Add CFB support (late December)
- [ ] Same-game parlay correlation
- [ ] Player/team props
- [ ] Tournament bracket simulator
- [ ] Historical data tracking
- [ ] Vig removal for fair probabilities

---

## Notes
- **Working:** ESPN Core API for NCAAM events and odds (ESPN BET, DraftKings both present)
- **Tested:** Successfully fetched 2 games for 2025-11-29 (BCU @ IU, NSU @ ARIZ)
---

## Latest Test Results (2025-11-29)

### Vig-Free Odds Display
```
Moneylines (vig-free probabilities):
  IU ML -100000 → 97.6%  (was 99.9% with vig)
  BCU ML +4000 → 2.4%

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
- **Odds Format:** American odds converted to decimal, vig-free implied probabilities calculated
- **Parlay Logic:** Independence assumption, conflict detection prevents same-game contradictory legs
- **Cache:** 5-minute TTL for live games, working correctly
- **EV Accuracy:** Vig removal implemented - probabilities are now fair and show true expected value
  - Before vig removal: All parlays showed 0% EV (probabilities summed >100%)
  - After vig removal: Accurate negative EV shown (typical -6.7% ROI reflects bookmaker edge)
  - Tool now correctly identifies when no positive EV opportunities exist
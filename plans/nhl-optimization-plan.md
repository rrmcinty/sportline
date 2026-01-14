# NHL Moneyline Optimization Plan

**Created:** 2026-01-14
**Purpose:** Guide future sessions to optimize NHL Moneyline from +13.40% to +18%+ ROI
**Context:** NHL is the ONLY profitable model. Goal is to squeeze more performance from an already-working system.

---

## Current State

**Baseline Performance:**
- 2024 model → 2025 test: **+13.40% ROI** ✓ PROFITABLE
- Win Rate: 56.71%
- Sample Size: 425 bets
- Optimal Buckets: 60-70% (+11.93%), 70-80% (+27.76%)
- Threshold: Min Edge 7%, Max EV 50%

**Why NHL Works (vs NBA/NCAAM):**
- More games per season (82 games × 32 teams = 1,312 games)
- Lower roster volatility (injuries less impactful than NBA)
- More predictable playing styles
- Better calibration (ECE not documented, but model generalizes well)

---

## Optimization Goals

**Primary Goal:** Increase ROI from +13.40% to **+18%+** while maintaining profitability

**Constraints:**
- Must maintain ROI > +7% (production threshold)
- Must maintain profitability in 60-70% and 70-80% buckets
- Must work on multiple seasons (2023→2024, 2024→2025)
- Must not degrade ECE (calibration quality)

**Success Criteria:**
- [ ] ROI > +18% on 2025 season (up from +13.40%)
- [ ] ROI > +7% on 2024 season (maintain baseline)
- [ ] Win rate > 55% (maintain quality)
- [ ] Buckets 60-70% and 70-80% still profitable
- [ ] ECE < 0.08 (excellent calibration)

---

## Phase 1: Low-Hanging Fruit (Quick Wins)

### 1.1 Verify 2024 Baseline

**Action:** Test 2023 model on 2024 season to establish second baseline

```bash
# Train 2023 model
node dist/cli/index.js train nhl --seasons 2023 --market moneyline --calibrate

# Test on 2024
node dist/cli/index.js backtest nhl --season 2024 --market moneyline --show-buckets

# Run twice to verify determinism
node dist/cli/index.js backtest nhl --season 2024 --market moneyline --show-buckets
```

**Expected:** +10-15% ROI (profitable on 2024 as well)

**Document in:** `data/experiments-nhl-moneyline.md`

---

### 1.2 Analyze Current Model Features

**Action:** Use feature importance to identify what's working

```bash
# Train with feature analysis
node dist/cli/index.js train nhl --seasons 2024 --market moneyline --analyze-features --calibrate
```

**Look for:**
- Top 10 most important features
- Redundant features (low importance, can be pruned)
- Missing feature categories (gaps to fill)

**Expected Insights:**
- Goalie stats likely highly important
- Special teams (PP/PK) likely important
- Recent form likely important
- Some features may be noise

---

### 1.3 Feature Selection (Pruning)

**Hypothesis:** Removing low-importance features reduces overfitting

```bash
# Try top 50 features only (vs current 70)
node dist/cli/index.js train nhl --seasons 2024 --market moneyline --select-features top_k:50 --calibrate
node dist/cli/index.js backtest nhl --season 2025 --market moneyline --show-buckets

# Try top 40 features
node dist/cli/index.js train nhl --seasons 2024 --market moneyline --select-features top_k:40 --calibrate
node dist/cli/index.js backtest nhl --season 2025 --market moneyline --show-buckets
```

**Success:** ROI > +13.40% (baseline)
**Expected Impact:** +0.5-2pp ROI improvement

---

### 1.4 Calibration Refinement

**Current:** Auto-selects best calibration method

**Try Explicitly:**
```bash
# Isotonic regression (non-parametric, more flexible)
node dist/cli/index.js train nhl --seasons 2024 --market moneyline --calibrate isotonic
node dist/cli/index.js backtest nhl --season 2025 --market moneyline --show-buckets

# Temperature scaling
node dist/cli/index.js train nhl --seasons 2024 --market moneyline --calibrate temperature
node dist/cli/index.js backtest nhl --season 2025 --market moneyline --show-buckets
```

**Success:** ROI > +13.40% AND ECE < current ECE
**Expected Impact:** +0-1pp ROI improvement

---

## Phase 2: Advanced Feature Engineering

### 2.1 Goalie-Specific Features (HIGHEST PRIORITY)

**Hypothesis:** NHL is goalie-dependent. Goalie quality matters more than team defense.

**Current Features:**
- Generic "save percentage" in team stats
- No goalie-specific tracking

**New Features:**
```typescript
export interface GoalieFeatures {
  // Starting goalie quality (vs season average)
  homeStartingGoalieSavePct: number;  // Season save %
  awayStartingGoalieSavePct: number;
  homeStartingGoalieGAA: number;  // Goals against average
  awayStartingGoalieGAA: number;
  homeStartingGoalieGSAA: number;  // Goals saved above average
  awayStartingGoalieGSAA: number;

  // Recent form (last 5 games)
  homeGoalieRecentSavePct: number;
  awayGoalieRecentSavePct: number;

  // Backup goalie indicator
  homeUsingBackupGoalie: boolean;
  awayUsingBackupGoalie: boolean;

  // Head-to-head history
  homeGoalieVsOpponentSavePct: number;  // Career vs this opponent
  awayGoalieVsOpponentSavePct: number;

  // Differential
  goalieSavePctDifferential: number;  // home - away
}
```

**Data Sources:**
- ESPN API (has goalie stats)
- NHL.com (more detailed goalie stats)
- Hockey Reference (historical data)

**Implementation:**
1. Create `src/db/schema.sql` table for goalies
2. Create `src/ingest/ingestGoalies.ts`
3. Create `src/models/goalieFeatures.ts`
4. Integrate into `src/models/features.ts`

**Expected Impact:** +2-4pp ROI improvement (high confidence)

---

### 2.2 Special Teams Enhancement

**Current:** Basic PP/PK stats in team stats

**New Features:**
```typescript
export interface SpecialTeamsFeatures {
  // Power play quality
  homePowerPlayPct: number;  // Current (season)
  awayPowerPlayPct: number;
  homePowerPlayPctRecent: number;  // Last 10 games
  awayPowerPlayPctRecent: number;
  homePowerPlayGoalsPerGame: number;
  awayPowerPlayGoalsPerGame: number;

  // Penalty kill quality
  homePenaltyKillPct: number;
  awayPenaltyKillPct: number;
  homePenaltyKillPctRecent: number;
  awayPenaltyKillPctRecent: number;

  // Matchup advantage
  homePPvsAwayPK: number;  // home PP% vs away PK%
  awayPPvsHomePK: number;

  // Penalty tendency
  homePenaltiesPerGame: number;  // More penalties = more PK situations
  awayPenaltiesPerGame: number;
}
```

**Expected Impact:** +1-2pp ROI improvement

---

### 2.3 Head-to-Head History

**Hypothesis:** Some teams match up well against specific opponents

**Features:**
```typescript
export interface HeadToHeadFeatures {
  // Season head-to-head record
  homeWinsVsOpponent: number;  // This season
  awayWinsVsOpponent: number;
  homeGoalsPerGameVsOpponent: number;
  awayGoalsPerGameVsOpponent: number;

  // Historical (last 3 seasons)
  homeHistoricalWinPctVsOpponent: number;
  awayHistoricalWinPctVsOpponent: number;

  // Recent meetings (last 3 games vs this opponent)
  homeRecentResultsVsOpponent: number;  // +1 per win, -1 per loss
  awayRecentResultsVsOpponent: number;
}
```

**Expected Impact:** +0.5-1pp ROI improvement

---

### 2.4 Scoring Timing Features

**Hypothesis:** Teams that score early have different win probabilities than late-game scorers

**Features:**
```typescript
export interface ScoringTimingFeatures {
  // First period performance
  homeFirstPeriodGoalsPerGame: number;
  awayFirstPeriodGoalsPerGame: number;
  homeFirstPeriodGoalsAllowed: number;
  awayFirstPeriodGoalsAllowed: number;

  // Third period performance (clutch)
  homeThirdPeriodGoalsPerGame: number;
  awayThirdPeriodGoalsPerGame: number;

  // Overtime performance
  homeOvertimeWinPct: number;
  awayOvertimeWinPct: number;

  // Comeback ability
  homeComebackWinPct: number;  // Win% when trailing after 2 periods
  awayComebackWinPct: number;
}
```

**Data Source:**
- NHL.com period-by-period stats
- ESPN detailed box scores

**Expected Impact:** +1-2pp ROI improvement

---

### 2.5 Divisional/Conference Strength

**Hypothesis:** Playing within division is different than inter-division

**Features:**
```typescript
export interface DivisionFeatures {
  // Is this a divisional game?
  isDivisionGame: boolean;
  isConferenceGame: boolean;

  // Divisional record
  homeDivisionWinPct: number;
  awayDivisionWinPct: number;

  // Conference strength
  homeConferenceRank: number;  // 1-16 in conference
  awayConferenceRank: number;
}
```

**Expected Impact:** +0.5-1pp ROI improvement

---

## Phase 3: Model Architecture Optimization

### 3.1 Gradient Boosting (XGBoost)

**Action:** Try gradient boosting vs Random Forest

```bash
# Train with XGBoost
node dist/cli/index.js train nhl --seasons 2024 --market moneyline --model-type gradient-boosting --calibrate

# Test on 2025
node dist/cli/index.js backtest nhl --season 2025 --market moneyline --show-buckets

# Tune learning rate
node dist/cli/index.js train nhl --seasons 2024 --market moneyline --model-type gradient-boosting --learning-rate 0.05 --calibrate
```

**Expected Impact:** +0.5-2pp ROI improvement

---

### 3.2 Ensemble Model

**Strategy:** Blend Random Forest + XGBoost + Logistic Regression

**Implementation:**
```typescript
// src/models/ensembleNhl.ts
export async function createEnsemble(season: number) {
  // Train 3 base models
  const rf = await trainRandomForest(season);
  const xgb = await trainXGBoost(season);
  const lr = await trainLogisticRegression(season);

  // Weighted average (optimize weights on validation set)
  const weights = {
    rf: 0.5,    // Best standalone
    xgb: 0.3,   // Second best
    lr: 0.2     // Baseline
  };

  return { rf, xgb, lr, weights };
}

export function predictEnsemble(features: number[], ensemble: Ensemble): number {
  const rfProb = predictRandomForest(features, ensemble.rf);
  const xgbProb = predictXGBoost(features, ensemble.xgb);
  const lrProb = predictLogisticRegression(features, ensemble.lr);

  return (
    ensemble.weights.rf * rfProb +
    ensemble.weights.xgb * xgbProb +
    ensemble.weights.lr * lrProb
  );
}
```

**Expected Impact:** +1-3pp ROI improvement (reduces overfitting)

---

### 3.3 Multi-Season Training

**Current:** Trains on single season only (1230 games for NHL)

**Enhancement:** Train on 2022+2023+2024 combined (3690 games)

**Implementation:**
First need to fix code limitation (same as NBA):
```typescript
// src/models/trainNhlMoneyline.ts
if (seasons.length > 1) {
  // Load and combine all seasons
  const allGames = [];
  for (const season of seasons) {
    allGames.push(...await loadSeasonGames('nhl', season));
  }
  // Train on combined data
}
```

**Test:**
```bash
# Train on multiple seasons
node dist/cli/index.js train nhl --seasons 2022,2023,2024 --market moneyline --calibrate

# Test on 2025
node dist/cli/index.js backtest nhl --season 2025 --market moneyline --show-buckets
```

**Expected Impact:** +1-2pp ROI improvement (more training data)

---

## Phase 4: Betting Strategy Optimization

### 4.1 Bucket Refinement

**Current Optimal:** 60-70% (+11.93%), 70-80% (+27.76%)

**Test Narrower Buckets:**
```bash
# Test 65-75% only (tighter range)
node dist/cli/index.js backtest nhl --season 2025 --market moneyline --buckets 65-75 --show-buckets

# Test 70-85% (focus on best bucket + neighbors)
node dist/cli/index.js backtest nhl --season 2025 --market moneyline --buckets 70-85 --show-buckets
```

**Goal:** Find tightest bucket range that maintains high ROI

**Expected Impact:** +1-2pp ROI improvement (better focus)

---

### 4.2 Kelly Criterion Sizing

**Current:** Flat $1 per bet in backtests

**Enhancement:** Use Kelly Criterion for bet sizing

```typescript
// src/betting/odds.ts already has Kelly calculation
export function kellyFraction(probability: number, odds: number): number {
  // Kelly = (p * odds - 1) / (odds - 1)
  // Use fractional Kelly (0.25x) for safety
}
```

**Implementation:**
Modify backtest to use Kelly sizing:
```typescript
// In src/lib/backtest/backtester.ts
const kellyFraction = calculateKelly(prediction.probability, odds);
const betSize = bankroll * kellyFraction * 0.25;  // Quarter Kelly
```

**Expected Impact:** +2-4pp ROI improvement (optimal bankroll growth)

---

### 4.3 Odds Shopping

**Current:** Uses ESPN odds only

**Enhancement:** Track multiple sportsbooks, take best line

**Implementation:**
1. Scrape DraftKings, FanDuel, BetMGM
2. Store in `odds_comparison` table
3. Backtest with best available odds
4. Calculate ROI improvement from line shopping

**Expected Impact:** +1-2pp ROI improvement

---

### 4.4 Live Betting (Future)

**Hypothesis:** In-game odds provide additional opportunities

**Requirements:**
- Live odds feed (expensive)
- Real-time model predictions
- Fast execution (API to sportsbook)

**Not Recommended for Now:** Focus on pre-game optimization first

---

## Phase 5: Data Quality & Hygiene

### 5.1 Verify No Data Leakage

**Action:** Audit feature extraction to ensure no future data

**Check:**
- `getTeamStatsBeforeDate()` is used everywhere
- `getRecentGames()` has proper date filtering
- Line movement features use opening odds only (not closing)

**Test:**
```bash
# Run in-sample test (should show WARNING)
node dist/cli/index.js train nhl --seasons 2024 --market moneyline --calibrate
node dist/cli/index.js backtest nhl --season 2024 --market moneyline --show-buckets
# Should see: "WARNING: Model was trained on season 2024, but you are backtesting on the SAME season"
```

**Expected:** Confirm no leakage exists (already looks good)

---

### 5.2 Verify Feature Order Consistency

**Action:** Ensure feature order matches between training and prediction

**Check:**
```typescript
// src/models/features.ts
export function getHockeyFeatureOrder(): string[] {
  // This MUST match feature extraction order exactly
}
```

**Test:**
```bash
# Feature order mismatch causes systematic prediction errors
# Verify predictions make sense (favorite should have >50% probability)
```

**Expected:** Feature order is already correct (model works)

---

## Implementation Priority Ranking

| Phase | Feature | Expected Impact | Effort | Priority |
|-------|---------|-----------------|--------|----------|
| 2.1 | **Goalie Features** | +2-4pp | Medium | 🔥 HIGHEST |
| 3.2 | **Ensemble Model** | +1-3pp | Medium | HIGH |
| 4.2 | **Kelly Criterion** | +2-4pp | Low | HIGH |
| 3.3 | **Multi-Season Training** | +1-2pp | Low | HIGH |
| 2.2 | **Special Teams Enhancement** | +1-2pp | Low | MEDIUM |
| 4.1 | **Bucket Refinement** | +1-2pp | Low | MEDIUM |
| 1.3 | **Feature Selection** | +0.5-2pp | Low | MEDIUM |
| 3.1 | **Gradient Boosting** | +0.5-2pp | Low | MEDIUM |
| 2.4 | **Scoring Timing** | +1-2pp | Medium | MEDIUM |
| 4.3 | **Odds Shopping** | +1-2pp | Medium | MEDIUM |
| 2.3 | **Head-to-Head History** | +0.5-1pp | Low | LOW |
| 2.5 | **Divisional Features** | +0.5-1pp | Low | LOW |
| 1.4 | **Calibration Refinement** | +0-1pp | Low | LOW |

---

## Execution Plan for Next Session

### Quick Wins (1-2 hours)
1. **Verify 2024 Baseline** - Train 2023, test on 2024
2. **Feature Importance Analysis** - Identify what's working
3. **Feature Selection** - Try top 40-50 features
4. **Gradient Boosting** - Quick architecture test

### Medium Effort (4-8 hours)
1. **Goalie Features MVP** - Add basic goalie stats (save%, GAA)
2. **Ensemble Model** - Blend RF + XGBoost
3. **Kelly Criterion Sizing** - Modify backtest for optimal bet sizing
4. **Multi-Season Training** - Fix code, train on 2022+2023+2024

### Large Projects (1-2 days)
1. **Full Goalie System** - Detailed goalie tracking, historical data
2. **Special Teams Overhaul** - PP/PK matchup advantages
3. **Odds Shopping Infrastructure** - Multi-sportsbook tracking
4. **Scoring Timing Analysis** - Period-by-period performance

---

## Success Criteria (Revisited)

**Current Baseline:** +13.40% ROI on 2025 season

**Targets by Improvement Level:**

| Level | ROI Target | Improvement | Difficulty |
|-------|------------|-------------|------------|
| Good | +15% | +1.6pp | Easy (feature selection) |
| Great | +18% | +4.6pp | Medium (goalie features + ensemble) |
| Excellent | +20% | +6.6pp | Hard (all optimizations) |
| World-Class | +25% | +11.6pp | Very Hard (may not be achievable) |

**Realistic Goal:** **+18% ROI** (+4.6pp improvement)
- Goalie features: +2-4pp
- Ensemble model: +1-3pp
- Kelly criterion: +2-4pp (but changes bet sizing, not accuracy)
- Feature selection: +0.5-2pp

**Conservative Goal:** **+16% ROI** (+2.6pp improvement)
- Goalie features: +2pp
- Feature selection: +0.5pp
- Gradient boosting: +0.5pp

---

## Testing Protocol

For each optimization:

1. **Train on 2024 data**
   ```bash
   node dist/cli/index.js train nhl --seasons 2024 --market moneyline [flags] --calibrate
   ```

2. **Test on 2025 (primary)**
   ```bash
   node dist/cli/index.js backtest nhl --season 2025 --market moneyline --show-buckets
   ```

3. **Run AGAIN to verify determinism**
   ```bash
   node dist/cli/index.js backtest nhl --season 2025 --market moneyline --show-buckets
   # Confirm: Same ROI both times
   ```

4. **Test on 2024 (validation)**
   ```bash
   # Train on 2023 first
   node dist/cli/index.js train nhl --seasons 2023 --market moneyline [flags] --calibrate
   node dist/cli/index.js backtest nhl --season 2024 --market moneyline --show-buckets
   ```

5. **Document in experiment registry**
   - Create `data/experiments-nhl-moneyline.md`
   - Add experiment number, date, changes, results
   - Show comparison to baseline (+13.40%)

6. **Success Check**
   - [ ] 2025 ROI improved vs baseline (+13.40%)
   - [ ] 2024 ROI remains profitable (>+7%)
   - [ ] Buckets 60-70% and 70-80% still profitable
   - [ ] ECE maintained or improved
   - [ ] Results are deterministic

---

## Risk Mitigation

**Risk 1: Overfitting to 2025 season**
- **Mitigation:** Always test on 2024 as well
- **Stopping condition:** If 2024 ROI drops below +7%, revert change

**Risk 2: Degrading calibration**
- **Mitigation:** Track ECE on every experiment
- **Stopping condition:** If ECE > 0.10, investigate before continuing

**Risk 3: Breaking profitable buckets**
- **Mitigation:** Check bucket breakdown on every test
- **Stopping condition:** If 70-80% bucket goes negative, revert

**Risk 4: Non-deterministic results**
- **Mitigation:** Run every backtest twice
- **Stopping condition:** If results differ, investigate randomness source

---

## Future Research Questions

1. **Can we predict optimal bet sizing per game?**
   - Kelly fraction varies by confidence
   - Some games are "sure things", others are 50/50

2. **Can we detect when to skip betting?**
   - Uncertainty quantification (prediction intervals)
   - Only bet when model is confident

3. **Are there seasonal patterns?**
   - Oct-Dec (early season) vs Jan-Mar (mid) vs Apr (late)
   - Teams change over the season

4. **Can we beat the closing line?**
   - Compare predictions to closing odds
   - If we consistently beat closing line, we have true edge

5. **What's the theoretical maximum ROI?**
   - Given market efficiency, what's achievable?
   - Sharp bettors typically achieve 5-10% ROI long-term
   - 13.40% is already excellent - how much higher can we go?

---

## Resources

**Code Files:**
- Training: `src/models/trainNhlMoneyline.ts`
- Features: `src/models/features.ts` (hockey section)
- Backtest: `src/cli/commands/backtest.ts`
- Optimal Buckets: `src/config/optimalBuckets.ts`

**Data Sources:**
- Games: ESPN API (already integrated)
- Goalies: NHL.com Goalie Stats, Hockey Reference
- Special Teams: NHL.com Team Stats
- Odds: The Odds API, DraftKings API

**Useful Links:**
- NHL API: https://gitlab.com/dword4/nhlapi
- Hockey Reference: https://www.hockey-reference.com/
- The Odds API: https://the-odds-api.com/
- Natural Stat Trick: https://www.naturalstattrick.com/

---

## Final Notes

**Key Advantages NHL Has:**
1. Already profitable (+13.40% vs NBA's -13.23%)
2. Generalizes well across seasons
3. Optimal buckets are stable (60-70%, 70-80%)
4. Low-risk optimization (start from working system)

**Most Likely Quick Wins:**
1. **Goalie features** (90% chance this helps significantly)
2. **Feature selection** (80% chance removes noise)
3. **Ensemble model** (70% chance improves robustness)

**Stretch Goal:**
- Get to +20% ROI on 2025 season
- This would be **world-class** performance
- Sharp bettors rarely exceed 10% long-term ROI
- Current 13.40% is already excellent

**Remember:**
> Don't break what's working. Test conservatively. Always validate on multiple seasons. NHL is the golden goose - treat it carefully.

**When to Stop Optimizing:**
- When 2024 ROI drops below +7% (production threshold)
- When improvements are <0.5pp per experiment (diminishing returns)
- When ECE degrades (calibration quality matters)
- When you reach +25% ROI (probably luck at that point)

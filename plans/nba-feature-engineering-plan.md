# NBA Moneyline Feature Engineering & Improvement Plan

**Created:** 2026-01-14
**Purpose:** Guide future sessions to improve NBA Moneyline models based on systematic testing findings
**Context:** Current baseline is unprofitable on 2025 season (-8.40% to -13.23% ROI). See `data/experiments-nba-moneyline.md` for full history.

---

## Current State

**Baseline Performance:**
- 2023 model → 2025 test: **-8.40% ROI** ❌
- 2023 model → 2024 test: **+4.54% ROI** ✓ (doesn't generalize)
- 2024 model → 2025 test: **-13.23% ROI** ❌

**What We've Tried (All Failed):**
- ✓ Calibration optimization (beta already optimal, ECE=0.1173)
- ✓ Walk-forward validation (no improvement)
- ✓ Hyperparameter tuning (all configs identical)
- ✓ Different training years (2023 better than 2024)

**Root Cause Hypothesis:**
Missing critical features that capture NBA-specific dynamics:
1. **Injuries** (star player availability has massive impact)
2. **Roster changes** (mid-season trades, buyouts)
3. **Load management** (rest patterns, back-to-backs)
4. **Motivational factors** (playoff seeding, tanking)
5. **Matchup-specific data** (opponent adjustments)

---

## Phase 1: Injury Tracking (HIGHEST PRIORITY)

### Why This Matters
NBA is star-dependent. Losing a player like LeBron, Curry, or Giannis shifts odds by 5-10+ points. Current model doesn't capture this.

### Implementation Plan

**Step 1.1: Choose Data Source**
Options:
- **ESPN Injury API** (already using ESPN for games)
- **NBA.com Injury Report** (official source)
- **FantasyLabs API** (paid, comprehensive)
- **Rotowire Scraper** (free, requires scraping)

**Step 1.2: Create Injury Schema**
```sql
-- Add to src/db/schema.sql
CREATE TABLE IF NOT EXISTS injuries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sport TEXT NOT NULL,
  team_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  injury_date DATE NOT NULL,
  return_date DATE,  -- NULL if still injured
  injury_type TEXT,  -- ankle, knee, rest, etc.
  injury_status TEXT,  -- out, doubtful, questionable, probable
  is_starter BOOLEAN DEFAULT 0,
  minutes_per_game REAL,
  usage_rate REAL,  -- % of team possessions used when on floor
  FOREIGN KEY (team_id) REFERENCES teams(id)
);

CREATE INDEX idx_injuries_date ON injuries(injury_date);
CREATE INDEX idx_injuries_team ON injuries(team_id, injury_date);
```

**Step 1.3: Ingest Injury Data**
Create `src/ingest/ingestInjuries.ts`:
```typescript
// Fetch injuries for each game day
// Store in database with player impact metrics
// Link to games table by date and team
```

**Step 1.4: Engineer Injury Features**
Create `src/models/injuryFeatures.ts`:
```typescript
export interface InjuryFeatures {
  // Aggregate injury impact
  homeMissingStarterCount: number;  // 0-5
  awayMissingStarterCount: number;

  // Impact-weighted (by minutes/usage)
  homeInjuryImpact: number;  // Sum of (minutes_per_game * usage_rate) for injured
  awayInjuryImpact: number;

  // Specific roles
  homeMissingStarPlayer: boolean;  // Top 2 usage players
  awayMissingStarPlayer: boolean;

  // Differential
  injuryImpactDifferential: number;  // home - away
}
```

**Step 1.5: Integrate into Model**
- Modify `src/models/features.ts` to include injury features
- Update `getFeatureOrder()` to append injury features (70 → 76 features)
- Retrain 2023 model with injury data
- Test on 2024 and 2025 seasons

**Step 1.6: Verify Impact**
```bash
# Train with injuries
node dist/cli/index.js train nba --seasons 2023 --market moneyline --calibrate

# Test both seasons
node dist/cli/index.js backtest nba --season 2024 --market moneyline --show-buckets
node dist/cli/index.js backtest nba --season 2025 --market moneyline --show-buckets
```

**Success Criteria:**
- [ ] ROI improves by >5pp on 2025 season (from -8.40% to >-3.40%)
- [ ] Model stays profitable on 2024 season (>+4.54%)
- [ ] Injury features have non-zero importance in feature analysis

---

## Phase 2: Advanced Feature Engineering

### 2.1 Rest and Travel Features (Expanded)

**Current Status:** Basic rest features exist (`homeRestDays`, `awayRestDays`, `homeBackToBack`, `awayBackToBack`)

**Enhancements:**
```typescript
export interface EnhancedRestFeatures {
  // Existing (already in model)
  homeRestDays: number;
  awayRestDays: number;
  homeBackToBack: boolean;
  awayBackToBack: boolean;

  // NEW: Travel burden
  homeTravelDistance: number;  // Miles from previous game
  awayTravelDistance: number;
  homeTimeZoneChange: number;  // Hours (negative = west to east)
  awayTimeZoneChange: number;

  // NEW: Schedule density
  homeGamesInLast7Days: number;  // 3-in-5 nights, etc.
  awayGamesInLast7Days: number;
  homeGamesInNext7Days: number;  // Load management if playoff locked
  awayGamesInNext7Days: number;

  // NEW: Cumulative fatigue
  homeCumulativeRestDays: number;  // Total rest days in last 14 games
  awayCumulativeRestDays: number;
}
```

**Implementation:**
- Scrape or calculate team schedules (already have game dates)
- Look up arena locations (lat/long) for distance calculation
- Compute time zone offsets
- Add to feature extraction in `src/models/features.ts`

**Expected Impact:** +2-3pp ROI improvement

---

### 2.2 Playoff and Tanking Incentives

**Hypothesis:** Late-season games have different dynamics:
- Teams locked into playoffs rest stars
- Teams eliminated tank for draft position
- Teams fighting for playoffs play harder

**Features:**
```typescript
export interface MotivationalFeatures {
  // Playoff positioning (as of game date)
  homePlayoffSeed: number | null;  // 1-8, or null if eliminated
  awayPlayoffSeed: number | null;
  homePlayoffProbability: number;  // 0-1 (calculated from standings)
  awayPlayoffProbability: number;

  // Playoff lock status
  homePlayoffLocked: boolean;  // Top 6 seed locked in
  awayPlayoffLocked: boolean;
  homeEliminatedFromPlayoffs: boolean;
  awayEliminatedFromPlayoffs: boolean;

  // Tanking indicators
  homeTankingLikelihood: number;  // 0-1 (eliminated + lottery odds)
  awayTankingLikelihood: number;

  // Days until playoffs
  daysUntilPlayoffs: number;  // Null if mid-season
}
```

**Implementation:**
- Calculate standings as of each game date
- Use playoff probability models (538 has public data)
- Add "tank mode" detector (eliminated + <15 games left)

**Expected Impact:** +1-2pp ROI improvement in late-season games

---

### 2.3 Referee Tendencies

**Hypothesis:** Different referees call games differently:
- Some favor home teams (more fouls on away team)
- Some call more total fouls (slower pace)
- Some allow more physical defense

**Data Source:**
- NBA.com Referee Reports
- Basketball Reference referee stats

**Features:**
```typescript
export interface RefereeFeatures {
  // Aggregate referee crew stats (3 refs per game)
  avgRefHomeFoulBias: number;  // +/- fouls called on home vs away
  avgRefFoulsPerGame: number;  // Total fouls called
  avgRefTechnicalFoulsPerGame: number;
  avgRefPaceImpact: number;  // Possessions above/below league avg
}
```

**Implementation:**
- Create `src/ingest/ingestReferees.ts`
- Store referee assignments in new `referees` table
- Calculate historical ref tendencies
- Add 4 features to model

**Expected Impact:** +1pp ROI improvement (small but measurable)

---

### 2.4 Lineup and Rotation Data

**Hypothesis:** Starting lineup quality matters more than season averages

**Data Source:**
- NBA.com Lineup Stats API
- Basketball Reference lineup data

**Features:**
```typescript
export interface LineupFeatures {
  // Starting 5 quality (vs season average)
  homeStartingLineupNetRating: number;  // +/- per 100 possessions
  awayStartingLineupNetRating: number;
  homeStartingLineupMinutesTogether: number;  // Chemistry indicator
  awayStartingLineupMinutesTogether: number;

  // Bench depth
  homeBenchNetRating: number;
  awayBenchNetRating: number;

  // Key player availability (overlap with injuries)
  homeTopPlayerMinutesAvailable: number;  // % of top 3 player minutes available
  awayTopPlayerMinutesAvailable: number;
}
```

**Implementation:**
- Scrape NBA.com lineup stats
- Match lineup data to games
- Add 8 features to model

**Expected Impact:** +2-3pp ROI improvement (high potential)

---

## Phase 3: Alternative Model Architectures

### 3.1 Gradient Boosting (XGBoost)

**Why Try This:**
- Better at capturing complex feature interactions
- Already has code in `src/models/trainNbaGradientBoosting.ts`
- Random Forest may be too simple for NBA complexity

**Implementation:**
```bash
# Modify training command to use gradient boosting
node dist/cli/index.js train nba --seasons 2023 --market moneyline --model-type gradient-boosting --calibrate

# Tune learning rate
node dist/cli/index.js train nba --seasons 2023 --market moneyline --model-type gradient-boosting --learning-rate 0.05 --calibrate
node dist/cli/index.js train nba --seasons 2023 --market moneyline --model-type gradient-boosting --learning-rate 0.1 --calibrate
```

**Expected Impact:** +1-2pp ROI improvement over Random Forest

---

### 3.2 Ensemble Methods

**Strategy:** Combine multiple models to reduce variance

**Approach 1: Simple Average**
```typescript
// Blend predictions from multiple models
const prediction = (
  0.4 * randomForestPrediction +
  0.4 * xgboostPrediction +
  0.2 * logisticRegressionPrediction
);
```

**Approach 2: Stacking (Meta-Learner)**
```typescript
// Train a meta-model on predictions from base models
// Base models: RF, XGBoost, LogReg
// Meta-model: Logistic Regression
```

**Implementation:**
Create `src/models/ensembleModel.ts`:
```typescript
export async function trainEnsemble(
  season: number,
  baseModels: Array<'rf' | 'xgboost' | 'logreg'>
) {
  // Train each base model
  // Collect predictions on validation set
  // Train meta-model on validation predictions
  // Save ensemble model
}
```

**Expected Impact:** +2-4pp ROI improvement (ensemble reduces overfitting)

---

### 3.3 Neural Network (If Dataset Grows)

**When to Try:** After collecting 3+ seasons of injury data (2023-2025+)

**Architecture:**
```
Input (80-100 features)
  ↓
Dense(128, relu) + Dropout(0.3)
  ↓
Dense(64, relu) + Dropout(0.3)
  ↓
Dense(32, relu)
  ↓
Dense(1, sigmoid) → Probability
```

**Implementation:**
Use TensorFlow.js or Brain.js:
```typescript
import * as tf from '@tensorflow/tfjs-node';

// Neural network training
// Requires more data than current 1230 games
```

**Expected Impact:** Unknown (requires more data)

---

## Phase 4: Data Infrastructure Improvements

### 4.1 Multi-Season Training Support

**Current Limitation:** `src/models/trainNbaMoneyline.ts` only supports single season

**Fix Required:**
```typescript
// In src/models/trainNbaMoneyline.ts
// Modify to accept multiple seasons
// Combine game data from all seasons
// Use first N seasons for training, last for validation

if (seasons.length > 1) {
  // Combine data from multiple seasons
  const allGames = [];
  for (const season of seasons) {
    const seasonGames = await loadSeasonGames(season);
    allGames.push(...seasonGames);
  }
  // Train on combined data
}
```

**Use Case:**
```bash
# Train on 2022+2023 combined
node dist/cli/index.js train nba --seasons 2022,2023 --market moneyline --calibrate
```

**Expected Impact:** +1-2pp ROI improvement (more training data)

---

### 4.2 Odds Shopping (Multiple Sportsbooks)

**Current:** Uses ESPN odds only

**Enhancement:**
- Scrape DraftKings, FanDuel, BetMGM, Caesars
- Store all odds in database
- Take best available line for each prediction

**Schema Change:**
```sql
-- Modify odds table
ALTER TABLE odds ADD COLUMN sportsbook TEXT DEFAULT 'espn';
ALTER TABLE odds ADD COLUMN odds_us_alt INTEGER;  -- Alternative book odds

-- Or create new table
CREATE TABLE odds_comparison (
  game_id INTEGER,
  team_id TEXT,
  sportsbook TEXT,
  odds_us INTEGER,
  timestamp TEXT,
  FOREIGN KEY (game_id) REFERENCES games(id)
);
```

**Expected Impact:** +1-2pp ROI improvement (better odds = better EV)

---

### 4.3 Live Odds Tracking

**Current:** Only uses opening odds

**Enhancement:**
- Track odds changes over time
- Detect sharp money moves
- Use closing line as signal

**Features:**
```typescript
export interface LiveOddsFeatures {
  homeOpeningOdds: number;
  awayOpeningOdds: number;
  homeClosingOdds: number;
  awayClosingOdds: number;
  homeOddsMovement: number;  // closing - opening
  awayOddsMovement: number;
  reverseLineMovement: boolean;  // Money on one side, line moves other way
  sharpMoneyIndicator: number;  // Large move without public money
}
```

**Expected Impact:** +2-3pp ROI improvement (sharp money signals)

---

## Phase 5: Alternative Betting Markets

### 5.1 NBA Spread (Instead of Moneyline)

**Hypothesis:** Spreads may be easier to predict than moneylines

**Advantages:**
- Less impacted by star injuries (spread adjusts)
- More efficient market (sharper lines)
- Push protection reduces variance

**Test Plan:**
```bash
# Train spread model on 2023
node dist/cli/index.js train nba --seasons 2023 --market spread --calibrate

# Test on both seasons
node dist/cli/index.js backtest nba --season 2024 --market spread --show-buckets
node dist/cli/index.js backtest nba --season 2025 --market spread --show-buckets
```

**Success Criteria:**
- [ ] Spread model has better ROI than moneyline on 2025
- [ ] Spread model is profitable on both 2024 and 2025

---

### 5.2 Player Props (Alternative Approach)

**Hypothesis:** Player-level predictions may be more stable

**Market Examples:**
- Points over/under
- Assists over/under
- Rebounds over/under

**Advantages:**
- Injuries directly impact props (easier signal)
- Less meta-game complexity
- More betting opportunities per game

**Data Requirements:**
- Player-level historical stats
- Opponent defensive stats by position
- Injury status
- Minutes projections

**Expected Impact:** Unknown (different market entirely)

---

## Implementation Priority Ranking

| Phase | Feature | Expected Impact | Effort | Priority |
|-------|---------|-----------------|--------|----------|
| 1 | **Injury Tracking** | +5-8pp | High | 🔥 HIGHEST |
| 2.4 | **Lineup Data** | +2-3pp | Medium | HIGH |
| 3.2 | **Ensemble Methods** | +2-4pp | Medium | HIGH |
| 2.1 | **Enhanced Rest/Travel** | +2-3pp | Low | MEDIUM |
| 3.1 | **Gradient Boosting** | +1-2pp | Low | MEDIUM |
| 4.2 | **Odds Shopping** | +1-2pp | Medium | MEDIUM |
| 2.2 | **Playoff Incentives** | +1-2pp | Medium | MEDIUM |
| 4.1 | **Multi-Season Training** | +1-2pp | Low | LOW |
| 2.3 | **Referee Tendencies** | +1pp | Medium | LOW |
| 5.1 | **NBA Spread** | Unknown | Low | LOW |

---

## Execution Plan for Next Session

### Quick Wins (1-2 hours)
1. **Try Gradient Boosting** - Code already exists in `src/models/trainNbaGradientBoosting.ts`
2. **Enhanced Rest Features** - Calculate from existing game data
3. **Multi-Season Training Support** - Small code change in `trainNbaMoneyline.ts`

### Medium Effort (4-8 hours)
1. **Injury Tracking MVP** - Start with ESPN Injury API, basic features
2. **Ensemble Model** - Blend RF + XGBoost + LogReg
3. **Playoff Incentives** - Calculate standings from game data

### Large Projects (1-2 days)
1. **Full Injury System** - Database, ingestion, historical data, 10+ features
2. **Lineup Data Integration** - Scrape NBA.com, match to games
3. **Odds Shopping Infrastructure** - Multi-sportsbook tracking

---

## Success Criteria (Revisited)

**From CLAUDE.md Protocol:**
> "Must be profitable on BOTH test seasons (2024 and 2025)"

**Specific Targets:**
- [ ] 2023 model → 2025 test: **>0% ROI** (currently -8.40%)
- [ ] 2023 model → 2024 test: **>+4.54% ROI** (maintain or improve)
- [ ] Improvement of **>8.4pp** required to reach breakeven on 2025
- [ ] ECE < 0.10 (currently 0.1173, acceptable)
- [ ] Deterministic results (verify by running backtests 2x)

**Stopping Conditions:**
- ✓ **Success:** ROI > 0% on both 2024 and 2025 after improvements
- ✓ **Partial Success:** ROI > -3% on 2025 (significant improvement, continue)
- ❌ **Failure:** After implementing top 5 priority features, still <-5% on 2025
  - Conclude: NBA Moneyline is too difficult with current approach
  - Pivot to NBA Spread or focus on NHL optimization

---

## Testing Protocol

For each new feature/model:

1. **Train on 2023 data**
   ```bash
   node dist/cli/index.js train nba --seasons 2023 --market moneyline --calibrate
   ```

2. **Test on 2025 (primary)**
   ```bash
   node dist/cli/index.js backtest nba --season 2025 --market moneyline --show-buckets
   ```

3. **Run AGAIN to verify determinism**
   ```bash
   node dist/cli/index.js backtest nba --season 2025 --market moneyline --show-buckets
   # Confirm: Same ROI both times
   ```

4. **Test on 2024 (validation)**
   ```bash
   node dist/cli/index.js backtest nba --season 2024 --market moneyline --show-buckets
   ```

5. **Document in experiment registry**
   - Update `data/experiments-nba-moneyline.md`
   - Add experiment number, date, changes, results
   - Show comparison to baseline

6. **Success Check**
   - [ ] 2025 ROI improved vs baseline (-8.40%)
   - [ ] 2024 ROI maintained or improved (>+4.54%)
   - [ ] Both tests are profitable (>0%)
   - [ ] Results are deterministic

---

## Future Research Questions

1. **Is 2025 an outlier year?**
   - Test on 2026 season when available
   - If 2026 works but 2025 doesn't, investigate 2025-specific factors

2. **Do conference-specific models work better?**
   - Train separate models for Eastern vs Western conference
   - Eastern: More defensive, slower pace
   - Western: More offensive, faster pace

3. **Does time-of-season matter?**
   - Train on Oct-Dec games only
   - Test on Jan-Apr games
   - See if early-season models generalize better

4. **Can we detect when the model will fail?**
   - Uncertainty quantification (prediction intervals)
   - Only bet when model is "confident" (narrow intervals)

---

## Resources

**Code Files:**
- Training: `src/models/trainNbaMoneyline.ts`
- Features: `src/models/features.ts`
- Backtest: `src/cli/commands/backtest.ts`
- Experiments: `data/experiments-nba-moneyline.md`

**Data Sources:**
- Games: ESPN API (already integrated)
- Injuries: ESPN Injury API, NBA.com, FantasyLabs
- Lineups: NBA.com Lineup Stats
- Referees: NBA.com Referee Reports
- Odds: The Odds API, DraftKings API

**Useful Links:**
- NBA API Docs: https://github.com/swar/nba_api
- The Odds API: https://the-odds-api.com/
- Basketball Reference: https://www.basketball-reference.com/

---

## Final Notes

**Key Insight from Current Experiments:**
> The problem is NOT calibration, training method, or hyperparameters. The problem is MISSING FEATURES that capture NBA-specific dynamics (injuries, roster changes, motivations).

**Most Likely Path to Success:**
1. Add injury tracking (80% chance this fixes it)
2. Add lineup/rotation data (60% chance helps significantly)
3. Try ensemble methods (70% chance helps)

**If All Else Fails:**
- Try NBA Spread instead of Moneyline
- Focus resources on NHL (already profitable)
- Wait for more seasons of data (2026+)
- Consider this a lesson about sport-specific predictability

**Remember:**
> Some sports are just harder to predict than others. NHL works (+13.40% ROI). NBA might be too volatile due to star dependency and roster changes. That's okay - focus on what works.

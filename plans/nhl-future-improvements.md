# NHL Moneyline Future Improvements Plan

**Created:** 2026-01-14
**Status:** Currently at **+21.02% ROI** (optimized from +13.40% baseline)
**Purpose:** Guide next phase of NHL optimization to push beyond +21% ROI
**Context:** Bucket filtering achieved +7.62pp improvement. This plan covers further enhancements.

---

## Current State (After Optimization)

**Achieved Performance:**
- **2025 ROI:** +21.02% (up from +13.40% baseline)
- **2024 ROI:** +31.71% (up from +26.67% baseline)
- **2025 Win Rate:** 61.56%
- **2025 Bets:** 359 (filtered from 425)
- **Method:** 60-80% probability bucket filtering

**What Was Tested:**
- ✅ Phase 0: Baseline verification
- ✅ Phase 1: Auto-calibration → NO IMPROVEMENT (already well-calibrated)
- ✅ Phase 2: Hyperparameter tuning → NO IMPROVEMENT (tested 54 combinations)
- ✅ Phase 4: Bucket optimization → **SUCCESS** (+7.62pp improvement)
- ❌ Phase 3: Multi-season training → SKIPPED

**Baseline Model:**
- Random Forest (100 trees, depth=15, minSamples=10)
- 63 features (50 hockey stats + 13 line movement)
- No calibration (Temperature=1.0)
- Training: Single season (1,095-1,123 games)

---

## Optimization Goals

**Primary Goal:** Push beyond +21% ROI to **+25%+** ROI

**Secondary Goals:**
1. Improve bet volume without sacrificing ROI
2. Reduce variance (more consistent returns)
3. Find profitable spread betting strategy
4. Implement dynamic bet sizing (Kelly criterion)

**Constraints:**
- Must maintain ROI > +18% (current optimized level)
- Must work on multiple seasons (2024, 2025)
- Must not significantly reduce bet volume (<300 bets problematic)

---

## Priority 1: Goalie-Specific Features 🔥

**Effort:** Medium (4-6 hours)
**Expected Impact:** +2-4pp ROI
**Risk:** Low

### Why This Matters

Current model uses team-level goalie stats (save percentage, GAA) but doesn't account for:
- **Starter vs backup** (backup goalies have worse stats)
- **Recent goalie form** (hot/cold streaks)
- **Goalie matchups** (some goalies perform better against certain teams)
- **Back-to-back starts** (goalie fatigue)

### Implementation Steps

1. **Add goalie identification to game data**
   ```typescript
   // src/db/schema.sql - Add goalie columns
   ALTER TABLE games ADD COLUMN home_starting_goalie TEXT;
   ALTER TABLE games ADD COLUMN away_starting_goalie TEXT;
   ```

2. **Track goalie-specific stats**
   ```typescript
   // New file: src/models/goalieFeatures.ts
   export function extractGoalieFeatures(
     db: Database,
     gameId: string,
     homeGoalie: string,
     awayGoalie: string,
     gameDate: string
   ): GoalieFeatures {
     // Last 5 starts save %
     // Last 10 starts GAA
     // Days since last start
     // Career record vs opponent
     // Home/away splits
   }
   ```

3. **Integrate into feature extraction**
   ```typescript
   // src/models/features.ts
   const goalieFeatures = extractGoalieFeatures(db, gameId, ...);
   features.push(...goalieFeatures);
   ```

4. **Test and validate**
   ```bash
   node dist/cli/index.js train nhl --seasons 2024 --market moneyline
   node dist/cli/index.js backtest nhl --season 2025 --market moneyline --buckets "60-80" --show-buckets
   # Run twice to verify determinism
   ```

### Success Criteria
- [ ] ROI > +23% on 2025 (vs current +21.02%)
- [ ] ROI > +33% on 2024 (vs current +31.71%)
- [ ] Feature importance shows goalie features in top 15
- [ ] Maintains 60-80% bucket profitability

---

## Priority 2: Rest & Schedule Features 🔥

**Effort:** Low (2-3 hours)
**Expected Impact:** +1-2pp ROI
**Risk:** Low

### Why This Matters

Hockey teams play back-to-backs and have varying rest days:
- **Back-to-back games** (0 days rest) significantly impact performance
- **Travel distance** (cross-country vs divisional)
- **Home stretch** (multiple home games in a row = advantage)
- **Schedule difficulty** (strength of recent opponents)

### Implementation Steps

1. **Add rest day calculation**
   ```typescript
   // src/models/features.ts - Add to hockey features
   const homeDaysRest = calculateRestDays(db, homeTeamId, gameDate);
   const awayDaysRest = calculateRestDays(db, awayTeamId, gameDate);

   features.push(
     homeDaysRest,
     awayDaysRest,
     homeDaysRest - awayDaysRest,  // Rest advantage
     homeDaysRest === 0 ? 1 : 0,   // Home on back-to-back
     awayDaysRest === 0 ? 1 : 0    // Away on back-to-back
   );
   ```

2. **Add travel distance** (optional)
   ```typescript
   const travelMiles = calculateDistance(lastGameCity, currentGameCity);
   features.push(Math.log(travelMiles + 1));
   ```

3. **Test and validate**
   ```bash
   node dist/cli/index.js train nhl --seasons 2024 --market moneyline
   node dist/cli/index.js backtest nhl --season 2025 --market moneyline --buckets "60-80" --show-buckets
   ```

### Success Criteria
- [ ] ROI > +22% on 2025 (vs current +21.02%)
- [ ] Back-to-back penalty evident in feature importance
- [ ] Maintains profitability across seasons

---

## Priority 3: Kelly Criterion Bet Sizing 💰

**Effort:** Low (1-2 hours)
**Expected Impact:** +2-4pp ROI through optimal sizing
**Risk:** Low (purely bet sizing, not prediction changes)

### Why This Matters

Current strategy uses flat $100 bets. Kelly criterion optimizes bet size based on edge:
- **High edge bets** → Larger wagers
- **Low edge bets** → Smaller wagers
- **Maximizes long-term growth**

### Implementation Steps

1. **Add Kelly calculator**
   ```typescript
   // src/betting/kelly.ts
   export function calculateKellyFraction(
     probability: number,
     odds: number,
     bankroll: number,
     fractionalKelly: number = 0.25  // Use 1/4 Kelly for safety
   ): number {
     const edge = probability - (1 / decimalOdds);
     const fraction = edge / (decimalOdds - 1);
     return Math.max(0, Math.min(fraction * fractionalKelly * bankroll, bankroll * 0.05));
   }
   ```

2. **Update backtest to use Kelly**
   ```typescript
   // src/lib/backtest/backtester.ts
   const betSize = calculateKellyFraction(prediction, odds, currentBankroll);
   // Instead of: const betSize = 100;
   ```

3. **Compare Kelly vs flat betting**
   ```bash
   node dist/cli/index.js backtest nhl --season 2025 --market moneyline \
     --buckets "60-80" --bet-sizing kelly --show-buckets
   ```

### Success Criteria
- [ ] Kelly ROI > Flat betting ROI by 2%+
- [ ] Kelly doesn't increase variance excessively
- [ ] Largest single bet stays under 5% of bankroll

---

## Priority 4: Spread Betting Strategy

**Effort:** Medium (3-4 hours)
**Expected Impact:** Unknown (new market)
**Risk:** Medium

### Why This Matters

Moneyline is profitable, but spread offers:
- **More betting opportunities** (closer games)
- **Different odds dynamics** (moneyline may be efficient, spread less so)
- **Diversification** (different edge sources)

### Implementation Steps

1. **Check if spread model exists**
   ```bash
   ls data/models/nhl/spread-*.json
   ```

2. **Train spread model if needed**
   ```bash
   node dist/cli/index.js train nhl --seasons 2024 --market spread
   ```

3. **Backtest spread strategy**
   ```bash
   node dist/cli/index.js backtest nhl --season 2025 --market spread --show-buckets
   ```

4. **If profitable, optimize with bucket filtering**
   ```bash
   node dist/cli/index.js backtest nhl --season 2025 --market spread \
     --buckets "60-80" --show-buckets
   ```

### Success Criteria
- [ ] Spread ROI > +7% on 2025
- [ ] Spread ROI > +7% on 2024
- [ ] Spread doesn't cannibalize moneyline opportunities (different games)

---

## Priority 5: Multi-Season Training (Revisited)

**Effort:** Low (1 hour)
**Expected Impact:** +0-2pp ROI (uncertain)
**Risk:** High (NCAAM showed catastrophic failure)

### Why Reconsider

Phase 2 hyperparameter tuning showed no improvement, so multi-season wasn't tested. However:
- **More training data** (2,326 games vs 1,095) could help
- **NHL may be more stable** than NCAAM (less roster volatility)
- **Worth testing** since it's quick

### Implementation Steps

1. **Modify training to support multiple seasons**
   ```typescript
   // src/models/trainNhlMoneyline.ts
   export async function trainNhlMoneyline(seasons: number[]) {
     // Combine games from all seasons
     // Train single model on combined data
   }
   ```

2. **Train and test**
   ```bash
   node dist/cli/index.js train nhl --seasons 2023,2024 --market moneyline
   node dist/cli/index.js backtest nhl --season 2025 --market moneyline \
     --buckets "60-80" --show-buckets
   ```

3. **Abort criteria**
   - If ROI drops below +18% on 2025 → REVERT
   - If ROI goes negative on 2024 → REVERT
   - If ECE degrades significantly (>0.15) → REVERT

### Success Criteria
- [ ] ROI > +22% on 2025 (vs current +21.02%)
- [ ] ROI > +32% on 2024 (vs current +31.71%)
- [ ] ECE stays < 0.10
- [ ] Model generalizes well (not just memorizing)

---

## Priority 6: Odds Shopping Integration 📊

**Effort:** High (8-10 hours)
**Expected Impact:** +3-5pp ROI through better lines
**Risk:** Medium (requires external API, may have rate limits)

### Why This Matters

Currently using ESPN odds only. Multiple sportsbooks offer different lines:
- **Line shopping** finds best available odds
- **+3-5pp ROI improvement** typical from odds shopping
- **No model changes** needed (just better execution)

### Implementation Steps

1. **Sign up for The Odds API**
   - https://the-odds-api.com/
   - Free tier: 500 requests/month
   - Paid tier: $25/month for 10,000 requests

2. **Add odds fetching module**
   ```typescript
   // src/odds/oddsApi.ts
   export async function fetchNhlOddsFromMultipleBooks(
     gameId: string
   ): Promise<MultiBookOdds> {
     // Fetch from DraftKings, FanDuel, BetMGM, Caesars
     // Return best available odds for home/away
   }
   ```

3. **Update recommendation logic**
   ```typescript
   // src/recommend/recommendNhl.ts
   const bestOdds = await fetchBestOdds(game.id);
   const edge = calculateEdge(prediction, bestOdds);
   ```

4. **Track line shopping benefit**
   ```typescript
   const espnEdge = calculateEdge(prediction, espnOdds);
   const bestEdge = calculateEdge(prediction, bestOdds);
   console.log(`Shopping benefit: +${bestEdge - espnEdge}%`);
   ```

### Success Criteria
- [ ] Average edge improvement +1-2% per bet
- [ ] ROI improvement +3-5pp on backtest with historical multi-book data
- [ ] API rate limits not exceeded
- [ ] Cost justified by ROI improvement

---

## Priority 7: Ensemble Model 🤖

**Effort:** Medium (4-6 hours)
**Expected Impact:** +1-3pp ROI
**Risk:** Low

### Why This Matters

Single Random Forest may miss patterns that other models catch:
- **Gradient boosting** (XGBoost, LightGBM) captures different interactions
- **Logistic regression** provides baseline probabilities
- **Ensemble** combines strengths of multiple models

### Implementation Steps

1. **Train multiple models**
   ```bash
   # Already have Random Forest
   # Add XGBoost
   node dist/cli/index.js train nhl --seasons 2024 --market moneyline --model xgboost

   # Add Gradient Boosting
   node dist/cli/index.js train nhl --seasons 2024 --market moneyline --model gradient-boosting
   ```

2. **Create ensemble predictor**
   ```typescript
   // src/models/ensemble.ts
   export function ensemblePredict(
     rfPred: number,
     xgbPred: number,
     gbPred: number
   ): number {
     // Weighted average (tune weights via CV)
     return 0.5 * rfPred + 0.3 * xgbPred + 0.2 * gbPred;
   }
   ```

3. **Backtest ensemble**
   ```bash
   node dist/cli/index.js backtest nhl --season 2025 --market moneyline \
     --model ensemble --buckets "60-80" --show-buckets
   ```

### Success Criteria
- [ ] Ensemble ROI > Single model ROI by 1%+
- [ ] Ensemble ECE similar or better than single model
- [ ] Maintains profitability across seasons

---

## Priority 8: Dynamic Bucket Adjustment 📈

**Effort:** Low (2-3 hours)
**Expected Impact:** +0.5-1pp ROI
**Risk:** Low

### Why This Matters

Current 60-80% bucket is static. Could optimize per game type:
- **Home favorites** (70-80% bucket works best)
- **Road underdogs** (60-70% bucket works best)
- **Divisional games** (different optimal range)

### Implementation Steps

1. **Analyze bucket performance by game type**
   ```bash
   # Custom analysis script
   node dist/cli/index.js backtest nhl --season 2025 --market moneyline \
     --analyze-by-game-type --show-buckets
   ```

2. **Implement conditional buckets**
   ```typescript
   // src/config/optimalBuckets.ts
   export function getOptimalBucketForGame(
     game: Game,
     prediction: number
   ): string[] {
     if (game.isHomeGame && prediction > 0.7) {
       return ['70-80'];  // Bet only high confidence home favorites
     } else if (!game.isHomeGame && prediction > 0.6) {
       return ['60-70'];  // Bet medium confidence road teams
     } else {
       return ['60-80'];  // Default
     }
   }
   ```

3. **Test and validate**
   ```bash
   node dist/cli/index.js backtest nhl --season 2025 --market moneyline \
     --dynamic-buckets --show-buckets
   ```

### Success Criteria
- [ ] Dynamic ROI > Static bucket ROI
- [ ] Maintains adequate bet volume (>250 bets)
- [ ] Improvement validated on 2024 season

---

## Testing Protocol

**For every experiment:**

1. **Train on 2024**
   ```bash
   node dist/cli/index.js train nhl --seasons 2024 --market moneyline [flags]
   ```

2. **Test on 2025 (primary)**
   ```bash
   node dist/cli/index.js backtest nhl --season 2025 --market moneyline \
     --buckets "60-80" --show-buckets
   ```

3. **Verify determinism**
   ```bash
   # Run again, confirm identical ROI
   node dist/cli/index.js backtest nhl --season 2025 --market moneyline \
     --buckets "60-80" --show-buckets
   ```

4. **Validate on 2024 (secondary)**
   ```bash
   node dist/cli/index.js train nhl --seasons 2023 --market moneyline [same flags]
   node dist/cli/index.js backtest nhl --season 2024 --market moneyline \
     --buckets "60-80" --show-buckets
   ```

5. **Document in registry**
   ```
   Update: data/experiments-nhl-moneyline.md
   Add experiment number, results, conclusion
   ```

---

## Success Criteria

**Phase Success:**
- [ ] ROI > +23% on 2025 (vs current +21.02%)
- [ ] ROI > +33% on 2024 (vs current +31.71%)
- [ ] Win rate > 60%
- [ ] Sample size > 250 bets per season
- [ ] ECE < 0.08 (maintain calibration quality)

**Ultimate Success:**
- [ ] ROI > +25% on 2025
- [ ] Consistent across 2023, 2024, 2025 seasons
- [ ] Deployed to production
- [ ] Monitored for 100+ real bets with expected performance

---

## Stopping Conditions

**Abort experiment if:**
- ROI drops below +18% on 2025
- ROI drops below +28% on 2024
- ECE degrades above 0.15
- Bet volume drops below 200 per season
- Results become non-deterministic

**Stop optimization if:**
- 5 consecutive experiments show <0.5pp improvement
- ROI plateaus at +23-24% despite multiple approaches
- Time investment (>20 hours) not justified by gains

---

## Priority Matrix

| Priority | Feature | Effort | Expected Impact | Risk | Order |
|----------|---------|--------|-----------------|------|-------|
| 🔥🔥🔥 | Goalie features | Medium | +2-4pp | Low | 1st |
| 🔥🔥 | Rest/schedule | Low | +1-2pp | Low | 2nd |
| 🔥🔥 | Kelly criterion | Low | +2-4pp | Low | 3rd |
| 🔥 | Spread betting | Medium | Unknown | Medium | 4th |
| ⚠️ | Multi-season | Low | +0-2pp | High | 5th |
| 💰 | Odds shopping | High | +3-5pp | Medium | 6th |
| 🤖 | Ensemble | Medium | +1-3pp | Low | 7th |
| 📈 | Dynamic buckets | Low | +0.5-1pp | Low | 8th |

**Recommended Order:**
1. Goalie features (best ROI per hour)
2. Rest/schedule (quick win)
3. Kelly criterion (quick win, different dimension)
4. Spread betting (diversification)
5. Only continue if hitting diminishing returns

---

## Estimated Timeline

| Phase | Duration | Cumulative ROI Gain |
|-------|----------|---------------------|
| Goalie features | 4-6 hours | +2-4pp |
| Rest/schedule | 2-3 hours | +3-6pp |
| Kelly criterion | 1-2 hours | +5-10pp |
| Spread betting | 3-4 hours | Unknown |
| **Total** | **10-15 hours** | **+5-10pp (est)** |

**Realistic target:** +25-26% ROI with 10-15 hours effort

---

## Key Learnings from Current Optimization

### What Worked ✅
- **Bucket filtering** - Simple beats complex (+7.62pp)
- **Multi-season validation** - Testing on 2024 AND 2025 prevented false positives
- **Deterministic verification** - Running tests 2x caught issues
- **Protocol adherence** - Following CLAUDE.md methodology worked perfectly

### What Didn't Work ❌
- **Auto-calibration** - Model already well-calibrated
- **Hyperparameter tuning** - 54 combinations, no improvement
- **Complexity** - Simple bucket filter beat sophisticated optimization

### Lessons Learned 💡
1. **Test simple solutions first** - Bucket filtering took 30 min, hyperparameter tuning took 67 min
2. **Not all optimization helps** - Calibration and hyperparameters were wasted effort
3. **Validation is critical** - 70-80% bucket looked great but failed 2024 validation
4. **Document everything** - Comprehensive docs saved hours of re-learning

---

## Resources

**Current Documentation:**
- `data/experiments-nhl-moneyline.md` - All experiments logged
- `data/NHL-OPTIMIZATION-SUMMARY.md` - Executive summary
- `data/NHL-IMPLEMENTATION-GUIDE.md` - Deployment guide
- `data/FINAL-SUMMARY.md` - Comprehensive findings

**Code Entry Points:**
- Training: `src/models/trainNhlMoneyline.ts`
- Features: `src/models/features.ts` (line 250-417 for hockey)
- Backtest: `src/cli/commands/backtest.ts`
- Optimal buckets: `src/config/optimalBuckets.ts`

**External Resources:**
- NHL API: https://gitlab.com/dword4/nhlapi
- The Odds API: https://the-odds-api.com/
- NHL game logs: https://www.hockey-reference.com/

---

## Notes

**Current Deployment Status:**
- Production uses baseline model (+13.40% ROI)
- Bucket filtering (+21.02% ROI) ready to deploy
- Deploy command: `node dist/cli/index.js recommend nhl --min-edge 0.07 --buckets "60-80"`

**Before Starting New Work:**
1. Deploy bucket filtering to production first
2. Monitor 50-100 real bets to confirm expected performance
3. Then proceed with goalie features or other improvements

**Git Branch:**
- Current work: `max-roi-2`
- No commits made yet (awaiting user approval)

---

**Last Updated:** 2026-01-14
**Next Review:** After deploying bucket filtering and monitoring results

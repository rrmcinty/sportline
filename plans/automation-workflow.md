# Automated Multi-Plan Execution Workflow

**Created:** 2026-01-14
**Purpose:** Systematically work through all optimization plans with minimal user intervention
**Usage:** Point Claude at this plan to execute all improvements automatically

---

## How to Use This Workflow

### 🚀 Quick Start (Autonomous Mode - Run While at Work)

Copy and paste this into Claude Code:

```
Execute automation-workflow.md in CONTINUOUS MODE.
Work through ALL 10 phases without stopping.
Use bypass permissions for all bash commands.
Document everything thoroughly in experiment registries.
Only abort if ROI drops below +18% or other critical safety issues.
Provide complete summary when done.
```

**What happens:**
- Claude works autonomously for the estimated 50-60 hours
- All 10 optimization phases executed automatically
- Everything documented in `data/experiments-*.md` files
- Safety guardrails prevent catastrophic failures
- Complete summary waiting when you return

**You'll return to:**
- ✅ NHL potentially improved from +21% to +29-35% ROI
- ✅ NBA potentially approaching profitability
- ✅ All experiments documented with commands and results
- ✅ Clear recommendations for what to deploy

---

### 🛡️ Safe Mode (With Checkpoints)

If you prefer to review progress at checkpoints:

```
Execute automation-workflow.md plan with checkpoint mode.
Stop after phases 1-3, 4-5, and 6-8 for my review.
Use bypass permissions for bash commands.
Document all findings.
```

**Stops at:**
- Checkpoint 1: After ~11 hours (quick wins complete)
- Checkpoint 2: After ~19 hours (system infrastructure)
- Checkpoint 3: After ~41 hours (advanced features)

---

### What This Does

Claude will automatically:
1. ✅ Enter plan mode for each optimization
2. ✅ Implement changes with bypass permissions
3. ✅ Run tests and validate results (2x for determinism)
4. ✅ Document findings in experiment registries
5. ✅ Move to next plan automatically
6. ✅ Abort if safety conditions violated

---

## Execution Order

Execute plans in this priority order (highest ROI per hour):

| Phase | Plan | Effort | Expected Impact | Priority |
|-------|------|--------|-----------------|----------|
| **1** | NHL: Kelly Criterion | 1-2 hours | +2-4pp | 🔥🔥🔥 |
| **2** | NHL: Rest/Schedule | 2-3 hours | +1-2pp | 🔥🔥 |
| **3** | NHL: Goalie Features | 4-6 hours | +2-4pp | 🔥🔥 |
| **4** | General: Bucket Optimizer | 3-4 hours | System-wide | 🔥🔥 |
| **5** | General: Kelly Universal | 3-4 hours | +2-4pp all | 🔥 |
| **6** | NHL: Spread Betting | 3-4 hours | Unknown | 🔥 |
| **7** | NHL: Ensemble Model | 4-6 hours | +1-3pp | 🔥 |
| **8** | General: Odds Shopping | 8-12 hours | +3-5pp all | 💰 |
| **9** | General: Injury Tracking | 12-16 hours | +5-8pp NBA | 🏥 |
| **10** | NHL: Multi-Season | 1 hour | +0-2pp | ⚠️ |

**Total Estimated Time:** 40-60 hours
**Total Expected NHL ROI Gain:** +8-14pp (from current +21% to ~+29-35%)

---

## Phase 1: NHL Kelly Criterion 🔥🔥🔥

**Goal:** Implement Kelly criterion bet sizing for NHL
**Expected:** +2-4pp ROI improvement
**Time:** 1-2 hours

### Plan Reference
See: `nhl-future-improvements.md` → Priority 3: Kelly Criterion Bet Sizing

### Implementation Steps

1. **Enter plan mode**
   ```
   Objective: Implement Kelly criterion bet sizing for NHL moneyline
   Source: plans/nhl-future-improvements.md (Priority 3)
   Bypass permissions: Needed for bash (run tests, builds)
   ```

2. **Create Kelly calculator**
   - File: `src/betting/kelly.ts`
   - Function: `calculateKellyFraction(probability, odds, bankroll, fractional=0.25)`
   - Safety: Cap at 5% of bankroll

3. **Update backtest to use Kelly**
   - File: `src/lib/backtest/backtester.ts`
   - Add `--bet-sizing kelly` flag
   - Compare Kelly vs flat betting

4. **Test on NHL**
   ```bash
   # Flat betting baseline
   node dist/cli/index.js backtest nhl --season 2025 --market moneyline \
     --buckets "60-80" --bet-sizing flat --show-buckets

   # Kelly betting
   node dist/cli/index.js backtest nhl --season 2025 --market moneyline \
     --buckets "60-80" --bet-sizing kelly --starting-bankroll 10000 --show-buckets

   # Run both twice to verify determinism
   ```

5. **Document results**
   - File: `data/experiments-nhl-moneyline.md`
   - Experiment #6: Kelly Criterion Bet Sizing
   - Compare: Kelly ROI vs Flat ROI
   - Success: Kelly > Flat by 2%+

### Success Criteria
- [ ] Kelly outperforms flat betting by 2%+
- [ ] Largest bet stays under 5% of bankroll
- [ ] Results deterministic (ran 2x)
- [ ] Documented in experiments-nhl-moneyline.md

### Abort Conditions
- Kelly performs worse than flat betting
- Kelly increases drawdown excessively (>30%)
- Implementation takes >3 hours

---

## Phase 2: NHL Rest & Schedule Features 🔥🔥

**Goal:** Add back-to-back and rest day features
**Expected:** +1-2pp ROI improvement
**Time:** 2-3 hours

### Plan Reference
See: `nhl-future-improvements.md` → Priority 2: Rest & Schedule Features

### Implementation Steps

1. **Enter plan mode**
   ```
   Objective: Add rest day and back-to-back features to NHL model
   Source: plans/nhl-future-improvements.md (Priority 2)
   Bypass permissions: Needed for bash (training, testing)
   ```

2. **Add rest day calculation**
   - File: `src/models/features.ts`
   - Add: `homeDaysRest`, `awayDaysRest`, `restAdvantage`
   - Add: `homeBackToBack` (boolean), `awayBackToBack` (boolean)

3. **Retrain model**
   ```bash
   node dist/cli/index.js train nhl --seasons 2024 --market moneyline
   ```

4. **Test on 2025 with bucket filtering**
   ```bash
   node dist/cli/index.js backtest nhl --season 2025 --market moneyline \
     --buckets "60-80" --show-buckets
   # Run twice to verify determinism
   ```

5. **Validate on 2024**
   ```bash
   node dist/cli/index.js train nhl --seasons 2023 --market moneyline
   node dist/cli/index.js backtest nhl --season 2024 --market moneyline \
     --buckets "60-80" --show-buckets
   ```

6. **Document results**
   - File: `data/experiments-nhl-moneyline.md`
   - Experiment #7: Rest & Schedule Features
   - Compare to baseline +21.02%

### Success Criteria
- [ ] ROI > +22% on 2025 (vs current +21.02%)
- [ ] Rest features appear in top 20 importance
- [ ] Validated on 2024 season
- [ ] Documented with commands and results

### Abort Conditions
- ROI drops below +20% on 2025
- Features have near-zero importance
- Implementation takes >4 hours

---

## Phase 3: NHL Goalie Features 🔥🔥

**Goal:** Add goalie-specific tracking and features
**Expected:** +2-4pp ROI improvement
**Time:** 4-6 hours

### Plan Reference
See: `nhl-future-improvements.md` → Priority 1: Goalie-Specific Features

### Implementation Steps

1. **Enter plan mode**
   ```
   Objective: Add goalie identification and goalie-specific features
   Source: plans/nhl-future-improvements.md (Priority 1)
   Bypass permissions: Needed for bash (training, testing, DB updates)
   ```

2. **Update database schema** (if goalie columns don't exist)
   ```sql
   ALTER TABLE games ADD COLUMN home_starting_goalie TEXT;
   ALTER TABLE games ADD COLUMN away_starting_goalie TEXT;
   ```

3. **Create goalie features module**
   - File: `src/models/goalieFeatures.ts`
   - Extract: Last 5 starts save%, last 10 starts GAA, days since last start
   - Extract: Career record vs opponent, home/away splits

4. **Integrate into feature extraction**
   - File: `src/models/features.ts`
   - Add goalie features to `extractHockeyGameFeatures()`

5. **Retrain and test**
   ```bash
   node dist/cli/index.js train nhl --seasons 2024 --market moneyline
   node dist/cli/index.js backtest nhl --season 2025 --market moneyline \
     --buckets "60-80" --show-buckets
   # Run twice for determinism
   ```

6. **Validate on 2024**
   ```bash
   node dist/cli/index.js train nhl --seasons 2023 --market moneyline
   node dist/cli/index.js backtest nhl --season 2024 --market moneyline \
     --buckets "60-80" --show-buckets
   ```

7. **Document results**
   - File: `data/experiments-nhl-moneyline.md`
   - Experiment #8: Goalie-Specific Features
   - Show feature importance rankings

### Success Criteria
- [ ] ROI > +23% on 2025 (vs current +21.02%)
- [ ] Goalie features in top 15 importance
- [ ] Validated on 2024 season (ROI > +32%)
- [ ] Documented comprehensively

### Abort Conditions
- ROI drops below +20% on 2025
- Implementation takes >8 hours
- Goalie data not available/reliable

---

## Phase 4: General Bucket Optimizer 🔥🔥

**Goal:** Automate bucket optimization for any sport
**Expected:** System-wide improvement capability
**Time:** 3-4 hours

### Plan Reference
See: `general-improvements.md` → Priority 1: Automated Bucket Optimization

### Implementation Steps

1. **Enter plan mode**
   ```
   Objective: Create automated bucket optimizer that works for any sport
   Source: plans/general-improvements.md (Priority 1)
   Bypass permissions: Needed for bash (testing multiple configurations)
   ```

2. **Create bucket optimizer module**
   - File: `src/lib/optimization/bucketOptimizer.ts`
   - Function: `optimizeBuckets(sport, market, trainSeason, testSeason)`
   - Test candidates: ['50-60'], ['60-70'], ['70-80'], ['60-80'], ['65-80'], ['70-90']

3. **Add CLI command**
   ```bash
   node dist/cli/index.js optimize-buckets <sport> --season <year> --market <moneyline|spread>
   ```

4. **Test on NHL** (should find 60-80%)
   ```bash
   node dist/cli/index.js optimize-buckets nhl --season 2025 --market moneyline
   # Expected output: Best buckets: 60-80 (ROI: +21.02%)
   ```

5. **Test on NBA** (if becomes profitable)
   ```bash
   node dist/cli/index.js optimize-buckets nba --season 2025 --market moneyline
   ```

6. **Document results**
   - Create: `data/experiments-system.md` (new file for system-wide improvements)
   - Document: Bucket optimizer implementation and validation

### Success Criteria
- [ ] Finds 60-80% bucket for NHL automatically
- [ ] Runs in <10 minutes per sport/market
- [ ] Can optimize any sport without manual tuning
- [ ] Documented with examples

### Abort Conditions
- Implementation takes >6 hours
- Optimizer doesn't find known optimal buckets
- Performance too slow (>30 min per sport)

---

## Phase 5: General Universal Kelly 🔥

**Goal:** Apply Kelly criterion to all profitable models
**Expected:** +2-4pp ROI across all profitable models
**Time:** 3-4 hours

### Plan Reference
See: `general-improvements.md` → Priority 2: Universal Kelly Criterion

### Implementation Steps

1. **If not already done in Phase 1, implement Kelly**
   - File: `src/betting/kelly.ts`
   - Make it work for all sports (NHL, NBA, NCAAM)

2. **Test on all sports with bucket optimizer results**
   ```bash
   # NHL
   node dist/cli/index.js backtest nhl --season 2025 --market moneyline \
     --buckets "60-80" --bet-sizing kelly --show-buckets

   # NBA (if profitable)
   node dist/cli/index.js backtest nba --season 2025 --market moneyline \
     --buckets [optimized] --bet-sizing kelly --show-buckets
   ```

3. **Compare flat vs Kelly across all sports**

4. **Document results**
   - File: `data/experiments-system.md`
   - Experiment: Universal Kelly Criterion
   - Compare: Flat vs Kelly for each sport

### Success Criteria
- [ ] Kelly improves ROI by 2%+ on average
- [ ] Works across all sports
- [ ] Safety limits enforced (5% max bet)
- [ ] Documented with comparisons

---

## Phase 6: NHL Spread Betting 🔥

**Goal:** Test if NHL spread is profitable
**Expected:** Unknown ROI, diversification benefit
**Time:** 3-4 hours

### Plan Reference
See: `nhl-future-improvements.md` → Priority 4: Spread Betting Strategy

### Implementation Steps

1. **Enter plan mode**
   ```
   Objective: Test NHL spread betting profitability
   Source: plans/nhl-future-improvements.md (Priority 4)
   Bypass permissions: Needed for bash (training, testing)
   ```

2. **Check if spread model exists**
   ```bash
   ls data/models/nhl/spread-*.json
   ```

3. **Train spread model if needed**
   ```bash
   node dist/cli/index.js train nhl --seasons 2024 --market spread
   ```

4. **Backtest spread**
   ```bash
   node dist/cli/index.js backtest nhl --season 2025 --market spread --show-buckets
   # Run twice for determinism
   ```

5. **If profitable (ROI > +7%), optimize with buckets**
   ```bash
   node dist/cli/index.js optimize-buckets nhl --season 2025 --market spread
   # Then test with best buckets
   ```

6. **Document results**
   - File: `data/experiments-nhl-spread.md` (create new)
   - Baseline spread performance
   - Bucket optimization results (if applicable)

### Success Criteria
- [ ] Spread ROI > +7% on 2025
- [ ] Spread ROI > +7% on 2024 (validation)
- [ ] Doesn't cannibalize moneyline opportunities
- [ ] Documented with full analysis

### Abort Conditions
- Spread ROI < 0% on initial test
- Spread worse than -10% ROI
- Implementation takes >5 hours

---

## Phase 7: NHL Ensemble Model 🔥

**Goal:** Combine multiple model types for better predictions
**Expected:** +1-3pp ROI improvement
**Time:** 4-6 hours

### Plan Reference
See: `nhl-future-improvements.md` → Priority 7: Ensemble Model

### Implementation Steps

1. **Enter plan mode**
   ```
   Objective: Create ensemble model combining RF, XGBoost, Gradient Boosting
   Source: plans/nhl-future-improvements.md (Priority 7)
   Bypass permissions: Needed for bash (training multiple models, testing)
   ```

2. **Train multiple model types**
   ```bash
   # Random Forest (already have)
   # XGBoost
   node dist/cli/index.js train nhl --seasons 2024 --market moneyline --model xgboost
   # Gradient Boosting
   node dist/cli/index.js train nhl --seasons 2024 --market moneyline --model gradient-boosting
   ```

3. **Create ensemble predictor**
   - File: `src/models/ensemble.ts`
   - Weighted average: 0.5 * RF + 0.3 * XGB + 0.2 * GB
   - Tune weights via cross-validation

4. **Test ensemble**
   ```bash
   node dist/cli/index.js backtest nhl --season 2025 --market moneyline \
     --model ensemble --buckets "60-80" --show-buckets
   ```

5. **Validate on 2024**

6. **Document results**
   - File: `data/experiments-nhl-moneyline.md`
   - Experiment: Ensemble Model
   - Compare single model vs ensemble

### Success Criteria
- [ ] Ensemble ROI > Single model ROI by 1%+
- [ ] Ensemble ECE similar or better
- [ ] Validated on 2024 season
- [ ] Documented with model weights

### Abort Conditions
- Ensemble performs worse than best single model
- Implementation takes >8 hours
- Models don't converge or train properly

---

## Phase 8: General Odds Shopping 💰

**Goal:** Integrate multi-book odds for better lines
**Expected:** +3-5pp ROI across all models
**Time:** 8-12 hours

### Plan Reference
See: `general-improvements.md` → Priority 3: Multi-Book Odds Shopping

### Implementation Steps

1. **Enter plan mode**
   ```
   Objective: Integrate The Odds API for multi-book odds shopping
   Source: plans/general-improvements.md (Priority 3)
   Bypass permissions: Needed for bash (API testing, builds)
   ```

2. **Sign up for The Odds API**
   - URL: https://the-odds-api.com/
   - Plan: $25/month (10,000 requests)

3. **Create odds aggregator**
   - File: `src/odds/oddsAggregator.ts`
   - Function: `getBestOddsForGame(sport, gameId)`
   - Compare: DraftKings, FanDuel, BetMGM, Caesars

4. **Update recommendation logic**
   - File: `src/recommend/recommend.ts`
   - Use best available odds instead of ESPN only
   - Track shopping benefit

5. **Test with historical data** (if available)
   ```bash
   node dist/cli/index.js backtest nhl --season 2025 --market moneyline \
     --buckets "60-80" --odds-source multi-book --show-buckets
   ```

6. **Document results**
   - File: `data/experiments-system.md`
   - Experiment: Multi-Book Odds Shopping
   - Show average edge improvement

### Success Criteria
- [ ] Average edge improvement +1-2% per bet
- [ ] ROI improvement +3-5pp on backtests
- [ ] API costs justified (<$25/month)
- [ ] Works for NHL, NBA, NCAAM

### Abort Conditions
- API unreliable or too expensive
- Historical data not available for testing
- Implementation takes >15 hours

---

## Phase 9: General Injury Tracking 🏥

**Goal:** Track injuries and incorporate into models
**Expected:** +5-8pp for NBA, +1-2pp for NHL
**Time:** 12-16 hours

### Plan Reference
See: `general-improvements.md` → Priority 4: Injury Tracking System

### Implementation Steps

1. **Enter plan mode**
   ```
   Objective: Implement injury tracking system for NBA and NHL
   Source: plans/general-improvements.md (Priority 4)
   Bypass permissions: Needed for bash (DB updates, training, testing)
   ```

2. **Choose data source**
   - Option A: ESPN Injury API (free)
   - Option B: RotoWire API (paid, $10-50/month)
   - Option C: Web scraping

3. **Create injury database**
   ```sql
   CREATE TABLE IF NOT EXISTS injuries (
     id INTEGER PRIMARY KEY,
     team_id TEXT NOT NULL,
     sport TEXT NOT NULL,
     player_name TEXT NOT NULL,
     injury_status TEXT NOT NULL,
     position TEXT,
     avg_minutes_per_game REAL,
     avg_points_per_game REAL,
     date_added TEXT NOT NULL,
     date_updated TEXT NOT NULL
   );
   ```

4. **Create injury features module**
   - File: `src/models/injuryFeatures.ts`
   - Extract: Total minutes out, stars out, injury count

5. **Integrate into NBA model**
   - File: `src/models/features.ts`
   - Add injury features to NBA feature extraction

6. **Retrain and test NBA**
   ```bash
   node dist/cli/index.js train nba --seasons 2024 --market moneyline
   node dist/cli/index.js backtest nba --season 2025 --market moneyline --show-buckets
   ```

7. **Document results**
   - File: `data/experiments-nba-moneyline.md`
   - Experiment: Injury Tracking Integration
   - Compare with/without injuries

### Success Criteria
- [ ] NBA ROI improves by +5pp (from -13% toward profitability)
- [ ] Injury features in top 10 importance
- [ ] Data source reliable (>90% accuracy)
- [ ] Updates daily automatically

### Abort Conditions
- Data source unreliable or unavailable
- No ROI improvement after implementation
- Implementation takes >20 hours

---

## Phase 10: NHL Multi-Season Training ⚠️

**Goal:** Train on multiple seasons for more data
**Expected:** +0-2pp ROI (high risk)
**Time:** 1 hour

### Plan Reference
See: `nhl-future-improvements.md` → Priority 5: Multi-Season Training (Revisited)

### Implementation Steps

1. **Enter plan mode**
   ```
   Objective: Test multi-season training (2023+2024 combined)
   Source: plans/nhl-future-improvements.md (Priority 5)
   Bypass permissions: Needed for bash (training, testing)
   WARNING: NCAAM multi-season failed catastrophically
   ```

2. **Modify training to support multiple seasons**
   - File: `src/models/trainNhlMoneyline.ts`
   - Allow: `--seasons 2023,2024`

3. **Train and test**
   ```bash
   node dist/cli/index.js train nhl --seasons 2023,2024 --market moneyline
   node dist/cli/index.js backtest nhl --season 2025 --market moneyline \
     --buckets "60-80" --show-buckets
   ```

4. **Validate on 2024**
   ```bash
   node dist/cli/index.js backtest nhl --season 2024 --market moneyline \
     --buckets "60-80" --show-buckets
   ```

5. **Document results**
   - File: `data/experiments-nhl-moneyline.md`
   - Experiment: Multi-Season Training
   - Compare to single-season baseline

### Success Criteria
- [ ] ROI > +22% on 2025 (vs current +21.02%)
- [ ] ROI > +32% on 2024 (vs current +31.71%)
- [ ] ECE stays < 0.10
- [ ] Model generalizes well

### Abort Conditions
- **CRITICAL:** ROI drops below +18% on 2025 → REVERT IMMEDIATELY
- ROI goes negative on 2024 → REVERT
- ECE degrades (>0.15) → REVERT
- Implementation takes >2 hours

---

## Checkpoints & User Review

### After Quick Wins (Phases 1-3)
**Stop and report:**
- NHL Kelly criterion results
- NHL rest/schedule results
- NHL goalie features results
- Cumulative ROI improvement
- Estimated time to completion

**User decision point:** Continue to system-wide improvements?

### After System-Wide (Phases 4-5)
**Stop and report:**
- Bucket optimizer functionality
- Universal Kelly results across sports
- Any NBA improvements observed
- Estimated time for remaining phases

**User decision point:** Continue to advanced features?

### After Advanced Features (Phases 6-8)
**Stop and report:**
- NHL spread profitability
- Ensemble model results
- Odds shopping implementation status
- Total ROI improvements achieved

**User decision point:** Tackle injury tracking?

### Final Report (After All Phases)
**Complete summary:**
- All experiments completed
- Total ROI improvement: Baseline → Final
- Time spent: Estimated vs Actual
- Success rate: Phases that worked vs failed
- Production deployment recommendations

---

## Safety & Guardrails

### Automatic Abort Conditions

**Stop immediately if:**
- NHL ROI drops below +18% on any test
- Any model shows non-deterministic results
- Implementation time exceeds 2x estimate
- Database corruption or data loss

### Manual Review Required

**User review needed before:**
- Deploying to production
- Making irreversible database changes
- Spending money (API subscriptions)
- Modifying baseline models

### Rollback Procedure

**If something breaks:**
1. Restore baseline model: `cp data/models/nhl/moneyline-2024-baseline.json data/models/nhl/moneyline-2024.json`
2. Revert code changes: `git checkout <file>`
3. Document failure: Update experiment registry with failure notes
4. Report to user: Explain what went wrong and why

---

## Documentation Requirements

### For Each Phase

**Required documentation:**
1. Experiment number in appropriate registry
2. Hypothesis and expected impact
3. Exact commands run
4. Raw results (ROI, win rate, bets)
5. Comparison to baseline
6. Conclusion (success/failure/partial)
7. Next steps recommendation

### Files to Update

- `data/experiments-nhl-moneyline.md` - NHL experiments
- `data/experiments-system.md` - System-wide experiments (create if needed)
- `data/experiments-nba-moneyline.md` - NBA experiments (if Phase 9)
- Plan files - Mark phases as complete

---

## Estimated Timeline

| Phase | Task | Time | Cumulative |
|-------|------|------|------------|
| 1 | Kelly Criterion | 1-2h | 2h |
| 2 | Rest/Schedule | 2-3h | 5h |
| 3 | Goalie Features | 4-6h | 11h |
| **Checkpoint 1** | **User Review** | - | - |
| 4 | Bucket Optimizer | 3-4h | 15h |
| 5 | Universal Kelly | 3-4h | 19h |
| **Checkpoint 2** | **User Review** | - | - |
| 6 | Spread Betting | 3-4h | 23h |
| 7 | Ensemble Model | 4-6h | 29h |
| 8 | Odds Shopping | 8-12h | 41h |
| **Checkpoint 3** | **User Review** | - | - |
| 9 | Injury Tracking | 12-16h | 57h |
| 10 | Multi-Season | 1h | 58h |
| **Final Review** | **Complete** | - | - |

**Total Time:** 50-60 hours of Claude work
**Expected NHL ROI:** +29-35% (from current +21%)
**Expected NBA ROI:** 0% to +9% (from current -13%)

---

## Usage Instructions

### Mode 1: Checkpoint Mode (Safe, Recommended)

Stops at 3 checkpoints for your review:

```bash
# In Claude Code:
"Execute the automation-workflow.md plan in the plans/ folder.
Work through all phases systematically with bypass permissions enabled.
Stop at checkpoints for my review."
```

### Mode 2: Continuous Mode (Autonomous, Use While Away)

Runs through ALL 10 phases without stopping:

```bash
# In Claude Code:
"Execute the automation-workflow.md plan in CONTINUOUS MODE.
Work through ALL 10 phases without stopping at checkpoints.
Use bypass permissions for all bash commands.
Document everything thoroughly.
Only stop if critical safety conditions are violated (ROI drops below +18%).
I'll review when I return."
```

**What happens:**
- ✅ Claude works through all 50-60 hours of optimizations
- ✅ Documents everything in experiment registries
- ✅ Auto-aborts if safety conditions violated
- ✅ Provides complete summary at the end
- ✅ You review results when you return

**Safety guardrails still active:**
- Auto-abort if NHL ROI drops below +18%
- Auto-abort if non-deterministic results
- Auto-abort if database corruption
- All changes documented and reversible

### Resume from Checkpoint

```bash
# To resume after a checkpoint:
"Resume the automation-workflow.md from Phase X (specify phase).
Continue with bypass permissions enabled."
```

### Skip a Phase

```bash
# To skip a phase that's not working:
"Continue automation-workflow.md but skip Phase X (explain why).
Move to Phase X+1."
```

### Emergency Stop

```bash
# To stop immediately:
"Stop the automation workflow. Restore baseline. Report current status."
```

---

## Success Metrics

### Overall Success Criteria

- [ ] NHL ROI improved to +25%+ (from +21.02%)
- [ ] NBA ROI improved toward profitability (from -13.23%)
- [ ] All profitable models use Kelly criterion
- [ ] Bucket optimizer working for all sports
- [ ] At least 5 phases successfully completed
- [ ] All experiments documented
- [ ] No baseline performance degradation

### Minimum Acceptable Results

- [ ] NHL ROI maintained above +20%
- [ ] No catastrophic failures (data loss, model corruption)
- [ ] At least 3 phases successfully completed
- [ ] Clear documentation of what worked and what didn't
- [ ] Recommendations for next steps

---

## Notes

**Before Starting:**
- Ensure current NHL bucket filtering is deployed and monitored
- Backup all baseline models
- Ensure git branch is clean (`max-roi-2`)

**During Execution:**
- Check results after each phase
- Don't continue if ROI degrades significantly
- Document failures as thoroughly as successes

**After Completion:**
- Review all experiment registries
- Create deployment plan for successful optimizations
- Update production with validated improvements

---

**Created:** 2026-01-14
**Last Updated:** 2026-01-14
**Estimated Completion:** 50-60 hours of automated work with 3-4 user checkpoints

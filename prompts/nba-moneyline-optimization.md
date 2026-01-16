# NBA Moneyline Model Optimization Prompt (Ralph Loop)

## Completion Promise
When the optimization goal is achieved OR you've exhausted all reasonable experiments, output:
```
<promise>NBA OPTIMIZATION COMPLETE</promise>
```

Success criteria for completion promise:
1. **SUCCESS**: Achieved ROI > 0% on 2026 (train 2025) AND at least one other test season
2. **OR EXHAUSTED**: Completed 10+ systematic experiments with documented conclusions

---

## Mission
You are tasked with optimizing the NBA moneyline prediction model to **maximize ROI on out-of-sample testing**.

**GOOD NEWS**: The model is ALREADY PROFITABLE!
- Primary (train 2025 → test 2026): **+9.94% ROI** ✅
- Tertiary (train 2023 → test 2024): **+4.54% ROI** ✅
- Secondary (train 2024 → test 2025): -12.55% ROI ❌ (anomaly)

**Goal**: Improve from +9.94% to +15%+ ROI, or confirm that +9.94% is the optimal baseline.

**Phase 1 COMPLETE**: Bucket filtering and rest advantage features FAILED for NBA (unlike NHL).

## Current State

### Latest Data Available
- **2026 Season (Current)**: 478 completed games (Oct 21, 2025 - Jan 12, 2026)
- **2025 Season**: 1,236 completed games (full season)
- **2024 Season**: 938 completed games (full season)
- **2023 Season**: 1,231 completed games (full season)

### Baseline Performance (Verified 2026-01-15)
| Model | Train Season | Test Season | ROI | Win Rate | Bets | Status |
|-------|-------------|-------------|-----|----------|------|--------|
| **2025 model** | **2025** | **2026** | **+9.94%** | 58.36% | 317 | ✅ **PROFITABLE** |
| 2024 model | 2024 | 2025 | -12.55% | 34.25% | 803 | ❌ UNPROFITABLE |
| 2023 model | 2023 | 2024 | +4.54% | 46.44% | 534 | ✅ PROFITABLE |

### Key Insight
**GOOD NEWS**: The 2025→2026 model is already profitable at +9.94% ROI! Two out of three validation pairs show positive ROI. The only failing pair (2024→2025) may be an anomaly - the 2024 model had less training data (936 vs 1,231 games) and used temperature calibration instead of beta.

**GOAL NOW**: Can we improve the +9.94% ROI further? Apply NHL learnings (bucket filtering, rest advantage) to potentially boost to +15%+ ROI.

### Comparison to NHL (which works)
| Sport | Train→Test | ROI | Win Rate | What Works |
|-------|-----------|-----|----------|------------|
| NHL | 2024→2025 | +13.40% | 56.71% | 60-80% bucket filtering, rest advantage |
| NHL | 2023→2024 | +26.67% | 42.95% | Same model, consistent across seasons |
| **NBA** | **2025→2026** | **+9.94%** | 58.36% | **BASELINE - Already profitable!** |
| NBA | 2024→2025 | -12.55% | 34.25% | Failed (less training data, temp calibration) |
| NBA | 2023→2024 | +4.54% | 46.44% | Works (beta calibration) |

---

## Critical Verification Requirements

### ⚠️ ROI CALCULATION VERIFICATION
Before claiming ANY result, you MUST verify the ROI calculation is correct:

```
ROI = (total_profit / total_staked) × 100

Where:
- total_staked = number_of_bets × $100 (flat betting)
- total_profit = sum of all bet outcomes
  - Win: profit = bet_amount × (odds > 0 ? odds/100 : 100/|odds|)
  - Loss: profit = -bet_amount
```

**Verification checklist for EVERY experiment:**
1. [ ] Run the exact backtest command and capture the full output
2. [ ] Verify the command used OUT-OF-SAMPLE testing (train season ≠ test season)
3. [ ] Run the SAME command TWICE and confirm identical results (determinism check)
4. [ ] Manually verify ROI calculation from the output:
   - Count total bets reported
   - Calculate expected staked amount: bets × $100
   - Calculate expected profit from wins/losses
   - Verify: ROI = profit / staked
5. [ ] Test on BOTH validation seasons (2024 AND 2025)
6. [ ] Document exact numbers in the experiments file

### ⚠️ OUT-OF-SAMPLE TESTING (NON-NEGOTIABLE)
```bash
# CORRECT: Train on one season, test on different season
node dist/cli/index.js train nba --season 2024 --market moneyline
node dist/cli/index.js backtest nba --season 2025 --market moneyline --show-buckets

# WRONG: Training and testing on same data (IN-SAMPLE = FAKE RESULTS)
node dist/cli/index.js train nba --season 2025 --market moneyline
node dist/cli/index.js backtest nba --season 2025 --market moneyline  # ❌ INVALID
```

### ⚠️ MULTI-SEASON VALIDATION
An improvement is ONLY valid if profitable on **MULTIPLE** test seasons:

**Primary Validation (Most Important)**:
- Train on 2025 → Test on 2026 (current season, 478 games)
- This is what matters for ACTUAL betting going forward

**Secondary Validation**:
- Train on 2024 → Test on 2025 (807 games)
- Train on 2023 → Test on 2024 (534 games)

**Success Criteria**:
- Must be profitable on 2025→2026 (primary)
- Should ALSO be profitable on at least ONE other validation pair
- If only one season pair is profitable, investigate why before declaring success

---

## Workflow for Each Iteration

### Step 1: Establish Baseline (First iteration only)
```bash
# Build the project first
npm run build

# PRIMARY: Train 2025 model, test on 2026 (current season)
node dist/cli/index.js train nba --season 2025 --market moneyline --calibrate
node dist/cli/index.js backtest nba --season 2026 --market moneyline --show-buckets

# SECONDARY: Train 2024 model, test on 2025
node dist/cli/index.js train nba --season 2024 --market moneyline --calibrate
node dist/cli/index.js backtest nba --season 2025 --market moneyline --show-buckets

# TERTIARY: Train 2023 model, test on 2024
node dist/cli/index.js train nba --season 2023 --market moneyline --calibrate
node dist/cli/index.js backtest nba --season 2024 --market moneyline --show-buckets
```

### Step 2: For Each Experiment
1. **State the hypothesis** - What change will improve the model and why?
2. **Make the change** - Modify code (features, architecture, hyperparameters, etc.)
3. **Build** - `npm run build` (ALWAYS after code changes)
4. **Train** - Train new model with changes
5. **Test primary** - Backtest on 2025 season
6. **Verify determinism** - Run the SAME backtest again, confirm identical results
7. **Test validation** - Backtest on 2024 season
8. **Document** - Record results in `data/experiments-nba-moneyline.md`
9. **Evaluate** - Compare to baseline, decide if successful

### Step 3: Update Experiments File
After EVERY experiment, update `data/experiments-nba-moneyline.md` with:

```markdown
## Experiment #N: [Name]

**Date:** YYYY-MM-DD
**Hypothesis:** [What we're testing]
**Changes:** [Code/config changes made]

### Commands Used
```bash
[Exact commands used]
```

### Results

#### Test 2026 (PRIMARY - current season, train 2025)
- **ROI:** X.XX%
- **Win Rate:** XX.XX%
- **Total Bets:** XXX
- **Verified:** ✓✓ (ran 2x, results: X.XX%, X.XX%)

#### Test 2025 (secondary, train 2024)
- **ROI:** X.XX%
- **Win Rate:** XX.XX%
- **Total Bets:** XXX
- **Verified:** ✓✓ (ran 2x, results: X.XX%, X.XX%)

#### Test 2024 (tertiary, train 2023)
- **ROI:** X.XX%
- **Win Rate:** XX.XX%
- **Total Bets:** XXX
- **Verified:** ✓✓ (ran 2x, results: X.XX%, X.XX%)

### ROI Calculation Verification (Primary Test)
- Total Bets: XXX
- Total Staked: $X,XXX (XXX × $100)
- Total Profit: $X,XXX
- Manual ROI: X,XXX / X,XXX × 100 = X.XX% ✓

### Bucket Breakdown
| Bucket | 2026 ROI | 2025 ROI | 2024 ROI | Status |
|--------|----------|----------|----------|--------|
| 50-60% | X.XX% | X.XX% | X.XX% | ✓/❌ |
| 60-70% | X.XX% | X.XX% | X.XX% | ✓/❌ |
| 70-80% | X.XX% | X.XX% | X.XX% | ✓/❌ |

### Conclusion
- **Status:** ✓ SUCCESS / ❌ FAILED
- **vs Baseline 2025:** +/- X.XX pp
- **vs Baseline 2024:** +/- X.XX pp
- **Recommendation:** [Deploy / Don't deploy / Need more testing]
```

---

## Experiment Ideas (Prioritized)

### Phase 1: Apply NHL Learnings ❌ COMPLETED - DID NOT WORK

**IMPORTANT**: These worked for NHL but FAILED for NBA. Do NOT retry.

1. **Bucket Filtering** ❌ FAILED (NHL: +7.62pp, NBA: ALL NEGATIVE)
   - 60-80% bucket: -1.45% ROI (vs +9.94% baseline) = **-11.39pp** ⛔
   - 0-20% bucket: +7.80% ROI (vs +9.94% baseline) = **-2.14pp** ⛔
   - 90-100% bucket: +9.30% ROI (vs +9.94% baseline) = **-0.64pp** ⛔
   - **Conclusion**: No bucket filtering is optimal for NBA

2. **Rest Advantage Feature** ❌ FAILED (NHL: +19.42pp, NBA: -5.71pp)
   - Added `restAdvantage = homeRestDays - awayRestDays` to features
   - Result: +4.23% ROI (vs +9.94% baseline) = **-5.71pp** ⛔
   - **Conclusion**: Rest advantage HURTS NBA model, unlike NHL
   - Feature was REVERTED

3. **Kelly Criterion Bet Sizing** - NOT TESTED YET
   - Try quarter-Kelly with 5% max bet
   - Command: `--bet-sizing kelly --starting-bankroll 10000`

### Phase 2: Feature Engineering
4. **Recent Form Window**
   - Current: Last 10 games
   - Try: Last 5 games (more recent form matters more in NBA)
   - Try: Last 15 games (more data)

5. **Scoring Momentum**
   - Add: Points scored trend (last 5 vs season average)
   - Add: Points allowed trend (defensive momentum)

6. **Home/Away Splits**
   - Separate home and away performance metrics
   - Some teams perform very differently home vs away

### Phase 3: Calibration Experiments
7. **Different Calibration Methods**
   - Test isotonic regression (more flexible than beta)
   - Test Platt scaling
   - Compare ECE scores before choosing

8. **Calibration Holdout Size**
   - Current: 20% holdout
   - Try: 30% holdout (more data for calibration)
   - Try: 15% holdout (more data for training)

### Phase 4: Model Architecture
9. **Gradient Boosting (XGBoost)**
   - Better at capturing complex interactions
   - May handle NBA's star player dynamics better

10. **Ensemble Methods**
    - Blend Random Forest + XGBoost + Logistic Regression
    - Weighted average based on calibration performance

11. **Shallower Trees**
    - NHL experiment showed depth=10 ≈ depth=15
    - Try max_depth=8 or 5 (less overfitting)

### Phase 5: Data Augmentation
12. **Multi-Season Training**
    - Train on 2023+2024, test on 2025
    - More training data may improve generalization

13. **Weighted Recent Games**
    - Give more weight to recent games vs early season
    - Early season stats are less reliable

### Phase 6: Feature Selection
14. **Top K Features**
    - Try top 30, 40, 50 features by importance
    - Remove noisy features that hurt generalization

15. **Remove Correlated Features**
    - Many features are highly correlated
    - Keep one representative from each cluster

---

## Key Files to Modify

### Feature Engineering
- `src/models/features.ts` - Add/modify features (see `extractGameFeatures`)
- `src/models/advancedFeatures.ts` - Add new advanced metrics
- `getFeatureOrder()` must match feature extraction order

### Training
- `src/models/trainNbaMoneyline.ts` - Training logic and hyperparameters
- Random Forest options: nEstimators, maxDepth, minNumSamples, maxFeatures

### Calibration
- `src/lib/model/calibration.ts` - Calibration methods
- Currently supports: temperature scaling, isotonic regression, beta calibration

### Backtesting
- `src/lib/backtest/backtester.ts` - ROI calculation and bucket analysis
- `src/cli/commands/backtest.ts` - CLI options

### Results Documentation
- `data/experiments-nba-moneyline.md` - Record ALL experiments here

---

## Success Criteria

**BASELINE ALREADY MEETS CORE CRITERIA** ✅:
- [x] ROI > 0% on **2026 test season** (PRIMARY - train 2025): +9.94% ✅
- [x] ROI > 0% on at least one other test season: +4.54% on 2024 ✅
- [x] Sample size > 100 bets: 317 bets ✅
- [x] Results are deterministic: verified 2x ✅
- [x] ECE < 0.15: 0.1020 ✅
- [x] Documented with exact commands and results ✅

**For an experiment to BEAT baseline**, it must:
- [ ] Beat baseline by at least 3 percentage points on primary test (+9.94% → +12.94%+)
- [ ] Not regress on secondary/tertiary tests
- [ ] Results are deterministic (ran 2x, identical)
- [ ] Documented with exact commands and results

---

## Anti-Patterns (Avoid These)

### ❌ In-Sample Testing
Never train and test on the same season. This gives fake results.

### ❌ Cherry-Picking Results
If one season is profitable but another isn't, it's NOT a success.

### ❌ Tiny Sample Sizes
If a bucket has < 50 bets, its ROI is meaningless (high variance).

### ❌ Claiming Success Without Verification
Always run backtests twice to confirm determinism.

### ❌ Forgetting to Build
After code changes, ALWAYS run `npm run build` before testing.

### ❌ Reporting Single-Run Results
Always verify with a second run. Non-deterministic results indicate a bug.

---

## Current Experiments Status

Track your progress here:

| # | Change | Test 2026 ROI | Test 2025 ROI | Test 2024 ROI | Status |
|---|--------|---------------|---------------|---------------|--------|
| 0 | Baseline (2025→2026) | **+9.94%** ✅ | N/A | N/A | ✅ PROFITABLE |
| 0a | Baseline (2024→2025) | N/A | -12.55% | N/A | ❌ |
| 0b | Baseline (2023→2024) | N/A | N/A | +4.54% | ✅ |
| 1 | 60-80% bucket filter | -1.45% | N/A | N/A | ❌ FAILED (-11.39pp) |
| 2 | 0-20% bucket filter | +7.80% | N/A | N/A | ❌ WORSE (-2.14pp) |
| 3 | 90-100% bucket filter | +9.30% | N/A | N/A | ❌ WORSE (-0.64pp) |
| 4 | Rest advantage feature | +4.23% | N/A | N/A | ❌ FAILED (-5.71pp) |

**BASELINE ESTABLISHED (2026-01-15)**:
- Primary (2025→2026): **+9.94% ROI** at edge=7%, EV=0.5%, 317 bets ✅
- The model is ALREADY PROFITABLE! Goal is now to IMPROVE from +9.94% to +15%+

**EXPERIMENTS COMPLETED (2026-01-15)**:
- Bucket filtering: ALL configurations hurt performance (NHL strategies don't transfer to NBA)
- Rest advantage: HURT performance by -5.71pp (feature was REVERTED)
- **Current optimal: BASELINE configuration (no bucket filtering, 70 features)**

**Next experiments to try**:
1. ~~Bucket filtering~~ ❌ FAILED - Do not retry
2. ~~Rest advantage feature~~ ❌ FAILED - Do not retry
3. Kelly Criterion bet sizing (untested)
4. Recent form window adjustment (5 games vs 10 games)
5. Edge threshold optimization (try 5% or 10% instead of 7%)
6. Multi-season training (train 2024+2025, test 2026)

Add new experiments as you complete them.

---

## Commands Reference

```bash
# Build (ALWAYS after code changes)
npm run build

# ============ PRIMARY: Train 2025, Test 2026 (current season) ============
node dist/cli/index.js train nba --season 2025 --market moneyline --calibrate
node dist/cli/index.js backtest nba --season 2026 --market moneyline --show-buckets

# ============ SECONDARY: Train 2024, Test 2025 ============
node dist/cli/index.js train nba --season 2024 --market moneyline --calibrate
node dist/cli/index.js backtest nba --season 2025 --market moneyline --show-buckets

# ============ TERTIARY: Train 2023, Test 2024 ============
node dist/cli/index.js train nba --season 2023 --market moneyline --calibrate
node dist/cli/index.js backtest nba --season 2024 --market moneyline --show-buckets

# ============ Additional Options ============

# Backtest with specific model path
node dist/cli/index.js backtest nba --season 2026 --market moneyline \
  --model-path data/models/nba/moneyline-2025.json --show-buckets

# Backtest with bucket filtering (if buckets are profitable)
node dist/cli/index.js backtest nba --season 2026 --market moneyline \
  --buckets "60-80" --show-buckets

# Backtest with Kelly criterion
node dist/cli/index.js backtest nba --season 2026 --market moneyline \
  --bet-sizing kelly --starting-bankroll 10000 --show-buckets

# Train with additional options
node dist/cli/index.js train nba --season 2025 --market moneyline \
  --calibrate --walk-forward --tune grid

# View model details
cat data/models/nba/moneyline-2025.json | head -100

# ============ Data Refresh ============
# If you need to update with latest games:
npm run ingest:sports:json -- nba 2026
npm run import:nba:db -- 2026
```

---

## End Condition

Stop when ANY of these occur:
1. **IMPROVED**: Beat baseline (+9.94%) by 3+ percentage points with verified results
2. **10 EXPERIMENTS**: Completed 10 systematic experiments with no improvement over baseline
3. **CONFIRMED OPTIMAL**: After exhaustive testing, determined +9.94% baseline is optimal

**Note**: SUCCESS CRITERIA ALREADY MET! Baseline is profitable at +9.94% ROI.
The goal now is to either:
- Find an improvement over baseline (ideal)
- Confirm baseline is optimal after exhaustive testing (acceptable)

If stopping due to #2 or #3, document:
- What was tried
- Why it didn't beat baseline
- Conclusion: baseline is the optimal configuration
- Recommendation: deploy baseline model to production

---

## Remember

The goal is **PROFITABLE BETTING**, not high accuracy. A model with 55% accuracy and good calibration is worth more than 60% accuracy with poor calibration.

Focus on:
1. Finding probability buckets where the model actually works
2. Proper calibration so probabilities match reality
3. Edge detection (model probability vs market probability)
4. Risk management (avoiding high-variance bets)

Good luck! Document everything thoroughly.

---

## Ralph Loop Iteration Awareness

### First Iteration
If `data/experiments-nba-moneyline.md` shows only baseline experiments (0, 0a, 0b), you're starting fresh:
1. Verify baseline by running backtest commands
2. Confirm the **+9.94% ROI** baseline is accurate (train 2025 → test 2026)
3. Pick Experiment #5 or later from the prioritized list (1-4 are DONE)
4. Execute and document

### Subsequent Iterations
If experiments beyond baseline exist in the file:
1. Read `data/experiments-nba-moneyline.md` to see what's been tried
2. Analyze results - what worked? What didn't?
3. Pick the NEXT logical experiment based on learnings
4. Never repeat an experiment that's already documented
5. Build on what worked, avoid what failed

**CRITICAL**: Phase 1 experiments (bucket filtering, rest advantage) are COMPLETE and FAILED.
Do NOT retry these. Start from Phase 2 (experiment #5+).

### State Tracking
All state is tracked in files:
- `data/experiments-nba-moneyline.md` - Experiment history and results
- `data/models/nba/moneyline-*.json` - Trained models
- `src/models/features.ts` - Feature definitions (if modified)
- Git history - All code changes

### Per-Iteration Checklist
At the start of each iteration:
1. [ ] Read `data/experiments-nba-moneyline.md` to understand current state
2. [ ] Identify what experiment to run next
3. [ ] If previous experiment succeeded, consider if we've met success criteria
4. [ ] If success criteria met, output completion promise

At the end of each iteration:
1. [ ] Update `data/experiments-nba-moneyline.md` with results
2. [ ] Commit changes to git if experiment was successful
3. [ ] Assess if completion criteria are met
4. [ ] If complete, output: `<promise>NBA OPTIMIZATION COMPLETE</promise>`

---

## Completion Conditions

### ✅ BASELINE ALREADY SUCCESSFUL
The baseline configuration already meets success criteria:
- ROI > 0% on 2026 season: **+9.94%** ✅
- ROI > 0% on 2024 season: **+4.54%** ✅
- Results verified (ran 2x, identical) ✅

### Improved Over Baseline (Output Promise)
If you find a configuration that:
- Beats baseline by 3+ percentage points on 2026 test
- Doesn't regress on other test seasons
- Results verified (ran 2x, identical)

Then output:
```
<promise>NBA OPTIMIZATION COMPLETE</promise>
```

With documentation of the improved configuration.

### Exhausted Attempts - Baseline is Optimal (Output Promise)
If you've completed 10+ experiments and:
- No configuration beats baseline (+9.94%)
- All reasonable approaches have been tried
- Documented what was learned

Then output:
```
<promise>NBA OPTIMIZATION COMPLETE</promise>
```

With documentation concluding baseline is optimal.

### Continue Iterating (No Promise)
If fewer than 10 experiments completed and no improvement found yet:
- Don't output the promise
- Let Ralph Loop continue to next iteration
- Pick the next logical experiment from Phase 2+

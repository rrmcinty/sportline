# NCAAM Moneyline Model Optimization Prompt (Ralph Loop)

## Completion Promise
When the optimization goal is achieved OR you've exhausted all reasonable experiments, output:
```
<promise>NCAAM OPTIMIZATION COMPLETE</promise>
```

Success criteria for completion promise:
1. **SUCCESS**: Achieved ROI > 0% on 2026 (train 2025) AND validated approach is sound
2. **OR EXHAUSTED**: Completed 10+ systematic experiments with documented conclusions

---

## Mission
You are tasked with optimizing the NCAAM moneyline prediction model to **achieve positive ROI on out-of-sample testing**.

**Current State**: The model is UNPROFITABLE but shows promise!
- Primary (train 2025 → test 2026): **-1.17% ROI** (best threshold: 6% edge, 3% EV)
- Previous baselines were worse: -7.95% (2024→2025), -5.33% (2023→2024)

**Key Insight**: The 0-10% probability bucket has **+46.40% ROI** on 145 bets!
This suggests the model is good at finding value in heavy underdogs.

**Goal**: Improve from -1.17% to positive ROI, potentially by focusing on profitable buckets.

---

## Current State

### Latest Data Available
- **2026 Season (Current)**: 2,337 completed games (for testing)
- **2025 Season**: 5,554 completed games (for training)
- **2024 Season**: Full season available
- **2023 Season**: Full season available

### Baseline Performance (2025→2026)
| Metric | Value |
|--------|-------|
| **ROI** | **-1.17%** |
| **Win Rate** | 53.25% |
| **Total Bets** | 1,093 (at edge=6%, EV=3%) |
| **Training Size** | 5,554 games |
| **Calibration** | Beta |

### Bucket Breakdown (2025→2026) - KEY INSIGHT!
| Bucket | Games | Accuracy | ROI | Profit | Status |
|--------|-------|----------|-----|--------|--------|
| **0-10%** | 145 | 20.0% | **+46.40%** | $3,620 | ✅ **BEST** |
| 10-20% | 81 | 34.6% | -1.02% | $-57 | ❌ |
| 20-30% | 71 | 31.0% | -17.20% | $-946 | ❌ |
| 30-40% | 80 | 46.3% | -40.93% | $-2,497 | ❌ |
| 40-50% | 107 | 38.3% | -25.61% | $-2,330 | ❌ |
| 50-60% | 110 | 56.4% | -13.87% | $-1,304 | ❌ |
| 60-70% | 167 | 55.7% | -8.88% | $-1,181 | ❌ |
| 70-80% | 274 | 67.5% | -0.45% | $-90 | ⚠️ Near break-even |
| **80-90%** | 347 | 72.3% | **+1.33%** | $306 | ✅ Marginal |
| 90-100% | 955 | 89.4% | -0.91% | $-231 | ❌ |

**Key Finding**: Heavy underdog bets (0-10% model probability) are highly profitable!
The model is good at identifying when favorites are overvalued.

---

## Critical Verification Requirements

### ⚠️ OUT-OF-SAMPLE TESTING (NON-NEGOTIABLE)
```bash
# CORRECT: Train on one season, test on different season
node dist/cli/index.js train ncaam --seasons 2025 --market moneyline --calibrate beta
node dist/cli/index.js backtest ncaam --season 2026 --market moneyline --show-buckets

# WRONG: Training and testing on same data (IN-SAMPLE = FAKE RESULTS)
node dist/cli/index.js train ncaam --seasons 2026 --market moneyline
node dist/cli/index.js backtest ncaam --season 2026 --market moneyline  # ❌ INVALID
```

### ⚠️ ROI CALCULATION VERIFICATION
Before claiming ANY result, verify:
```
ROI = (total_profit / total_staked) × 100

Where:
- total_staked = number_of_bets × $100 (flat betting)
- total_profit = sum of all bet outcomes
```

### ⚠️ MULTI-SEASON VALIDATION
If an experiment shows positive ROI on 2026, also test on:
- Train 2024 → Test 2025
- Train 2023 → Test 2024

Success requires positive ROI on at least 2 test seasons.

---

## Workflow for Each Iteration

### Step 1: Establish/Verify Baseline (First iteration only)
```bash
# Build the project first
npm run build

# PRIMARY: Train 2025 model, test on 2026 (current season)
node dist/cli/index.js train ncaam --seasons 2025 --market moneyline --calibrate beta
node dist/cli/index.js backtest ncaam --season 2026 --market moneyline --show-buckets

# SECONDARY: Train 2024 model, test on 2025
node dist/cli/index.js train ncaam --seasons 2024 --market moneyline --calibrate beta
node dist/cli/index.js backtest ncaam --season 2025 --market moneyline --show-buckets
```

### Step 2: For Each Experiment
1. **State the hypothesis** - What change will improve the model and why?
2. **Make the change** - Modify code/config if needed
3. **Build** - `npm run build` (ALWAYS after code changes)
4. **Train** - Train new model with changes
5. **Test primary** - Backtest on 2026 season
6. **Verify determinism** - Run the SAME backtest again, confirm identical results
7. **Test validation** - Backtest on 2025 season (if primary looks good)
8. **Document** - Record results in `data/experiments-ncaam-moneyline.md`
9. **Evaluate** - Compare to baseline, decide if successful

---

## Experiment Ideas (Prioritized)

### Phase 1: Bucket Filtering (HIGHEST PRIORITY)
The bucket analysis shows clear winners. Try filtering to profitable buckets only.

1. **0-10% Bucket Only (Heavy Underdogs)**
   - Bucket ROI: +46.40% on 145 bets
   - Command: `--buckets "0-10"`
   - Hypothesis: Model is best at finding overvalued favorites

2. **0-10% + 80-90% Combined**
   - Both profitable buckets together
   - Command: `--buckets "0-10,80-90"`
   - More bets while staying profitable

3. **0-20% Range (Expanded Underdogs)**
   - Include marginal 10-20% bucket
   - Command: `--buckets "0-20"`
   - Test if slightly less extreme underdogs work

### Phase 2: Threshold Optimization
4. **Edge Threshold Optimization**
   - Current best: 6% edge
   - Try: 3%, 4%, 5%, 7%, 8%, 9%, 10%
   - Different thresholds may work better with bucket filtering

5. **EV Threshold Optimization**
   - Current best: 3% EV
   - Try: 1%, 2%, 4%, 5%

### Phase 3: Model Architecture
6. **Gradient Boosting**
   - May handle NCAAM's high variance better
   - Command: `--model-type gradient-boosting`

7. **Shallower Trees**
   - Reduce overfitting on noisy NCAAM data
   - Requires code modification

### Phase 4: Calibration Experiments
8. **Temperature Scaling**
   - Try: `--calibrate temperature`
   - May work better for extreme probabilities

9. **Isotonic Regression**
   - Try: `--calibrate isotonic`
   - More flexible calibration

### Phase 5: Feature Engineering
10. **Remove Line Movement Features**
    - Previous experiment showed this hurts (-14pp)
    - DON'T retry unless with bucket filtering

---

## Key Files to Modify

### Backtesting
- `src/cli/commands/backtest.ts` - CLI options including `--buckets`

### Training
- `src/models/trainNcaamMoneyline.ts` - Training logic

### Results Documentation
- `data/experiments-ncaam-moneyline.md` - Record ALL experiments here

---

## Success Criteria

**For an experiment to be SUCCESSFUL**, it must:
- [ ] ROI > 0% on 2026 test season (train 2025)
- [ ] ROI > 0% OR near break-even on 2025 test season (train 2024)
- [ ] Sample size > 50 bets
- [ ] Results are deterministic (ran 2x, identical)
- [ ] Documented with exact commands and results

**For the optimization to be COMPLETE**:
- Found a profitable configuration, OR
- Exhausted 10+ experiments and documented why NCAAM is unprofitable

---

## Anti-Patterns (Avoid These)

### ❌ In-Sample Testing
Never train and test on the same season.

### ❌ Tiny Sample Sizes
Buckets with < 30 bets have high variance. Be skeptical of extreme ROI.

### ❌ Ignoring the Bucket Analysis
The 0-10% bucket with +46.40% ROI is the most promising finding!

### ❌ Forgetting to Build
After code changes, ALWAYS run `npm run build` before testing.

---

## Current Experiments Status

Track your progress here:

| # | Change | Test 2026 ROI | Test 2025 ROI | Bets | Status |
|---|--------|---------------|---------------|------|--------|
| 0 | Baseline (2025→2026) | **-1.17%** | N/A | 1,093 | ❌ |
| 1 | 0-10% bucket only | TBD | TBD | ~145 | Pending |
| 2 | 0-10% + 80-90% buckets | TBD | TBD | ~492 | Pending |
| 3 | Edge optimization | TBD | TBD | TBD | Pending |

**Next experiments to try (in order)**:
1. 0-10% bucket filtering (highest priority - +46.40% ROI!)
2. Combined 0-10% + 80-90% bucket filtering
3. Threshold optimization with bucket filtering
4. Model architecture changes

---

## Commands Reference

```bash
# Build (ALWAYS after code changes)
npm run build

# ============ PRIMARY: Train 2025, Test 2026 ============
node dist/cli/index.js train ncaam --seasons 2025 --market moneyline --calibrate beta
node dist/cli/index.js backtest ncaam --season 2026 --market moneyline --show-buckets

# ============ With Bucket Filtering ============
# 0-10% only (heavy underdogs)
node dist/cli/index.js backtest ncaam --season 2026 --market moneyline \
  --model-path data/models/ncaam/moneyline-2025.json --buckets "0-10" --show-buckets

# 0-10% + 80-90% combined
node dist/cli/index.js backtest ncaam --season 2026 --market moneyline \
  --model-path data/models/ncaam/moneyline-2025.json --buckets "0-10,80-90" --show-buckets

# 0-20% expanded underdogs
node dist/cli/index.js backtest ncaam --season 2026 --market moneyline \
  --model-path data/models/ncaam/moneyline-2025.json --buckets "0-20" --show-buckets

# ============ SECONDARY: Train 2024, Test 2025 ============
node dist/cli/index.js train ncaam --seasons 2024 --market moneyline --calibrate beta
node dist/cli/index.js backtest ncaam --season 2025 --market moneyline --show-buckets

# ============ Custom Edge/EV Thresholds ============
node dist/cli/index.js backtest ncaam --season 2026 --market moneyline \
  --model-path data/models/ncaam/moneyline-2025.json \
  --edge-range "0.03,0.04,0.05,0.06,0.07,0.08" \
  --ev-range "0.01,0.02,0.03" --show-buckets

# ============ Model Architecture ============
# Gradient Boosting
node dist/cli/index.js train ncaam --seasons 2025 --market moneyline \
  --model-type gradient-boosting --learning-rate 0.1 --gb-max-depth 5
```

---

## End Condition

Stop when ANY of these occur:
1. **PROFITABLE**: Found configuration with ROI > 0% validated on multiple seasons
2. **10 EXPERIMENTS**: Completed 10 systematic experiments with no success
3. **CONFIRMED UNPROFITABLE**: Determined NCAAM cannot be made profitable with current features

If stopping due to #2 or #3, document:
- What was tried
- Why it didn't work
- The best configuration found (even if unprofitable)
- Recommendations for future improvement

---

## Ralph Loop Iteration Awareness

### First Iteration
1. Verify baseline by running backtest commands
2. Confirm the **-1.17% ROI** baseline and bucket breakdown
3. Start with Experiment #1: 0-10% bucket filtering
4. Document results

### Subsequent Iterations
1. Read `data/experiments-ncaam-moneyline.md` to see what's been tried
2. Analyze results - what worked? What didn't?
3. Pick the NEXT logical experiment
4. Never repeat an experiment that's already documented

### Per-Iteration Checklist
At the start of each iteration:
- [ ] Read experiments file to understand current state
- [ ] Identify what experiment to run next
- [ ] If previous experiment succeeded, validate on second season

At the end of each iteration:
- [ ] Update `data/experiments-ncaam-moneyline.md` with results
- [ ] Assess if completion criteria are met
- [ ] If complete, output: `<promise>NCAAM OPTIMIZATION COMPLETE</promise>`

---

## Key Differences from NBA Optimization

| Aspect | NBA | NCAAM |
|--------|-----|-------|
| Baseline ROI | +9.94% ✅ | -1.17% ❌ |
| Bucket filtering | Hurts performance | **May help!** |
| Best bucket | All buckets | **0-10% (+46% ROI)** |
| Strategy | Bet everything | **Filter to underdogs** |
| Training data | 1,231 games | 5,554 games |
| Test data | 473 games | 2,337 games |

**NCAAM requires a different approach than NBA!**
- NBA: Bet all probabilities
- NCAAM: Focus on specific profitable buckets (especially 0-10%)

---

## Remember

The goal is **PROFITABLE BETTING**, not high accuracy. NCAAM's 0-10% bucket has only 20% accuracy but +46% ROI because:
- Betting on heavy underdogs at plus-money odds
- When they win, the payout is huge
- The model is good at identifying when underdogs have hidden value

Focus on:
1. Finding the right bucket combinations
2. Optimizing thresholds for those buckets
3. Validating across multiple seasons

Good luck!

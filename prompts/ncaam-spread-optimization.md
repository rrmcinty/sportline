# NCAAM Spread Model Optimization Prompt (Ralph Loop)

## Completion Promise
When the optimization goal is achieved OR you've exhausted all reasonable experiments, output:
```
<promise>NCAAM SPREAD OPTIMIZATION COMPLETE</promise>
```

Success criteria for completion promise:
1. **SUCCESS**: Achieved ROI > 0% on 2026 (train 2025) AND validated on 2025 (train 2024)
2. **OR EXHAUSTED**: Completed 10+ systematic experiments with documented conclusions

---

## Mission
You are tasked with optimizing the NCAAM spread prediction model to **achieve positive ROI on out-of-sample testing**.

**Current State**: The model is UNPROFITABLE but shows promise!
- Primary (train 2025 → test 2026): **-3.12% ROI** (962 bets, edge=3%, EV=3%)
- Win Rate: 46.05%

**Key Insight**: The 40-50% probability bucket has **+28.71% ROI** on 190 bets!
This suggests the model finds value in certain underdog spread bets.

**Goal**: Improve from -3.12% to positive ROI, potentially by focusing on profitable buckets.

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
| **ROI** | **-3.12%** |
| **Win Rate** | 46.05% |
| **Total Bets** | 962 (at edge=3%, EV=3%) |
| **Training Size** | 5,554 games |
| **Calibration** | Beta |

### Bucket Breakdown (2025→2026) - KEY INSIGHT!
| Bucket | Games | Accuracy | ROI | Profit | Status |
|--------|-------|----------|-----|--------|--------|
| 0-10% | 4 | 100.0% | -100.00% | $-400 | Tiny sample |
| 30-40% | 2 | 100.0% | -100.00% | $-200 | Tiny sample |
| **40-50%** | 190 | 39.5% | **+28.71%** | $4,680 | **PROMISING** |
| 50-60% | 2,141 | 50.5% | -7.27% | $-11,647 | Main volume, bad |

**Key Finding**: The 40-50% bucket (underdog spreads) is highly profitable!
Most volume is in 50-60% which loses money.

---

## Critical Verification Requirements

### ⚠️ OUT-OF-SAMPLE TESTING (NON-NEGOTIABLE)
```bash
# CORRECT: Train on one season, test on different season
node dist/cli/index.js train ncaam --seasons 2025 --market spread --calibrate beta
node dist/cli/index.js backtest ncaam --season 2026 --market spread --model-path data/models/ncaam/spread-2025.json --show-buckets

# WRONG: Training and testing on same data (IN-SAMPLE = FAKE RESULTS)
node dist/cli/index.js train ncaam --seasons 2026 --market spread
node dist/cli/index.js backtest ncaam --season 2026 --market spread  # ❌ INVALID
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

# PRIMARY: Train 2025 model, test on 2026
node dist/cli/index.js train ncaam --seasons 2025 --market spread --calibrate beta
node dist/cli/index.js backtest ncaam --season 2026 --market spread --model-path data/models/ncaam/spread-2025.json --show-buckets

# SECONDARY: Train 2024 model, test on 2025
node dist/cli/index.js train ncaam --seasons 2024 --market spread --calibrate beta
node dist/cli/index.js backtest ncaam --season 2025 --market spread --model-path data/models/ncaam/spread-2024.json --show-buckets
```

### Step 2: For Each Experiment
1. **State the hypothesis** - What change will improve the model and why?
2. **Make the change** - Modify code/config if needed
3. **Build** - `npm run build` (ALWAYS after code changes)
4. **Train** - Train new model with changes
5. **Test primary** - Backtest on 2026 season
6. **Verify determinism** - Run the SAME backtest again, confirm identical results
7. **Test validation** - Backtest on 2025 season (if primary looks good)
8. **Document** - Record results in `data/experiments-ncaam-spread.md`
9. **Evaluate** - Compare to baseline, decide if successful

---

## Experiment Ideas (Prioritized)

### Phase 1: Bucket Filtering (HIGHEST PRIORITY)
The bucket analysis shows a clear winner!

1. **40-50% Bucket Only**
   - Bucket ROI: +28.71% on 190 bets
   - Command: `--buckets "40-50"`
   - Hypothesis: Model finds value in underdog spreads

2. **30-50% Range**
   - Expand to include 30-40% bucket
   - Command: `--buckets "30-50"`
   - More bets if 30-40% is also profitable on validation

3. **40-60% Range**
   - Include marginal 50-60% bucket
   - Command: `--buckets "40-60"`
   - Test if wider range works

### Phase 2: Threshold Optimization
4. **Edge Threshold Sweep**
   - Current: 3% edge
   - Try: 1%, 2%, 4%, 5%, 6%, 7%, 8%
   - Different thresholds may work better with bucket filtering

5. **EV Threshold Sweep**
   - Current: 3% EV
   - Try: 1%, 2%, 4%, 5%

### Phase 3: Calibration
6. **Temperature Scaling**
   - Try: `--calibrate temperature`
   - May work better for spread predictions

7. **No Calibration**
   - Try: raw probabilities
   - Calibration may be hurting performance

### Phase 4: Model Architecture
8. **Gradient Boosting**
   - May handle NCAAM's high variance better
   - Command: `--model-type gradient-boosting`

---

## Key Files to Modify

### Backtesting
- `src/cli/commands/backtest.ts` - CLI options including `--buckets`

### Training
- `src/models/trainSpread.ts` - Spread training logic

### Results Documentation
- `data/experiments-ncaam-spread.md` - Record ALL experiments here

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
- Exhausted 10+ experiments and documented why NCAAM spreads are unprofitable

---

## Commands Reference

```bash
# Build (ALWAYS after code changes)
npm run build

# ============ PRIMARY: Train 2025, Test 2026 ============
node dist/cli/index.js train ncaam --seasons 2025 --market spread --calibrate beta
node dist/cli/index.js backtest ncaam --season 2026 --market spread \
  --model-path data/models/ncaam/spread-2025.json --show-buckets

# ============ With Bucket Filtering ============
# 40-50% only (underdog spreads)
node dist/cli/index.js backtest ncaam --season 2026 --market spread \
  --model-path data/models/ncaam/spread-2025.json --buckets "40-50" --show-buckets

# 30-50% range
node dist/cli/index.js backtest ncaam --season 2026 --market spread \
  --model-path data/models/ncaam/spread-2025.json --buckets "30-50" --show-buckets

# ============ SECONDARY: Train 2024, Test 2025 ============
node dist/cli/index.js train ncaam --seasons 2024 --market spread --calibrate beta
node dist/cli/index.js backtest ncaam --season 2025 --market spread \
  --model-path data/models/ncaam/spread-2024.json --show-buckets

# ============ Different Calibration ============
node dist/cli/index.js train ncaam --seasons 2025 --market spread --calibrate temperature

# ============ Gradient Boosting ============
node dist/cli/index.js train ncaam --seasons 2025 --market spread \
  --model-type gradient-boosting --learning-rate 0.1 --gb-max-depth 5
```

---

## Current Experiments Status

| # | Change | Test 2026 ROI | Test 2025 ROI | Bets | Status |
|---|--------|---------------|---------------|------|--------|
| 0 | Baseline (2025→2026) | **-3.12%** | TBD | 962 | Baseline |
| 1 | 40-50% bucket only | TBD | TBD | ~190 | Pending |
| 2 | 30-50% bucket range | TBD | TBD | TBD | Pending |
| 3 | Threshold optimization | TBD | TBD | TBD | Pending |

---

## Spread-Specific Considerations

### How Spread Betting Works in NCAAM
- **High variance**: 350+ teams with huge talent gaps
- **Large spreads**: Common to see -20 to -30 point spreads
- **Push handling**: Bets where adjusted_margin == 0 are excluded
- **Standard odds**: Usually -110 on both sides

### Key Insight
The 40-50% bucket (+28.71% ROI) represents games where:
- Model gives underdog ~40-50% chance to cover
- These are often large spread games
- Favorites may be overvalued by the market

### NCAAM vs NBA Spreads
| Aspect | NBA | NCAAM |
|--------|-----|-------|
| Baseline ROI | +4.89% | -3.12% |
| Best bucket | 60-70% | **40-50%** |
| Strategy | Slight favorites | **Underdogs** |
| Variance | Low | High |

**NCAAM spreads may require opposite strategy from NBA!**

---

## End Condition

Stop when ANY of these occur:
1. **PROFITABLE**: Found configuration with ROI > 0% validated on multiple seasons
2. **10 EXPERIMENTS**: Completed 10 systematic experiments with no success
3. **CONFIRMED UNPROFITABLE**: Determined NCAAM spreads cannot be made profitable

If stopping due to #2 or #3, document:
- What was tried
- Why it didn't work
- The best configuration found (even if unprofitable)
- Recommendations for future improvement

---

## Remember

The goal is **PROFITABLE BETTING**, not high accuracy. NCAAM's 40-50% bucket has only 39.5% accuracy but +28.71% ROI because:
- Betting on underdogs to cover
- Large spreads mean high payouts when underdogs cover
- Market may overvalue favorites

Focus on:
1. Testing the 40-50% bucket first (highest priority!)
2. Finding the right threshold combinations
3. Validating across multiple seasons

Good luck!

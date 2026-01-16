# NBA Spread Model Optimization Prompt (Ralph Loop)

## Completion Promise
When the optimization goal is achieved OR you've exhausted all reasonable experiments, output:
```
<promise>NBA SPREAD OPTIMIZATION COMPLETE</promise>
```

Success criteria for completion promise:
1. **SUCCESS**: Achieved ROI > 5% on 2026 (train 2025) AND validated on 2025 (train 2024)
2. **OR EXHAUSTED**: Completed 10+ systematic experiments with documented conclusions

---

## Mission
You are tasked with optimizing the NBA spread prediction model to **maximize ROI while maintaining validation across seasons**.

**Current State**: The model is ALREADY PROFITABLE!
- Primary (train 2025 → test 2026): **+4.89% ROI** (213 bets, edge=8%, EV=0.5%)
- Win Rate: 54.93%

**Goal**: Improve from +4.89% to +7%+ ROI, OR confirm current configuration is optimal.

---

## Current State

### Latest Data Available
- **2026 Season (Current)**: 473 completed games (for testing)
- **2025 Season**: 1,231 completed games (for training)
- **2024 Season**: Full season available
- **2023 Season**: Full season available

### Baseline Performance (2025→2026)
| Metric | Value |
|--------|-------|
| **ROI** | **+4.89%** |
| **Win Rate** | 54.93% |
| **Total Bets** | 213 (at edge=8%, EV=0.5%) |
| **Training Size** | 1,231 games |
| **Calibration** | Beta |

### Bucket Breakdown (2025→2026)
| Bucket | Games | Accuracy | ROI | Profit | Status |
|--------|-------|----------|-----|--------|--------|
| 10-20% | 10 | 30.0% | +88.93% | $178 | Tiny sample |
| 50-60% | 106 | 51.9% | -12.96% | $-713 | Bad |
| **60-70%** | 339 | 51.6% | **+3.50%** | $612 | Main volume |
| 70-80% | 7 | 42.9% | +27.40% | $82 | Tiny sample |

**Key Finding**: Most bets are in 60-70% bucket with marginal profit.

---

## Critical Verification Requirements

### ⚠️ OUT-OF-SAMPLE TESTING (NON-NEGOTIABLE)
```bash
# CORRECT: Train on one season, test on different season
node dist/cli/index.js train nba --seasons 2025 --market spread --calibrate beta
node dist/cli/index.js backtest nba --season 2026 --market spread --model-path data/models/nba/spread-2025.json --show-buckets

# WRONG: Training and testing on same data (IN-SAMPLE = FAKE RESULTS)
node dist/cli/index.js train nba --seasons 2026 --market spread
node dist/cli/index.js backtest nba --season 2026 --market spread  # ❌ INVALID
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
node dist/cli/index.js train nba --seasons 2025 --market spread --calibrate beta
node dist/cli/index.js backtest nba --season 2026 --market spread --model-path data/models/nba/spread-2025.json --show-buckets

# SECONDARY: Train 2024 model, test on 2025
node dist/cli/index.js train nba --seasons 2024 --market spread --calibrate beta
node dist/cli/index.js backtest nba --season 2025 --market spread --model-path data/models/nba/spread-2024.json --show-buckets
```

### Step 2: For Each Experiment
1. **State the hypothesis** - What change will improve the model and why?
2. **Make the change** - Modify code/config if needed
3. **Build** - `npm run build` (ALWAYS after code changes)
4. **Train** - Train new model with changes
5. **Test primary** - Backtest on 2026 season
6. **Verify determinism** - Run the SAME backtest again, confirm identical results
7. **Test validation** - Backtest on 2025 season (if primary looks good)
8. **Document** - Record results in `data/experiments-nba-spread.md`
9. **Evaluate** - Compare to baseline, decide if successful

---

## Experiment Ideas (Prioritized)

### Phase 1: Threshold Optimization
1. **Edge Threshold Sweep**
   - Current: 8% edge
   - Try: 5%, 6%, 7%, 9%, 10%
   - Find optimal edge for spread betting

2. **EV Threshold Sweep**
   - Current: 0.5% EV
   - Try: 1%, 2%, 3%
   - Spreads may need different EV than moneyline

### Phase 2: Bucket Filtering
3. **60-70% Bucket Only**
   - This bucket has most volume and +3.50% ROI
   - Command: `--buckets "60-70"`

4. **50-70% Range**
   - Capture more bets
   - Command: `--buckets "50-70"`

### Phase 3: Calibration
5. **Temperature Scaling**
   - Try: `--calibrate temperature`
   - May work better for spread predictions

6. **Isotonic Regression**
   - Try: `--calibrate isotonic`
   - More flexible calibration

### Phase 4: Model Architecture
7. **Gradient Boosting**
   - May handle spread predictions better
   - Command: `--model-type gradient-boosting`

8. **Shallower Trees**
   - Reduce overfitting
   - Modify tree depth in training code

---

## Key Files to Modify

### Backtesting
- `src/cli/commands/backtest.ts` - CLI options including `--buckets`

### Training
- `src/models/trainSpread.ts` - Spread training logic

### Results Documentation
- `data/experiments-nba-spread.md` - Record ALL experiments here

---

## Success Criteria

**For an experiment to be SUCCESSFUL**, it must:
- [ ] ROI > 5% on 2026 test season (train 2025)
- [ ] ROI > 0% on 2025 test season (train 2024)
- [ ] Sample size > 50 bets
- [ ] Results are deterministic (ran 2x, identical)
- [ ] Documented with exact commands and results

**For the optimization to be COMPLETE**:
- Found a configuration with ROI > 5% validated on multiple seasons, OR
- Exhausted 10+ experiments and confirmed +4.89% is optimal

---

## Commands Reference

```bash
# Build (ALWAYS after code changes)
npm run build

# ============ PRIMARY: Train 2025, Test 2026 ============
node dist/cli/index.js train nba --seasons 2025 --market spread --calibrate beta
node dist/cli/index.js backtest nba --season 2026 --market spread \
  --model-path data/models/nba/spread-2025.json --show-buckets

# ============ With Bucket Filtering ============
node dist/cli/index.js backtest nba --season 2026 --market spread \
  --model-path data/models/nba/spread-2025.json --buckets "60-70" --show-buckets

# ============ SECONDARY: Train 2024, Test 2025 ============
node dist/cli/index.js train nba --seasons 2024 --market spread --calibrate beta
node dist/cli/index.js backtest nba --season 2025 --market spread \
  --model-path data/models/nba/spread-2024.json --show-buckets

# ============ Different Calibration ============
node dist/cli/index.js train nba --seasons 2025 --market spread --calibrate temperature
node dist/cli/index.js train nba --seasons 2025 --market spread --calibrate isotonic

# ============ Gradient Boosting ============
node dist/cli/index.js train nba --seasons 2025 --market spread \
  --model-type gradient-boosting --learning-rate 0.1 --gb-max-depth 5
```

---

## Current Experiments Status

| # | Change | Test 2026 ROI | Test 2025 ROI | Bets | Status |
|---|--------|---------------|---------------|------|--------|
| 0 | Baseline (2025→2026) | **+4.89%** | TBD | 213 | Baseline |
| 1 | Validate on 2025 | TBD | TBD | TBD | Pending |
| 2 | Edge optimization | TBD | TBD | TBD | Pending |
| 3 | Bucket filtering | TBD | TBD | TBD | Pending |

---

## Spread-Specific Considerations

### How Spread Betting Differs from Moneyline
- **Spread grading**: Home team covers if `(home_score - away_score) + spread > 0`
- **Pushes excluded**: Bets where `adjusted_margin == 0` are excluded
- **Standard odds**: Usually -110 on both sides (4.55% vig)
- **Lower variance**: Most games are close to 50/50

### Key Insight
Spread betting typically has:
- Lower ROI potential than moneyline (markets are more efficient)
- Higher bet volume (more games have value)
- More consistent returns (less variance)

The +4.89% baseline is quite good for spread betting!

---

## End Condition

Stop when ANY of these occur:
1. **IMPROVED**: Found configuration with ROI > 5% validated on multiple seasons
2. **CONFIRMED OPTIMAL**: Validated +4.89% is optimal after 10+ experiments
3. **10 EXPERIMENTS**: Completed 10 systematic experiments

---

## Remember

The goal is **PROFITABLE BETTING**, not high accuracy. For spreads:
- 52.4% accuracy is break-even (at -110 odds)
- Current 54.93% accuracy = profitable
- Focus on finding optimal thresholds and validation

Good luck!

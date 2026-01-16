# NHL Spread (Puck Line) Model Optimization Prompt (Ralph Loop)

## Completion Promise
When the optimization goal is achieved OR you've exhausted all reasonable experiments, output:
```
<promise>NHL SPREAD OPTIMIZATION COMPLETE</promise>
```

Success criteria for completion promise:
1. **SUCCESS**: Achieved ROI > 5% on 2026 (train 2025) AND validated on 2025 (train 2024)
2. **OR EXHAUSTED**: Completed 10+ systematic experiments with documented conclusions

---

## Mission
You are tasked with optimizing the NHL spread (puck line) prediction model to **maximize ROI while maintaining validation across seasons**.

**Current State**: The model is ALREADY PROFITABLE!
- Primary (train 2025 → test 2026): **+7.87% ROI** (388 bets, edge=8%, EV=0.5%)
- Win Rate: 46.65%

**Key Insight**: The 20-30% bucket has **+18.10% ROI** on 123 bets!
This suggests the model is good at identifying underdog puck line value.

**Goal**: Validate on 2nd season, potentially improve to +10%+, OR confirm optimal.

---

## Current State

### Latest Data Available
- **2026 Season (Current)**: 565 completed games (for testing)
- **2025 Season**: 1,159 completed games (for training)
- **2024 Season**: Full season available
- **2023 Season**: Full season available

### Baseline Performance (2025→2026)
| Metric | Value |
|--------|-------|
| **ROI** | **+7.87%** |
| **Win Rate** | 46.65% |
| **Total Bets** | 388 (at edge=8%, EV=0.5%) |
| **Training Size** | 1,159 games |
| **Calibration** | Temperature |

### Bucket Breakdown (2025→2026) - KEY INSIGHT!
| Bucket | Games | Accuracy | ROI | Profit | Status |
|--------|-------|----------|-----|--------|--------|
| 10-20% | 17 | 17.6% | +16.38% | $246 | Small sample |
| **20-30%** | 123 | 27.6% | **+18.10%** | $1,864 | **BEST** |
| 30-40% | 48 | 41.7% | -16.64% | $-682 | Bad |
| 40-50% | 186 | 52.2% | -3.25% | $-566 | Near break-even |
| 50-60% | 87 | 56.3% | -17.02% | $-1,310 | Bad |
| 60-70% | 104 | 64.4% | -10.87% | $-968 | Bad |

**Key Finding**: Underdog puck lines (10-30% buckets) are highly profitable!
The model is good at identifying when favorites won't cover -1.5.

---

## Critical Verification Requirements

### ⚠️ OUT-OF-SAMPLE TESTING (NON-NEGOTIABLE)
```bash
# CORRECT: Train on one season, test on different season
node dist/cli/index.js train nhl --seasons 2025 --market spread --calibrate temperature
node dist/cli/index.js backtest nhl --season 2026 --market spread --model-path data/models/nhl/spread-2025.json --show-buckets

# WRONG: Training and testing on same data (IN-SAMPLE = FAKE RESULTS)
node dist/cli/index.js train nhl --seasons 2026 --market spread
node dist/cli/index.js backtest nhl --season 2026 --market spread  # ❌ INVALID
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
node dist/cli/index.js train nhl --seasons 2025 --market spread --calibrate temperature
node dist/cli/index.js backtest nhl --season 2026 --market spread --model-path data/models/nhl/spread-2025.json --show-buckets

# SECONDARY: Train 2024 model, test on 2025
node dist/cli/index.js train nhl --seasons 2024 --market spread --calibrate temperature
node dist/cli/index.js backtest nhl --season 2025 --market spread --model-path data/models/nhl/spread-2024.json --show-buckets
```

### Step 2: For Each Experiment
1. **State the hypothesis** - What change will improve the model and why?
2. **Make the change** - Modify code/config if needed
3. **Build** - `npm run build` (ALWAYS after code changes)
4. **Train** - Train new model with changes
5. **Test primary** - Backtest on 2026 season
6. **Verify determinism** - Run the SAME backtest again, confirm identical results
7. **Test validation** - Backtest on 2025 season (if primary looks good)
8. **Document** - Record results in `data/experiments-nhl-spread.md`
9. **Evaluate** - Compare to baseline, decide if successful

---

## Experiment Ideas (Prioritized)

### Phase 1: Validation (HIGHEST PRIORITY)
First, validate the +7.87% baseline on a second season!

1. **Validate on 2025 Season**
   - Train 2024 → Test 2025
   - Must show positive ROI to confirm model works

### Phase 2: Bucket Filtering
2. **20-30% Bucket Only**
   - Bucket ROI: +18.10% on 123 bets
   - Command: `--buckets "20-30"`
   - Focus on best performing bucket

3. **10-30% Range (All Underdogs)**
   - Both profitable buckets together
   - Command: `--buckets "10-30"`
   - More bets while staying in profitable zone

4. **10-40% Range**
   - Wider range to test
   - Command: `--buckets "10-40"`

### Phase 3: Threshold Optimization
5. **Edge Threshold Sweep**
   - Current: 8% edge
   - Try: 5%, 6%, 7%, 9%, 10%
   - Find optimal edge with bucket filtering

6. **EV Threshold Sweep**
   - Current: 0.5% EV
   - Try: 1%, 2%, 3%

### Phase 4: Calibration
7. **Beta Calibration**
   - Current uses temperature
   - Try: `--calibrate beta`
   - May work better for puck lines

8. **Isotonic Regression**
   - Try: `--calibrate isotonic`
   - More flexible calibration

---

## Key Files to Modify

### Backtesting
- `src/cli/commands/backtest.ts` - CLI options including `--buckets`

### Training
- `src/models/trainSpread.ts` - Spread training logic

### Results Documentation
- `data/experiments-nhl-spread.md` - Record ALL experiments here

---

## Success Criteria

**For an experiment to be SUCCESSFUL**, it must:
- [ ] ROI > 5% on 2026 test season (train 2025)
- [ ] ROI > 0% on 2025 test season (train 2024)
- [ ] Sample size > 50 bets
- [ ] Results are deterministic (ran 2x, identical)
- [ ] Documented with exact commands and results

**For the optimization to be COMPLETE**:
- Validated +7.87% baseline on multiple seasons, OR
- Found improved configuration with higher ROI, OR
- Exhausted 10+ experiments

---

## Commands Reference

```bash
# Build (ALWAYS after code changes)
npm run build

# ============ PRIMARY: Train 2025, Test 2026 ============
node dist/cli/index.js train nhl --seasons 2025 --market spread --calibrate temperature
node dist/cli/index.js backtest nhl --season 2026 --market spread \
  --model-path data/models/nhl/spread-2025.json --show-buckets

# ============ With Bucket Filtering ============
# 20-30% only (best bucket)
node dist/cli/index.js backtest nhl --season 2026 --market spread \
  --model-path data/models/nhl/spread-2025.json --buckets "20-30" --show-buckets

# 10-30% range (all underdogs)
node dist/cli/index.js backtest nhl --season 2026 --market spread \
  --model-path data/models/nhl/spread-2025.json --buckets "10-30" --show-buckets

# ============ SECONDARY: Train 2024, Test 2025 ============
node dist/cli/index.js train nhl --seasons 2024 --market spread --calibrate temperature
node dist/cli/index.js backtest nhl --season 2025 --market spread \
  --model-path data/models/nhl/spread-2024.json --show-buckets

# ============ Different Calibration ============
node dist/cli/index.js train nhl --seasons 2025 --market spread --calibrate beta
node dist/cli/index.js train nhl --seasons 2025 --market spread --calibrate isotonic

# ============ Gradient Boosting ============
node dist/cli/index.js train nhl --seasons 2025 --market spread \
  --model-type gradient-boosting --learning-rate 0.1 --gb-max-depth 5
```

---

## Current Experiments Status

| # | Change | Test 2026 ROI | Test 2025 ROI | Bets | Status |
|---|--------|---------------|---------------|------|--------|
| 0 | Baseline (2025→2026) | **+7.87%** | TBD | 388 | Baseline |
| 1 | Validate on 2025 | TBD | TBD | TBD | **HIGHEST PRIORITY** |
| 2 | 20-30% bucket only | TBD | TBD | ~123 | Pending |
| 3 | 10-30% bucket range | TBD | TBD | ~140 | Pending |

---

## NHL Puck Line Specifics

### How Puck Lines Work
- **Standard puck line**: -1.5 for favorites, +1.5 for underdogs
- **Higher odds**: Underdogs at +1.5 get ~-200, favorites at -1.5 get ~+150
- **Low scoring**: Hockey games are often 2-3 goal affairs
- **One-goal games**: Very common, making -1.5 risky

### Key Insight
The 20-30% bucket (+18.10% ROI) represents games where:
- Model gives underdog 20-30% chance to cover +1.5
- In reality, underdogs cover more often than expected
- One-goal losses still cover for the underdog!

### NHL Spread vs NHL Moneyline
| Aspect | NHL Moneyline | NHL Spread |
|--------|---------------|------------|
| Baseline ROI | +13.40% | +7.87% |
| Best bucket | 60-80% (favorites) | **20-30% (underdogs)** |
| Strategy | Bet favorites | **Bet underdogs** |
| Win Rate | 56.71% | 46.65% |

**Interesting**: Moneyline favors favorites, puck line favors underdogs!

---

## End Condition

Stop when ANY of these occur:
1. **VALIDATED**: Confirmed +7.87% ROI on multiple seasons
2. **IMPROVED**: Found configuration with ROI > 10%
3. **10 EXPERIMENTS**: Completed 10 systematic experiments

---

## Remember

The goal is **PROFITABLE BETTING**, not high accuracy. NHL puck line's 20-30% bucket has only 27.6% accuracy but +18.10% ROI because:
- Betting on underdogs to cover +1.5
- One-goal losses = still covers!
- Puck line odds favor underdog bets
- Market may undervalue underdogs' ability to keep games close

Focus on:
1. First, validate baseline on 2025 season (critical!)
2. Test bucket filtering to isolate profitable ranges
3. Optimize thresholds for underdog-focused strategy

Good luck!

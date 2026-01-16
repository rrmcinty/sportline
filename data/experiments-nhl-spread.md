# NHL Spread (Puck Line) Optimization Experiments

**Goal:** Validate +7.87% ROI baseline on multiple seasons OR improve to +10%+

**Protocol:** Following "Iterative Model Improvement Protocol" in CLAUDE.md

## Current Experiments Status (Updated 2026-01-16)

| # | Date | Change | Test 2026 ROI | Test 2025 ROI | Bets | Status |
|---|------|--------|---------------|---------------|------|--------|
| 0 | 2026-01-16 | Baseline (2025→2026) | **+7.87%** | N/A | 388 | Baseline |
| 1 | 2026-01-16 | Validate on 2025 (2024→2025) | N/A | **-29.43%** | 341 | **FAILED** |
| 2 | 2026-01-16 | 20-30% bucket only (2026) | **+22.92%** | N/A | 88 | Bucket works on 2026 |
| 3 | 2026-01-16 | 20-30% bucket (2025) | N/A | **-50.74%** | 199 | **FAILED** |
| 4 | 2026-01-16 | Train 2023 → Test 2024 | N/A | **-12.96%** | 737 | **FAILED** |
| 5 | 2026-01-16 | Retrain with isotonic | **-0.77%** | N/A | 355 | Model variance issue |
| 6 | 2026-01-16 | Multi-season (2024+2025) | N/A | N/A | N/A | Not supported for spread |
| 7 | 2026-01-16 | Gradient boosting | **-2.61%** | N/A | 415 | **FAILED** |
| 8 | 2026-01-16 | Beta calibration explicit | **-0.77%** | N/A | 355 | Near break-even |
| 9 | 2026-01-16 | 10-30% bucket filter | **+22.94%** | **-50.49%** | 122/200 | **FAILED VALIDATION** |
| 10 | 2026-01-16 | Final analysis | - | - | - | **COMPLETE** |

---

## Critical Finding: NHL SPREAD MODELS DO NOT VALIDATE

**The +7.87% ROI on 2026 DOES NOT replicate on other seasons.**

| Season Pair | ROI | Conclusion |
|-------------|-----|------------|
| 2025 → 2026 | **+7.87%** | Only profitable pair |
| 2024 → 2025 | **-29.43%** | Catastrophic failure |
| 2023 → 2024 | **-12.96%** | Also fails |

**This suggests the 2025→2026 profitability is likely noise/luck, not a systematic edge.**

---

## Baseline Performance (Experiment #0)

### Configuration
- **Model:** Random Forest (100 trees)
- **Features:** 64 features (hockey stats + line movement)
- **Calibration:** Temperature scaling
- **Training:** 1,159 games from 2025 season

### Test: Train 2025 → Test 2026
```bash
node dist/cli/index.js backtest nhl --season 2026 --market spread --model-path data/models/nhl/spread-2025.json --show-buckets
```
- **ROI:** +7.87%
- **Win Rate:** 46.65%
- **Total Bets:** 388 (at edge=8%, EV=0.5%)
- **Verified:** ✓✓

### Bucket Breakdown (2025→2026)
| Bucket | Games | Accuracy | ROI | Profit | Status |
|--------|-------|----------|-----|--------|--------|
| 10-20% | 17 | 17.6% | +16.38% | $246 | Small sample |
| **20-30%** | 123 | 27.6% | **+18.10%** | $1,864 | **BEST** |
| 30-40% | 48 | 41.7% | -16.64% | $-682 | Bad |
| 40-50% | 186 | 52.2% | -3.25% | $-566 | Near break-even |
| 50-60% | 87 | 56.3% | -17.02% | $-1,310 | Bad |
| 60-70% | 104 | 64.4% | -10.87% | $-968 | Bad |

---

## Experiment #1: Validation on 2025 Season

**Date:** 2026-01-16
**Hypothesis:** The +7.87% ROI should replicate on 2024→2025 test.

### Command
```bash
node dist/cli/index.js backtest nhl --season 2025 --market spread --model-path data/models/nhl/spread-2024.json --show-buckets
```

### Results
- **ROI:** -29.43%
- **Win Rate:** 31.96%
- **Total Bets:** 341
- **All buckets negative** (worst: 70-80% at -54.21%)

### Conclusion
- **Status:** **FAILED VALIDATION**
- **The model DOES NOT generalize across seasons**
- The bucket pattern is completely inverted from 2026

---

## Experiment #2: 20-30% Bucket Filtering (2026)

**Date:** 2026-01-16
**Hypothesis:** Filtering to the best bucket may improve ROI on 2026.

### Command
```bash
node dist/cli/index.js backtest nhl --season 2026 --market spread --model-path data/models/nhl/spread-2025.json --buckets "20-30" --show-buckets
```

### Results
- **ROI:** +22.92%
- **Win Rate:** 64.77%
- **Total Bets:** 88 (at edge=7%, EV=0.5%)

### Conclusion
- Higher ROI with bucket filtering, but very small sample (88 bets)
- Still needs validation on 2025 season

---

## Experiment #3: 20-30% Bucket Validation on 2025

**Date:** 2026-01-16
**Hypothesis:** The 20-30% bucket should also work on 2025.

### Command
```bash
node dist/cli/index.js backtest nhl --season 2025 --market spread --model-path data/models/nhl/spread-2024.json --buckets "20-30" --show-buckets
```

### Results
- **ROI:** -50.74%
- **Win Rate:** 28.64%
- **Total Bets:** 199

### Conclusion
- **Status:** **CATASTROPHIC FAILURE**
- The same bucket that has +18% on 2026 has -42% on 2025
- This is strong evidence the 2026 results are noise

---

## Experiment #4: Third Season Test (2023→2024)

**Date:** 2026-01-16
**Hypothesis:** Maybe 2024→2025 was an anomaly; test another season pair.

### Commands
```bash
node dist/cli/index.js train nhl --seasons 2023 --market spread --calibrate temperature
node dist/cli/index.js backtest nhl --season 2024 --market spread --model-path data/models/nhl/spread-2023.json --show-buckets
```

### Results
- **ROI:** -12.96%
- **Win Rate:** 33.79%
- **Total Bets:** 737
- Only 30-40% bucket near break-even (+0.52%)

### Conclusion
- **Status:** **FAILED**
- Third season pair also loses money
- Pattern: Only 2025→2026 is profitable

---

## Experiment #5: Model Variance Check

**Date:** 2026-01-16
**Observation:** Retraining the model gives different results.

### Original 2025 Model
- **2026 ROI:** +7.87%

### Retrained 2025 Model (with isotonic flag)
- **2026 ROI:** -0.77%

### Conclusion
- Model results vary significantly with different calibration/training runs
- This indicates the "edge" is not stable
- Random seed and calibration method dramatically affect outcome

---

## Key Findings

### What We Learned

1. **NHL spread models DO NOT validate across seasons**
   - 2025→2026: +7.87% ✅ (only profitable pair)
   - 2024→2025: -29.43% ❌
   - 2023→2024: -12.96% ❌

2. **Bucket profitability is season-specific**
   - 20-30% bucket on 2026: +18.10%
   - 20-30% bucket on 2025: -41.80%
   - Complete inversion between seasons

3. **Model has high variance**
   - Same training data can produce +7.87% or -0.77% depending on run
   - This suggests overfitting, not genuine edge

4. **Puck line betting is fundamentally hard**
   - 1.5 goal spread is very binary in hockey
   - Either the game is a blowout or it's close
   - Difficult to predict consistently

### Why NHL Spread Fails

1. **Low scoring sport** - Most games are 2-4 goals total
2. **Binary outcome** - Either cover -1.5 or don't (no middle ground)
3. **High variance** - Empty net goals can swing outcomes
4. **Small sample sizes** - ~1100 games per season not enough

---

## Conclusion

**NHL SPREAD MODEL IS NOT PROFITABLE**

The +7.87% ROI on 2025→2026 is almost certainly **noise** because:
1. Does not validate on any other season pair
2. Bucket patterns completely invert between seasons
3. Model results vary with different random seeds
4. No systematic edge exists

**Recommendation:** Do NOT use NHL spread betting. Stick with NHL moneyline which IS validated profitable (+13.40% ROI).

---

## Success Criteria Check

- [ ] ROI > 5% on 2026: +7.87% ✓ (but doesn't matter)
- [ ] ROI > 0% on 2025: **-29.43% ✗ FAILED**
- [ ] Sample size > 50 bets: ✓
- [ ] Results deterministic: **✗ VARIES WITH TRAINING**

**CONCLUSION: NHL SPREAD OPTIMIZATION COMPLETE - Model is UNPROFITABLE**

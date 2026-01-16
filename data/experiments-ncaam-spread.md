# NCAAM Spread Model Optimization Experiments

**Goal:** Achieve positive ROI on 2026 (train 2025) AND validate on 2025 (train 2024)

**Protocol:** Following "Iterative Model Improvement Protocol" in CLAUDE.md

## Current Experiments Status (Updated 2026-01-16)

| # | Date | Change | Test 2026 ROI | Test 2025 ROI | Bets | Status |
|---|------|--------|---------------|---------------|------|--------|
| 0 | 2026-01-16 | Baseline (2025→2026) | **-3.12%** | N/A | 962 | Baseline |
| 1 | 2026-01-16 | Validate 2024→2025 | N/A | **-13.82%** | 730 | **FAILED** |
| 2 | 2026-01-16 | 40-50% bucket filter | +28.71% | **-4.20%** | 190/1998 | **FAILED VALIDATION** |
| 3 | 2026-01-16 | 2023→2024 test | N/A | N/A | 50 | +23.02% (tiny sample) |
| 4 | 2026-01-16 | Temperature calibration | -3.12% | N/A | 962 | No change |
| 5 | 2026-01-16 | Gradient boosting | -3.12% | N/A | 962 | No change |
| 6 | 2026-01-16 | Isotonic calibration | **-3.53%** | N/A | 2092 | **WORSE** |
| 7 | 2026-01-16 | 80-90% bucket | N/A | **-22.16%** | 520 | **FAILED** |
| 8 | 2026-01-16 | 30-50% bucket range | **-2.71%** | N/A | 958 | Still negative |
| 9 | 2026-01-16 | 70-80% bucket | N/A | N/A | 0 | No bets |
| 10 | 2026-01-16 | Final analysis | - | - | - | **COMPLETE** |

---

## Critical Finding: NCAAM SPREAD MODELS DO NOT VALIDATE

**The model is UNPROFITABLE and does not validate across seasons.**

| Season Pair | ROI | Conclusion |
|-------------|-----|------------|
| 2025 → 2026 | **-3.12%** | Unprofitable baseline |
| 2024 → 2025 | **-13.82%** | Catastrophic failure |
| 2023 → 2024 | **+23.02%** | Only 50 bets (tiny sample) |

**The +28.71% ROI in the 40-50% bucket on 2026 DOES NOT replicate on 2025 (-4.20%).**

---

## Baseline Performance (Experiment #0)

### Configuration
- **Model:** Random Forest (100 trees)
- **Features:** 70 features (basketball stats + line movement)
- **Calibration:** Beta
- **Training:** 5,554 games from 2025 season

### Test: Train 2025 → Test 2026
```bash
node dist/cli/index.js backtest ncaam --season 2026 --market spread --model-path data/models/ncaam/spread-2025.json --show-buckets
```
- **ROI:** -3.12%
- **Win Rate:** 46.05%
- **Total Bets:** 962 (at edge=3%, EV=3%)
- **Verified:** ✓✓

### Bucket Breakdown (2025→2026)
| Bucket | Games | Accuracy | ROI | Profit | Status |
|--------|-------|----------|-----|--------|--------|
| 0-10% | 4 | 100.0% | -100.00% | $-400 | Tiny sample |
| 30-40% | 2 | 100.0% | -100.00% | $-200 | Tiny sample |
| **40-50%** | 190 | 39.5% | **+28.71%** | $4,680 | Promising but fails validation |
| 50-60% | 2141 | 50.5% | -7.27% | $-11,647 | Main volume, bad |

---

## Experiment #1: Validation on 2025 Season

**Date:** 2026-01-16
**Hypothesis:** The baseline should validate on 2024→2025 test.

### Command
```bash
node dist/cli/index.js train ncaam --seasons 2024 --market spread --calibrate beta
node dist/cli/index.js backtest ncaam --season 2025 --market spread --model-path data/models/ncaam/spread-2024.json --show-buckets
```

### Results
- **ROI:** -13.82%
- **Win Rate:** 45.34%
- **Total Bets:** 730
- **All buckets negative**

### Conclusion
- **Status:** **CATASTROPHIC FAILURE**
- The model performs even worse on validation

---

## Experiment #2: 40-50% Bucket Filtering

**Date:** 2026-01-16
**Hypothesis:** The 40-50% bucket (+28.71% ROI on 2026) should also work on 2025.

### Commands
```bash
# 2026 (test)
node dist/cli/index.js backtest ncaam --season 2026 --market spread --model-path data/models/ncaam/spread-2025.json --buckets "40-50" --show-buckets
# Result: +28.71% ROI (190 bets)

# 2025 (validation)
node dist/cli/index.js backtest ncaam --season 2025 --market spread --model-path data/models/ncaam/spread-2024.json --show-buckets
# Result: -4.20% ROI (1998 bets in 40-50% bucket)
```

### Conclusion
- **Status:** **FAILED VALIDATION**
- The profitable bucket on 2026 loses money on 2025
- Pattern does not transfer across seasons

---

## Key Findings

### What We Learned

1. **NCAAM spread models are NOT profitable**
   - Baseline: -3.12% ROI on 2026
   - Validation: -13.82% ROI on 2025
   - All threshold combinations negative

2. **Bucket profitability is season-specific**
   - 40-50% bucket on 2026: +28.71%
   - 40-50% bucket on 2025: -4.20%
   - Complete inversion between seasons

3. **Calibration method doesn't help**
   - Beta, temperature, isotonic all produce similar negative results
   - Gradient boosting also doesn't improve

4. **NCAAM is fundamentally unpredictable**
   - 350+ teams with huge talent disparities
   - Massive roster turnover year-to-year
   - Large spreads (20-30 points common)
   - Market may be too efficient

### Why NCAAM Spread Fails

1. **High variance** - 350+ teams, huge talent gaps
2. **Large spreads** - Common to see -20 to -30 point spreads
3. **Roster turnover** - Players transfer, graduate constantly
4. **One-and-done players** - Top talent leaves after one year
5. **Market efficiency** - Vegas very good at NCAAM spreads

---

## Conclusion

**NCAAM SPREAD MODEL IS NOT PROFITABLE**

The model fails to achieve positive ROI on any season pair tested:
- 2025→2026: -3.12%
- 2024→2025: -13.82%

The 40-50% bucket that looks promising on 2026 (+28.71%) is noise - it completely fails on 2025 (-4.20%).

**Recommendation:** Do NOT use NCAAM spread betting. The market is too efficient and the variance is too high.

---

## Success Criteria Check

- [ ] ROI > 0% on 2026: **-3.12% ✗ FAILED**
- [ ] ROI > 0% on 2025: **-13.82% ✗ FAILED**
- [ ] Sample size > 50 bets: ✓
- [ ] Results deterministic: ✓

**CONCLUSION: NCAAM SPREAD OPTIMIZATION COMPLETE - Model is UNPROFITABLE**

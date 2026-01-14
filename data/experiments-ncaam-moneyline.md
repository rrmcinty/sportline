# NCAAM Moneyline Optimization Experiments

**Goal:** Improve from baseline (-7.95% ROI on 2024→2025, -5.33% ROI on 2023→2024) to positive ROI

**Protocol:** Following "Iterative Model Improvement Protocol" in CLAUDE.md

## Baseline Performance (Experiment #0)

### Configuration
- **Model:** Random Forest (default)
- **Features:** 70 features (59 basketball stats + 8 line movement + 3 advanced)
- **Calibration:** Beta calibration
- **Training:** Standard train/validation split

### Test 1: Train 2024 → Test 2025
- **Command:** `node dist/cli/index.js backtest ncaam --season 2025 --market moneyline --model-path data/models/ncaam/moneyline-2024.json --show-buckets`
- **ROI:** -7.95%
- **Win Rate:** 52.03%
- **Total Bets:** 2977
- **Optimal Threshold:** Edge=3%, EV=0.5%
- **Verified:** ✓ (from data/REAL-OUT-OF-SAMPLE-RESULTS.md)

**Bucket Breakdown (2025):**
| Bucket | Games | ROI | Status |
|--------|-------|-----|--------|
| 40-50% | 104 | -12.96% | ❌ |
| 50-60% | 241 | -33.23% | ❌ |
| 60-70% | 392 | -23.43% | ❌ |
| 70-80% | 676 | -18.69% | ❌ |
| 80-90% | 1044 | -6.92% | ❌ |
| 90-100% | 3097 | +0.38% | Marginal |

### Test 2: Train 2023 → Test 2024
- **Command:** `node dist/cli/index.js backtest ncaam --season 2024 --market moneyline --model-path data/models/ncaam/moneyline-2023.json --show-buckets`
- **ROI:** -5.33%
- **Win Rate:** 44.99%
- **Total Bets:** 3076
- **Optimal Threshold:** Edge=4%, EV=3%
- **Verified:** ✓✓ (ran 2x on 2026-01-13, identical results)

**Bucket Breakdown (2024):**
| Bucket | Games | Accuracy | ROI | Profit | Status |
|--------|-------|----------|-----|--------|--------|
| 0-10% | 99 | 27.3% | -16.89% | $-929 | ❌ |
| 10-20% | 361 | 34.3% | -11.33% | $-3218 | ❌ |
| 20-30% | 389 | 41.1% | -2.32% | $-778 | ❌ |
| 30-40% | 427 | 43.8% | -9.01% | $-3386 | ❌ |
| 40-50% | 516 | 53.5% | -6.95% | $-3217 | ❌ |
| 50-60% | 756 | 60.3% | -12.38% | $-8137 | ❌ |
| 60-70% | 606 | 70.5% | -3.06% | $-1381 | ❌ |
| 70-80% | 888 | 71.5% | -8.24% | $-5282 | ❌ |
| 80-90% | 1478 | 83.7% | -2.56% | $-1419 | ❌ |

### Summary
- **Status:** ❌ UNPROFITABLE (both test pairs)
- **2024→2025:** -7.95% ROI
- **2023→2024:** -5.33% ROI
- **Consistency:** Unprofitable on both season pairs
- **Best bucket:** 90-100% on 2025 (+0.38% ROI, marginal)

---

## Experiments

| # | Date | Change | Train | Test 2025 ROI | Test 2024 ROI | Status | Notes |
|---|------|--------|-------|---------------|---------------|--------|-------|
| 0 | 2026-01-13 | Baseline | 2024/2023 | -7.95% | -5.33% | ❌ | Baseline established |
| 1 | 2026-01-13 | Remove line movement | 2024 | -22.33% | N/A | ❌ | FAILED: -14.38pp worse |
| 2 | 2026-01-14 | Multi-season training | 2022+2023+2024 | -22.59% | N/A | ❌ | FAILED: -14.64pp worse |

---

## Experiment #1: Remove Line Movement Features

**Date:** 2026-01-13
**Hypothesis:** NCAAM has low market liquidity compared to NBA/NHL. Sharp money indicators (line movement features) may be noise rather than signal.
**Changes:**
- Modified `src/models/features.ts` line 158-161
- Conditionally use `getDefaultLineMovementFeatures()` for NCAAM (all zeros)
- NBA/NHL continue using line movement features
- Exported `getDefaultLineMovementFeatures()` from `lineMovementFeatures.ts`

### Commands
```bash
# Training
node dist/cli/index.js train ncaam --seasons 2024 --market moneyline --calibrate beta

# Test: 2024→2025
node dist/cli/index.js backtest ncaam --season 2025 --market moneyline --model-path data/models/ncaam/moneyline-2024.json --show-buckets
```

### Results

#### Test 2025 (primary)
- **ROI:** -22.33%
- **Win Rate:** 34.79%
- **Total Bets:** 2811 (optimal threshold: Edge=4%, EV=0.5%)
- **Verified:** ✓✓ (ran 2x on 2026-01-13, identical results)

#### Test 2024 (validation)
- **Not tested** (results so bad that validation unnecessary)

### Bucket Breakdown (2025)
| Bucket | Games | Accuracy | ROI | Profit | Status |
|--------|-------|----------|-----|--------|--------|
| 0-10% | 33 | 18.2% | -13.81% | $-152 | ❌ |
| 10-20% | 196 | 27.0% | -15.39% | $-1431 | ❌ |
| 20-30% | 289 | 37.0% | -20.19% | $-3817 | ❌ |
| 30-40% | 406 | 43.1% | -33.27% | $-9382 | ❌ |
| 40-50% | 672 | 50.7% | -15.16% | $-7337 | ❌ |
| 50-60% | 883 | 59.8% | -22.74% | $-13897 | ❌ |
| 60-70% | 1185 | 69.2% | -28.01% | $-20981 | ❌ |
| 70-80% | 1890 | 81.5% | -22.25% | $-16755 | ❌ |

### Comparison to Baseline
| Metric | Baseline 2025 | Exp #1 2025 | Δ |
|--------|---------------|-------------|---|
| ROI | -7.95% | -22.33% | **-14.38 pp** ⚠️ |
| Win Rate | 52.03% | 34.79% | -17.24 pp |
| Total Bets | 2977 | 2811 | -166 |

### Calibration
- **Training Accuracy:** 64.38%
- **Beta params:** a=3.700, b=0.300

### Conclusion
- **Status:** ❌ FAILED
- **Reason:** Massive performance degradation (-14.38 percentage points worse than baseline)
- **Key Finding:** Line movement features are CRITICAL for NCAAM model, even though market has lower liquidity than NBA/NHL
- **Hypothesis rejected:** Sharp money signals DO work in NCAAM, removing them breaks the model
- **Next Steps:** Revert code changes, keep line movement features for all sports

---

## Experiment #2: Multi-Season Training

**Date:** 2026-01-14
**Hypothesis:** Training on more data (3 seasons) reduces overfitting and improves generalization to new seasons.
**Changes:**
- Trained on 2022, 2023, AND 2024 seasons combined (16,273 examples vs 5,520 baseline)
- Same Random Forest architecture (100 trees)
- Beta calibration on 3,254 holdout samples (20% of training data)

### Commands
```bash
# Training
node dist/cli/index.js train ncaam --seasons 2022,2023,2024 --market moneyline --calibrate beta

# Test: 2024→2025 (multi-season model vs baseline)
node dist/cli/index.js backtest ncaam --season 2025 --market moneyline --model-path data/models/ncaam/moneyline-2024.json --show-buckets
```

### Results

#### Test 2025 (primary)
- **ROI:** -22.59%
- **Win Rate:** 34.06%
- **Total Bets:** 2757 (optimal threshold: Edge=4%, EV=0.5%)
- **Verified:** ✓✓ (ran 2x on 2026-01-14, identical results)

#### Test 2024 (validation)
- **Not tested** (results so bad that validation unnecessary)

### Bucket Breakdown (2025)
| Bucket | Games | Accuracy | ROI | Profit | Status |
|--------|-------|----------|-----|--------|--------|
| 10-20% | 79 | 19.0% | +21.76% | $+805 | ⚠️ Tiny sample, bad calibration |
| 20-30% | 229 | 26.6% | -31.03% | $-3786 | ❌ |
| 30-40% | 429 | 40.3% | -35.74% | $-9936 | ❌ |
| 40-50% | 676 | 45.1% | -27.92% | $-13539 | ❌ |
| 50-60% | 920 | 55.7% | -18.95% | $-12886 | ❌ |
| 60-70% | 1219 | 68.2% | -26.74% | $-21041 | ❌ |
| 70-80% | 2002 | 83.6% | -21.38% | $-16696 | ❌ |

### Comparison to Baseline
| Metric | Baseline 2025 | Exp #2 2025 | Δ |
|--------|---------------|-------------|---|
| ROI | -7.95% | -22.59% | **-14.64 pp** ⚠️ |
| Win Rate | 52.03% | 34.06% | -17.97 pp |
| Total Bets | 2977 | 2757 | -220 |
| Training Samples | 5,520 | 16,273 | +10,753 |

### Calibration
- **Training Accuracy:** 64.86%
- **Beta params:** a=2.100, b=0.300
- **Calibration Quality:** TERRIBLE - model probabilities are way off despite beta calibration

### Conclusion
- **Status:** ❌ FAILED
- **Reason:** Catastrophic performance degradation (-14.64 percentage points worse than baseline)
- **Key Finding:** Training on 3 seasons (3x more data) made performance WORSE, not better
- **Possible Causes:**
  1. **Feature distribution mismatch:** Stats from 2022 games may have different distributions than 2024/2025
  2. **Roster/rule changes:** 2022 rosters/rules don't generalize to 2025
  3. **Overfitting to noise:** More data doesn't help if patterns don't transfer across seasons
  4. **Calibration issues:** Beta calibration on mixed-season data may not work well
- **Hypothesis rejected:** More training data does NOT improve NCAAM model generalization
- **Next Steps:** Abandon multi-season approach, focus on single-season models with better features/calibration

---

## Pattern Analysis: Why Are Experiments #1 and #2 Failing So Badly?

**Critical Observation:** Both experiments resulted in nearly identical terrible performance:
- Experiment #1 (no line movement): -22.33% ROI
- Experiment #2 (multi-season): -22.59% ROI
- Baseline: -7.95% ROI

**This suggests a fundamental issue, not just bad hyperparameters.**

### Possible Explanations:

1. **Model overwrite issue:** Both experiments saved to `moneyline-2024.json`. Need to verify we're not testing the wrong model.
   - ✓ Verified: Exp #2 model has 16,273 training samples (multi-season)
   - ✗ This is the correct model

2. **Calibration failure:** Both models have terrible calibration despite using beta method
   - Baseline model (from Jan 13) may have had better calibration settings
   - Need to investigate calibration parameters

3. **Training code bug:** Something changed in how we train models
   - Need to compare training process to original baseline training

4. **Feature extraction bug:** Features being computed differently than baseline
   - Need to verify feature extraction hasn't changed

### Action Items Before Continuing:
- [ ] Re-train baseline model on just 2024 season, verify it matches original -7.95% ROI
- [ ] Compare feature extraction between baseline and new experiments
- [ ] Investigate calibration settings
- [ ] Check if training code changed

---

## Experiment Templates

### Template for New Experiment

```markdown
## Experiment #X: [Name]

**Date:** YYYY-MM-DD
**Hypothesis:** [What we're testing and why]
**Changes:** [Specific code/config changes]

### Commands
```bash
# Training
node dist/cli/index.js train ncaam --season 2024 --market moneyline [flags]

# Test 1: 2024→2025
node dist/cli/index.js backtest ncaam --season 2025 --market moneyline --model-path [path] --show-buckets

# Test 2: 2023→2024
node dist/cli/index.js backtest ncaam --season 2024 --market moneyline --model-path [path] --show-buckets
```

### Results

#### Test 2025 (primary)
- **ROI:** X.XX%
- **Win Rate:** XX.XX%
- **Total Bets:** XXXX
- **Optimal Threshold:** Edge=X%, EV=X%
- **Verified:** ✓✓ (ran 2x, identical)

#### Test 2024 (validation)
- **ROI:** X.XX%
- **Win Rate:** XX.XX%
- **Total Bets:** XXXX
- **Verified:** ✓✓ (ran 2x, identical)

### Bucket Breakdown
| Bucket | 2025 ROI | 2024 ROI | Status |
|--------|----------|----------|--------|
| ... | ... | ... | ... |

### Comparison to Baseline
| Metric | Baseline 2025 | Exp #X 2025 | Δ | Baseline 2024 | Exp #X 2024 | Δ |
|--------|---------------|-------------|---|---------------|-------------|---|
| ROI | -7.95% | X.XX% | +X.XX pp | -5.33% | X.XX% | +X.XX pp |
| Win Rate | 52.03% | XX.XX% | +X.XX pp | 44.99% | XX.XX% | +X.XX pp |

### Calibration
- **ECE 2025:** X.XXX
- **ECE 2024:** X.XXX
- **Status:** [Excellent <0.05 | Good <0.10 | Poor >0.10]

### Conclusion
- **Status:** ✓ SUCCESS | ❌ FAILED
- **Reason:** [Explanation]
- **Next Steps:** [What to try next]
```

---

## Success Criteria Checklist

Before marking an experiment as successful:

- [ ] ROI > 0% on Test 2025
- [ ] ROI > 0% on Test 2024
- [ ] Beats baseline by >5 percentage points on BOTH tests
- [ ] ECE < 0.10 (well-calibrated)
- [ ] Sample size >100 bets per season
- [ ] Results verified (ran tests 2x, identical results)
- [ ] Bucket breakdown shows multiple profitable buckets
- [ ] Manual ROI calculation: (total_profit / total_staked) * 100
- [ ] Code changes committed to git
- [ ] Updated this registry

---

## Notes

### Why Baseline is Unprofitable
- **Model doesn't generalize well** across seasons
- **Possible causes:**
  - Roster changes (player turnover)
  - Coaching changes
  - Conference realignment
  - Rule changes
  - Limited training data (only ~5500 games per season)
  - Overfitting to training season patterns

### Key Insights from Baseline
1. **2023→2024 performs better** (-5.33%) than 2024→2025 (-7.95%)
   - Suggests 2025 season had different dynamics than 2024
   - Or 2024 model is worse quality than 2023 model

2. **All probability buckets are unprofitable** except 90-100% (marginal)
   - Model calibration may be off
   - Or odds are too efficient in NCAAM

3. **Accuracy is decent** (70-80% in high-prob buckets)
   - But odds account for this, making bets -EV

### Next Steps
1. Try removing line movement features (Experiment #1)
2. Try multi-season training (Experiment #2)
3. Re-enable situational features (Experiment #3)
4. Try different calibration methods (Experiment #4)
5. Try XGBoost architecture (Experiment #5)
6. Add conference strength features (Experiment #6)
7. Add sample size weighting (Experiment #7)
8. Try ensemble model (Experiment #8)

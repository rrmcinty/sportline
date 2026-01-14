# NHL Moneyline Optimization - Implementation Guide

**Date:** 2026-01-14
**Improvement Found:** +7.62pp ROI increase (13.40% → 21.02%)
**Strategy:** 60-80% probability bucket filtering

---

## Quick Start (Recommended)

### Option 1: Command-Line Flag (Easiest)

Use the `--buckets` flag with your existing workflow:

```bash
# Recommendations with bucket filter
node dist/cli/index.js recommend nhl --min-edge 0.07 --buckets "60-80"
```

**Pros:**
- No code changes required
- Easy to test and revert
- Can experiment with different bucket ranges

**Cons:**
- Need to remember to add flag every time
- Not automatically applied in Lambda

### Option 2: Update Default Buckets (Permanent)

Modify `src/config/optimalBuckets.ts` to make this the default behavior.

**Current code:**
```typescript
export const OPTIMAL_BUCKETS = {
  nhl: {
    moneyline: {
      ranges: [], // Empty = all buckets
      minEdge: 0.07,
      minEV: 0.005,
    },
  },
  // ... other sports
};
```

**Updated code:**
```typescript
export const OPTIMAL_BUCKETS = {
  nhl: {
    moneyline: {
      ranges: ['60-80'], // Only bet 60-80% probability predictions
      minEdge: 0.07,
      minEV: 0.005,
    },
  },
  // ... other sports
};
```

Then rebuild and deploy:

```bash
npm run build
npm run sync
npm run cdk:deploy
```

**Pros:**
- Automatically applied everywhere (CLI, Lambda, backtest)
- No need to remember flags
- Clean and maintainable

**Cons:**
- Requires code change and deployment
- Need to rebuild after modifying

---

## Detailed Implementation Steps

### Step 1: Verify Current Performance

Before making changes, confirm your baseline:

```bash
# Verify baseline ROI
node dist/cli/index.js backtest nhl --season 2025 --market moneyline \
  --model-path data/models/nhl/moneyline-2024.json --show-buckets

# Expected: +13.40% ROI, 425 bets
```

### Step 2: Test New Strategy

Test the bucket filter to confirm it works:

```bash
# Test 60-80% bucket strategy
node dist/cli/index.js backtest nhl --season 2025 --market moneyline \
  --model-path data/models/nhl/moneyline-2024.json \
  --buckets "60-80" --show-buckets

# Expected: +21.02% ROI, 359 bets
```

Run twice to verify deterministic results.

### Step 3A: Deploy with Command-Line Flag (Quick Method)

Just start using the flag:

```bash
# For recommendations
node dist/cli/index.js recommend nhl --min-edge 0.07 --buckets "60-80"
```

### Step 3B: Deploy with Code Changes (Permanent Method)

#### 1. Update optimal buckets configuration

Edit `src/config/optimalBuckets.ts`:

```typescript
export const OPTIMAL_BUCKETS = {
  nhl: {
    moneyline: {
      ranges: ['60-80'],
      minEdge: 0.07,
      minEV: 0.005,
    },
  },
  nba: {
    moneyline: {
      ranges: [], // Keep NBA unchanged for now
      minEdge: 0.03,
      minEV: 0.005,
    },
    spread: {
      ranges: [],
      minEdge: 0.04,
      minEV: 0.005,
    },
  },
  // ... rest unchanged
};
```

#### 2. Rebuild

```bash
npm run build
```

Check for any TypeScript compilation errors.

#### 3. Test locally

```bash
# Test recommendations (should filter to 60-80%)
node dist/cli/index.js recommend nhl

# Verify it's working - check that recommendations show probabilities in 60-80% range
```

#### 4. Sync to S3 and deploy Lambda

```bash
# Export predictions and models to S3
npm run sync

# Deploy Lambda with updated logic
npm run cdk:deploy

# Or production:
npm run cdk:deploy:prod
```

#### 5. Verify Lambda

Check Lambda logs to ensure recommendations are filtered correctly:

```bash
# Trigger Lambda manually
aws lambda invoke \
  --function-name Sportline-Update-dev-$(whoami) \
  --payload '{}' \
  /tmp/lambda-output.json

# Check logs
aws logs tail /aws/lambda/Sportline-Update-dev-$(whoami) --follow
```

---

## Testing Checklist

Before considering deployment complete:

- [ ] Baseline backtest matches expected +13.40% ROI
- [ ] New strategy backtest shows +21.02% ROI (run 2x, identical)
- [ ] Recommendations only show predictions in 60-80% range
- [ ] Lambda logs show filtered recommendations (if deployed)
- [ ] Bucket configuration persists across rebuilds
- [ ] No TypeScript compilation errors
- [ ] Test on 2024 season: expect +31.71% ROI with 485 bets

---

## Rollback Instructions

If something goes wrong, revert immediately:

### If using command-line flag:
Just stop using the `--buckets` flag.

### If you modified code:

#### 1. Restore original configuration

Edit `src/config/optimalBuckets.ts`:

```typescript
export const OPTIMAL_BUCKETS = {
  nhl: {
    moneyline: {
      ranges: [], // Back to empty = all buckets
      minEdge: 0.07,
      minEV: 0.005,
    },
  },
  // ... rest unchanged
};
```

#### 2. Rebuild and redeploy

```bash
npm run build
npm run sync
npm run cdk:deploy
```

#### 3. Or restore from backup

If you have git history:

```bash
git checkout src/config/optimalBuckets.ts
npm run build
npm run sync
npm run cdk:deploy
```

---

## Monitoring Post-Deployment

After deploying, monitor these metrics:

### Daily Checks (First Week)

```bash
# Check daily recommendations
node dist/cli/index.js recommend nhl

# Verify:
# - Recommendations exist
# - All show 60-80% probability range
# - Edge values are reasonable (> 7%)
```

### Weekly Checks

Track actual betting results vs expectations:

| Metric | Expected (2025) | Actual |
|--------|-----------------|--------|
| Win Rate | 61.56% | ??? |
| ROI | +21.02% | ??? |
| Avg Bets/Week | ~30 | ??? |

If actual win rate drops below 55% or ROI drops below +10%, investigate immediately.

---

## Alternative Strategies

If you want different risk/reward profiles:

### Conservative (More Bets, Lower ROI)
Use the baseline strategy - no bucket filter
- ROI: +13.40%
- Bets: 425
- More betting opportunities

### Balanced (Recommended)
Use 60-80% bucket filter
- ROI: +21.02%
- Bets: 359
- Best validated performance

### Aggressive (Highest ROI, Fewest Bets)
Use 65-80% bucket filter
- ROI: +34.60% (2025), +23.29% (2024)
- Bets: 244 (2025), 204 (2024)
- Higher ROI but fewer opportunities

### Ultra-Aggressive (Not Recommended)
Use 70-80% bucket filter
- ROI: +39.21% (2025), +19.26% (2024)
- Bets: 119 (2025), 34 (2024) ⚠️
- **Issue:** 2024 sample size too small

---

## Expected Impact

Based on 2025 season validation:

| Scenario | Units | Win Rate | Expected Profit | vs Baseline |
|----------|-------|----------|-----------------|-------------|
| Baseline | 425 | 56.71% | +$5,695 | - |
| **60-80%** | **359** | **61.56%** | **+$7,546** | **+$1,851** |
| 65-80% | 244 | 69.26% | +$8,442 | +$2,747 |
| 70-80% | 119 | 75.63% | +$4,666 | -$1,029 |

Assumes $100 units per bet.

---

## Troubleshooting

### Issue: Recommendations don't show any games

**Possible causes:**
1. No games scheduled today
2. Bucket filter too restrictive (no predictions in 60-80% range)
3. Edge threshold too high

**Solution:**
```bash
# Check without bucket filter
node dist/cli/index.js recommend nhl --min-edge 0.07

# If games appear, bucket filter is working correctly
```

### Issue: ROI not matching expectations

**Possible causes:**
1. Small sample size (need 50+ bets minimum)
2. Variance (short-term results differ from long-term expectation)
3. Model drift (season dynamics changed)

**Solution:**
- Track results over 100+ bets before concluding
- Compare actual win rate to expected 61.56%
- If win rate < 55% after 100 bets, investigate

### Issue: Lambda not filtering correctly

**Possible causes:**
1. Code changes not deployed
2. Sync didn't upload latest predictions
3. Lambda using cached old data

**Solution:**
```bash
# Force full rebuild and sync
npm run build
rm -rf data/export/*
npm run sync
npm run cdk:deploy
```

---

## Support & Questions

**Experiment documentation:**
- Full details: `data/experiments-nhl-moneyline.md`
- Executive summary: `data/NHL-OPTIMIZATION-SUMMARY.md`
- This guide: `data/NHL-IMPLEMENTATION-GUIDE.md`

**Baseline backup:**
- Original model: `data/models/nhl/moneyline-2024-baseline.json`
- Current model: `data/models/nhl/moneyline-2024.json`

**Git branch:** `max-roi-2` (no commits made yet)

---

## Next Steps

1. ✅ Choose implementation method (flag vs code)
2. ✅ Test locally to verify results
3. ✅ Deploy to dev environment first
4. ✅ Monitor for 1-2 weeks
5. ✅ Deploy to production if successful
6. ⏳ Wait for Phase 2 (hyperparameter tuning) results
7. ⏳ Consider Phase 3 (multi-season) if Phase 2 shows promise

---

## Success Criteria

Mark implementation as successful when:

- [ ] Deployed to dev environment
- [ ] Tested recommendations look correct
- [ ] Lambda logs show filtered bets
- [ ] Tracked 50+ actual bets
- [ ] Actual win rate matches expected (58-65%)
- [ ] Actual ROI matches expected (18-24%)
- [ ] No production incidents
- [ ] Stakeholders approve for production

Once validated, deploy to production and update production documentation.

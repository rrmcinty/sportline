# Implementation Plans

This directory contains detailed plans for future development sessions. Each plan provides:
- Context from previous experiments
- Prioritized feature lists
- Implementation steps
- Success criteria
- Testing protocols

---

## 🤖 Automated Execution

### Automation Workflow Plan
**File:** `automation-workflow.md`

**Purpose:** Systematically execute all optimization plans with minimal user intervention

**What it does:**
- ✅ Works through all 10 phases automatically
- ✅ Implements with bypass permissions enabled
- ✅ Tests and validates each change
- ✅ Documents findings as it goes
- ✅ Provides checkpoints for user review

**How to use:**
```bash
# In Claude Code:
"Execute the automation-workflow.md plan.
Work through all phases systematically with bypass permissions enabled.
Stop at checkpoints for my review."
```

**Estimated time:** 50-60 hours of automated work
**Expected results:** NHL ROI +29-35% (from current +21%), NBA toward profitability

**Checkpoints:**
1. After quick wins (Phases 1-3): ~11 hours
2. After system-wide (Phases 4-5): ~19 hours
3. After advanced features (Phases 6-8): ~41 hours
4. Final review: ~58 hours

---

## Available Plans

### 1. NBA Moneyline Feature Engineering Plan
**File:** `nba-feature-engineering-plan.md`

**Status:** Unprofitable (-8.40% to -13.23% ROI on 2025)

**Goal:** Achieve positive ROI on both 2024 and 2025 test seasons

**Top Priorities:**
1. 🔥 **Injury Tracking** - Expected +5-8pp improvement
2. 🔥 **Lineup Data** - Expected +2-3pp improvement
3. 🔥 **Ensemble Methods** - Expected +2-4pp improvement

**When to Use:**
- When you have time to add new features (injury tracking, lineups)
- When you want to try alternative model architectures (ensemble, XGBoost)
- When NBA spread becomes priority over moneyline

**Estimated Effort:**
- Quick wins: 1-2 hours (gradient boosting, enhanced rest features)
- Medium effort: 4-8 hours (injury MVP, ensemble model)
- Full implementation: 1-2 days (complete injury system, lineup data)

---

### 2. NHL Moneyline Optimization Plan (COMPLETED) ✅
**File:** `nhl-optimization-plan.md`

**Status:** **OPTIMIZED to +21.02% ROI** (up from +13.40% baseline) ✓✓

**Achievement:** +7.62pp improvement via 60-80% bucket filtering

**What Was Tested:**
- ✅ Auto-calibration → No improvement (already calibrated)
- ✅ Hyperparameter tuning → No improvement (54 combinations tested)
- ✅ Bucket optimization → **SUCCESS** (+7.62pp improvement)

**Deployment Status:**
- Production uses baseline (+13.40%)
- Optimized strategy ready to deploy (+21.02%)
- Command: `node dist/cli/index.js recommend nhl --min-edge 0.07 --buckets "60-80"`

---

### 3. NHL Future Improvements Plan
**File:** `nhl-future-improvements.md`

**Status:** Highly profitable (+21.02% ROI on 2025) ✓✓

**Goal:** Push beyond +21% to +25%+ ROI

**Top Priorities:**
1. 🔥🔥🔥 **Goalie Features** - Expected +2-4pp improvement (4-6 hours)
2. 🔥🔥 **Rest/Schedule Features** - Expected +1-2pp improvement (2-3 hours)
3. 🔥🔥 **Kelly Criterion** - Expected +2-4pp improvement (1-2 hours)
4. 🔥 **Spread Betting** - Unknown ROI, diversification benefit (3-4 hours)
5. ⚠️ **Multi-Season Training** - Expected +0-2pp improvement, high risk (1 hour)
6. 💰 **Odds Shopping** - Expected +3-5pp improvement (8-10 hours)
7. 🤖 **Ensemble Model** - Expected +1-3pp improvement (4-6 hours)
8. 📈 **Dynamic Buckets** - Expected +0.5-1pp improvement (2-3 hours)

**When to Use:**
- After deploying current bucket filtering optimization
- When monitoring shows 50-100 real bets match expected performance
- When ready to push for +25%+ ROI

**Estimated Effort:**
- Quick wins: 3-5 hours (rest features, Kelly criterion)
- Medium effort: 4-6 hours (goalie features)
- High effort: 8-10 hours (odds shopping, ensemble)
- Full suite: 10-15 hours total

---

### 4. General System Improvements Plan
**File:** `general-improvements.md`

**Purpose:** Cross-sport improvements that benefit all models

**Top Priorities:**
1. 🔥🔥🔥 **Automated Bucket Optimizer** - Find optimal buckets for any sport (3-4 hours)
2. 🔥🔥 **Universal Kelly Criterion** - +2-4pp ROI across all profitable models (3-4 hours)
3. 💰 **Multi-Book Odds Shopping** - +3-5pp ROI across all models (8-12 hours)
4. 🏥 **Injury Tracking System** - +5-8pp for NBA, +1-2pp for NHL (12-16 hours)
5. 🤖 **Automated Model Retraining** - Maintain performance as seasons progress (4-6 hours)
6. 📱 **Live Betting Foundation** - New revenue stream, unknown ROI (20+ hours)
7. 📊 **Dashboard Improvements** - Better UX, no direct ROI (2-3 hours)
8. 🔍 **Model Explainability** - Better debugging, easier to understand (4-6 hours)

**When to Use:**
- After NHL bucket filtering is deployed and validated
- When you want improvements that benefit multiple sports
- When ready to build infrastructure (Kelly, odds shopping, injuries)

**Estimated Impact:**
- **NHL:** +6-11pp additional ROI (beyond current +21%)
- **NBA:** +13-22pp improvement (could make profitable)
- **System-wide:** Better UX, automated optimization, lower maintenance

**Estimated Effort:**
- Quick wins: 6-8 hours (bucket optimizer, Kelly criterion)
- Infrastructure: 20-30 hours (odds shopping, injuries, auto-retraining)
- Full system overhaul: 40-60 hours (includes live betting, dashboard, explainability)

---

## How to Use These Plans

### For New Sessions

1. **Read the plan file** to understand context and priorities
2. **Choose a priority** based on available time and goals
3. **Follow the implementation steps** in the plan
4. **Test using the documented protocol** (train, backtest 2x, validate)
5. **Document results** in the experiment registry (`data/experiments-{sport}-moneyline.md`)

### Success Criteria

Each plan includes specific success criteria. Examples:

**NBA:** Must be profitable on BOTH 2024 and 2025 (currently fails)
**NHL:** Must maintain +7% baseline while increasing ROI (currently +13.40%)

### Testing Protocol

Every plan includes a testing protocol:
1. Train on year N
2. Test on year N+1 (primary)
3. Run again to verify determinism
4. Test on year N (validation)
5. Document results

### Stopping Conditions

Each plan includes stopping conditions to avoid wasted effort:

**NBA:**
- ✓ Success: ROI > 0% on both seasons
- ⚠️ Partial: ROI > -3% (significant improvement)
- ❌ Failure: After top 5 features, still <-5% → Pivot to spread or give up

**NHL:**
- ✓ Success: ROI > +18% on 2025
- ⚠️ Warning: 2024 drops below +7% → Revert changes
- ❌ Failure: Improvements <0.5pp per experiment → Diminishing returns

---

## Priority Matrix

Use this to decide which plan to work on:

| Plan | Status | Effort | Expected Impact | Priority |
|------|--------|--------|-----------------|----------|
| **NHL Future Improvements** | Optimized (+21.02%) | Low-Medium | +4-6pp more | **🔥🔥 HIGHEST** |
| **General System Improvements** | N/A | Medium-High | +6-15pp all sports | **🔥 HIGH** |
| **NBA Feature Engineering** | Broken (-13.23%) | High | +5-8pp | MEDIUM |
| **NBA Spread** | Unknown (-9.38%) | Medium | Unknown | LOW |
| **NCAAM** | Broken (-7.95%) | Very High | Low | VERY LOW |

**Current Recommendation:**
1. **Deploy NHL bucket filtering first** (already optimized, ready to use)
2. **Monitor 50-100 real bets** to confirm +21% ROI
3. **Then pursue NHL goalie features** (quick 4-6 hour win for +2-4pp more)
4. **Then build system infrastructure** (Kelly criterion, odds shopping) to benefit all models
5. **Then tackle NBA** (injuries + features to make profitable)

---

## Experiment Registry

All experiments should be documented in:
- `data/experiments-nba-moneyline.md` (already exists)
- `data/experiments-nhl-moneyline.md` (create when starting NHL work)
- `data/experiments-ncaam-moneyline.md` (already exists)

---

## Key Lessons from Current Experiments

### From NHL Optimization (data/experiments-nhl-moneyline.md) ✅
**Achievement:** Optimized from +13.40% to +21.02% ROI (+7.62pp improvement)

**What Worked:**
1. **Bucket filtering was breakthrough** - Excluding 50-60% bucket (loses -14.78%) increased ROI dramatically
2. **Simple beats complex** - Bucket filter (30 min) beat hyperparameter tuning (67 min, 54 combinations)
3. **Multi-season validation critical** - Testing on both 2025 AND 2024 prevented false positives
4. **Deterministic verification essential** - Running tests 2x caught non-deterministic issues

**What Didn't Work:**
1. **Auto-calibration provided no improvement** - Model already well-calibrated (ECE=0.0930)
2. **Hyperparameter tuning provided no improvement** - 54 combinations tested, best = baseline
3. **Not all optimization helps** - 67 minutes of grid search wasted vs 30 minutes of bucket testing

**Key Insight:** NHL remains the only profitable model (+21.02% ROI validated on multiple seasons)

### From NCAAM (data/experiments-ncaam-moneyline.md)
1. **Line movement features are CRITICAL** - Removing them caused -14pp degradation
2. **Multi-season training made things WORSE** - Training on 3 seasons caused -22.59% ROI (vs -7.95% baseline)
3. **Some sports are just harder** - NCAAM has too much roster volatility
4. **Feature distribution mismatch** - Stats from 2022 don't generalize to 2025

### From NBA (data/experiments-nba-moneyline.md)
1. **Training method doesn't fix bad features** - Walk-forward, hyperparameters, calibration all failed
2. **Season-to-season consistency matters** - 2023 model works on 2024 but fails on 2025
3. **Injuries likely the missing piece** - Star dependency is huge in NBA
4. **Unprofitable on out-of-sample** - -13.23% ROI (train 2024, test 2025)

---

## Future Plans (TODO)

Plans that should be created in the future:

1. **`nba-spread-plan.md`** - Try spread instead of moneyline
2. **`player-props-plan.md`** - Player-level predictions (points/assists/rebounds)
3. **`ncaam-spread-plan.md`** - NCAAM spread may work better than moneyline
4. **`multi-sport-ensemble-plan.md`** - Combine predictions across sports
5. **`live-betting-plan.md`** - In-game betting strategy (requires live odds)

---

## Resources

**Project Documentation:**
- `CLAUDE.md` - Main project instructions and protocol
- `data/REAL-OUT-OF-SAMPLE-RESULTS.md` - Verified baseline performance
- `READY-FOR-PRODUCTION.md` - Production deployment summary

**Experiment Registries:**
- `data/experiments-nba-moneyline.md`
- `data/experiments-ncaam-moneyline.md`

**Code Entry Points:**
- Training: `src/cli/commands/train.ts`
- Backtesting: `src/cli/commands/backtest.ts`
- Features: `src/models/features.ts`
- Models: `src/models/train{Sport}{Market}.ts`

**External Resources:**
- ESPN API (already integrated)
- NHL API: https://gitlab.com/dword4/nhlapi
- NBA API: https://github.com/swar/nba_api
- The Odds API: https://the-odds-api.com/

---

## Contributing

When creating new plans:

1. **Follow the template** from existing plans (NBA/NHL)
2. **Include context** from previous experiments
3. **Prioritize by impact** and effort
4. **Provide specific steps** (not just ideas)
5. **Define success criteria** clearly
6. **Include testing protocol** (train, test 2x, validate)
7. **Add stopping conditions** (know when to quit)

---

## Questions?

- Read `CLAUDE.md` for project context
- Check experiment registries for historical results
- Run `/help` in Claude Code for CLI assistance
- See GitHub issues: https://github.com/anthropics/claude-code/issues

---

**Last Updated:** 2026-01-14 (after NHL optimization completion)
**Next Review:** After deploying NHL bucket filtering and monitoring 50-100 real bets

**Recent Updates:**
- ✅ NHL optimization completed: +21.02% ROI achieved (up from +13.40%)
- ✅ Created `nhl-future-improvements.md` plan for next optimization phase
- ✅ Created `general-improvements.md` plan for cross-sport enhancements
- 📋 Updated priority matrix to reflect completed NHL work

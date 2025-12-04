# NCAAM V2 - Complete Implementation Checklist

## ✅ Phase 1: Foundation (COMPLETE)

- [x] Project structure and configuration
- [x] Database schema (4 tables, simple and focused)
- [x] Type definitions with odds helpers
- [x] ESPN API client (games, odds, scores)
- [x] Feature engineering (7 proven features)
- [x] Model training (logistic regression with L2)
- [x] Backtest validation system
- [x] CLI scaffolding

## 🔄 Phase 2: Validation (READY TO RUN)

**Next Steps:**

1. **Install dependencies:**
   ```bash
   cd ncaam-v2
   npm install
   ```

2. **Build the project:**
   ```bash
   npm run build
   ```

3. **Fetch historical data (this will take ~30-60 min):**
   ```bash
   npm run fetch
   # Fetches 2023, 2024, 2025 seasons (~1500-2000 games)
   ```

4. **Train the model:**
   ```bash
   npm run train
   # Expected: 70-75% accuracy, <10% ECE
   ```

5. **🚨 CRITICAL: Run backtest validation:**
   ```bash
   npm run backtest
   # Decision point: ROI >5%? ECE <10%? Sample >500?
   ```

## Decision Point: Production Criteria

**✅ PROCEED if:**
- Overall ROI ≥ 5%
- ECE ≤ 10%
- Sample size ≥ 500 games
- High-confidence tier (80-100%) ROI ≥ 15%

**❌ STOP if:**
- ROI < 5% → unprofitable, don't use for real bets
- ECE > 10% → poorly calibrated, probabilities unreliable
- Sample < 500 → not enough data, wait for more games

## 📋 Phase 3: Production (If Validated)

- [ ] Build recommendation engine
- [ ] Add Kelly criterion stake sizing
- [ ] Display backtest stats inline
- [ ] Daily update automation
- [ ] ROI tracking vs actual results

## 📊 Phase 4: Optimization (If Profitable)

- [ ] Test additional features (pace, recent form, rest days)
- [ ] Optimize confidence thresholds
- [ ] Add divergence-based filtering
- [ ] Consider totals model (if moneyline ROI >10%)

## Key Differences from V1

| V1 Sportline | V2 NCAAM |
|--------------|----------|
| 5 sports | 1 sport (NCAAM) |
| 3 market types | 1 market (moneyline) |
| 17-36 features | 7 features |
| Multi-sport complexity | Single-sport focus |
| Feature normalization | No normalization |
| Complex caching | Minimal caching |
| 7 database tables | 4 tables |
| Parlays by default | No parlays |
| Production before validation | Backtest-first approach |

## Why This Approach Works

1. **Focus = Speed** - One sport means faster iteration and debugging
2. **Validation First** - No production code until profitability proven
3. **Simplicity = Reliability** - Fewer features = better calibration
4. **Data-Driven** - Every decision backed by backtest results
5. **Kill Bad Ideas Fast** - Clear criteria for when to stop

## Expected Results (Based on V1 Data)

From original sportline NCAAM backtest:
- **Overall ROI:** +5.06% (1,818 games)
- **ECE:** 9.83% (decent calibration)
- **80-90% tier:** +15.8% ROI (156 games)
- **90-100% tier:** +10.3% ROI (130 games)

V2 should match or exceed these with:
- Simpler model (better calibration)
- Focused features (less overfitting)
- 3-season validation (more reliable)

## Files Created

```
ncaam-v2/
├── DESIGN.md              # Philosophy and roadmap
├── README.md              # User guide
├── IMPLEMENTATION.md      # This file
├── package.json
├── tsconfig.json
├── schema.sql
└── src/
    ├── types.ts           # Core types + helpers
    ├── db.ts              # Database layer
    ├── fetch.ts           # ESPN API client
    ├── features.ts        # Feature engineering
    ├── train.ts           # Model training
    ├── backtest.ts        # Validation system
    └── index.ts           # CLI entry point
```

## Commands Reference

```bash
# Setup
npm install
npm run build

# Data pipeline
npm run fetch              # Fetch 2023-2025 seasons
ncaam fetch --season 2025  # Single season
ncaam fetch --season 2025 --from 2025-01-01 --to 2025-03-31

# Model pipeline
npm run train              # Train on 2023-2025
npm run backtest           # Validate profitability

# Daily workflow (when in production)
npm run update             # Fetch new games + retrain
npm run recommend          # Show today's bets
```

## Success Metrics

**Minimum Viable Product:**
- [ ] 3-season backtest ROI >5%
- [ ] ECE <10%
- [ ] Sample size >500 games
- [ ] High-confidence tier ROI >15%

**Production Ready:**
- [ ] Consistent performance across seasons
- [ ] 5+ high-confidence bets per week (in-season)
- [ ] CLI displays backtest stats inline
- [ ] Automated daily updates working

**Optimization Goals:**
- [ ] Overall ROI >7%
- [ ] ECE <7%
- [ ] High-confidence ROI >20%
- [ ] Divergence filtering adds >3% ROI

## Next Actions

1. ✅ Review this implementation plan
2. 🏃 Run the validation pipeline (steps 1-5 above)
3. 🎯 Analyze backtest results
4. 🚦 Make go/no-go decision based on criteria
5. ⚡ If profitable → build recommendation engine
6. 🛑 If unprofitable → analyze failures and pivot

---

**Remember:** The goal is to make money, not build a complex system. If backtest fails, we learn fast and move on. Simplicity enables speed.

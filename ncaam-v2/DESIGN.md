# NCAAM V2 Design - Data-Driven Betting Tool

**Philosophy:** Ruthlessly prioritize what makes money. Cut everything else.

## Core Principles

1. **Start Simple, Add Only What's Proven**
   - Begin with 5 features, add more ONLY if they improve ROI
   - No feature makes it to production without backtest validation

2. **Moneylines Only (Initially)**
   - Current data shows: Moneylines profitable across all sports
   - Spreads broken in 3 of 4 sports → don't waste time
   - Totals work but are complex → phase 2

3. **Calibration Over Accuracy**
   - A 70% accurate model with ECE 5% beats 80% with ECE 20%
   - Betting requires reliable probabilities, not just correct picks

4. **High-Confidence Only**
   - Current data: 80-100% predictions = +15-30% ROI across sports
   - Mid-range (40-60%) = marginal or negative
   - Filter aggressively: show only bets with proven edge

5. **3-Season Validation Required**
   - 2-season models hide variance (NBA spreads: +11% → -3%)
   - Minimum 500 games for production confidence
   - Re-validate every season

## What We're Building

### Phase 1: Moneyline MVP (Weeks 1-2)
- Data: Games, odds, scores (SQLite)
- Features: 5-10 only, proven predictors
- Model: Single logistic regression (no ensemble yet)
- Output: Top 5 high-confidence bets with backtest stats
- Validation: 3-season backtest before showing ANY bets

### Phase 2: Refinement (Week 3)
- Add ensemble if it improves ROI >2%
- Test recency weighting (may not matter with 2 seasons)
- Optimize feature selection based on coefficients
- Add divergence filtering (model vs market >10%)

### Phase 3: Expansion (Week 4+)
- Add totals model ONLY if moneyline profitable
- Consider other sports if NCAAM ROI >5%
- Live odds tracking for line movement
- Bankroll management recommendations

## Architecture Decisions

### Data Layer
```
Simple and fast:
- ESPN API → SQLite (no complex ORM)
- Daily incremental updates
- Minimal caching (5 min for live games)
- No historical odds (just latest line for features)
```

### Feature Engineering
```
Start with these 5 proven winners:
1. Home/Away margin differential (10-game avg)
2. Home/Away win rate (10-game)
3. Opponent strength (SOS)
4. Home advantage indicator
5. Market implied probability

Add if they improve ROI:
- Pace metrics
- Recent form (last 3 games)
- Rest days
- Venue-specific stats
```

### Model Pipeline
```
Clean separation:
1. Extract: Pull games from DB with feature joins
2. Transform: Compute features, standardize
3. Train: L2-regularized logistic regression
4. Validate: Temporal split, compute ECE + ROI
5. Save: Only if ECE <10% AND ROI >3%
6. Apply: Generate predictions for upcoming games
```

### Recommendation Engine
```
Strict filtering:
- Predicted probability >80% OR <20%
- |Model - Market| >10% (divergence filter)
- Backtest ROI >5% for that confidence tier
- Display: Confidence tier, backtest stats, EV, suggested stake
```

## What We're NOT Building

❌ Multi-sport support (focus = depth not breadth)  
❌ Parlay generation (compounds negative EV)  
❌ Spread models (proven unprofitable)  
❌ Live betting (scope creep)  
❌ Web UI (CLI is faster to iterate)  
❌ Complex calibration (L2 regularization is enough)  
❌ Feature normalization (hurt calibration in v1)  

## Success Metrics

**Phase 1 (MVP):**
- [ ] 3-season backtest ROI >5% (NCAAM moneylines)
- [ ] ECE <10% (well-calibrated probabilities)
- [ ] High-confidence tier (>80%) ROI >15%
- [ ] Sample size >500 validated games

**Phase 2 (Refinement):**
- [ ] ROI improved by >2% from Phase 1
- [ ] 5+ bets per day during peak season
- [ ] Feature selection reduces model to 5-7 features
- [ ] Divergence filtering improves ROI by >3%

**Phase 3 (Expansion):**
- [ ] Totals model ROI >5% (if added)
- [ ] Multi-season consistency (no regression)
- [ ] Automated daily updates working
- [ ] ROI tracking vs actual bet results

## File Structure

```
ncaam-v2/
├── DESIGN.md           # This file
├── README.md           # Quick start guide
├── package.json        # Minimal dependencies
├── tsconfig.json       # TypeScript config
├── data/
│   └── ncaam.db        # SQLite database
├── src/
│   ├── index.ts        # CLI entry point
│   ├── data/
│   │   ├── fetch.ts    # ESPN API client
│   │   └── db.ts       # Database helpers
│   ├── features/
│   │   └── compute.ts  # Feature engineering
│   ├── model/
│   │   ├── train.ts    # Model training
│   │   ├── apply.ts    # Generate predictions
│   │   └── backtest.ts # Validation
│   └── recommend/
│       └── filter.ts   # Bet filtering and display
└── models/
    └── moneyline/      # Saved model artifacts
```

## Implementation Order

1. **Data ingestion** (ESPN → SQLite)
2. **Feature computation** (5 features only)
3. **Model training** (basic logistic regression)
4. **Backtesting** (3-season validation)
5. **Recommendation CLI** (high-confidence only)
6. **Iterate** (add features if ROI improves)

## Key Differences from V1

| V1 (Current) | V2 (New) |
|-------------|---------|
| 5 sports | NCAAM only (focused) |
| 3 market types | Moneylines only (profitable) |
| 36 features (totals) | 5-10 features (validated) |
| Ensemble from day 1 | Single model → ensemble if proven |
| Parlays by default | No parlays (negative EV) |
| Multi-sport CLI | Simple, focused CLI |
| Complex caching | Minimal caching |
| 7 tables | 4 tables max |

## Risk Mitigation

**"What if it's not profitable?"**
- Backtest BEFORE building full system
- If 3-season ROI <3%, kill the project
- Focus means we know quickly

**"What if we need more features?"**
- Add incrementally, one at a time
- Each must improve ROI >2% to stay
- Remove if weight < 0.1

**"What if the edge disappears?"**
- Re-validate quarterly
- Kill features that stop working
- Adapt faster with simpler system

## Timeline

- **Days 1-2:** Data ingestion + feature engineering
- **Days 3-4:** Model training + backtesting
- **Day 5:** Validation (if ROI <5%, restart with different features)
- **Days 6-7:** Recommendation engine + CLI
- **Week 2:** Testing with paper bets
- **Week 3+:** Refinement based on results

## Next Steps

1. Set up project structure
2. Implement ESPN data fetcher
3. Build 5-feature model
4. Run 3-season backtest (2023, 2024, 2025)
5. **Decision point:** ROI >5% → continue, else pivot

---

**Remember:** We're building a tool to make money, not a comprehensive sports analytics platform. Every line of code must justify itself through ROI improvement.

# NCAAM V2 - Data-Driven Betting Tool

**Focus:** College basketball moneylines only. Maximum ROI. Minimum complexity.

## Philosophy

This is a **complete rewrite** based on lessons from the original sportline project:

- ✅ **Moneylines only** - proven profitable across all sports
- ✅ **High-confidence bets** - 80%+ predictions show +15-30% ROI
- ✅ **3-season validation** - minimum 500 games before production
- ✅ **Simple feature set** - 5-10 features, each proven to improve ROI
- ❌ **No spreads** - unprofitable in 3 of 4 sports tested
- ❌ **No parlays** - compound negative EV
- ❌ **No over-engineering** - ruthlessly cut complexity

## Quick Start

```bash
# Install dependencies
npm install

# Build
npm run build

# Fetch historical data (2023-2025 seasons)
npm run fetch

# Train model
npm run train

# Validate with backtest
npm run backtest

# Get today's recommendations
npm run recommend

# Daily update (fetch new games + retrain)
npm run update
```

## Commands

### `fetch --season <years>`
Fetch games, odds, and scores from ESPN API.

```bash
ncaam fetch --season 2023,2024,2025
ncaam fetch --season 2025 --from 2025-01-01
```

### `train --season <years>`
Train moneyline model with temporal validation.

```bash
ncaam train --season 2023,2024,2025
```

**Success criteria:**
- Validation accuracy >70%
- ECE <10% (well-calibrated)
- High-confidence tier ROI >15%

### `backtest --season <years>`
Validate model profitability across seasons.

```bash
ncaam backtest --season 2023,2024,2025
```

**Minimum requirements:**
- 3-season ROI >5%
- Sample size >500 games
- Consistent performance across seasons

### `recommend [options]`
Show today's high-confidence bets.

```bash
# Default: 80%+ confidence only
ncaam recommend

# Custom threshold
ncaam recommend --min-confidence 75

# Next 7 days
ncaam recommend --days 7

# Show all with divergence filter
ncaam recommend --min-confidence 0 --min-divergence 10
```

**Output includes:**
- Predicted probability (model)
- Market probability (odds)
- Divergence (model vs market)
- Backtest ROI for this confidence tier
- Suggested stake (Kelly criterion)
- EV calculation

## Features (5-10 only)

**Current feature set:**
1. Home margin differential (10-game avg)
2. Away margin differential (10-game avg)
3. Home win rate (10-game)
4. Away win rate (10-game)
5. Opponent strength (SOS)
6. Home advantage indicator
7. Market implied probability

**Candidates for addition (if they improve ROI >2%):**
- Pace metrics (possessions per game)
- Recent form (last 3 games weighted)
- Rest days differential
- Venue-specific performance

## Model Architecture

**Type:** L2-regularized logistic regression  
**Training:** 70/30 temporal split (older games = train, recent = validate)  
**Regularization:** λ = 0.1 (prevent overfitting)  
**Output:** Probability home team wins  

**Ensemble (Phase 2):**
- Base model: Stats only (no market data)
- Market model: Stats + market implied probability
- Blend: 70% base + 30% market (if ensemble improves ROI >2%)

## Success Metrics

**Required for production:**
- ✅ 3-season ROI >5%
- ✅ ECE <10%
- ✅ High-confidence (>80%) ROI >15%
- ✅ Sample size >500 validated games

**Current status:** Not yet validated (new system)

## Development Roadmap

**Phase 1: MVP (Week 1-2)**
- [x] Project setup
- [ ] Data fetching (ESPN API)
- [ ] Feature engineering (5 features)
- [ ] Model training (basic logistic)
- [ ] Backtesting (3 seasons)
- [ ] Recommendation CLI

**Decision Point:** If 3-season ROI <5%, pivot or kill project.

**Phase 2: Refinement (Week 3)**
- [ ] Add ensemble if it improves ROI >2%
- [ ] Test additional features (one at a time)
- [ ] Optimize confidence thresholds
- [ ] Add divergence filtering

**Phase 3: Production (Week 4+)**
- [ ] Automated daily updates
- [ ] ROI tracking vs actual results
- [ ] Bankroll management tools
- [ ] Consider adding totals model

## Key Differences from V1

| V1 | V2 |
|----|-----|
| 5 sports | NCAAM only |
| Moneyline + spread + totals | Moneyline only |
| 17-36 features per model | 5-10 features |
| Multi-sport CLI complexity | Simple focused CLI |
| Parlays by default | No parlays |
| 7 database tables | 4 tables |
| Complex caching layer | Minimal caching |
| Feature normalization | No normalization (hurt calibration) |

## Why This Will Work Better

1. **Focus = Speed** - One sport means we iterate faster
2. **Simplicity = Reliability** - Fewer features = better calibration
3. **Validation First** - No production code without proven ROI
4. **Data-Driven** - Every decision backed by backtest results
5. **Cutting Losses** - Kill features/approaches that don't work

## License

MIT

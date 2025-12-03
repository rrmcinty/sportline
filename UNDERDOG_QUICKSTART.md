# Underdog Model Quick Start Guide 🐕

This is a **completely separate, experimental module** for finding profitable underdog bets in NCAAM basketball.

## What Makes This Different?

**Main Model**: Optimizes across all games (favorites + underdogs) to maximize overall ROI.

**Underdog Model**: Trained ONLY on underdog games (+100 or better) to learn upset patterns and find mispriced dogs.

## Quick Start (5 minutes)

### 1. Ensure you have historical data

```bash
# Check if you have data for 2022-2025
sportline data ingest --sport ncaam --season 2022
sportline data ingest --sport ncaam --season 2023
sportline data ingest --sport ncaam --season 2024
sportline data ingest --sport ncaam --season 2025
```

### 2. Train the underdog model

```bash
# Train on all seasons (recommended for maximum statistical power)
sportline underdog train

# Or specify seasons manually
sportline underdog train --seasons 2022,2023,2024,2025 --tiers moderate,heavy
```

**Training takes**: ~10-30 seconds for 4 seasons of data

**Output**: Model saved to `models/underdog-ncaam/underdog_{tiers}_{seasons}_{timestamp}/`

### 3. Get today's underdog predictions

```bash
# Show underdog opportunities for today
sportline underdog predict

# Specify a date
sportline underdog predict --date 20251210

# Only moderate dogs (+110 to +199)
sportline underdog predict --min-odds 110 --max-odds 199
```

**Output**: Ranked list of underdogs with:
- Model win probability vs market implied
- Edge percentage
- Expected value per $10 bet
- Kelley criterion bet sizing
- Confidence rating (high/medium/low)

### 4. Validate with backtest

```bash
# Backtest on historical data
sportline underdog backtest --seasons 2022,2023,2024,2025

# Test only moderate dogs
sportline underdog backtest --seasons 2023,2024,2025 --tiers moderate

# Stricter edge requirement (5% minimum)
sportline underdog backtest --seasons 2023,2024,2025 --min-edge 0.05
```

**Output**: ROI, win rate, and profit by odds range (e.g., +100-149, +150-199, etc.)

## Key Features

### Underdog-Specific Metrics
- **Upset Rate**: Historical win rate as underdog
- **Home Dog Advantage**: Home underdogs outperform by ~5%
- **Pace Differential**: Fast pace = more variance = better for dogs
- **Market Overreaction**: How far market diverged from actual performance

### Tiered Approach
- **Moderate (+100 to +199)**: Most reliable, 38-42% win rate target
- **Heavy (+200 to +299)**: High variance, 25-35% win rate target
- **Extreme (+300+)**: Lottery tickets, only bet with 15%+ edge

### Smart Bet Sizing
Uses **Kelley Criterion** to calculate optimal bet size:
- Accounts for win probability and odds
- Caps at 10% of bankroll (fractional Kelly for safety)
- Adjusts per prediction confidence

## Example Output

```bash
$ sportline underdog predict

🐕 Generating underdog predictions for NCAAM...

✅ Found 5 underdog opportunities:

1. 🔥 Butler +165 [MODERATE]
   vs Villanova
   Model: 42.3% | Market: 37.8% | Edge: +4.5%
   Expected Value: $1.85 per $10 bet
   Kelley Sizing: 3.2% of bankroll

2. ⚠️ Georgia Tech +145 [MODERATE]
   vs Duke
   Model: 38.7% | Market: 34.5% | Edge: +4.2%
   Expected Value: $1.20 per $10 bet
   Kelley Sizing: 2.8% of bankroll

📊 Summary:
   Total Expected Value: $8.45
   Average Edge: +4.8%
   High Confidence: 2
```

## When to Use This vs Main Model

### Use Underdog Model When:
✅ Looking specifically for underdog value  
✅ Want aggressive edge-seeking on dogs  
✅ Comfortable with higher variance  
✅ Betting moderate dogs (+100 to +199)  
✅ Large sample size (10+ bets per day)

### Use Main Model When:
✅ Want overall best ROI (favorites + underdogs)  
✅ Prefer lower variance  
✅ Betting favorites or close games  
✅ Single-game focus  
✅ Risk-averse bankroll management

## Expected Performance

### Target Metrics (Moderate Dogs)
- **Win Rate**: 38-42% (vs 37-40% market implied)
- **ROI**: +8-15%
- **Edge**: 3-8% average
- **ECE**: <10% (well-calibrated)

### Main Model Underdog Results (for comparison)
From 3-season NCAAM backtest:
- 0-10% bin: +45.4% ROI (38 games)
- 10-20% bin: +89.1% ROI (58 games)
- Overall underdogs: Suppressed by guardrails

**The Goal**: Capture this underdog value systematically without guardrails.

## Important Notes

⚠️ **This is experimental** - Underdog betting is high variance  
⚠️ **NCAAM only** - Not tested on other sports yet  
⚠️ **Use proper bankroll management** - Kelley sizing recommended  
⚠️ **Track CLV** - Closing line value validates edge  
⚠️ **Need large samples** - 50+ bets minimum for statistical significance

## Full Documentation

See [`src/underdog/README.md`](src/underdog/README.md) for:
- Architecture details
- Feature engineering
- Training methodology
- Best practices
- Advanced usage

## Questions?

1. **"How many seasons should I train on?"**  
   → All available (2022-2025) for maximum statistical power on rare upsets

2. **"What's a good minimum edge?"**  
   → 3% is default, 5% is safer but fewer bets

3. **"Can I use this for other sports?"**  
   → Not yet - features are NCAAM-specific. CFB/NFL/NBA need separate training.

4. **"Why 50/50 ensemble vs 70/30 in main model?"**  
   → Trust model more on underdogs where market is less efficient

5. **"What if backtest ROI is negative?"**  
   → Check by odds range - may need to focus on moderate dogs only

---

**Remember**: The house edge is real. We're looking for +EV opportunities, not guaranteed wins. Bet responsibly! 🎲

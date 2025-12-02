# Backtest Results Persistence System

## Overview

The system now automatically saves backtest results to JSON files and uses them to:
1. **Display historical performance** in the recommend command
2. **Analyze optimal configurations** across different training windows
3. **Provide transparency** to users about model performance

## Architecture

### File Structure

```
data/backtest-results/
  ├── nba_moneyline_2024-2025.json
  ├── nba_spread_2024-2025.json
  ├── nba_total_2024-2025.json
  ├── nfl_moneyline_2023-2024-2025.json
  └── ... (generated per sport/market/seasons combination)
```

### Components

#### 1. `src/model/backtest-storage.ts`
Persistence layer for backtest results:
- **`saveBacktestResults()`**: Saves backtest data to JSON
- **`loadBacktestResults()`**: Loads specific backtest configuration
- **`getAllBacktestResults()`**: Gets all backtests for a sport
- **`findBestConfig()`**: Finds optimal training configuration by ROI/ECE
- **`getLatestBacktestForConfig()`**: Used by recommend command

#### 2. `src/model/backtest.ts` (Modified)
Now saves results after each backtest:
- `backtestMoneyline()` → saves to `{sport}_moneyline_{seasons}.json`
- `backtestSpreads()` → saves to `{sport}_spread_{seasons}.json`
- `backtestTotals()` → saves to `{sport}_total_{seasons}.json`

Saved data includes:
- Overall ROI and Expected Calibration Error (ECE)
- Total profit/bets
- Per-bin calibration statistics
- Timestamp of backtest run
- Games analyzed (total, with predictions, with odds)

#### 3. `src/model/update-optimal-configs.ts`
Analyzes all backtest results to recommend optimal configurations:
```bash
node dist/model/update-optimal-configs.js
```

Output example:
```
✅ RECOMMENDED CONFIGURATIONS (ROI >= 5%):

NBA moneyline:
  Seasons: 2024, 2025
  ROI: +5.8%
  ECE: 4.50%
  Strong performance: 5.8% ROI
```

#### 4. `src/cli/commands.ts` (Modified)
The `recommend` command now:
1. Identifies sport/market for each bet
2. Loads corresponding backtest results via `getBacktestStats()`
3. Displays historical performance inline:
   ```
   Historical: 52.9% win rate, +5.8% ROI - NBA moneyline (seasons 2024, 2025)
   ```

## Usage

### Running Backtests (Auto-Saves Results)
```bash
# Run backtest - results automatically saved to JSON
sportline model backtest --sport nba --season 2024,2025 --market moneyline

# Check saved results
ls data/backtest-results/
cat data/backtest-results/nba_moneyline_2024-2025.json
```

### Analyzing Optimal Configurations
```bash
# After running backtests, analyze which configs are best
node dist/model/update-optimal-configs.js
```

This shows which sport/market/season combinations are profitable (ROI >= 5%) and which should be avoided.

### Using in Recommend Command
```bash
# Recommend command automatically loads and displays backtest results
sportline recommend --sport nba --date 20241201
```

Output now includes:
```
1. ⚠️ CLE ML -125 [NBA]
   Historical: 52.9% win rate, +5.8% ROI - NBA moneyline (seasons 2024, 2025)
```

## Data Schema

```typescript
interface BacktestResults {
  sport: Sport;
  market: "moneyline" | "spread" | "total";
  seasons: number[];
  timestamp: string;
  totalGames: number;
  gamesWithPredictions: number;
  gamesWithOdds: number;
  overallROI: number;
  overallECE: number;
  totalProfit: number;
  totalBets: number;
  calibration: CalibrationBin[];
}

interface CalibrationBin {
  bin: string;           // e.g., "60-70%"
  predicted: number;     // Average predicted probability
  actual: number;        // Actual win rate
  count: number;         // Games in this bin
  bets: number;          // Bets placed in this bin
  profit: number;        // Total profit ($)
  roi: number;           // Return on investment (%)
}
```

## Benefits

### 1. Transparency
Users see **actual historical performance** for each recommendation:
- Win rate from real backtests
- ROI from optimal configuration
- Training window used (which seasons)

### 2. Continuous Improvement
- Each backtest run updates the data
- Can track performance over time
- Easy to identify which configs are improving/degrading

### 3. Data-Driven Configuration
- `update-optimal-configs.js` analyzes all results
- Recommends best configurations automatically
- Flags unprofitable markets (ROI < 5%)

### 4. No Hardcoded Stats
- Old system: Hardcoded stats from markdown files
- New system: Dynamic loading from actual backtest runs
- Always up-to-date with latest model performance

## Future Enhancements

### Automatic Config Updates
Could extend `update-optimal-configs.ts` to:
1. Automatically rewrite `optimal-config.ts` with best configs
2. Commit changes to git with performance diffs
3. Run as part of CI/CD pipeline

### Historical Tracking
Could add:
- Time-series of ROI/ECE changes
- Performance degradation alerts
- A/B testing between configurations

### Recommend Command Enhancements
Could show:
- Confidence intervals from backtest variance
- Number of historical bets in similar situations
- Trend arrows (↑/↓) showing recent performance changes

## Example Workflow

```bash
# 1. Train models with optimal configs (auto-selected)
sportline model train --sport nba --markets moneyline,total

# 2. Run backtests (auto-saves results)
sportline model backtest --sport nba --season 2024,2025 --market moneyline
sportline model backtest --sport nba --season 2024,2025 --market total

# 3. Analyze optimal configurations
node dist/model/update-optimal-configs.js

# 4. Get recommendations with historical context
sportline recommend --sport nba --date 20241201
```

Each recommendation now shows:
- Expected value (forward-looking)
- Historical performance (backward-looking validation)
- Training configuration used

This gives users complete transparency about why bets are recommended and what to expect based on historical performance.

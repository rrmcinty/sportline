# NCAAM Moneyline Model V2 — Progress & Context Log

## Project Overview
- **Goal:** Build and iterate on a logistic regression model to predict NCAA men's basketball moneyline outcomes, using both rolling stat features and outcome-based rolling features, with flexible config-driven feature selection.
- **Stack:** TypeScript (Node.js, ESM), better-sqlite3, ml-logistic-regression, ml-matrix, SQLite for data storage.

## Data Pipeline
- **Data ingestion:**
  - Scripts fetch and process ESPN NCAAM data (teams, games, stats, odds) into JSON, then import into SQLite (`importNcaamToDb.ts`).
  - Handles missing teams/games/odds/stats robustly, logs issues for review.
- **Database schema:**
  - `games`, `teams`, `odds`, `game_stats`, `season_stats` tables.

## Model Training Script (`trainNcaamMoneyline.ts`)
- **Config-driven:**
  - All features (stat-based and outcome-based) are toggled via `ncaam_moneyline_features.json`.
  - Config includes: seasons, features, rolling_windows, allowed_providers.
- **Feature types:**
  - **Rolling stat features:** e.g., `fieldGoalsMade`, `assists`, etc. — rolling averages over N games, computed from `game_stats`.
  - **Outcome-based rolling features:** e.g., `homeWinRate5`, `homeAvgMargin5`, etc. — computed from game outcomes over N games, via custom helpers.
  - **Market features:** e.g., `marketImpliedProb` — computed from odds, optional.
- **Feature selection:**
  - Any feature can be toggled on/off in the config. The script only includes features set to `true`.
- **Odds provider logic:**
  - Tries allowed providers first, falls back to any provider if none found.
- **Skip logic:**
  - Skips games with missing rolling stats, odds, or required features (e.g., if `marketImpliedProb` is enabled but missing).
  - Logs all skips for debugging.
- **Mean imputation:**
  - For rolling stat features, missing values are imputed with the mean (except for games skipped entirely).
- **Model training:**
  - Logistic regression (ml-logistic-regression) on selected features.
  - 80/20 train/test split, accuracy and log loss reported.
  - Debug logs written to file (class balance, sample predictions).

## Key Experiments & Findings
- **Initial runs:**
  - Only away wins were present due to a bug; fixed by correcting score extraction.
- **Odds filtering:**
  - Many games skipped due to strict provider filtering; added fallback to any provider.
- **Feature flexibility:**
  - Added config toggles for all features, including outcome-based and market features.
- **Rolling stat vs. outcome-based features:**
  - Outcome-based rolling features (win rate, margin) are highly predictive, sometimes outperforming raw stat rolling averages.
  - Adding more raw stats can sometimes hurt accuracy (possible overfitting or noise).
- **Robustness:**
  - Script now exits gracefully if no games are available after filtering.
  - All skip reasons are logged for analysis.

## Current Config Example
```json
{
  "sport": "ncaam",
  "market": "moneyline",
  "seasons": [2024, 2025],
  "features": {
    "fieldGoalsMade": true,
    "homeWinRate5": true,
    "awayWinRate5": true,
    "homeAvgMargin5": true,
    "awayAvgMargin5": true,
    "homeWinRate10": true,
    "awayWinRate10": true,
    "homeAdvantage": true
  },
  "rolling_windows": [5, 10],
  "allowed_providers": ["ESPN Bet - Live Odds", "ESPN BET"]
}
```

## Outstanding Issues / Next Steps
- If only outcome-based features are enabled, rolling stat skip logic may still require at least one stat feature (could be refactored for pure outcome-based models).
- Feature importance analysis and regularization could help with overfitting when using many raw stats.
- Consider adding more advanced features (e.g., opponent-adjusted stats, recency weighting).
- Continue monitoring skip logs for data quality issues.

## Summary for Next AI
- The codebase is robust, config-driven, and ready for further feature engineering and model experimentation.
- All feature toggling is via config; script logic is unified for both stat and outcome-based rolling features.
- See skip logs and debug logs for troubleshooting data/feature issues.
- See this file for a summary of all major design and debugging decisions to date.

-- NCAAM V2 Database Schema
-- Simple, focused on what matters for moneyline predictions

-- Teams
CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  abbreviation TEXT,
  conference TEXT,
  UNIQUE(id)
);

-- Games (historical + upcoming)
CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL,           -- YYYY-MM-DD format
  season INTEGER NOT NULL,      -- 2023, 2024, 2025
  home_team_id INTEGER NOT NULL,
  away_team_id INTEGER NOT NULL,
  home_score INTEGER,           -- NULL if not played yet
  away_score INTEGER,           -- NULL if not played yet
  status TEXT,                  -- 'scheduled', 'final', 'in_progress'
  venue TEXT,
  FOREIGN KEY (home_team_id) REFERENCES teams(id),
  FOREIGN KEY (away_team_id) REFERENCES teams(id),
  UNIQUE(id)
);

CREATE INDEX IF NOT EXISTS idx_games_date ON games(date);
CREATE INDEX IF NOT EXISTS idx_games_season ON games(season);
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
CREATE INDEX IF NOT EXISTS idx_games_home_team ON games(home_team_id);
CREATE INDEX IF NOT EXISTS idx_games_away_team ON games(away_team_id);

-- Odds (latest only, for features and betting)
CREATE TABLE IF NOT EXISTS odds (
  game_id INTEGER PRIMARY KEY,
  home_ml INTEGER,              -- American odds (e.g., -150, +120)
  away_ml INTEGER,
  home_implied_prob REAL,       -- Vig-free probability
  away_implied_prob REAL,
  provider TEXT,                -- 'ESPN BET', 'DraftKings', etc.
  updated_at TEXT,              -- ISO timestamp
  FOREIGN KEY (game_id) REFERENCES games(id)
);

-- Model predictions (save for tracking/validation)
CREATE TABLE IF NOT EXISTS predictions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL,
  model_version TEXT NOT NULL,  -- e.g., 'v2.0_2025-12-03'
  home_win_prob REAL NOT NULL,  -- Model's predicted probability
  confidence_tier TEXT,         -- 'extreme', 'high', 'medium', 'low'
  divergence REAL,              -- |model - market|
  recommended INTEGER,          -- 1 if shown to user, 0 if filtered
  created_at TEXT NOT NULL,     -- ISO timestamp
  FOREIGN KEY (game_id) REFERENCES games(id)
);

CREATE INDEX IF NOT EXISTS idx_predictions_game ON predictions(game_id);
CREATE INDEX IF NOT EXISTS idx_predictions_model ON predictions(model_version);
CREATE INDEX IF NOT EXISTS idx_predictions_recommended ON predictions(recommended);

-- Model metadata (track versions and performance)
CREATE TABLE IF NOT EXISTS model_runs (
  version TEXT PRIMARY KEY,     -- e.g., 'v2.0_2025-12-03'
  seasons TEXT NOT NULL,        -- '2023,2024,2025'
  features TEXT NOT NULL,       -- JSON array of feature names
  train_samples INTEGER,
  val_samples INTEGER,
  val_accuracy REAL,
  val_ece REAL,                 -- Expected Calibration Error
  backtest_roi REAL,            -- 3-season backtest ROI
  backtest_games INTEGER,
  high_conf_roi REAL,           -- ROI for >80% confidence
  high_conf_games INTEGER,
  trained_at TEXT NOT NULL,     -- ISO timestamp
  artifacts_path TEXT           -- Path to saved model weights
);

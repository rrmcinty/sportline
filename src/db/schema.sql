-- sportline SQLite schema for modeling pipeline

CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sport TEXT NOT NULL,
  espn_id TEXT NOT NULL,
  name TEXT NOT NULL,
  abbreviation TEXT,
  UNIQUE(sport, espn_id)
);

CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  espn_event_id TEXT NOT NULL,
  sport TEXT NOT NULL,
  date TEXT NOT NULL,
  season INTEGER NOT NULL,
  home_team_id INTEGER NOT NULL,
  away_team_id INTEGER NOT NULL,
  home_score INTEGER,
  away_score INTEGER,
  venue TEXT,
  status TEXT DEFAULT 'scheduled',
  FOREIGN KEY(home_team_id) REFERENCES teams(id),
  FOREIGN KEY(away_team_id) REFERENCES teams(id),
  UNIQUE(espn_event_id)
);

CREATE TABLE IF NOT EXISTS odds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL,
  provider TEXT NOT NULL,
  market TEXT NOT NULL,
  line REAL,
  price_home INTEGER,
  price_away INTEGER,
  price_over INTEGER,
  price_under INTEGER,
  timestamp TEXT NOT NULL,
  FOREIGN KEY(game_id) REFERENCES games(id)
);

CREATE TABLE IF NOT EXISTS team_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL,
  sport TEXT NOT NULL,
  season INTEGER NOT NULL,
  game_date TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  metric_value REAL NOT NULL,
  FOREIGN KEY(team_id) REFERENCES teams(id)
);

CREATE TABLE IF NOT EXISTS features (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL,
  market TEXT NOT NULL,
  feature_name TEXT NOT NULL,
  value REAL NOT NULL,
  FOREIGN KEY(game_id) REFERENCES games(id)
);

CREATE TABLE IF NOT EXISTS model_runs (
  run_id TEXT PRIMARY KEY,
  sport TEXT NOT NULL,
  season INTEGER NOT NULL,
  config_json TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  metrics_json TEXT,
  artifacts_path TEXT
);

CREATE INDEX IF NOT EXISTS idx_games_date ON games(date);
CREATE INDEX IF NOT EXISTS idx_games_season ON games(season);
CREATE INDEX IF NOT EXISTS idx_odds_game ON odds(game_id);
CREATE INDEX IF NOT EXISTS idx_team_stats_team_season ON team_stats(team_id, season);
CREATE INDEX IF NOT EXISTS idx_features_game ON features(game_id);

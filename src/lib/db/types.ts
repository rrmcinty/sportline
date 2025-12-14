/**
 * TypeScript types for database entities and application models
 */

export interface Team {
  id: string; // ESPN team id
  sport: string;
  name: string;
  abbreviation: string | null;
  display_name: string | null;
  short_display_name: string | null;
}

export interface Game {
  id: string; // ESPN event id
  sport: string;
  date: string;
  season: number;
  home_team_id: string;
  away_team_id: string;
  home_score: number | null;
  away_score: number | null;
  venue: string | null;
  status: string;
}

export interface Odds {
  id: number;
  game_id: string;
  provider: string;
  market: string;
  line: number | null;
  price_home: number | null;
  price_away: number | null;
  price_over: number | null;
  price_under: number | null;
  timestamp: string;
}

export interface GameStats {
  id: number;
  game_id: string;
  team_id: string;
  sport: string;
  season: number;
  metric_name: string;
  metric_value: string | number;
}

export interface SeasonStats {
  id: number;
  team_id: string;
  sport: string;
  season: number;
  category: string;
  metric_name: string;
  metric_abbr: string | null;
  metric_value: string | null;
}

export interface TeamStats {
  id: number;
  team_id: string;
  sport: string;
  season: number;
  game_date: string;
  metric_name: string;
  metric_value: number;
}

export interface Features {
  id: number;
  game_id: string;
  market: string;
  feature_name: string;
  value: number;
}

export interface ModelRun {
  run_id: string;
  sport: string;
  season: number;
  config_json: string;
  started_at: string;
  finished_at: string | null;
  metrics_json: string | null;
  artifacts_path: string | null;
}

// Application-specific types

export interface FeatureConfig {
  sport: string;
  model: 'logistic_regression' | 'ensemble';
  market: string;
  seasons: number[];
  features: Record<string, boolean>;
  rolling_windows: number[];
  allowed_providers: string[];
  recency_weighting: {
    enabled: boolean;
    decay: number;
  };
  regularization?: {
    lambda: number;  // L2 regularization strength (higher = smaller weights)
    temperature?: number;  // Temperature scaling for calibration (default: 1.0)
  };
  calibration?: {
    method: 'temperature' | 'platt' | 'isotonic';  // Calibration method
    temperature: number;  // Temperature parameter (< 1.0 = less confident)
  };
  min_edge: number;
  min_ev: number;
  max_ev?: number;  // Maximum EV threshold to filter unrealistic bets
}

export interface GameFeatures {
  game_id: string;
  season: number;
  date: string;
  home_team: string;
  away_team: string;
  features: Record<string, number>;
  odds: OddsData[];
  target: number | null; // 1 for home win, 0 for away win, null if not completed
}

export interface OddsData {
  provider: string;
  home: number | null;
  away: number | null;
}

export interface Prediction {
  game_id: string;
  home_team: string;
  away_team: string;
  prob_home: number;
  prob_away: number;
}

export interface Recommendation {
  game_id: string;
  date: string;
  home_team: string;
  away_team: string;
  model_prob_home: number;
  model_prob_away: number;
  odds_home: number | null;
  odds_away: number | null;
  ev_home: number | null;
  ev_away: number | null;
  edge_home: number | null;
  edge_away: number | null;
  recommended_side: 'home' | 'away' | null;
  actual: number | null;
  provider: string;
}

export interface TrainedModel {
  sport: string;
  market: string;
  modelType: 'logistic_regression' | 'ensemble';
  trainedAt: string;
  seasons: number[];
  features: Record<string, boolean>;
  rollingWindows: number[];
  featureKeys: string[];
  featureMeans: Record<string, number>;
  featureStds: Record<string, number>;
  modelParams: LogisticRegressionParams | RandomForestParams;
  thresholds: {
    min_edge: number;
    min_ev: number;
  };
  backtestMetrics: {
    accuracy: number;
    logLoss: number;
    roi: number;
    totalBets: number;
    winRate: number;
  };
  recencyWeighting: {
    enabled: boolean;
    decay: number;
  };
  calibration?: {
    method: 'temperature' | 'platt' | 'isotonic';
    temperature: number;
  };
}

export interface LogisticRegressionParams {
  type: 'logistic_regression';
  theta: number[][];
  learningRate: number;
  numSteps: number;
}

export interface RandomForestParams {
  type: 'ensemble';
  nEstimators: number;
  maxFeatures: number;
  seed: number;
  // Random forest trees can't be easily serialized, so we'll need to retrain or use a different approach
}

export interface BacktestResult {
  threshold_edge: number;
  threshold_ev: number;
  total_bets: number;
  total_staked: number;
  total_profit: number;
  roi: number;
  win_rate: number;
  wins: number;
  losses: number;
  avg_odds: number;
  sharpe_ratio: number | null;
}

export interface ProbabilityBucket {
  bucket: string;
  count: number;
  accuracy: number;
  avg_ev: number;
  avg_edge: number;
  win_count: number;
  loss_count: number;
  total_profit: number;
  roi: number;
}

export interface TodaysGame extends Game {
  home_team_name: string;
  away_team_name: string;
  odds: Odds[];
}

/**
 * Temporary type stubs for compatibility with restored code
 * These will be properly integrated later
 */

import type { GameRow, OddsRow, GameFeatures as ModelGameFeatures } from '../../models/types.js';

// Re-export types from models
export type { GameRow, OddsRow };

// Extended GameFeatures for backtesting (includes game metadata and odds)
// Note: This shadows the ModelGameFeatures import for backtesting purposes
export interface GameFeatures {
  game_id: string;
  date: string;
  season: number;
  home_team: string;
  away_team: string;
  odds: Array<{
    provider?: string | null;
    price_home?: number | null;
    price_away?: number | null;
    line?: number | null;
  }>;
  target: number; // 1 for home win, 0 for away win
  features: ModelGameFeatures; // Nested model features
}

// Alias for Game type
export type Game = GameRow;

// Additional types for restored code
export interface OddsData {
  gameId: string;
  provider: string;
  market: string;
  line?: number | null;
  homeOdds?: number | null;
  awayOdds?: number | null;
  overOdds?: number | null;
  underOdds?: number | null;
}

export interface TeamRow {
  id: string;
  sport: string;
  name: string;
  abbreviation?: string;
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
  actual: number | null; // 1 for home win, 0 for away win
  provider: string;
  line: number | null;
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
  // Kelly betting metrics (optional)
  final_bankroll?: number;
  min_bankroll?: number;
  max_bankroll?: number;
  max_bet_size?: number;
  bankroll_roi?: number; // (final_bankroll - starting_bankroll) / starting_bankroll
}

export interface ProbabilityBucket {
  bucket: string; // e.g., "50-60"
  count: number;
  accuracy: number;
  avg_ev: number;
  avg_edge: number;
  win_count: number;
  loss_count: number;
  total_profit: number;
  roi: number;
  home_bet_count: number;
  away_bet_count: number;
  home_bet_percentage: number;
  away_bet_percentage: number;
}

export interface FeatureConfig {
  name: string;
  enabled: boolean;
  parameters?: Record<string, unknown>;
}

export interface EnhancedBacktestMetrics {
  // Core metrics (from BacktestResult)
  roi: number;
  win_rate: number;
  total_bets: number;
  total_profit: number;

  // Calibration
  ece: number; // Expected Calibration Error

  // Risk metrics
  max_drawdown: number; // Maximum drawdown (%)
  max_drawdown_duration: number; // Longest drawdown period (days)
  sharpe_ratio: number; // Risk-adjusted return
  sortino_ratio: number; // Downside risk-adjusted return

  // Time series
  cumulative_roi_over_time: Array<{
    date: string;
    cumulative_roi: number;
    cumulative_profit: number;
    bet_count: number;
  }>;

  // ROI by confidence bucket
  roi_by_confidence: Array<{
    bucket: string; // e.g., "50-60%"
    bets: number;
    roi: number;
    win_rate: number;
    avg_prob: number;
  }>;
}

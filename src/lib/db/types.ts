/**
 * Temporary type stubs for compatibility with restored code
 * These will be properly integrated later
 */

import type { GameRow, OddsRow, GameFeatures as ModelGameFeatures } from '../../models/types.js';

// Re-export types from models
export type { GameRow, OddsRow };
export type GameFeatures = ModelGameFeatures;

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
  gameId: string;
  predictedProbability: number;
  edge: number;
  ev: number;
  odds: number;
  side: 'home' | 'away';
}

export interface BacktestResult {
  totalBets: number;
  wins: number;
  losses: number;
  winRate: number;
  roi: number;
  totalProfit: number;
  avgEdge: number;
}

export interface ProbabilityBucket {
  min: number;
  max: number;
  bets: number;
  wins: number;
  winRate: number;
  avgPredicted: number;
  calibrationError: number;
}

export interface FeatureConfig {
  name: string;
  enabled: boolean;
  parameters?: Record<string, unknown>;
}

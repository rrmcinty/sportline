/**
 * Type definitions for NFL spread-specific modeling
 */

import type { GameFeatures } from "../../model/features.js";

/**
 * Extended features for NFL spread modeling
 */
export interface NFLSpreadGameFeatures extends GameFeatures {
  // Spread-specific features
  homeATSRecord5: number; // ATS win rate (last 5 games)
  awayATSRecord5: number;
  homeATSRecord10: number; // ATS win rate (last 10 games)
  awayATSRecord10: number;
  homeATSMargin5: number; // Avg margin vs spread (last 5)
  awayATSMargin5: number;
  homeATSMargin10: number; // Avg margin vs spread (last 10)
  awayATSMargin10: number;
  spreadMovement: number; // Opening vs closing spread movement
  marketOverreaction: number; // How much spread moved vs actual performance
  homeRestDays: number | null; // Days since last game (if available)
  awayRestDays: number | null;
  favoriteTeam: "home" | "away" | null; // Which team is favored by spread
  spreadSize: number; // Absolute value of spread
  isTightSpread: number; // 1 if spread <= 3, 0 otherwise (coin flip games)
}

/**
 * Confidence bucket for spread predictions
 */
export type SpreadConfidenceBucket =
  | "0-10%"
  | "10-20%"
  | "20-30%"
  | "30-40%"
  | "40-50%"
  | "50-60%"
  | "60-70%"
  | "70-80%"
  | "80-90%"
  | "90-100%";

/**
 * NFL spread model artifacts
 */
export interface NFLSpreadModel {
  weights: number[];
  featureNames: string[];
  seasons: number[];
  timestamp: string;
  metrics: {
    accuracy: number;
    roi: number;
    ece: number;
    brier: number;
    logLoss: number;
    sampleSize: number;
  };
}

/**
 * NFL spread prediction result
 */
export interface NFLSpreadPrediction {
  gameId: number;
  date: string;
  homeTeam: string;
  awayTeam: string;
  spreadLine: number;
  favoriteTeam: "home" | "away";
  homeCoverProbability: number; // Model's probability home covers
  marketProbability: number; // Market's implied probability
  edge: number; // modelProb - marketProb
  expectedValue: number; // Expected value of $10 bet
  confidence: SpreadConfidenceBucket;
  isProfitableBucket: boolean; // True if confidence bucket is historically profitable
  traits: string[]; // List of favorable traits (e.g., "Home favorite -3 or less", "Strong ATS trend")
}

/**
 * NFL spread backtest results
 */
export interface NFLSpreadBacktestResults {
  seasons: number[];
  timestamp: string;
  totalGames: number;
  totalBets: number;
  wins: number;
  losses: number;
  pushes: number;
  winRate: number;
  totalProfit: number;
  roi: number;
  ece: number;
  brier: number;
  logLoss: number;
  byConfidenceBucket: Array<{
    bucket: SpreadConfidenceBucket;
    bets: number;
    wins: number;
    losses: number;
    pushes: number;
    winRate: number;
    profit: number;
    roi: number;
  }>;
  bySpreadSize: Array<{
    range: string; // e.g., "0-3", "3.5-7", "7.5+"
    bets: number;
    wins: number;
    winRate: number;
    profit: number;
    roi: number;
  }>;
}

/**
 * Traits analysis result
 */
export interface SpreadTraitsAnalysis {
  bucket: SpreadConfidenceBucket;
  profitableTrait: {
    name: string;
    description: string;
    winRate: number;
    roi: number;
    sampleSize: number;
    avgFeatures: Record<string, number>;
  };
  unprofitableTrait: {
    name: string;
    description: string;
    winRate: number;
    roi: number;
    sampleSize: number;
    avgFeatures: Record<string, number>;
  };
}

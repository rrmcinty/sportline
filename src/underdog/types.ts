/**
 * Type definitions for underdog-specific modeling
 */

import type { GameFeatures } from "../model/features.js";

/**
 * Underdog betting tiers based on moneyline odds
 */
export type UnderdogTier = "moderate" | "heavy" | "extreme";

/**
 * Extended features for underdog modeling
 */
export interface UnderdogGameFeatures extends GameFeatures {
  // Underdog-specific features
  homeUpsetRate5: number;      // Win rate as underdog (last 5 underdog games)
  awayUpsetRate5: number;
  homeUpsetRate10: number;     // Win rate as underdog (last 10 underdog games)
  awayUpsetRate10: number;
  homeAsUnderdog: number;      // 1 if home is underdog, 0 otherwise
  awayAsUnderdog: number;      // 1 if away is underdog, 0 otherwise
  homeDogAdvantage: number;    // Home court multiplier for underdogs
  paceDifferential: number;    // Pace diff (fast pace favors underdogs)
  confStrengthDiff: number;    // Conference strength differential (proxy)
  recentDogTrend5: number;     // Recent trend as underdog (5 games)
  recentDogTrend10: number;    // Recent trend as underdog (10 games)
  marketOverreaction: number;  // How much market moved vs actual performance
  // Tier classification
  underdogTier: UnderdogTier | null;  // null if neither team is underdog
  underdogTeam: "home" | "away" | null;
}

/**
 * Underdog model artifacts
 */
export interface UnderdogModel {
  weights: number[];
  featureNames: string[];
  tier: UnderdogTier;
  sport: "ncaam" | "cfb" | "nfl" | "nba" | "nhl";
  seasons: number[];
  timestamp: string;
  metrics: {
    roi: number;
    ece: number;
    winRate: number;
    sampleSize: number;
  };
}

/**
 * Underdog prediction result
 */
export interface UnderdogPrediction {
  gameId: number;
  date: string;
  homeTeam: string;
  awayTeam: string;
  underdogTeam: "home" | "away";
  underdogTier: UnderdogTier;
  modelProbability: number;      // Model's win probability for underdog
  marketProbability: number;     // Market's implied probability for underdog
  edge: number;                  // modelProb - marketProb
  odds: number;                  // American odds (e.g., +150)
  expectedValue: number;         // Expected value of $10 bet
  kelleySizing: number;          // Kelley criterion optimal bet % of bankroll
  confidence: "high" | "medium" | "low";
}

/**
 * Underdog backtest results
 */
export interface UnderdogBacktestResults {
  sport: string;
  seasons: number[];
  tier: UnderdogTier;
  timestamp: string;
  totalGames: number;
  totalBets: number;
  wins: number;
  losses: number;
  winRate: number;
  totalProfit: number;
  roi: number;
  ece: number;
  avgOdds: number;
  avgEdge: number;
  closingLineValue: number;  // Avg improvement vs closing line
  byOddsRange: Array<{
    range: string;  // e.g., "+100 to +149"
    bets: number;
    wins: number;
    winRate: number;
    profit: number;
    roi: number;
  }>;
}

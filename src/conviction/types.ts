/**
 * Type definitions for high-conviction betting classifier
 */

import type { Sport, MarketType } from "../models/types.js";

/**
 * Profitable betting profile (golden profile)
 */
export interface ConvictionProfile {
  sport: Sport;
  market: MarketType;
  minConfidence: number;  // e.g., 0.20 for 20% confidence
  maxConfidence: number;  // e.g., 0.40 for 40% confidence
  side: "underdog" | "favorite" | "either";
  name: string;  // e.g., "NBA Underdog 20-40%"
  sampleSize: number;  // Number of bets matching this profile in backtest
  roi: number;  // Historical ROI from backtest
  winRate: number;  // Historical win rate
  avgOdds: number;  // Average odds for this profile
}

/**
 * Features for the conviction classifier
 */
export interface ConvictionFeatures {
  // Identifiers
  gameId: number;
  date: string;
  sport: Sport;
  market: MarketType;
  homeTeam: string;
  awayTeam: string;

  // Prediction metadata
  modelProbability: number;  // Raw model prediction for winning side
  marketProbability: number;  // Vig-free market implied probability
  confidenceBucket: string;  // e.g., "20-30%"
  
  // Profile matching
  isUnderdog: boolean;  // Model predicts underdog wins
  isFavorite: boolean;  // Model predicts favorite wins
  
  // Odds info
  odds: number;  // American odds (e.g., +150)
  oddsRange: string;  // e.g., "+150 to +199"
  
  // Historical ROI for this bucket
  bucketHistoricalROI: number;  // Average ROI from backtest for this confidence bucket
  bucketWinRate: number;  // Win rate from backtest for this bucket
  bucketSampleSize: number;  // Sample size in backtest for this bucket
  
  // Profile indicators (0 or 1)
  matchesNBAUnderdog20_40: number;
  matchesCFBUnderdog10_40: number;
  matchesHighConfidenceFavorite: number;
  
  // Divergence
  modelMarketDivergence: number;  // modelProb - marketProb
}

/**
 * Training data point for the conviction classifier
 */
export interface ConvictionTrainingPoint {
  features: ConvictionFeatures;
  label: "HIGH_CONVICTION" | "PASS";  // HIGH_CONVICTION if historical ROI >20%, PASS if <5%
  historicalROI: number;  // Actual ROI from backtest
}

/**
 * Trained conviction classifier model
 */
export interface ConvictionModel {
  weights: number[];
  featureNames: string[];
  sport: Sport;
  market: MarketType;
  profiles: ConvictionProfile[];
  timestamp: string;
  trainConfig: {
    totalTrainingPoints: number;
    highConvictionCount: number;
    passCount: number;
    trainTestSplit: number;
    temporalValidation: boolean;
  };
  metrics: {
    trainingAccuracy: number;
    validationAccuracy: number;
    precision: number;  // TP / (TP + FP)
    recall: number;  // TP / (TP + FN)
    f1Score: number;
  };
}

/**
 * Conviction prediction for a game
 */
export interface ConvictionPrediction {
  gameId: number;
  date: string;
  sport: Sport;
  market: MarketType;
  homeTeam: string;
  awayTeam: string;
  pick: string;  // e.g., "LAL ML +150"
  
  // Conviction classifier output
  isHighConviction: boolean;
  convictionScore: number;  // Probability (0-1) that this matches high-conviction profile
  confidenceLevel: "VERY_HIGH" | "HIGH" | "MEDIUM" | "PASS";
  
  // Model prediction
  modelProbability: number;
  odds: number;
  
  // Profile matched
  matchedProfile: ConvictionProfile | null;
  matchedProfileName: string;
  
  // Expected value
  expectedValue: number;  // EV of $10 bet
  expectedROI: number;  // Based on matched profile's historical ROI
  
  // Reasoning
  reasoning: string;  // Explanation of why this is/isn't high conviction
}

/**
 * Conviction backtest results
 */
export interface ConvictionBacktestResults {
  sport: Sport;
  market: MarketType;
  seasons: number[];
  timestamp: string;
  
  // Overall performance
  totalBets: number;
  totalHighConvictionBets: number;
  wins: number;
  losses: number;
  pushes: number;
  
  // Performance metrics
  winRate: number;
  roi: number;
  totalProfit: number;
  
  // Confidence intervals (95% bootstrap)
  roiLowerBound: number;
  roiUpperBound: number;
  roiPointEstimate: number;
  
  // Per-profile breakdown
  byProfile: Array<{
    profileName: string;
    bets: number;
    wins: number;
    winRate: number;
    roi: number;
    profit: number;
  }>;
  
  // Model quality
  precision: number;  // Of high-conviction picks, how many were actually profitable?
  recall: number;  // Of all profitable bets, what % were identified as high-conviction?
  
  // Monitoring
  rollingPerformance: Array<{
    bets: number;  // Cumulative number of bets
    roi: number;  // ROI at this point
  }>;
}

/**
 * Performance monitoring tracker (for early-warning system)
 */
export interface ConvictionMonitor {
  sport: Sport;
  market: MarketType;
  recentBets: Array<{
    gameId: number;
    date: string;
    prediction: ConvictionPrediction;
    result: "WIN" | "LOSS" | "PUSH" | "PENDING";
    actualProfit: number;
  }>;
  
  // Metrics
  recentWinRate: number;  // Last 20 bets win rate
  recentROI: number;  // Last 20 bets ROI
  consecutiveLosses: number;  // Current losing streak
  
  // Halt status
  isHalted: boolean;
  haltReason?: string;
  haltedAt?: string;
  lastRetrain?: string;
}

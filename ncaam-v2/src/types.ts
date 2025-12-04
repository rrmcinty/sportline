/**
 * Core types for NCAAM V2
 * Keep it simple - only what we need
 */

export interface Team {
  id: number;
  name: string;
  abbreviation?: string;
  conference?: string;
}

export interface Game {
  id: number;
  date: string;              // YYYY-MM-DD
  season: number;            // 2023, 2024, 2025
  homeTeamId: number;
  awayTeamId: number;
  homeScore?: number;        // null if not played
  awayScore?: number;
  status: 'scheduled' | 'final' | 'in_progress';
  venue?: string;
}

export interface Odds {
  gameId: number;
  homeML: number;            // American odds (e.g., -150)
  awayML: number;            // American odds (e.g., +120)
  homeImpliedProb: number;   // Vig-free probability
  awayImpliedProb: number;
  provider: string;
  updatedAt: string;         // ISO timestamp
}

export interface GameFeatures {
  gameId: number;
  // Core performance metrics (10-game windows)
  homeMargin10: number;      // Avg point differential
  awayMargin10: number;
  homeWinRate10: number;     // 0.0 to 1.0
  awayWinRate10: number;
  // Strength of schedule
  homeOppStrength: number;   // Opponent avg win rate
  awayOppStrength: number;
  // Context
  homeAdvantage: number;     // 1 for home, 0 for away
  // Market (optional for ensemble)
  marketImpliedProb?: number;
}

export interface Prediction {
  gameId: number;
  modelVersion: string;
  homeWinProb: number;       // Model prediction
  confidenceTier: 'extreme' | 'high' | 'medium' | 'low';
  divergence: number;        // |model - market|
  recommended: boolean;      // Whether shown to user
  createdAt: string;
}

export interface ModelMetadata {
  version: string;           // e.g., 'v2.0_2025-12-03'
  seasons: number[];         // [2023, 2024, 2025]
  features: string[];        // Feature names
  trainSamples: number;
  valSamples: number;
  valAccuracy: number;
  valECE: number;            // Expected Calibration Error
  backtestROI: number;       // 3-season ROI
  backtestGames: number;
  highConfROI: number;       // ROI for >80% confidence
  highConfGames: number;
  trainedAt: string;
  artifactsPath: string;
}

export interface Recommendation {
  game: Game;
  homeTeam: Team;
  awayTeam: Team;
  prediction: Prediction;
  odds: Odds;
  expectedValue: number;     // (prob * payout) - stake
  suggestedStake: number;    // Kelly criterion
  backtestROI: number;       // Historical ROI for this tier
}

/**
 * American odds conversion helpers
 */
export function oddsToDecimal(american: number): number {
  if (american > 0) {
    return (american / 100) + 1;
  } else {
    return (100 / Math.abs(american)) + 1;
  }
}

export function oddsToImpliedProb(american: number): number {
  if (american > 0) {
    return 100 / (american + 100);
  } else {
    return Math.abs(american) / (Math.abs(american) + 100);
  }
}

/**
 * Remove vig to get fair probabilities
 */
export function removeVig(homeOdds: number, awayOdds: number): { home: number; away: number } {
  const homeRaw = oddsToImpliedProb(homeOdds);
  const awayRaw = oddsToImpliedProb(awayOdds);
  const total = homeRaw + awayRaw;
  
  return {
    home: homeRaw / total,
    away: awayRaw / total
  };
}

/**
 * Calculate expected value
 */
export function calculateEV(
  winProb: number,
  odds: number,
  stake: number = 10
): { payout: number; profit: number; ev: number } {
  const decimalOdds = oddsToDecimal(odds);
  const payout = stake * decimalOdds;
  const profit = payout - stake;
  const ev = (winProb * payout) - stake;
  
  return { payout, profit, ev };
}

/**
 * Kelly criterion for optimal stake sizing
 * Returns fraction of bankroll to bet (0 to 1)
 */
export function kellyFraction(
  winProb: number,
  decimalOdds: number
): number {
  const b = decimalOdds - 1; // net odds
  const kelly = (winProb * b - (1 - winProb)) / b;
  
  // Safety: never bet more than 10% of bankroll (fractional Kelly)
  return Math.max(0, Math.min(kelly * 0.25, 0.10));
}

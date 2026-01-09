/**
 * Expected Value (EV) and edge calculation utilities
 */

import type { OddsData as _OddsData } from '../db/types.js';

/**
 * Convert American odds to decimal payout (profit per $1 staked)
 */
export function americanToDecimal(odds: number): number {
  if (odds > 0) {
    return 1 + odds / 100;
  } else {
    return 1 + 100 / Math.abs(odds);
  }
}

/**
 * Convert American odds to implied probability
 */
export function americanToImpliedProb(odds: number): number {
  if (odds > 0) {
    return 100 / (odds + 100);
  } else {
    return Math.abs(odds) / (Math.abs(odds) + 100);
  }
}

/**
 * Get market implied probability from odds array (normalized)
 */
export function getMarketImpliedProb(
  oddsArr: { home: number | null; away: number | null }[],
): number | null {
  for (const odds of oddsArr) {
    if (odds.home != null && odds.away != null) {
      const probHome = americanToImpliedProb(odds.home);
      const probAway = americanToImpliedProb(odds.away);
      // Normalize to remove vig
      return probHome / (probHome + probAway);
    }
  }
  return null;
}

/**
 * Calculate expected value (EV) for a bet
 * @param probability - Model's predicted probability of winning
 * @param odds - American odds for the bet
 * @returns Expected value as a decimal (e.g., 0.05 = 5% EV)
 */
export function calculateEV(probability: number, odds: number): number {
  const payout = americanToDecimal(odds);
  // EV = P(win) * (payout - 1) - P(lose) * 1
  return probability * (payout - 1) - (1 - probability);
}

/**
 * Calculate edge (difference between model probability and market probability)
 * @param modelProb - Model's predicted probability
 * @param marketProb - Market implied probability
 * @returns Edge as a decimal (e.g., 0.05 = 5% edge)
 */
export function calculateEdge(modelProb: number, marketProb: number): number {
  return modelProb - marketProb;
}

/**
 * Calculate both EV and edge for home and away bets
 */
export function calculateBettingMetrics(
  probHome: number,
  oddsHome: number | null,
  oddsAway: number | null,
): {
  ev_home: number | null;
  ev_away: number | null;
  edge_home: number | null;
  edge_away: number | null;
  implied_home: number | null;
  implied_away: number | null;
} {
  const probAway = 1 - probHome;

  let ev_home: number | null = null;
  let ev_away: number | null = null;
  let edge_home: number | null = null;
  let edge_away: number | null = null;
  let implied_home: number | null = null;
  let implied_away: number | null = null;

  if (oddsHome !== null && oddsAway !== null) {
    // Calculate EVs
    ev_home = calculateEV(probHome, oddsHome);
    ev_away = calculateEV(probAway, oddsAway);

    // Calculate market implied probabilities
    implied_home = americanToImpliedProb(oddsHome);
    implied_away = americanToImpliedProb(oddsAway);

    // Calculate edges
    edge_home = calculateEdge(probHome, implied_home);
    edge_away = calculateEdge(probAway, implied_away);
  }

  return {
    ev_home,
    ev_away,
    edge_home,
    edge_away,
    implied_home,
    implied_away,
  };
}

/**
 * Determine recommended side based on EV and edge thresholds
 */
export function getRecommendedSide(
  ev_home: number | null,
  ev_away: number | null,
  edge_home: number | null,
  edge_away: number | null,
  minEV: number,
  minEdge: number,
  maxEV?: number,
): 'home' | 'away' | null {
  // Filter out bets above max_ev threshold
  if (maxEV !== undefined) {
    if (ev_home !== null && ev_home > maxEV) ev_home = null;
    if (ev_away !== null && ev_away > maxEV) ev_away = null;
  }

  if (ev_home !== null && ev_home > minEV && edge_home !== null && edge_home > minEdge) {
    // Check if home is better than away
    if (ev_away === null || edge_away === null || ev_home > ev_away) {
      return 'home';
    }
  }

  if (ev_away !== null && ev_away > minEV && edge_away !== null && edge_away > minEdge) {
    return 'away';
  }

  return null;
}

/**
 * Format odds for display
 */
export function formatOdds(odds: number): string {
  if (odds > 0) {
    return `+${odds}`;
  }
  return odds.toString();
}

/**
 * Format percentage for display
 */
export function formatPercentage(value: number, decimals: number = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

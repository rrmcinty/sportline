/**
 * Odds conversion and Expected Value calculation utilities
 */

/**
 * Convert American odds to decimal odds
 * @param american American odds (e.g., +150, -200)
 * @returns Decimal odds (e.g., 2.5, 1.5)
 */
export function americanToDecimal(american: number): number {
  if (american > 0) {
    return american / 100 + 1;
  } else {
    return 100 / Math.abs(american) + 1;
  }
}

/**
 * Convert American odds to implied probability
 * @param american American odds (e.g., +150, -200)
 * @returns Implied probability (0-1 range)
 */
export function americanToImpliedProb(american: number): number {
  const decimal = americanToDecimal(american);
  return 1 / decimal;
}

/**
 * Calculate expected value of a bet
 * @param winProbability Probability of winning (0-1 range)
 * @param odds American odds
 * @returns Expected value (positive = good bet, negative = bad bet)
 */
export function calculateEV(winProbability: number, odds: number): number {
  const decimalOdds = americanToDecimal(odds);
  // EV = (winProb × payout) - stake
  // payout = stake × (decimalOdds - 1)
  // EV = (winProb × stake × (decimalOdds - 1)) - stake
  // Factor out stake (assume stake = 1)
  // EV = (winProb × (decimalOdds - 1)) - (1 - winProb)
  return winProbability * (decimalOdds - 1) - (1 - winProbability);
}

/**
 * Calculate Kelly Criterion percentage for optimal bet sizing
 * @param winProbability Probability of winning (0-1 range)
 * @param odds American odds
 * @returns Kelly percentage (0-1 range, may be negative if not a good bet)
 */
export function calculateKellyPercentage(winProbability: number, odds: number): number {
  const decimalOdds = americanToDecimal(odds);
  const q = 1 - winProbability;
  const b = decimalOdds - 1; // net odds received on the wager

  // Kelly formula: f = (bp - q) / b
  // where f = fraction of bankroll, b = net odds, p = win prob, q = loss prob
  if (b <= 0) {
    return 0;
  }

  const kelly = (b * winProbability - q) / b;
  // Cap at reasonable maximum (e.g., 25% of bankroll)
  return Math.max(0, Math.min(0.25, kelly));
}

/**
 * Convert decimal odds to American odds
 * @param decimal Decimal odds (e.g., 2.5, 1.5)
 * @returns American odds (e.g., +150, -200)
 */
export function decimalToAmerican(decimal: number): number {
  if (decimal >= 2) {
    return (decimal - 1) * 100;
  } else {
    return -100 / (decimal - 1);
  }
}

/**
 * Remove sportsbook vig (vigorish) from implied probabilities
 * Sportsbooks set odds so implied probabilities sum to > 1.0 (e.g., 1.05-1.08)
 * This normalizes them back to sum to 1.0, giving true probabilities
 *
 * Example:
 *   Home odds: -110 (implied prob: 0.524)
 *   Away odds: -110 (implied prob: 0.524)
 *   Total: 1.048 (4.8% vig)
 *   After removal: { homeTrue: 0.50, awayTrue: 0.50 }
 *
 * @param homeImplied Home team implied probability (0-1 range)
 * @param awayImplied Away team implied probability (0-1 range)
 * @returns True probabilities without vig
 */
export function removeVig(
  homeImplied: number,
  awayImplied: number,
): { homeTrue: number; awayTrue: number } {
  const total = homeImplied + awayImplied;
  return {
    homeTrue: homeImplied / total,
    awayTrue: awayImplied / total,
  };
}

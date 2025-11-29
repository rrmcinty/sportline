/**
 * Odds conversion and probability utilities
 */

/**
 * Convert American odds to decimal odds
 * @param american American odds (e.g., -110, +150)
 * @returns Decimal odds (e.g., 1.909, 2.5)
 */
export function americanToDecimal(american: number): number {
  if (american > 0) {
    return 1 + american / 100;
  } else {
    return 1 + 100 / Math.abs(american);
  }
}

/**
 * Convert decimal odds to American odds
 * @param decimal Decimal odds (e.g., 1.909, 2.5)
 * @returns American odds (e.g., -110, +150)
 */
export function decimalToAmerican(decimal: number): number {
  if (decimal >= 2.0) {
    return Math.round((decimal - 1) * 100);
  } else {
    return Math.round(-100 / (decimal - 1));
  }
}

/**
 * Calculate implied probability from American odds
 * Note: This includes the bookmaker's vig/juice
 * @param american American odds (e.g., -110, +150)
 * @returns Implied probability (0 to 1)
 */
export function impliedProbability(american: number): number {
  if (american > 0) {
    return 100 / (american + 100);
  } else {
    return Math.abs(american) / (Math.abs(american) + 100);
  }
}

/**
 * Calculate implied probability from decimal odds
 * @param decimal Decimal odds (e.g., 1.909, 2.5)
 * @returns Implied probability (0 to 1)
 */
export function impliedProbabilityDecimal(decimal: number): number {
  return 1 / decimal;
}

/**
 * Remove vig from two-way odds to get true probabilities
 * @param prob1 Implied probability of outcome 1
 * @param prob2 Implied probability of outcome 2
 * @returns Tuple of vig-free probabilities [prob1, prob2]
 */
export function removeVig(prob1: number, prob2: number): [number, number] {
  const total = prob1 + prob2;
  return [prob1 / total, prob2 / total];
}

/**
 * Format American odds with proper sign
 * @param american American odds
 * @returns Formatted string (e.g., "-110", "+150")
 */
export function formatAmericanOdds(american: number): string {
  return american > 0 ? `+${american}` : `${american}`;
}

/**
 * Calculate parlay payout from decimal odds
 * @param decimalOdds Array of decimal odds for each leg
 * @param stake Bet amount
 * @returns Total payout (including stake)
 */
export function calculateParlayPayout(decimalOdds: number[], stake: number): number {
  const multiplier = decimalOdds.reduce((acc, odds) => acc * odds, 1);
  return stake * multiplier;
}

/**
 * Calculate parlay probability (assumes independence)
 * @param probabilities Array of probabilities for each leg (0 to 1)
 * @returns Combined probability (0 to 1)
 */
export function calculateParlayProbability(probabilities: number[]): number {
  return probabilities.reduce((acc, prob) => acc * prob, 1);
}

/**
 * Calculate expected value
 * @param probability Probability of winning (0 to 1)
 * @param payout Total payout if win
 * @param stake Bet amount
 * @returns Expected value
 */
export function calculateEV(probability: number, payout: number, stake: number): number {
  return probability * payout - stake;
}

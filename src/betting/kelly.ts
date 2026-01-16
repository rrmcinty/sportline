/**
 * Kelly Criterion bet sizing calculator
 *
 * The Kelly Criterion is a formula for sizing bets based on edge and odds.
 * Formula: f* = (bp - q) / b
 * where:
 *   f* = fraction of bankroll to bet
 *   b = decimal odds - 1 (net odds received on the bet)
 *   p = probability of winning (model probability)
 *   q = probability of losing (1 - p)
 *
 * We use fractional Kelly (typically 0.25) to reduce variance and risk of ruin.
 */

/**
 * Convert American odds to decimal odds
 */
export function americanToDecimal(americanOdds: number): number {
  if (americanOdds > 0) {
    // Positive odds: +150 means you win $150 on a $100 bet
    return 1 + americanOdds / 100;
  } else {
    // Negative odds: -150 means you must bet $150 to win $100
    return 1 + 100 / Math.abs(americanOdds);
  }
}

/**
 * Calculate Kelly fraction for a bet
 *
 * @param probability - Model's win probability (0-1)
 * @param americanOdds - American odds format (e.g., -110, +150)
 * @param bankroll - Current bankroll
 * @param fractionalKelly - Fraction of Kelly to use (default 0.25 for quarter-Kelly)
 * @param maxBetPercent - Maximum bet as fraction of bankroll (default 0.05 = 5%)
 * @returns Bet amount in dollars
 */
export function calculateKellyBet(
  probability: number,
  americanOdds: number,
  bankroll: number,
  fractionalKelly: number = 0.25,
  maxBetPercent: number = 0.05,
): number {
  // Sanity checks
  if (probability <= 0 || probability >= 1) return 0;
  if (bankroll <= 0) return 0;
  if (Math.abs(americanOdds) < 100) return 0; // Invalid odds

  // Convert to decimal odds
  const decimalOdds = americanToDecimal(americanOdds);
  const b = decimalOdds - 1; // Net odds

  // Kelly formula: f* = (bp - q) / b
  const p = probability;
  const q = 1 - probability;
  const kellyFraction = (b * p - q) / b;

  // If Kelly is negative or zero, no bet
  if (kellyFraction <= 0) return 0;

  // Apply fractional Kelly (conservative)
  const adjustedFraction = kellyFraction * fractionalKelly;

  // Calculate bet amount
  let betAmount = adjustedFraction * bankroll;

  // Apply max bet cap (5% of bankroll by default)
  const maxBet = bankroll * maxBetPercent;
  betAmount = Math.min(betAmount, maxBet);

  // Round to nearest dollar
  return Math.round(betAmount);
}

/**
 * Calculate expected growth rate for a Kelly bet
 * This is useful for comparing different betting opportunities
 *
 * @param probability - Model's win probability (0-1)
 * @param americanOdds - American odds format
 * @param fractionalKelly - Fraction of Kelly to use
 * @returns Expected growth rate (G)
 */
export function calculateKellyGrowthRate(
  probability: number,
  americanOdds: number,
  fractionalKelly: number = 0.25,
): number {
  if (probability <= 0 || probability >= 1) return 0;

  const decimalOdds = americanToDecimal(americanOdds);
  const b = decimalOdds - 1;

  const p = probability;
  const q = 1 - probability;
  const kellyFraction = (b * p - q) / b;

  if (kellyFraction <= 0) return 0;

  const f = kellyFraction * fractionalKelly;

  // Expected growth rate: G = p * ln(1 + fb) + q * ln(1 - f)
  const G = p * Math.log(1 + f * b) + q * Math.log(1 - f);

  return G;
}

/**
 * Simulate Kelly betting over a series of bets
 * Useful for visualizing bankroll growth
 *
 * @param bets - Array of {probability, odds, won}
 * @param startingBankroll - Initial bankroll
 * @param fractionalKelly - Fraction of Kelly to use
 * @returns Array of bankroll values after each bet
 */
export function simulateKellyBetting(
  bets: Array<{ probability: number; odds: number; won: boolean }>,
  startingBankroll: number,
  fractionalKelly: number = 0.25,
): number[] {
  const bankrollHistory: number[] = [startingBankroll];
  let currentBankroll = startingBankroll;

  for (const bet of bets) {
    const betAmount = calculateKellyBet(
      bet.probability,
      bet.odds,
      currentBankroll,
      fractionalKelly,
    );

    if (betAmount === 0) {
      bankrollHistory.push(currentBankroll);
      continue;
    }

    if (bet.won) {
      const decimalOdds = americanToDecimal(bet.odds);
      const profit = betAmount * (decimalOdds - 1);
      currentBankroll += profit;
    } else {
      currentBankroll -= betAmount;
    }

    // Prevent bankruptcy
    if (currentBankroll <= 0) {
      currentBankroll = 0;
      bankrollHistory.push(0);
      break;
    }

    bankrollHistory.push(currentBankroll);
  }

  return bankrollHistory;
}

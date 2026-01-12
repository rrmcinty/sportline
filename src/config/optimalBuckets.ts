/**
 * Optimal probability bucket ranges by sport and market
 * Based on historical backtesting results
 *
 * These buckets identify which model probability ranges are historically profitable.
 * Updated: 2026-01-11 optimization run
 */

export interface BucketRange {
  min: number;
  max: number;
}

export interface SportBuckets {
  moneyline: BucketRange[];
  spread: BucketRange[];
}

export const OPTIMAL_BUCKETS: Record<string, SportBuckets> = {
  nba: {
    moneyline: [
      { min: 40, max: 50 },
      { min: 90, max: 100 },
    ],
    spread: [
      { min: 50, max: 60 },
      { min: 60, max: 70 },
    ],
  },
  ncaam: {
    moneyline: [
      { min: 0, max: 30 },
      { min: 80, max: 100 },
    ],
    spread: [
      { min: 60, max: 70 },
      { min: 70, max: 80 },
      { min: 80, max: 90 },
      { min: 90, max: 100 },
    ],
  },
  nhl: {
    moneyline: [{ min: 60, max: 100 }],
    spread: [
      { min: 70, max: 80 },
      { min: 80, max: 90 },
    ],
  },
};

/**
 * Check if a probability falls within optimal buckets for a sport/market
 */
export function isInOptimalBucket(
  sport: string,
  market: 'moneyline' | 'spread',
  probability: number,
): boolean {
  const sportBuckets = OPTIMAL_BUCKETS[sport];
  if (!sportBuckets) return false;

  const buckets = sportBuckets[market];
  const probPercent = probability * 100;

  return buckets.some((bucket) => probPercent >= bucket.min && probPercent <= bucket.max);
}

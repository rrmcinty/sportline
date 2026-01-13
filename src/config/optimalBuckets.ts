/**
 * Optimal probability bucket ranges by sport and market
 * Based on historical backtesting results
 *
 * These buckets identify which model probability ranges are historically profitable.
 * Updated: 2026-01-13 - Verified against 2024 and 2025 season backtests
 * Methodology: Buckets profitable in both seasons, or strong performance in 2025
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
      // 70-80% bucket: 67.77% ROI (2024), 74.32% ROI (2025) - consistently strong
      { min: 70, max: 80 },
      // 90-100% bucket: 54.70% ROI (2025) - high confidence bets
      { min: 90, max: 100 },
    ],
    spread: [
      // 60-70% bucket: 35.92% ROI (2025)
      { min: 60, max: 70 },
      // 70-80% bucket: 85.41% ROI (2025) - exceptional performance
      { min: 70, max: 80 },
    ],
  },
  ncaam: {
    moneyline: [
      // 70-80% bucket: 18.39% ROI (2025)
      { min: 70, max: 80 },
      // 80-90% bucket: 36.63% ROI (2025)
      { min: 80, max: 90 },
      // 90-100% bucket: 33.51% ROI (2025)
      { min: 90, max: 100 },
    ],
    spread: [
      // 30-40% bucket: 22.81% ROI (2024), 12.34% ROI (2025) - consistent
      { min: 30, max: 40 },
      // 40-50% bucket: 15.45% ROI (2025)
      { min: 40, max: 50 },
    ],
  },
  nhl: {
    moneyline: [
      // 70-80% bucket: 78.43% ROI (2024), 75.94% ROI (2025) - strong in both seasons
      { min: 70, max: 80 },
      // 90-100% bucket: 78.18% ROI (2025)
      { min: 90, max: 100 },
    ],
    spread: [
      // 10-20% bucket: 51.01% ROI (2024), 86.24% ROI (2025) - underdog value
      { min: 10, max: 20 },
      // 20-30% bucket: 77.33% ROI (2025)
      { min: 20, max: 30 },
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

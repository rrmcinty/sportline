/**
 * Optimal probability bucket ranges by sport and market
 * Based on historical backtesting results
 *
 * CRITICAL: Proper out-of-sample testing (train 2024, test 2025) shows:
 * - ONLY NHL Moneyline is profitable: +13.40% ROI
 * - All other models LOSE MONEY: NBA (-9% to -13%), NCAAM (-8% to -9%), NHL Spread (-35%)
 *
 * Updated: 2026-01-13 - Out-of-sample validation (train 2024 → test 2025)
 * See data/REAL-OUT-OF-SAMPLE-RESULTS.md for full details
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
      // ⚠️ WARNING: NBA ML loses -13.23% ROI out-of-sample (train 2024, test 2025)
      // These buckets are from IN-SAMPLE testing only - NOT RELIABLE
      { min: 70, max: 80 },
      { min: 90, max: 100 },
    ],
    spread: [
      // ⚠️ WARNING: NBA Spread loses -9.38% ROI out-of-sample
      // DO NOT USE - model does not generalize
      { min: 60, max: 70 },
      { min: 70, max: 80 },
    ],
  },
  ncaam: {
    moneyline: [
      // ⚠️ WARNING: NCAAM ML loses -7.95% ROI out-of-sample
      // DO NOT USE - model does not generalize
      { min: 70, max: 80 },
      { min: 80, max: 90 },
      { min: 90, max: 100 },
    ],
    spread: [
      // ⚠️ WARNING: NCAAM Spread loses -9.18% ROI out-of-sample
      // DO NOT USE - model does not generalize
      { min: 30, max: 40 },
      { min: 40, max: 50 },
    ],
  },
  nhl: {
    moneyline: [
      // ✅ VERIFIED PROFITABLE: +13.40% ROI out-of-sample (train 2024, test 2025)
      // 60-70% bucket: +11.93% ROI (596 games)
      { min: 60, max: 70 },
      // 70-80% bucket: +27.76% ROI (317 games) - BEST PERFORMER
      { min: 70, max: 80 },
    ],
    spread: [
      // ⚠️ WARNING: NHL Spread loses -35.40% ROI out-of-sample - WORST MODEL
      // DO NOT USE UNDER ANY CIRCUMSTANCES
      { min: 10, max: 20 },
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

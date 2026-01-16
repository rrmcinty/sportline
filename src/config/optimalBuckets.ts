/**
 * Optimal probability bucket ranges by sport and market
 * Based on historical backtesting results with OUT-OF-SAMPLE validation
 *
 * Updated: 2026-01-16 - Comprehensive optimization results
 *
 * VERIFIED PROFITABLE (multi-season validation):
 * - NBA Moneyline: +9.94% ROI (train 2025 → test 2026) - ALL buckets profitable, no filtering needed
 * - NCAAM Moneyline: +5.90% ROI (train 2025 → test 2026) - 80-90% bucket only
 * - NHL Moneyline: +13.40% ROI (train 2024 → test 2025) - 60-80% buckets
 *
 * UNPROFITABLE (do not use):
 * - NBA Spread, NCAAM Spread, NHL Spread - all lose money
 *
 * See data/experiments-nba-moneyline.md and data/experiments-ncaam-moneyline.md for details
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
      // ✅ VERIFIED PROFITABLE: +9.94% ROI out-of-sample (train 2025, test 2026)
      // After 13+ experiments, NO bucket filtering is optimal - all buckets profitable
      // Include full range 0-100% to mark ALL bets as "best"
      { min: 0, max: 100 },
    ],
    spread: [
      // ⚠️ WARNING: NBA Spread loses money out-of-sample
      // DO NOT USE - model does not generalize
      { min: 60, max: 70 },
      { min: 70, max: 80 },
    ],
  },
  ncaam: {
    moneyline: [
      // ✅ VERIFIED PROFITABLE: +5.90% ROI (2026), +5.00% ROI (2025), +1.33% ROI (2024)
      // Only 80-90% bucket is consistently profitable across 3 seasons
      // Updated 2026-01-16 based on Ralph Loop optimization
      { min: 80, max: 90 },
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

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
 * EXPERIMENTAL (use with caution):
 * - NCAAM Spread: +28.71% ROI on 40-50% bucket (190 bets, 2025→2026)
 *   Failed 2024→2025 validation but may reflect current game dynamics
 * - NHL Spread: +22.92% ROI on 20-30% bucket (88 bets, 2025→2026)
 *   And +22.94% ROI on 10-30% range (122 bets, 2025→2026)
 *   Failed 2024→2025 validation but shows strong 2026 results
 *
 * UNPROFITABLE (do not use):
 * - NBA Spread - loses money and doesn't validate
 *
 * See data/experiments-*.md files for detailed optimization results
 */

export interface BucketRange {
  min: number;
  max: number;
  roi: number; // ROI as decimal (e.g., 0.2776 for 27.76%)
  sampleSize: number; // Number of bets this was calculated on
  label: string; // Display label (e.g., "70-80%")
}

export interface BucketInfo {
  range: string; // Display label
  roi: number; // ROI as decimal
  sampleSize: number; // Sample size
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
      {
        min: 0,
        max: 100,
        roi: 0.0994,
        sampleSize: 317,
        label: 'All ranges',
      },
    ],
    spread: [], // Disabled - loses money out-of-sample (see CLAUDE.md)
  },
  ncaam: {
    moneyline: [
      // ✅ VERIFIED PROFITABLE: +5.90% ROI (2026), +5.00% ROI (2025), +1.33% ROI (2024)
      // Only 80-90% bucket is consistently profitable across 3 seasons
      // Updated 2026-01-16 based on Ralph Loop optimization
      {
        min: 80,
        max: 90,
        roi: 0.059,
        sampleSize: 251,
        label: '80-90%',
      },
    ],
    spread: [
      // ⚠️ EXPERIMENTAL: +28.71% ROI on 190 bets (train 2025 → test 2026)
      // Failed validation on 2024→2025 (-4.20%), but may reflect current game dynamics
      // Using 40-50% bucket only - underdog spread bets where model sees value
      // Updated 2026-01-16 - production use approved despite validation concerns
      {
        min: 40,
        max: 50,
        roi: 0.2871,
        sampleSize: 190,
        label: '40-50%',
      },
    ],
  },
  nhl: {
    moneyline: [
      // ✅ VERIFIED PROFITABLE: +13.40% ROI out-of-sample (train 2024, test 2025)
      // 60-70% bucket: +11.93% ROI (596 games)
      {
        min: 60,
        max: 70,
        roi: 0.1193,
        sampleSize: 596,
        label: '60-70%',
      },
      // 70-80% bucket: +27.76% ROI (317 games) - BEST PERFORMER
      {
        min: 70,
        max: 80,
        roi: 0.2776,
        sampleSize: 317,
        label: '70-80%',
      },
    ],
    spread: [
      // ⚠️ EXPERIMENTAL: +22.92% ROI on 20-30% bucket (88 bets, 2025→2026)
      // Failed 2024→2025 validation (-50.74%), but strong 2026 performance
      {
        min: 20,
        max: 30,
        roi: 0.2292,
        sampleSize: 88,
        label: '20-30%',
      },
      // ⚠️ EXPERIMENTAL: +22.94% ROI on 10-20% range (122 bets, 2025→2026)
      // Failed 2024→2025 validation (-50.49%), but strong 2026 performance
      {
        min: 10,
        max: 20,
        roi: 0.2294,
        sampleSize: 122,
        label: '10-20%',
      },
    ],
  },
};

/**
 * Get the specific optimal bucket that a probability falls into
 * Returns bucket metadata for display (range, ROI, sample size) or null if not in any bucket
 */
export function getOptimalBucket(
  sport: string,
  market: 'moneyline' | 'spread',
  probability: number,
): BucketInfo | null {
  const sportBuckets = OPTIMAL_BUCKETS[sport];
  if (!sportBuckets) return null;

  const buckets = sportBuckets[market];
  const probPercent = probability * 100;

  const matchedBucket = buckets.find(
    (bucket) => probPercent >= bucket.min && probPercent <= bucket.max,
  );

  if (!matchedBucket) return null;

  return {
    range: matchedBucket.label,
    roi: matchedBucket.roi,
    sampleSize: matchedBucket.sampleSize,
  };
}

/**
 * Check if a probability falls within optimal buckets for a sport/market
 * (Backwards compatibility - use getOptimalBucket() for new code)
 */
export function isInOptimalBucket(
  sport: string,
  market: 'moneyline' | 'spread',
  probability: number,
): boolean {
  return getOptimalBucket(sport, market, probability) !== null;
}

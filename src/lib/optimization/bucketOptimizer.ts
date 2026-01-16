/**
 * Automated bucket optimization for finding profitable probability ranges
 *
 * This module tests various probability bucket combinations to find the optimal
 * ranges for betting. Buckets are defined as probability ranges (e.g., 60-80%)
 * where the model's predictions are most accurate and profitable.
 */

import type { Recommendation } from '../db/types.js';
import { runBacktestForThreshold } from '../backtest/backtester.js';
import type { ConfidenceBucket } from '../../recommend/recommendNba.js';

export interface BucketCombination {
  label: string;
  ranges: Array<{ min: number; max: number }>;
}

export interface BucketOptimizationResult {
  combination: BucketCombination;
  roi: number;
  totalBets: number;
  winRate: number;
  totalStaked: number;
  totalProfit: number;
}

/**
 * Generate standard bucket combinations to test
 */
export function generateBucketCombinations(): BucketCombination[] {
  return [
    // Single buckets
    { label: '50-60', ranges: [{ min: 0.5, max: 0.6 }] },
    { label: '60-70', ranges: [{ min: 0.6, max: 0.7 }] },
    { label: '70-80', ranges: [{ min: 0.7, max: 0.8 }] },
    { label: '80-90', ranges: [{ min: 0.8, max: 0.9 }] },
    { label: '90-100', ranges: [{ min: 0.9, max: 1.0 }] },

    // Two-bucket combinations
    { label: '50-70', ranges: [{ min: 0.5, max: 0.7 }] },
    { label: '60-80', ranges: [{ min: 0.6, max: 0.8 }] },
    { label: '70-90', ranges: [{ min: 0.7, max: 0.9 }] },
    { label: '80-100', ranges: [{ min: 0.8, max: 1.0 }] },

    // Narrow ranges
    { label: '65-75', ranges: [{ min: 0.65, max: 0.75 }] },
    { label: '65-80', ranges: [{ min: 0.65, max: 0.8 }] },
    { label: '55-65', ranges: [{ min: 0.55, max: 0.65 }] },

    // Three-bucket combination
    { label: '50-80', ranges: [{ min: 0.5, max: 0.8 }] },
    { label: '60-90', ranges: [{ min: 0.6, max: 0.9 }] },

    // Multi-range (non-contiguous)
    {
      label: '60-70,80-90',
      ranges: [
        { min: 0.6, max: 0.7 },
        { min: 0.8, max: 0.9 },
      ],
    },
    {
      label: '50-60,70-80',
      ranges: [
        { min: 0.5, max: 0.6 },
        { min: 0.7, max: 0.8 },
      ],
    },

    // Full range (no filtering)
    { label: 'all', ranges: [{ min: 0.0, max: 1.0 }] },
  ];
}

/**
 * Filter recommendations by bucket combination
 */
function filterByBuckets(
  recommendations: Recommendation[],
  combination: BucketCombination,
): Recommendation[] {
  if (combination.label === 'all') {
    return recommendations;
  }

  return recommendations.filter((rec) => {
    // Check if home or away probability falls in any of the ranges
    const homeInBucket = combination.ranges.some(
      (range) => rec.model_prob_home >= range.min && rec.model_prob_home < range.max,
    );
    const awayInBucket = combination.ranges.some(
      (range) => rec.model_prob_away >= range.min && rec.model_prob_away < range.max,
    );
    return homeInBucket || awayInBucket;
  });
}

/**
 * Test a single bucket combination
 */
export function testBucketCombination(
  recommendations: Recommendation[],
  combination: BucketCombination,
  minEdge: number = 0.07,
  minEV: number = 0.005,
  maxEV?: number,
  betSizing: 'flat' | 'kelly' = 'flat',
  startingBankroll: number = 10000,
): BucketOptimizationResult {
  // Filter recommendations by bucket
  const filtered = filterByBuckets(recommendations, combination);

  // Run backtest on filtered recommendations
  const result = runBacktestForThreshold(
    filtered,
    minEdge,
    minEV,
    100,
    maxEV,
    betSizing,
    startingBankroll,
  );

  return {
    combination,
    roi: result.roi,
    totalBets: result.total_bets,
    winRate: result.win_rate,
    totalStaked: result.total_staked,
    totalProfit: result.total_profit,
  };
}

/**
 * Find optimal bucket combination for a sport/market
 *
 * @param recommendations - Array of game recommendations with predictions
 * @param minEdge - Minimum edge threshold (default: 7%)
 * @param minEV - Minimum EV threshold (default: 0.5%)
 * @param maxEV - Maximum EV threshold (filter outliers)
 * @param minBets - Minimum bets required for a combination to be considered
 * @param betSizing - Bet sizing strategy ('flat' or 'kelly')
 * @param startingBankroll - Starting bankroll for Kelly sizing
 * @returns Best bucket combination with results
 */
export function optimizeBuckets(
  recommendations: Recommendation[],
  minEdge: number = 0.07,
  minEV: number = 0.005,
  maxEV?: number,
  minBets: number = 20,
  betSizing: 'flat' | 'kelly' = 'flat',
  startingBankroll: number = 10000,
): BucketOptimizationResult {
  const combinations = generateBucketCombinations();
  const results: BucketOptimizationResult[] = [];

  console.log(`\nTesting ${combinations.length} bucket combinations...`);
  console.log(`Min Edge: ${(minEdge * 100).toFixed(1)}%, Min EV: ${(minEV * 100).toFixed(1)}%`);
  console.log(`Min Bets: ${minBets}, Bet Sizing: ${betSizing}\n`);

  for (const combination of combinations) {
    const result = testBucketCombination(
      recommendations,
      combination,
      minEdge,
      minEV,
      maxEV,
      betSizing,
      startingBankroll,
    );

    // Only consider combinations with enough bets
    if (result.totalBets >= minBets) {
      results.push(result);
    }
  }

  // Sort by ROI descending
  results.sort((a, b) => b.roi - a.roi);

  // Print top 10 results
  console.log('Top 10 Bucket Combinations:\n');
  console.log('Rank | Buckets         | ROI      | Win Rate | Bets | Profit');
  console.log('-----+-----------------+----------+----------+------+---------');

  for (let i = 0; i < Math.min(10, results.length); i++) {
    const r = results[i];
    console.log(
      `${(i + 1).toString().padStart(4)} | ` +
        `${r.combination.label.padEnd(15)} | ` +
        `${(r.roi * 100).toFixed(2).padStart(7)}% | ` +
        `${(r.winRate * 100).toFixed(2).padStart(7)}% | ` +
        `${r.totalBets.toString().padStart(4)} | ` +
        `$${r.totalProfit.toFixed(0).padStart(6)}`,
    );
  }

  console.log('');

  if (results.length === 0) {
    throw new Error(`No bucket combinations met minimum bet requirement (${minBets} bets)`);
  }

  return results[0];
}

/**
 * Convert bucket combination to CLI-compatible string format
 */
export function bucketToString(combination: BucketCombination): string {
  if (combination.label === 'all') {
    return '';
  }

  return combination.ranges
    .map((r) => `${Math.round(r.min * 100)}-${Math.round(r.max * 100)}`)
    .join(',');
}

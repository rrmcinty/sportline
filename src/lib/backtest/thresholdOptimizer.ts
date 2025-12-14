/**
 * Threshold optimization utilities
 * Advanced techniques for finding optimal betting thresholds
 */

import type { BacktestResult } from '../db/types.js';

/**
 * Optimize thresholds using a more sophisticated approach
 * Considers multiple objectives: ROI, win rate, and sample size
 */
export function optimizeThresholdsMultiObjective(
  backtestResults: BacktestResult[],
  minBets: number = 20,
  roiWeight: number = 0.7,
  winRateWeight: number = 0.2,
  sampleSizeWeight: number = 0.1
): { min_edge: number; min_ev: number; score: number } {
  // Filter results with sufficient bets
  const validResults = backtestResults.filter((r) => r.total_bets >= minBets);

  if (validResults.length === 0) {
    return { min_edge: 0.03, min_ev: 0.01, score: 0 };
  }

  // Normalize metrics for scoring
  const maxROI = Math.max(...validResults.map((r) => r.roi));
  const maxWinRate = Math.max(...validResults.map((r) => r.win_rate));
  const maxBets = Math.max(...validResults.map((r) => r.total_bets));

  // Calculate composite score for each result
  const scored = validResults.map((r) => {
    const roiScore = maxROI > 0 ? r.roi / maxROI : 0;
    const winRateScore = maxWinRate > 0 ? r.win_rate / maxWinRate : 0;
    const sampleSizeScore = maxBets > 0 ? r.total_bets / maxBets : 0;

    const compositeScore =
      roiWeight * roiScore +
      winRateWeight * winRateScore +
      sampleSizeWeight * sampleSizeScore;

    return {
      ...r,
      score: compositeScore,
    };
  });

  // Sort by composite score
  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];

  return {
    min_edge: best.threshold_edge,
    min_ev: best.threshold_ev,
    score: best.score,
  };
}

/**
 * Find thresholds that maximize expected profit per bet
 */
export function optimizeForExpectedProfit(
  backtestResults: BacktestResult[],
  minBets: number = 20
): { min_edge: number; min_ev: number } {
  const validResults = backtestResults.filter((r) => r.total_bets >= minBets);

  if (validResults.length === 0) {
    return { min_edge: 0.03, min_ev: 0.01 };
  }

  // Calculate expected profit per bet
  const withExpectedProfit = validResults.map((r) => ({
    ...r,
    expectedProfitPerBet: r.total_bets > 0 ? r.total_profit / r.total_bets : 0,
  }));

  // Sort by expected profit per bet
  withExpectedProfit.sort((a, b) => b.expectedProfitPerBet - a.expectedProfitPerBet);

  const best = withExpectedProfit[0];

  return {
    min_edge: best.threshold_edge,
    min_ev: best.threshold_ev,
  };
}

/**
 * Find thresholds using Kelly Criterion-inspired approach
 * Balances growth rate with risk
 */
export function optimizeKellyCriterion(
  backtestResults: BacktestResult[],
  minBets: number = 20
): { min_edge: number; min_ev: number } {
  const validResults = backtestResults.filter((r) => r.total_bets >= minBets);

  if (validResults.length === 0) {
    return { min_edge: 0.03, min_ev: 0.01 };
  }

  // Calculate Kelly score: win_rate * roi - (1 - win_rate)
  const withKelly = validResults.map((r) => ({
    ...r,
    kellyScore: r.win_rate * (1 + r.roi) - (1 - r.win_rate),
  }));

  withKelly.sort((a, b) => b.kellyScore - a.kellyScore);

  const best = withKelly[0];

  return {
    min_edge: best.threshold_edge,
    min_ev: best.threshold_ev,
  };
}

/**
 * Get threshold recommendations using multiple strategies
 */
export function getThresholdRecommendations(
  backtestResults: BacktestResult[],
  minBets: number = 20
): {
  bestROI: { min_edge: number; min_ev: number };
  bestExpectedProfit: { min_edge: number; min_ev: number };
  bestKelly: { min_edge: number; min_ev: number };
  recommended: { min_edge: number; min_ev: number };
} {
  // Try different optimization strategies
  const bestROI = backtestResults
    .filter((r) => r.total_bets >= minBets)
    .sort((a, b) => b.roi - a.roi)[0] || null;

  const bestExpectedProfit = optimizeForExpectedProfit(
    backtestResults,
    minBets
  );
  const bestKelly = optimizeKellyCriterion(backtestResults, minBets);

  // Use multi-objective as recommended default
  const multiObjective = optimizeThresholdsMultiObjective(
    backtestResults,
    minBets
  );

  return {
    bestROI: bestROI
      ? { min_edge: bestROI.threshold_edge, min_ev: bestROI.threshold_ev }
      : { min_edge: 0.03, min_ev: 0.01 },
    bestExpectedProfit,
    bestKelly,
    recommended: { min_edge: multiObjective.min_edge, min_ev: multiObjective.min_ev },
  };
}

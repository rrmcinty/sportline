/**
 * Backtesting framework for finding optimal betting thresholds
 */

import type {
  GameFeatures,
  Recommendation,
  BacktestResult,
  ProbabilityBucket,
} from '../db/types.js';
import { calculateBettingMetrics } from '../odds/evCalculator.js';
import { calculateKellyBet } from '../../betting/kelly.js';

function selectDeterministicOddsRow(
  oddsArr: Array<{
    provider?: string | null;
    price_home?: number | null;
    price_away?: number | null;
    line?: number | null;
  }>,
): (typeof oddsArr)[number] | null {
  if (!oddsArr || oddsArr.length === 0) return null;

  const providerPriority = ['draftkings', 'fanduel', 'betmgm'];

  const normalized = oddsArr.map((o) => ({
    odds: o,
    provider: (o.provider || '').toLowerCase(),
  }));

  const byPriority = normalized
    .slice()
    .sort((a, b) => {
      const aIdx = providerPriority.indexOf(a.provider);
      const bIdx = providerPriority.indexOf(b.provider);
      const aRank = aIdx === -1 ? Number.POSITIVE_INFINITY : aIdx;
      const bRank = bIdx === -1 ? Number.POSITIVE_INFINITY : bIdx;
      if (aRank !== bRank) return aRank - bRank;
      return a.provider.localeCompare(b.provider);
    })
    .map((x) => x.odds);

  for (const odds of byPriority) {
    if (odds.price_home == null || odds.price_away == null) continue;
    return odds;
  }

  return null;
}

function passesJuiceGate(betOdds: number, betEdge: number): boolean {
  const MAX_VIG_PRICE = -115;
  const EDGE_REQUIRED_IF_VIGGY = 0.04;

  if (betOdds <= MAX_VIG_PRICE && betEdge < EDGE_REQUIRED_IF_VIGGY) return false;
  return true;
}

/**
 * Generate recommendations from test set predictions
 */
export function generateRecommendations(
  fullDataset: GameFeatures[],
  predictions: number[],
  splitIdx: number,
  flipPredictions: boolean = false,
): Recommendation[] {
  const recommendations: Recommendation[] = [];

  for (let i = 0; i < predictions.length; i++) {
    const datasetIdx = splitIdx + i;
    const row = fullDataset[datasetIdx];

    if (!row) continue;

    const oddsArr = row.odds;
    const odds = oddsArr && oddsArr.length > 0 ? selectDeterministicOddsRow(oddsArr) : null;

    // Don't skip if no odds - just set them to null
    // if (!odds) continue;

    let model_prob_home = predictions[i];
    if (flipPredictions) {
      model_prob_home = 1 - model_prob_home;
    }
    const model_prob_away = 1 - model_prob_home;

    const metrics = calculateBettingMetrics(
      model_prob_home,
      odds?.price_home ?? null,
      odds?.price_away ?? null,
    );

    recommendations.push({
      game_id: row.game_id,
      date: row.date,
      home_team: row.home_team,
      away_team: row.away_team,
      model_prob_home,
      model_prob_away,
      odds_home: odds?.price_home ?? null,
      odds_away: odds?.price_away ?? null,
      ev_home: metrics.ev_home,
      ev_away: metrics.ev_away,
      edge_home: metrics.edge_home,
      edge_away: metrics.edge_away,
      recommended_side: null, // Will be set based on thresholds
      actual: row.target,
      provider: odds?.provider ?? '',
      line: odds?.line ?? null,
    });
  }

  return recommendations;
}

/**
 * Run backtest for a specific threshold combination
 */
export function runBacktestForThreshold(
  recommendations: Recommendation[],
  minEdge: number,
  minEV: number,
  unitSize: number = 100,
  maxEV?: number,
  betSizing: 'flat' | 'kelly' = 'flat',
  startingBankroll: number = 10000,
): BacktestResult {
  let totalBets = 0;
  let totalStaked = 0;
  let totalProfit = 0;
  let wins = 0;
  let losses = 0;
  let oddsSum = 0;
  let currentBankroll = startingBankroll;
  let maxBetSize = 0;
  let minBankroll = startingBankroll;
  let maxBankroll = startingBankroll;

  for (const rec of recommendations) {
    let betSide: 'home' | 'away' | null = null;
    let betOdds: number | null = null;
    let betEdge: number | null = null;
    let betProbability: number | null = null;

    // Determine if we should bet
    if (
      rec.ev_home !== null &&
      rec.ev_home > minEV &&
      rec.edge_home !== null &&
      rec.edge_home > minEdge
    ) {
      // Filter out bets above max_ev threshold
      if (maxEV !== undefined && rec.ev_home > maxEV) {
        // Skip this bet - EV too high
      } else if (rec.ev_away === null || rec.edge_away === null || rec.ev_home > rec.ev_away) {
        betSide = 'home';
        const _betEV = rec.ev_home;
        betEdge = rec.edge_home;
        betOdds = rec.odds_home;
        betProbability = rec.model_prob_home;
      }
    }

    if (
      !betSide &&
      rec.ev_away !== null &&
      rec.ev_away > minEV &&
      rec.edge_away !== null &&
      rec.edge_away > minEdge
    ) {
      // Filter out bets above max_ev threshold
      if (maxEV !== undefined && rec.ev_away > maxEV) {
        // Skip this bet - EV too high
      } else {
        betSide = 'away';
        const _betEV = rec.ev_away;
        betEdge = rec.edge_away;
        betOdds = rec.odds_away;
        betProbability = rec.model_prob_away;
      }
    }

    if (!betSide || betOdds === null || rec.actual === null || betEdge === null) continue;

    // Filter out extreme odds that are likely data errors (> +/-500)
    if (Math.abs(betOdds) > 500) continue;

    if (!passesJuiceGate(betOdds, betEdge)) continue;

    // Calculate bet size
    let betAmount: number;
    if (betSizing === 'kelly' && betProbability !== null) {
      betAmount = calculateKellyBet(betProbability, betOdds, currentBankroll);
      if (betAmount === 0) continue; // Skip if Kelly says not to bet
      maxBetSize = Math.max(maxBetSize, betAmount);
    } else {
      betAmount = unitSize;
    }

    // Place bet
    totalBets++;
    totalStaked += betAmount;

    const won =
      (betSide === 'home' && rec.actual === 1) || (betSide === 'away' && rec.actual === 0);

    if (won) {
      wins++;
      const payout = betOdds > 0 ? betOdds / 100 : 100 / Math.abs(betOdds);
      const profit = betAmount * payout;
      totalProfit += profit;
      currentBankroll += profit;
      oddsSum += betOdds;
    } else {
      losses++;
      totalProfit -= betAmount;
      currentBankroll -= betAmount;
    }

    // Track bankroll extremes
    minBankroll = Math.min(minBankroll, currentBankroll);
    maxBankroll = Math.max(maxBankroll, currentBankroll);

    // Prevent bankruptcy
    if (currentBankroll <= 0) {
      console.warn(`⚠️  Bankrupt after ${totalBets} bets (started with $${startingBankroll})`);
      break;
    }
  }

  const roi = totalStaked > 0 ? totalProfit / totalStaked : 0;
  const winRate = totalBets > 0 ? wins / totalBets : 0;
  const avgOdds = totalBets > 0 ? oddsSum / totalBets : 0;

  // Calculate Sharpe ratio (simplified)
  let sharpeRatio: number | null = null;
  if (totalBets > 10) {
    // Need sufficient sample size
    const avgProfit = totalProfit / totalBets;
    const profitVariance =
      recommendations
        .map((_rec) => {
          // Simplified profit calculation per bet
          return 0; // Would need to track individual bet profits
        })
        .reduce((sum, p) => sum + p * p, 0) / totalBets;
    const stdDev = Math.sqrt(profitVariance);
    sharpeRatio = stdDev > 0 ? avgProfit / stdDev : null;
  }

  const result: BacktestResult = {
    threshold_edge: minEdge,
    threshold_ev: minEV,
    total_bets: totalBets,
    total_staked: totalStaked,
    total_profit: totalProfit,
    roi,
    win_rate: winRate,
    wins,
    losses,
    avg_odds: avgOdds,
    sharpe_ratio: sharpeRatio,
  };

  // Add Kelly-specific metrics if using Kelly bet sizing
  if (betSizing === 'kelly') {
    result.final_bankroll = currentBankroll;
    result.min_bankroll = minBankroll;
    result.max_bankroll = maxBankroll;
    result.max_bet_size = maxBetSize;
    result.bankroll_roi = (currentBankroll - startingBankroll) / startingBankroll;
  }

  return result;
}

/**
 * Run backtest across multiple threshold combinations
 */
export function runBacktestGrid(
  recommendations: Recommendation[],
  edgeRange: number[] = [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08],
  evRange: number[] = [0.005, 0.01, 0.015, 0.02, 0.025, 0.03],
  maxEV?: number,
  betSizing: 'flat' | 'kelly' = 'flat',
  startingBankroll: number = 10000,
): BacktestResult[] {
  const results: BacktestResult[] = [];

  for (const minEdge of edgeRange) {
    for (const minEV of evRange) {
      const result = runBacktestForThreshold(
        recommendations,
        minEdge,
        minEV,
        100,
        maxEV,
        betSizing,
        startingBankroll,
      );
      results.push(result);
    }
  }

  return results;
}

/**
 * Find optimal thresholds based on ROI
 * Only considers positive ROI results, falls back to config thresholds if all ROI is negative
 */
export function findOptimalThresholds(
  backtestResults: BacktestResult[],
  minBets: number = 20,
  configThresholds?: { min_edge?: number; min_ev?: number },
): { min_edge: number; min_ev: number } {
  // Filter results with sufficient bets
  let validResults = backtestResults.filter((r) => r.total_bets >= minBets);

  if (validResults.length === 0) {
    console.warn('[Backtester] No threshold combinations met minimum bet requirement');
    // Fall back to config or default
    if (configThresholds?.min_edge !== undefined && configThresholds?.min_ev !== undefined) {
      console.warn(
        `[Backtester] Using config thresholds: edge=${(configThresholds.min_edge * 100).toFixed(1)}%, ev=${(configThresholds.min_ev * 100).toFixed(1)}%`,
      );
      return {
        min_edge: configThresholds.min_edge,
        min_ev: configThresholds.min_ev,
      };
    }
    return { min_edge: 0.03, min_ev: 0.01 }; // Default fallback
  }

  // Only consider results with positive ROI
  const positiveROIResults = validResults.filter((r) => r.roi > 0);

  if (positiveROIResults.length > 0) {
    // Use positive ROI results if available
    validResults = positiveROIResults;
  } else {
    // If no positive ROI, warn and fall back to config or best negative ROI
    console.warn('[Backtester] ⚠️  No threshold combinations with positive ROI found!');
    if (configThresholds?.min_edge !== undefined && configThresholds?.min_ev !== undefined) {
      console.warn(
        `[Backtester] Using config thresholds: edge=${(configThresholds.min_edge * 100).toFixed(1)}%, ev=${(configThresholds.min_ev * 100).toFixed(1)}%`,
      );
      return {
        min_edge: configThresholds.min_edge,
        min_ev: configThresholds.min_ev,
      };
    }
    // If no config provided, still use best negative ROI but warn about it
    console.warn('[Backtester] ⚠️  All thresholds have negative ROI - using least negative');
  }

  // Sort by ROI descending
  validResults.sort((a, b) => b.roi - a.roi);

  const best = validResults[0];
  console.log(
    `[Backtester] Optimal thresholds: edge=${(best.threshold_edge * 100).toFixed(1)}%, ev=${(best.threshold_ev * 100).toFixed(1)}%`,
  );
  console.log(
    `[Backtester] Expected ROI: ${(best.roi * 100).toFixed(2)}% over ${best.total_bets} bets`,
  );
  console.log(`[Backtester] Win rate: ${(best.win_rate * 100).toFixed(2)}%`);

  return {
    min_edge: best.threshold_edge,
    min_ev: best.threshold_ev,
  };
}

/**
 * Generate probability bucket analysis for calibration
 *
 * Buckets are based on MODEL CONFIDENCE for the HOME TEAM winning.
 * For example, "50-60" bucket contains games where the model predicted
 * the home team had a 50-60% chance of winning.
 *
 * ROI is calculated by betting on whichever side (home or away) has
 * positive expected value, just like the real betting system does.
 */
export function generateProbabilityBuckets(
  recommendations: Recommendation[],
  bucketSize: number = 0.1,
): ProbabilityBucket[] {
  const buckets: ProbabilityBucket[] = [];

  for (let b = 0; b < 1; b += bucketSize) {
    const lower = b;
    const upper = b + bucketSize;
    const label = `${Math.round(lower * 100)}-${Math.round(upper * 100)}`;

    const inBucket = recommendations.filter(
      (r) => r.model_prob_home >= lower && r.model_prob_home < upper,
    );

    if (inBucket.length === 0) continue;

    const win_count = inBucket.filter((r) => r.actual === 1).length;
    const loss_count = inBucket.filter((r) => r.actual === 0).length;
    const accuracy = win_count / inBucket.length;
    const avg_ev = inBucket.reduce((sum, r) => sum + (r.ev_home ?? 0), 0) / inBucket.length;
    const avg_edge = inBucket.reduce((sum, r) => sum + (r.edge_home ?? 0), 0) / inBucket.length;

    // Calculate actual profit for this bucket using smart betting (bet on best EV side)
    let totalProfit = 0;
    let totalStaked = 0;
    let homeBetCount = 0;
    let awayBetCount = 0;

    for (const rec of inBucket) {
      if (rec.actual === null) continue;

      // Determine which side to bet on (same logic as runBacktestForThreshold)
      let betSide: 'home' | 'away' | null = null;
      let betOdds: number | null = null;
      let betEdge: number | null = null;

      // Check home side
      if (rec.ev_home !== null && rec.odds_home !== null && rec.ev_home > 0) {
        if (rec.ev_away === null || rec.ev_home > rec.ev_away) {
          betSide = 'home';
          betOdds = rec.odds_home;
          betEdge = rec.edge_home;
        }
      }

      // Check away side if home wasn't selected
      if (!betSide && rec.ev_away !== null && rec.odds_away !== null && rec.ev_away > 0) {
        betSide = 'away';
        betOdds = rec.odds_away;
        betEdge = rec.edge_away;
      }

      // Skip if no positive EV bet or extreme odds
      if (!betSide || betOdds === null || betEdge === null || Math.abs(betOdds) > 500) {
        continue;
      }

      if (!passesJuiceGate(betOdds, betEdge)) continue;

      // Track home/away bet counts
      if (betSide === 'home') {
        homeBetCount++;
      } else {
        awayBetCount++;
      }

      totalStaked += 100; // $100 bet

      // Check if bet won
      const won =
        (betSide === 'home' && rec.actual === 1) || (betSide === 'away' && rec.actual === 0);

      if (won) {
        // Calculate profit only (not including original stake)
        const profit =
          betOdds > 0
            ? betOdds // +150 odds = $150 profit on $100 bet
            : (100 / Math.abs(betOdds)) * 100; // -150 odds = $66.67 profit on $100 bet
        totalProfit += profit;
      } else {
        totalProfit -= 100; // Lost the $100 stake
      }
    }

    const roi = totalStaked > 0 ? totalProfit / totalStaked : 0;
    const totalBets = homeBetCount + awayBetCount;
    const homeBetPercentage = totalBets > 0 ? homeBetCount / totalBets : 0;
    const awayBetPercentage = totalBets > 0 ? awayBetCount / totalBets : 0;

    buckets.push({
      bucket: label,
      count: inBucket.length,
      accuracy,
      avg_ev,
      avg_edge,
      win_count,
      loss_count,
      total_profit: totalProfit,
      roi,
      home_bet_count: homeBetCount,
      away_bet_count: awayBetCount,
      home_bet_percentage: homeBetPercentage,
      away_bet_percentage: awayBetPercentage,
    });
  }

  return buckets;
}

export function generateEdgeBuckets(
  recommendations: Recommendation[],
  edges: Array<{ lower: number; upper: number; label: string }> = [
    { lower: 0.0, upper: 0.01, label: '0-1' },
    { lower: 0.01, upper: 0.02, label: '1-2' },
    { lower: 0.02, upper: 0.03, label: '2-3' },
    { lower: 0.03, upper: 0.05, label: '3-5' },
    { lower: 0.05, upper: 1.0, label: '5-100' },
  ],
): ProbabilityBucket[] {
  const buckets: ProbabilityBucket[] = [];

  for (const edgeBucket of edges) {
    const inBucket: Recommendation[] = [];

    for (const rec of recommendations) {
      if (rec.actual === null) continue;

      // Determine which side we would bet for bucket assignment (positive EV, best side)
      let betSide: 'home' | 'away' | null = null;
      let betOdds: number | null = null;
      let betEdge: number | null = null;
      let betEV: number | null = null;

      if (rec.ev_home !== null && rec.odds_home !== null && rec.ev_home > 0) {
        if (rec.ev_away === null || rec.ev_home > rec.ev_away) {
          betSide = 'home';
          betOdds = rec.odds_home;
          betEdge = rec.edge_home;
          betEV = rec.ev_home;
        }
      }

      if (!betSide && rec.ev_away !== null && rec.odds_away !== null && rec.ev_away > 0) {
        betSide = 'away';
        betOdds = rec.odds_away;
        betEdge = rec.edge_away;
        betEV = rec.ev_away;
      }

      if (!betSide || betOdds === null || betEdge === null || betEV === null) continue;
      if (Math.abs(betOdds) > 500) continue;
      if (!passesJuiceGate(betOdds, betEdge)) continue;

      if (betEdge >= edgeBucket.lower && betEdge < edgeBucket.upper) {
        inBucket.push(rec);
      }
    }

    if (inBucket.length === 0) continue;

    // Accuracy as home-win rate for this slice (kept for continuity)
    const win_count = inBucket.filter((r) => r.actual === 1).length;
    const loss_count = inBucket.filter((r) => r.actual === 0).length;
    const accuracy = win_count / inBucket.length;

    // avg ev/edge (home perspective) for continuity with existing type
    const avg_ev = inBucket.reduce((sum, r) => sum + (r.ev_home ?? 0), 0) / inBucket.length;
    const avg_edge = inBucket.reduce((sum, r) => sum + (r.edge_home ?? 0), 0) / inBucket.length;

    let totalProfit = 0;
    let totalStaked = 0;
    let homeBetCount = 0;
    let awayBetCount = 0;

    for (const rec of inBucket) {
      if (rec.actual === null) continue;

      let betSide: 'home' | 'away' | null = null;
      let betOdds: number | null = null;
      let betEdge: number | null = null;

      if (rec.ev_home !== null && rec.odds_home !== null && rec.ev_home > 0) {
        if (rec.ev_away === null || rec.ev_home > rec.ev_away) {
          betSide = 'home';
          betOdds = rec.odds_home;
          betEdge = rec.edge_home;
        }
      }

      if (!betSide && rec.ev_away !== null && rec.odds_away !== null && rec.ev_away > 0) {
        betSide = 'away';
        betOdds = rec.odds_away;
        betEdge = rec.edge_away;
      }

      if (!betSide || betOdds === null || betEdge === null || Math.abs(betOdds) > 500) continue;
      if (!passesJuiceGate(betOdds, betEdge)) continue;

      if (betSide === 'home') homeBetCount++;
      else awayBetCount++;

      totalStaked += 100;

      const won =
        (betSide === 'home' && rec.actual === 1) || (betSide === 'away' && rec.actual === 0);

      if (won) {
        const profit = betOdds > 0 ? betOdds : (100 / Math.abs(betOdds)) * 100;
        totalProfit += profit;
      } else {
        totalProfit -= 100;
      }
    }

    const roi = totalStaked > 0 ? totalProfit / totalStaked : 0;
    const totalBets = homeBetCount + awayBetCount;
    const homeBetPercentage = totalBets > 0 ? homeBetCount / totalBets : 0;
    const awayBetPercentage = totalBets > 0 ? awayBetCount / totalBets : 0;

    buckets.push({
      bucket: edgeBucket.label,
      count: inBucket.length,
      accuracy,
      avg_ev,
      avg_edge,
      win_count,
      loss_count,
      total_profit: totalProfit,
      roi,
      home_bet_count: homeBetCount,
      away_bet_count: awayBetCount,
      home_bet_percentage: homeBetPercentage,
      away_bet_percentage: awayBetPercentage,
    });
  }

  return buckets;
}

/**
 * Print backtest summary
 */
export function printBacktestSummary(backtestResults: BacktestResult[], topN: number = 10): void {
  console.log('\n========== Backtest Results ==========\n');

  // Sort by ROI
  const sorted = [...backtestResults].sort((a, b) => b.roi - a.roi);

  console.log('Top threshold combinations by ROI:\n');
  console.log('Edge  | EV    | Bets | ROI      | Win Rate | Avg Odds');
  console.log('------+-------+------+----------+----------+---------');

  for (let i = 0; i < Math.min(topN, sorted.length); i++) {
    const r = sorted[i];
    console.log(
      `${(r.threshold_edge * 100).toFixed(1).padStart(4)}% | ` +
        `${(r.threshold_ev * 100).toFixed(1).padStart(4)}% | ` +
        `${r.total_bets.toString().padStart(4)} | ` +
        `${(r.roi * 100).toFixed(2).padStart(7)}% | ` +
        `${(r.win_rate * 100).toFixed(2).padStart(7)}% | ` +
        `${r.avg_odds.toFixed(0).padStart(7)}`,
    );
  }

  console.log('\n======================================\n');
}

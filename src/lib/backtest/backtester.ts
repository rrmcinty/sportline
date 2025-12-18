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

/**
 * Generate recommendations from test set predictions
 */
export function generateRecommendations(
  fullDataset: GameFeatures[],
  predictions: number[],
  splitIdx: number
): Recommendation[] {
  const recommendations: Recommendation[] = [];

  for (let i = 0; i < predictions.length; i++) {
    const datasetIdx = splitIdx + i;
    const row = fullDataset[datasetIdx];

    if (!row) continue;

    const oddsArr = row.odds;
    const odds = oddsArr && oddsArr.length > 0 ? oddsArr[0] : null;
    
    // Don't skip if no odds - just set them to null
    // if (!odds) continue;

    const model_prob_home = predictions[i];
    const model_prob_away = 1 - model_prob_home;

    const metrics = calculateBettingMetrics(
      model_prob_home,
      odds?.home ?? null,
      odds?.away ?? null
    );

    recommendations.push({
      game_id: row.game_id,
      date: row.date,
      home_team: row.home_team,
      away_team: row.away_team,
      model_prob_home,
      model_prob_away,
      odds_home: odds?.home ?? null,
      odds_away: odds?.away ?? null,
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
  unitSize: number = 100
): BacktestResult {
  let totalBets = 0;
  let totalStaked = 0;
  let totalProfit = 0;
  let wins = 0;
  let losses = 0;
  let oddsSum = 0;

  for (const rec of recommendations) {
    let betSide: 'home' | 'away' | null = null;
    let betEV: number | null = null;
    let betEdge: number | null = null;
    let betOdds: number | null = null;

    // Determine if we should bet
    if (
      rec.ev_home !== null &&
      rec.ev_home > minEV &&
      rec.edge_home !== null &&
      rec.edge_home > minEdge
    ) {
      if (
        rec.ev_away === null ||
        rec.edge_away === null ||
        rec.ev_home > rec.ev_away
      ) {
        betSide = 'home';
        betEV = rec.ev_home;
        betEdge = rec.edge_home;
        betOdds = rec.odds_home;
      }
    }

    if (
      !betSide &&
      rec.ev_away !== null &&
      rec.ev_away > minEV &&
      rec.edge_away !== null &&
      rec.edge_away > minEdge
    ) {
      betSide = 'away';
      betEV = rec.ev_away;
      betEdge = rec.edge_away;
      betOdds = rec.odds_away;
    }

    if (!betSide || betOdds === null || rec.actual === null) continue;

    // Filter out extreme odds that are likely data errors (> +/-500)
    if (Math.abs(betOdds) > 500) continue;

    // Place bet
    totalBets++;
    totalStaked += unitSize;

    const won =
      (betSide === 'home' && rec.actual === 1) ||
      (betSide === 'away' && rec.actual === 0);

    if (won) {
      wins++;
      const payout = betOdds > 0 ? betOdds / 100 : 100 / Math.abs(betOdds);
      totalProfit += unitSize * payout;
      oddsSum += betOdds;
    } else {
      losses++;
      totalProfit -= unitSize;
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
        .map((rec) => {
          // Simplified profit calculation per bet
          return 0; // Would need to track individual bet profits
        })
        .reduce((sum, p) => sum + p * p, 0) / totalBets;
    const stdDev = Math.sqrt(profitVariance);
    sharpeRatio = stdDev > 0 ? avgProfit / stdDev : null;
  }

  return {
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
}

/**
 * Run backtest across multiple threshold combinations
 */
export function runBacktestGrid(
  recommendations: Recommendation[],
  edgeRange: number[] = [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08],
  evRange: number[] = [0.005, 0.01, 0.015, 0.02, 0.025, 0.03]
): BacktestResult[] {
  const results: BacktestResult[] = [];

  for (const minEdge of edgeRange) {
    for (const minEV of evRange) {
      const result = runBacktestForThreshold(recommendations, minEdge, minEV);
      results.push(result);
    }
  }

  return results;
}

/**
 * Find optimal thresholds based on ROI
 */
export function findOptimalThresholds(
  backtestResults: BacktestResult[],
  minBets: number = 20
): { min_edge: number; min_ev: number } {
  // Filter results with sufficient bets
  const validResults = backtestResults.filter((r) => r.total_bets >= minBets);

  if (validResults.length === 0) {
    console.warn(
      '[Backtester] No threshold combinations met minimum bet requirement'
    );
    return { min_edge: 0.03, min_ev: 0.01 }; // Default fallback
  }

  // Sort by ROI descending
  validResults.sort((a, b) => b.roi - a.roi);

  const best = validResults[0];
  console.log(
    `[Backtester] Optimal thresholds: edge=${(best.threshold_edge * 100).toFixed(1)}%, ev=${(best.threshold_ev * 100).toFixed(1)}%`
  );
  console.log(
    `[Backtester] Expected ROI: ${(best.roi * 100).toFixed(2)}% over ${best.total_bets} bets`
  );
  console.log(
    `[Backtester] Win rate: ${(best.win_rate * 100).toFixed(2)}%`
  );

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
  bucketSize: number = 0.1
): ProbabilityBucket[] {
  const buckets: ProbabilityBucket[] = [];

  for (let b = 0; b < 1; b += bucketSize) {
    const lower = b;
    const upper = b + bucketSize;
    const label = `${Math.round(lower * 100)}-${Math.round(upper * 100)}`;

    const inBucket = recommendations.filter(
      (r) => r.model_prob_home >= lower && r.model_prob_home < upper
    );

    if (inBucket.length === 0) continue;

    const win_count = inBucket.filter((r) => r.actual === 1).length;
    const loss_count = inBucket.filter((r) => r.actual === 0).length;
    const accuracy = win_count / inBucket.length;
    const avg_ev =
      inBucket.reduce((sum, r) => sum + (r.ev_home ?? 0), 0) /
      inBucket.length;
    const avg_edge =
      inBucket.reduce((sum, r) => sum + (r.edge_home ?? 0), 0) /
      inBucket.length;

    // Calculate actual profit for this bucket using smart betting (bet on best EV side)
    let totalProfit = 0;
    let totalStaked = 0;
    for (const rec of inBucket) {
      if (rec.actual === null) continue;

      // Determine which side to bet on (same logic as runBacktestForThreshold)
      let betSide: 'home' | 'away' | null = null;
      let betOdds: number | null = null;

      // Check home side
      if (rec.ev_home !== null && rec.odds_home !== null && rec.ev_home > 0) {
        if (rec.ev_away === null || rec.ev_home > rec.ev_away) {
          betSide = 'home';
          betOdds = rec.odds_home;
        }
      }

      // Check away side if home wasn't selected
      if (!betSide && rec.ev_away !== null && rec.odds_away !== null && rec.ev_away > 0) {
        betSide = 'away';
        betOdds = rec.odds_away;
      }

      // Skip if no positive EV bet or extreme odds
      if (!betSide || betOdds === null || Math.abs(betOdds) > 500) {
        continue;
      }

      totalStaked += 100; // $100 bet

      // Check if bet won
      const won = (betSide === 'home' && rec.actual === 1) || (betSide === 'away' && rec.actual === 0);

      if (won) {
        // Calculate profit only (not including original stake)
        const profit = betOdds > 0 
          ? betOdds // +150 odds = $150 profit on $100 bet
          : (100 / Math.abs(betOdds)) * 100; // -150 odds = $66.67 profit on $100 bet
        totalProfit += profit;
      } else {
        totalProfit -= 100; // Lost the $100 stake
      }
    }

    const roi = totalStaked > 0 ? totalProfit / totalStaked : 0;

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
    });
  }

  return buckets;
}

/**
 * Print backtest summary
 */
export function printBacktestSummary(
  backtestResults: BacktestResult[],
  topN: number = 10
): void {
  console.log('\n========== Backtest Results ==========\n');

  // Sort by ROI
  const sorted = [...backtestResults].sort((a, b) => b.roi - a.roi);

  console.log(
    'Top threshold combinations by ROI:\n'
  );
  console.log(
    'Edge  | EV    | Bets | ROI      | Win Rate | Avg Odds'
  );
  console.log(
    '------+-------+------+----------+----------+---------'
  );

  for (let i = 0; i < Math.min(topN, sorted.length); i++) {
    const r = sorted[i];
    console.log(
      `${(r.threshold_edge * 100).toFixed(1).padStart(4)}% | ` +
        `${(r.threshold_ev * 100).toFixed(1).padStart(4)}% | ` +
        `${r.total_bets.toString().padStart(4)} | ` +
        `${(r.roi * 100).toFixed(2).padStart(7)}% | ` +
        `${(r.win_rate * 100).toFixed(2).padStart(7)}% | ` +
        `${r.avg_odds.toFixed(0).padStart(7)}`
    );
  }

  console.log('\n======================================\n');
}

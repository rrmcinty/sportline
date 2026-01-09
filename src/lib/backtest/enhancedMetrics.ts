/**
 * Enhanced backtesting metrics for better model evaluation
 */

import type { Recommendation, EnhancedBacktestMetrics } from '../db/types.js';
import { calculateECE } from '../model/calibration.js';

/**
 * Calculate maximum drawdown and its duration
 */
function calculateDrawdown(
  cumulativeProfits: number[],
  dates: string[],
): { maxDrawdown: number; maxDrawdownDuration: number } {
  let maxDrawdown = 0;
  let maxDrawdownDuration = 0;
  let peak = cumulativeProfits[0] || 0;
  let drawdownStart = 0;

  for (let i = 0; i < cumulativeProfits.length; i++) {
    const profit = cumulativeProfits[i];

    if (profit > peak) {
      peak = profit;
      drawdownStart = i;
    } else {
      const drawdown = peak - profit;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }

      // Calculate duration in days
      if (drawdownStart < i) {
        const startDate = new Date(dates[drawdownStart]);
        const currentDate = new Date(dates[i]);
        const duration = Math.ceil(
          (currentDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
        );
        if (duration > maxDrawdownDuration) {
          maxDrawdownDuration = duration;
        }
      }
    }
  }

  return { maxDrawdown, maxDrawdownDuration };
}

/**
 * Calculate Sharpe and Sortino ratios
 */
function calculateRiskAdjustedReturns(returns: number[]): {
  sharpeRatio: number;
  sortinoRatio: number;
} {
  if (returns.length === 0) {
    return { sharpeRatio: 0, sortinoRatio: 0 };
  }

  const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);

  // Sharpe ratio (assume 0% risk-free rate for simplicity)
  const sharpeRatio = stdDev > 0 ? avgReturn / stdDev : 0;

  // Sortino ratio (only downside deviation)
  const downside = returns.filter((r) => r < 0);
  if (downside.length === 0) {
    return { sharpeRatio, sortinoRatio: sharpeRatio };
  }

  const downsideVariance = downside.reduce((sum, r) => sum + Math.pow(r, 2), 0) / downside.length;
  const downsideStdDev = Math.sqrt(downsideVariance);
  const sortinoRatio = downsideStdDev > 0 ? avgReturn / downsideStdDev : 0;

  return { sharpeRatio, sortinoRatio };
}

/**
 * Calculate ROI by confidence bucket
 */
function calculateRoiByConfidence(
  bets: Array<{
    prob: number;
    profit: number;
    stake: number;
    won: boolean;
  }>,
): Array<{
  bucket: string;
  bets: number;
  roi: number;
  win_rate: number;
  avg_prob: number;
}> {
  const buckets = [
    { min: 0.5, max: 0.6, label: '50-60%' },
    { min: 0.6, max: 0.7, label: '60-70%' },
    { min: 0.7, max: 0.8, label: '70-80%' },
    { min: 0.8, max: 0.9, label: '80-90%' },
    { min: 0.9, max: 1.0, label: '90-100%' },
  ];

  return buckets.map((bucket) => {
    const betsInBucket = bets.filter((b) => b.prob >= bucket.min && b.prob < bucket.max);

    if (betsInBucket.length === 0) {
      return {
        bucket: bucket.label,
        bets: 0,
        roi: 0,
        win_rate: 0,
        avg_prob: 0,
      };
    }

    const totalStake = betsInBucket.reduce((sum, b) => sum + b.stake, 0);
    const totalProfit = betsInBucket.reduce((sum, b) => sum + b.profit, 0);
    const wins = betsInBucket.filter((b) => b.won).length;
    const avgProb = betsInBucket.reduce((sum, b) => sum + b.prob, 0) / betsInBucket.length;

    return {
      bucket: bucket.label,
      bets: betsInBucket.length,
      roi: totalStake > 0 ? totalProfit / totalStake : 0,
      win_rate: wins / betsInBucket.length,
      avg_prob: avgProb,
    };
  });
}

/**
 * Calculate enhanced backtesting metrics
 */
export function calculateEnhancedMetrics(
  recommendations: Recommendation[],
  edgeThreshold: number,
  evThreshold: number,
): EnhancedBacktestMetrics {
  // Filter recommendations by thresholds
  const filteredRecs = recommendations.filter((rec) => {
    if (!rec.recommended_side) return false;

    const edge = rec.recommended_side === 'home' ? (rec.edge_home ?? 0) : (rec.edge_away ?? 0);
    const ev = rec.recommended_side === 'home' ? (rec.ev_home ?? 0) : (rec.ev_away ?? 0);

    return edge >= edgeThreshold && ev >= evThreshold;
  });

  if (filteredRecs.length === 0) {
    return {
      roi: 0,
      win_rate: 0,
      total_bets: 0,
      total_profit: 0,
      ece: 0,
      max_drawdown: 0,
      max_drawdown_duration: 0,
      sharpe_ratio: 0,
      sortino_ratio: 0,
      cumulative_roi_over_time: [],
      roi_by_confidence: [],
    };
  }

  // Calculate core metrics
  const stake = 100; // Fixed stake per bet
  let totalProfit = 0;
  let wins = 0;
  const cumulativeProfits: number[] = [];
  const returns: number[] = [];
  const dates: string[] = [];
  const bets: Array<{ prob: number; profit: number; stake: number; won: boolean }> = [];

  // Collect probabilities and labels for ECE calculation
  const probabilities: number[] = [];
  const labels: number[] = [];

  const cumulativeTimeSeries: Array<{
    date: string;
    cumulative_roi: number;
    cumulative_profit: number;
    bet_count: number;
  }> = [];

  filteredRecs
    .slice()
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .forEach((rec) => {
      const odds = rec.recommended_side === 'home' ? rec.odds_home : rec.odds_away;
      const actual = rec.actual;

      if (odds === null || actual === null) return;

      const won =
        (rec.recommended_side === 'home' && actual === 1) ||
        (rec.recommended_side === 'away' && actual === 0);

      const profit = won ? stake * (Math.abs(odds) / 100) : -stake;
      totalProfit += profit;

      if (won) wins++;

      // Track for drawdown
      cumulativeProfits.push(totalProfit);
      dates.push(rec.date);

      // Track returns for Sharpe/Sortino
      returns.push(profit / stake);

      // Track bets for ROI by confidence
      const prob = rec.recommended_side === 'home' ? rec.model_prob_home : rec.model_prob_away;
      bets.push({ prob, profit, stake, won });

      // Track for ECE
      probabilities.push(prob);
      labels.push(won ? 1 : 0);

      // Track cumulative time series
      cumulativeTimeSeries.push({
        date: rec.date,
        cumulative_roi: totalProfit / (bets.length * stake),
        cumulative_profit: totalProfit,
        bet_count: bets.length,
      });
    });

  const roi = totalProfit / (filteredRecs.length * stake);
  const winRate = wins / filteredRecs.length;

  // Calculate ECE
  const ece = calculateECE(probabilities, labels);

  // Calculate drawdown
  const { maxDrawdown, maxDrawdownDuration } = calculateDrawdown(cumulativeProfits, dates);
  const maxDrawdownPct = filteredRecs.length > 0 ? maxDrawdown / (filteredRecs.length * stake) : 0;

  // Calculate risk-adjusted returns
  const { sharpeRatio, sortinoRatio } = calculateRiskAdjustedReturns(returns);

  // Calculate ROI by confidence
  const roiByConfidence = calculateRoiByConfidence(bets);

  return {
    roi,
    win_rate: winRate,
    total_bets: filteredRecs.length,
    total_profit: totalProfit,
    ece,
    max_drawdown: maxDrawdownPct,
    max_drawdown_duration: maxDrawdownDuration,
    sharpe_ratio: sharpeRatio,
    sortino_ratio: sortinoRatio,
    cumulative_roi_over_time: cumulativeTimeSeries,
    roi_by_confidence: roiByConfidence,
  };
}

/**
 * Print enhanced metrics report
 */
export function printEnhancedMetrics(metrics: EnhancedBacktestMetrics): void {
  console.log('\n=== Enhanced Backtest Metrics ===\n');

  console.log('Core Performance:');
  console.log(`  Total Bets: ${metrics.total_bets}`);
  console.log(`  ROI: ${(metrics.roi * 100).toFixed(2)}%`);
  console.log(`  Win Rate: ${(metrics.win_rate * 100).toFixed(2)}%`);
  console.log(`  Total Profit: $${metrics.total_profit.toFixed(2)}`);

  console.log('\nCalibration:');
  console.log(`  Expected Calibration Error: ${metrics.ece.toFixed(4)}`);

  console.log('\nRisk Metrics:');
  console.log(`  Max Drawdown: ${(metrics.max_drawdown * 100).toFixed(2)}%`);
  console.log(`  Max Drawdown Duration: ${metrics.max_drawdown_duration} days`);
  console.log(`  Sharpe Ratio: ${metrics.sharpe_ratio.toFixed(3)}`);
  console.log(`  Sortino Ratio: ${metrics.sortino_ratio.toFixed(3)}`);

  console.log('\nROI by Confidence:');
  console.log('Bucket  | Bets | ROI      | Win Rate | Avg Prob');
  console.log('--------+------+----------+----------+---------');
  metrics.roi_by_confidence.forEach((bucket) => {
    if (bucket.bets > 0) {
      console.log(
        `${bucket.bucket.padEnd(7)} | ${String(bucket.bets).padStart(4)} | ${((bucket.roi * 100).toFixed(2) + '%').padStart(8)} | ${((bucket.win_rate * 100).toFixed(1) + '%').padStart(8)} | ${(bucket.avg_prob * 100).toFixed(1) + '%'}`,
      );
    }
  });

  if (metrics.cumulative_roi_over_time.length > 0) {
    console.log('\nCumulative ROI Over Time (last 10 data points):');
    const last10 = metrics.cumulative_roi_over_time.slice(-10);
    last10.forEach((point) => {
      console.log(
        `  ${point.date}: ${(point.cumulative_roi * 100).toFixed(2)}% ($${point.cumulative_profit.toFixed(0)}, ${point.bet_count} bets)`,
      );
    });
  }

  console.log('\n' + '='.repeat(50) + '\n');
}

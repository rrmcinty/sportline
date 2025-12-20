/**
 * Backtest command - Run comprehensive backtesting with detailed analysis using existing trained models
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { DatabaseQueries } from '../../lib/db/queries.js';
import { loadFeatureConfig } from '../../lib/features/featureConfig.js';
import { extractFeaturesForDataset } from '../../lib/features/featureEngineering.js';
import { loadModel, findLatestModel } from '../../lib/model/modelStorage.js';
import { batchPredict } from '../../lib/model/predictor.js';
import {
  generateRecommendations,
  runBacktestGrid,
  generateProbabilityBuckets,
  printBacktestSummary,
} from '../../lib/backtest/backtester.js';
import { getThresholdRecommendations } from '../../lib/backtest/thresholdOptimizer.js';
import {
  analyzeProfitableBets,
  printProfitabilityAnalysis,
} from '../../lib/backtest/profitabilityAnalyzer.js';
import type { Recommendation } from '../../lib/db/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface BacktestOptions {
  sport: string;
  config?: string;
  market?: string;
}

export async function backtest(options: BacktestOptions): Promise<void> {
  console.log('\n📈 Sportline Backtesting Analysis\n');

  // Step 1: Load existing trained model
  const sportToCategory: Record<string, string> = {
    ncaam: 'basketball',
    nba: 'basketball',
    nhl: 'hockey',
    nfl: 'football',
    cfb: 'football',
  };

  const sportCategory = sportToCategory[options.sport] || 'basketball';
  const market = options.market || 'moneyline';

  console.log('[1/4] Loading existing trained model...');
  const modelsDir = path.join(process.cwd(), `src/train/${sportCategory}/${options.sport}/models`);

  const modelPath = findLatestModel(options.sport, market, modelsDir);
  if (!modelPath) {
    console.error(`❌ No trained model found for ${options.sport} ${market}`);
    console.error(`   Expected location: ${modelsDir}`);
    console.error(`   Run 'sportline train --sport ${options.sport}' first`);
    process.exit(1);
  }

  const model = loadModel(modelPath);
  console.log(`✓ Loaded model: ${path.basename(modelPath)}`);
  console.log(`✓ Model accuracy: ${(model.backtestMetrics.accuracy * 100).toFixed(2)}%`);
  console.log(`✓ Model ROI: ${(model.backtestMetrics.roi * 100).toFixed(2)}%`);

  // Step 2: Load configuration (from model or file)
  let config;
  if (options.config) {
    console.log('\n[2/4] Loading custom configuration...');
    config = loadFeatureConfig(options.config);
  } else {
    console.log('\n[2/4] Using model configuration...');
    // Reconstruct config from model
    config = {
      sport: model.sport,
      model: model.modelType,
      market: model.market,
      seasons: model.seasons,
      features: model.features,
      rolling_windows: model.rollingWindows,
      allowed_providers: ['draftkings', 'fanduel', 'betmgm'], // Default
      recency_weighting: model.recencyWeighting,
      min_edge: model.thresholds.min_edge,
      min_ev: model.thresholds.min_ev,
    };
  }
  console.log(`✓ Config loaded for ${config.sport} ${config.market}`);

  // Step 3: Load data and extract features
  console.log('\n[3/4] Loading data and extracting features...');
  const dbPath = path.join(process.cwd(), 'data', 'sportline.db');
  const db = new DatabaseQueries(dbPath);

  const games = db.getHistoricalGames(config.sport, config.seasons);
  console.log(`✓ Loaded ${games.length} historical games`);

  const { dataset } = extractFeaturesForDataset(games, db, config);
  console.log(`✓ Prepared ${dataset.length} games for backtesting`);

  db.close();

  // Step 4: Generate predictions using loaded model
  console.log('\n[4/4] Generating predictions for backtesting...');

  // Use the same train/test split as original training (80/20)
  const splitIdx = Math.floor(0.8 * dataset.length);
  const testDataset = dataset.slice(splitIdx);

  // Generate predictions using the loaded model
  const testProbabilities = batchPredict(
    testDataset.map((d) => d.features),
    model,
  );

  const recommendations = generateRecommendations(dataset, testProbabilities, splitIdx);

  console.log(`✓ Generated ${recommendations.length} recommendations for backtesting`);

  // Step 5: Run comprehensive backtest analysis
  console.log('\n========== Comprehensive Backtest Analysis ==========\n');

  // Test a wider range of thresholds
  const edgeRange = [0.01, 0.015, 0.02, 0.025, 0.03, 0.035, 0.04, 0.045, 0.05, 0.06, 0.07, 0.08];
  const evRange = [0.005, 0.01, 0.015, 0.02, 0.025, 0.03, 0.035, 0.04];

  const backtestResults = runBacktestGrid(recommendations, edgeRange, evRange);

  // Print detailed results
  printBacktestSummary(backtestResults, 15);

  // Get threshold recommendations using multiple strategies
  const thresholdRecs = getThresholdRecommendations(backtestResults, 20);

  console.log('\n========== Threshold Recommendations ==========\n');
  console.log('Strategy                | Min Edge | Min EV | Notes');
  console.log('------------------------+----------+--------+---------------------------');
  console.log(
    `Best ROI                | ${(thresholdRecs.bestROI.min_edge * 100).toFixed(1).padStart(7)}% | ${(thresholdRecs.bestROI.min_ev * 100).toFixed(1).padStart(5)}% | Maximize return`,
  );
  console.log(
    `Best Expected Profit    | ${(thresholdRecs.bestExpectedProfit.min_edge * 100).toFixed(1).padStart(7)}% | ${(thresholdRecs.bestExpectedProfit.min_ev * 100).toFixed(1).padStart(5)}% | Maximize profit per bet`,
  );
  console.log(
    `Kelly Criterion         | ${(thresholdRecs.bestKelly.min_edge * 100).toFixed(1).padStart(7)}% | ${(thresholdRecs.bestKelly.min_ev * 100).toFixed(1).padStart(5)}% | Balance growth and risk`,
  );
  console.log(
    `Recommended (Default)   | ${(thresholdRecs.recommended.min_edge * 100).toFixed(1).padStart(7)}% | ${(thresholdRecs.recommended.min_ev * 100).toFixed(1).padStart(5)}% | Multi-objective optimized`,
  );
  console.log('===============================================\n');

  // Generate probability buckets
  console.log('\n========== Probability Calibration Analysis ==========\n');
  const buckets = generateProbabilityBuckets(recommendations, 0.1);

  // Helper function to determine strategy label
  function getStrategyLabel(bucket: any): string {
    if (bucket.home_bet_percentage > 0.7) {
      return 'Home Focus';
    } else if (bucket.away_bet_percentage > 0.7) {
      return 'Away Focus';
    } else if (Math.abs(bucket.home_bet_percentage - 0.5) < 0.1) {
      return 'Balanced';
    } else {
      return 'Mixed';
    }
  }

  console.log('Bucket | Count | Accuracy | Avg EV  | ROI      | Home Bets | Away Bets | Strategy');
  console.log(
    '-------+-------+----------+---------+----------+-----------+-----------+-----------',
  );

  for (const bucket of buckets) {
    console.log(
      `${bucket.bucket.padEnd(6)} | ${bucket.count.toString().padStart(5)} | ` +
        `${(bucket.accuracy * 100).toFixed(1).padStart(7)}% | ` +
        `${(bucket.avg_ev * 100).toFixed(2).padStart(6)}% | ` +
        `${(bucket.roi * 100).toFixed(1).padStart(7)}% | ` +
        `${bucket.home_bet_count.toString().padStart(9)} | ` +
        `${bucket.away_bet_count.toString().padStart(9)} | ` +
        `${getStrategyLabel(bucket).padEnd(9)}`,
    );
  }

  console.log('======================================================\n');

  // EV bucket analysis (does predicted EV correlate with realized ROI?)
  console.log('\n========== EV Bucket ROI Sanity Check ==========');

  function passesJuiceGate(betOdds: number, betEdge: number): boolean {
    const MAX_VIG_PRICE = -115;
    const EDGE_REQUIRED_IF_VIGGY = 0.04;
    if (betOdds <= MAX_VIG_PRICE && betEdge < EDGE_REQUIRED_IF_VIGGY) return false;
    return true;
  }

  function getBetForRec(rec: Recommendation): {
    side: 'home' | 'away';
    odds: number;
    edge: number;
    ev: number;
  } | null {
    // Match the positive-EV best-side logic used in bucket calculations
    if (
      rec.ev_home !== null &&
      rec.odds_home !== null &&
      rec.edge_home !== null &&
      rec.ev_home > 0
    ) {
      if (rec.ev_away === null || rec.ev_home > rec.ev_away) {
        if (!passesJuiceGate(rec.odds_home, rec.edge_home)) return null;
        return { side: 'home', odds: rec.odds_home, edge: rec.edge_home, ev: rec.ev_home };
      }
    }
    if (
      rec.ev_away !== null &&
      rec.odds_away !== null &&
      rec.edge_away !== null &&
      rec.ev_away > 0
    ) {
      if (!passesJuiceGate(rec.odds_away, rec.edge_away)) return null;
      return { side: 'away', odds: rec.odds_away, edge: rec.edge_away, ev: rec.ev_away };
    }
    return null;
  }

  const evBuckets: Array<{ label: string; lower: number; upper: number }> = [
    { label: '<0', lower: Number.NEGATIVE_INFINITY, upper: 0 },
    { label: '0-1', lower: 0, upper: 0.01 },
    { label: '1-2', lower: 0.01, upper: 0.02 },
    { label: '2-5', lower: 0.02, upper: 0.05 },
    { label: '5+', lower: 0.05, upper: Number.POSITIVE_INFINITY },
  ];

  type EVBucketRow = {
    label: string;
    bets: number;
    roi: number;
    winRate: number;
    avgEV: number;
  };

  const evRows: EVBucketRow[] = [];

  for (const b of evBuckets) {
    let bets = 0;
    let wins = 0;
    let totalProfit = 0;
    let totalStaked = 0;
    let evSum = 0;

    for (const rec of recommendations) {
      if (rec.actual === null) continue;
      const bet = getBetForRec(rec);
      if (!bet) continue;
      if (!(bet.ev >= b.lower && bet.ev < b.upper)) continue;

      bets++;
      totalStaked += 100;
      evSum += bet.ev;

      const won =
        (bet.side === 'home' && rec.actual === 1) || (bet.side === 'away' && rec.actual === 0);

      if (won) {
        wins++;
        const profit = bet.odds > 0 ? bet.odds : (100 / Math.abs(bet.odds)) * 100;
        totalProfit += profit;
      } else {
        totalProfit -= 100;
      }
    }

    if (bets === 0) continue;
    evRows.push({
      label: b.label,
      bets,
      roi: totalStaked > 0 ? totalProfit / totalStaked : 0,
      winRate: bets > 0 ? wins / bets : 0,
      avgEV: bets > 0 ? evSum / bets : 0,
    });
  }

  console.log('EV Bucket | Bets | Avg EV  | Win Rate | ROI');
  console.log('----------+------+---------+----------+----------');
  for (const r of evRows) {
    console.log(
      `${r.label.padEnd(8)} | ${r.bets.toString().padStart(4)} | ${(r.avgEV * 100)
        .toFixed(2)
        .padStart(6)}% | ${(r.winRate * 100).toFixed(1).padStart(7)}% | ${(r.roi * 100)
        .toFixed(2)
        .padStart(7)}%`,
    );
  }
  console.log('===============================================\n');

  // Step 6: Analyze profitable bet characteristics
  console.log('\n========== Profitable Bet Analysis ==========\n');

  // Use the recommended thresholds for profitability analysis
  const recommendedEdge = thresholdRecs.recommended.min_edge;
  const recommendedEV = thresholdRecs.recommended.min_ev;

  const profitabilityAnalysis = analyzeProfitableBets(
    recommendations,
    dataset,
    recommendedEdge,
    recommendedEV,
    100, // $100 unit size
  );

  printProfitabilityAnalysis(profitabilityAnalysis);

  // Calculate overall metrics
  const totalGames = recommendations.length;
  const gamesWithActuals = recommendations.filter((r) => r.actual !== null).length;

  console.log('\n========== Overall Model Performance ==========\n');
  console.log(`Total test games: ${totalGames}`);
  console.log(`Games with actuals: ${gamesWithActuals}`);
  console.log(`Model accuracy: ${(model.backtestMetrics.accuracy * 100).toFixed(2)}%`);
  console.log(`Model ROI: ${(model.backtestMetrics.roi * 100).toFixed(2)}%`);
  console.log(`Model trained: ${model.trainedAt}`);

  // Find best result for display
  const bestByROI = backtestResults
    .filter((r) => r.total_bets >= 20)
    .sort((a, b) => b.roi - a.roi)[0];

  if (bestByROI) {
    console.log(`\nBest backtest result:`);
    console.log(`  ROI: ${(bestByROI.roi * 100).toFixed(2)}%`);
    console.log(`  Total bets: ${bestByROI.total_bets}`);
    console.log(`  Win rate: ${(bestByROI.win_rate * 100).toFixed(2)}%`);
    console.log(`  Total profit (per $100 units): $${bestByROI.total_profit.toFixed(2)}`);
  }

  console.log('\n===============================================\n');

  console.log('\n💡 Insights:\n');
  console.log('1. Higher thresholds = fewer bets but potentially higher ROI');
  console.log('2. Check calibration buckets to see where model is accurate');
  console.log('3. Use recommended thresholds for production');
  console.log('4. Consider Kelly Criterion for optimal bet sizing\n');

  console.log('✅ Backtest complete! Use these insights to optimize your strategy.\n');
}

/**
 * Backtest command - Run comprehensive backtesting with detailed analysis
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { DatabaseQueries } from '../../lib/db/queries.js';
import { loadFeatureConfig } from '../../lib/features/featureConfig.js';
import { extractFeaturesForDataset } from '../../lib/features/featureEngineering.js';
import { trainModel } from '../../lib/model/trainer.js';
import {
  generateRecommendations,
  runBacktestGrid,
  generateProbabilityBuckets,
  printBacktestSummary,
} from '../../lib/backtest/backtester.js';
import { getThresholdRecommendations } from '../../lib/backtest/thresholdOptimizer.js';
import type { BacktestResult } from '../../lib/db/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface BacktestOptions {
  sport: string;
  config?: string;
}

export async function backtest(options: BacktestOptions): Promise<void> {
  console.log('\n📈 Sportline Backtesting Analysis\n');

  // Step 1: Load configuration
  const defaultConfigPath = path.join(
    process.cwd(),
    'src/train/basketball/ncaam/featuresConfig.json'
  );
  const configPath = options.config || defaultConfigPath;

  console.log('[1/5] Loading configuration...');
  const config = loadFeatureConfig(configPath);
  console.log(`✓ Config loaded for ${config.sport} ${config.market}`);

  // Step 2: Load data and extract features
  console.log('\n[2/5] Loading data and extracting features...');
  const dbPath = path.join(process.cwd(), 'data', 'sportline.db');
  const db = new DatabaseQueries(dbPath);

  const games = db.getHistoricalGames(config.sport, config.seasons);
  console.log(`✓ Loaded ${games.length} historical games`);

  const { dataset } = extractFeaturesForDataset(games, db, config);
  console.log(`✓ Prepared ${dataset.length} games for training`);

  db.close();

  // Step 3: Train model
  console.log('\n[3/5] Training model...');
  const trainingResult = trainModel(dataset, config);

  // Step 4: Generate recommendations
  console.log('\n[4/5] Generating recommendations for backtesting...');
  const splitIdx = Math.floor(0.8 * dataset.length);
  const recommendations = generateRecommendations(
    dataset,
    trainingResult.probabilities.test,
    splitIdx
  );

  // Step 5: Run comprehensive backtest analysis
  console.log('\n[5/5] Running comprehensive backtest analysis...\n');

  // Test a wider range of thresholds
  const edgeRange = [
    0.01, 0.015, 0.02, 0.025, 0.03, 0.035, 0.04, 0.045, 0.05, 0.06, 0.07,
    0.08,
  ];
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
    `Best ROI                | ${(thresholdRecs.bestROI.min_edge * 100).toFixed(1).padStart(7)}% | ${(thresholdRecs.bestROI.min_ev * 100).toFixed(1).padStart(5)}% | Maximize return`
  );
  console.log(
    `Best Expected Profit    | ${(thresholdRecs.bestExpectedProfit.min_edge * 100).toFixed(1).padStart(7)}% | ${(thresholdRecs.bestExpectedProfit.min_ev * 100).toFixed(1).padStart(5)}% | Maximize profit per bet`
  );
  console.log(
    `Kelly Criterion         | ${(thresholdRecs.bestKelly.min_edge * 100).toFixed(1).padStart(7)}% | ${(thresholdRecs.bestKelly.min_ev * 100).toFixed(1).padStart(5)}% | Balance growth and risk`
  );
  console.log(
    `Recommended (Default)   | ${(thresholdRecs.recommended.min_edge * 100).toFixed(1).padStart(7)}% | ${(thresholdRecs.recommended.min_ev * 100).toFixed(1).padStart(5)}% | Multi-objective optimized`
  );
  console.log('===============================================\n');

  // Generate probability buckets
  console.log('\n========== Probability Calibration Analysis ==========\n');
  const buckets = generateProbabilityBuckets(recommendations, 0.1);

  console.log(
    'Bucket | Count | Accuracy | Avg EV  | Avg Edge | ROI      | Profit'
  );
  console.log(
    '-------+-------+----------+---------+----------+----------+---------'
  );

  for (const bucket of buckets) {
    console.log(
      `${bucket.bucket.padEnd(6)} | ${bucket.count.toString().padStart(5)} | ` +
        `${(bucket.accuracy * 100).toFixed(1).padStart(7)}% | ` +
        `${(bucket.avg_ev * 100).toFixed(2).padStart(6)}% | ` +
        `${(bucket.avg_edge * 100).toFixed(2).padStart(7)}% | ` +
        `${(bucket.roi * 100).toFixed(1).padStart(7)}% | ` +
        `$${bucket.total_profit.toFixed(0).padStart(6)}`
    );
  }

  console.log('======================================================\n');

  // Calculate overall metrics
  const totalGames = recommendations.length;
  const gamesWithActuals = recommendations.filter(
    (r) => r.actual !== null
  ).length;

  console.log('\n========== Overall Model Performance ==========\n');
  console.log(`Total test games: ${totalGames}`);
  console.log(`Games with actuals: ${gamesWithActuals}`);
  console.log(
    `Train accuracy: ${(trainingResult.metrics.trainAccuracy * 100).toFixed(2)}%`
  );
  console.log(
    `Test accuracy: ${(trainingResult.metrics.testAccuracy * 100).toFixed(2)}%`
  );
  console.log(`Log loss: ${trainingResult.metrics.logLoss.toFixed(4)}`);

  // Find best result for display
  const bestByROI = backtestResults
    .filter((r) => r.total_bets >= 20)
    .sort((a, b) => b.roi - a.roi)[0];

  if (bestByROI) {
    console.log(`\nBest backtest result:`);
    console.log(`  ROI: ${(bestByROI.roi * 100).toFixed(2)}%`);
    console.log(`  Total bets: ${bestByROI.total_bets}`);
    console.log(`  Win rate: ${(bestByROI.win_rate * 100).toFixed(2)}%`);
    console.log(
      `  Total profit (per $100 units): $${bestByROI.total_profit.toFixed(2)}`
    );
  }

  console.log('\n===============================================\n');

  console.log('\n💡 Insights:\n');
  console.log(
    '1. Higher thresholds = fewer bets but potentially higher ROI'
  );
  console.log('2. Check calibration buckets to see where model is accurate');
  console.log('3. Use recommended thresholds for production');
  console.log('4. Consider Kelly Criterion for optimal bet sizing\n');

  console.log(
    '✅ Backtest complete! Use these insights to optimize your strategy.\n'
  );
}

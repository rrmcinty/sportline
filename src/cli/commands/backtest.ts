/**
 * Backtest command - Run comprehensive backtesting with detailed analysis
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { DatabaseQueries } from '../../lib/db/queries.js';
import { loadFeatureConfig } from '../../lib/features/featureConfig.js';
import { extractFeaturesForDataset } from '../../lib/features/featureEngineering.js';
import { trainModel, calculateCoefficientImportance } from '../../lib/model/trainer.js';
import {
  generateRecommendations,
  runBacktestGrid,
  generateProbabilityBuckets,
  printBacktestSummary,
} from '../../lib/backtest/backtester.js';
import { getThresholdRecommendations } from '../../lib/backtest/thresholdOptimizer.js';
import { 
  analyzeProfitableBets, 
  printProfitabilityAnalysis 
} from '../../lib/backtest/profitabilityAnalyzer.js';
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
  // Map sports to their sport categories
  const sportToCategory: Record<string, string> = {
    'ncaam': 'basketball',
    'nba': 'basketball',
    'nhl': 'hockey',
    'nfl': 'football',
    'cfb': 'football'
  };
  
  const sportCategory = sportToCategory[options.sport] || 'basketball';
  const defaultConfigPath = path.join(
    process.cwd(),
    `src/train/${sportCategory}/${options.sport}/featuresConfig.json`
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

  // Feature Importance Analysis
  console.log('\n🔍 Feature Importance Analysis:');
  const coeffImportance = calculateCoefficientImportance(trainingResult, trainingResult.featureKeys);

  console.log('\n📊 Top 20 Most Important Features (Coefficient-based):');
  coeffImportance.slice(0, 20).forEach((item, i) => {
    const direction = item.coefficient >= 0 ? '📈' : '📉';
    console.log(`${(i + 1).toString().padStart(2)}. ${item.feature.padEnd(25)} | ${item.importance.toFixed(4)} | ${direction}`);
  });

  console.log('\n🗑️  Bottom 10 Least Important Features:');
  coeffImportance.slice(-10).forEach((item, i) => {
    const rank = coeffImportance.length - 10 + i + 1;
    console.log(`${rank.toString().padStart(3)}. ${item.feature.padEnd(25)} | ${item.importance.toFixed(4)}`);
  });

  // Recommendations
  const uselessFeatures = coeffImportance.filter(item => item.importance < 0.001);
  const lowImportanceFeatures = coeffImportance.filter(item => item.importance < 0.01);

  console.log(`\n💡 Recommendations:`);
  console.log(`  - ${uselessFeatures.length} features have importance < 0.001 (consider disabling)`);
  console.log(`  - ${lowImportanceFeatures.length} features have importance < 0.01 (review these)`);
  console.log(`  - Top feature: ${coeffImportance[0].feature} (${coeffImportance[0].importance.toFixed(4)})`);

  console.log(`\n🗑️ Features to Consider Disabling (< 0.001 importance):`);
  uselessFeatures.forEach((item, i) => {
    console.log(`${(i + 1).toString().padStart(3)}. ${item.feature.padEnd(30)} | ${item.importance.toFixed(6)}`);
  });

  console.log(`\n⚠️  Features to Review (< 0.01 importance):`);
  lowImportanceFeatures.forEach((item, i) => {
    console.log(`${(i + 1).toString().padStart(3)}. ${item.feature.padEnd(30)} | ${item.importance.toFixed(6)}`);
  });

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

  // Step 6: Analyze profitable bet characteristics
  console.log('\n[6/6] Analyzing profitable bet characteristics...\n');
  
  // Use the recommended thresholds for profitability analysis
  const recommendedEdge = thresholdRecs.recommended.min_edge;
  const recommendedEV = thresholdRecs.recommended.min_ev;
  
  const profitabilityAnalysis = analyzeProfitableBets(
    recommendations,
    dataset,
    recommendedEdge,
    recommendedEV,
    100 // $100 unit size
  );
  
  printProfitabilityAnalysis(profitabilityAnalysis);

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

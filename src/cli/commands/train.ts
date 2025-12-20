/**
 * Train command - Orchestrates model training, backtesting, and model saving
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { DatabaseQueries } from '../../lib/db/queries.js';
import { loadFeatureConfig } from '../../lib/features/featureConfig.js';
import { extractFeaturesForDataset } from '../../lib/features/featureEngineering.js';
import { trainModel } from '../../lib/model/trainer.js';
import { saveModel, generateModelFilename } from '../../lib/model/modelStorage.js';
import {
  generateRecommendations,
  runBacktestGrid,
  findOptimalThresholds,
  generateProbabilityBuckets,
  generateEdgeBuckets,
  printBacktestSummary,
} from '../../lib/backtest/backtester.js';
import {
  calculateCoefficientImportance,
  calculatePermutationImportance as _calculatePermutationImportance,
} from '../../lib/model/trainer.js';
import {
  saveHistoricalData,
  clearHistoricalDataCache,
} from '../../lib/analysis/historicalDataManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const IS_VERBOSE = process.env.SPORTLINE_VERBOSE === '1';

interface TrainOptions {
  sport: string;
  force: boolean;
  config?: string;
  market?: string;
}

export async function train(options: TrainOptions): Promise<void> {
  console.log('\n🏀 Sportline Model Training\n');
  console.log(`Sport: ${options.sport}`);

  // Step 1: Load configuration
  // Note: Config file is in src/, not dist/, so we need to navigate correctly
  // Map sports to their sport categories
  const sportToCategory: Record<string, string> = {
    ncaam: 'basketball',
    nba: 'basketball',
    nhl: 'hockey',
    nfl: 'football',
    cfb: 'football',
  };

  const sportCategory = sportToCategory[options.sport] || 'basketball';
  const market = options.market || 'moneyline';

  // Determine config file path based on market
  let defaultConfigPath: string;
  if (market === 'moneyline') {
    defaultConfigPath = path.join(
      process.cwd(),
      `src/train/${sportCategory}/${options.sport}/featuresConfig.json`,
    );
  } else {
    defaultConfigPath = path.join(
      process.cwd(),
      `src/train/${sportCategory}/${options.sport}/featuresConfig_${market}.json`,
    );
  }

  const configPath = options.config || defaultConfigPath;

  console.log(`\n[1/7] Loading configuration from ${configPath}...`);
  const config = loadFeatureConfig(configPath);
  console.log(`✓ Loaded config for ${config.sport} ${config.market}`);
  console.log(`  Model: ${config.model}`);
  console.log(`  Seasons: ${config.seasons.join(', ')}`);
  console.log(`  Rolling windows: ${config.rolling_windows.join(', ')}`);

  // Step 2: Connect to database and load games
  console.log('\n[2/7] Loading historical games from database...');
  const dbPath = path.join(process.cwd(), 'data', 'sportline.db');
  const db = new DatabaseQueries(dbPath);

  const games = db.getHistoricalGames(config.sport, config.seasons);
  console.log(`✓ Loaded ${games.length} games`);

  if (games.length === 0) {
    console.error('❌ No games found in database for specified seasons');
    process.exit(1);
  }

  // Step 3: Extract features
  console.log('\n[3/7] Extracting features...');
  const { dataset, featureMeans, skipStats } = extractFeaturesForDataset(games, db, config);

  console.log(`✓ Extracted features for ${dataset.length} games`);
  if (IS_VERBOSE) {
    console.log(`  Skipped (no rolling stats): ${skipStats.skipNoRollingStats}`);
    console.log(`  Skipped (no odds): ${skipStats.skipNoOdds}`);
    console.log(`  Feature count: ${Object.keys(dataset[0]?.features || {}).length}`);
  }

  if (dataset.length === 0) {
    console.error('❌ No valid training data after feature extraction');
    process.exit(1);
  }

  // Step 4: Train model
  console.log('\n[4/7] Training model...');
  const trainingResult = trainModel(dataset, config);

  // Step 5: Generate recommendations from test set
  console.log('\n[5/7] Generating recommendations for backtesting...');
  const splitIdx = Math.floor(0.8 * dataset.length);

  const probsForBacktest =
    trainingResult.calibratedProbabilities?.test ?? trainingResult.probabilities.test;

  const recommendations = generateRecommendations(
    dataset,
    probsForBacktest,
    splitIdx,
  );
  console.log(`✓ Generated ${recommendations.length} test predictions`);

  // Step 6: Run backtest to find optimal thresholds
  console.log('\n[6/7] Running backtest to optimize thresholds...');

  const testData = dataset.slice(splitIdx);
  if (IS_VERBOSE) {
    // Debug: Check dataset odds
    const testWithOdds = testData.filter((d) => d.odds && d.odds.length > 0);
    console.log(`  Test games with odds in dataset: ${testWithOdds.length}/${testData.length}`);

    // Debug: Log sample game from dataset
    if (testData.length > 0) {
      const sample = testData[0];
      console.log(`  Sample game odds:`, JSON.stringify(sample.odds?.slice(0, 1)));
    }

    // Debug: Check how many recommendations have non-null odds
    const recsWithOdds = recommendations.filter(
      (r) => r.odds_home !== null && r.odds_away !== null,
    );
    console.log(`  Recommendations with odds: ${recsWithOdds.length}/${recommendations.length}`);
  }

  // Use wider threshold ranges to ensure we find something
  const backtestResults = runBacktestGrid(
    recommendations,
    [0.0, 0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08],
    [0.0, 0.005, 0.01, 0.015, 0.02, 0.025, 0.03],
  );
  console.log(`✓ Tested ${backtestResults.length} threshold combinations`);

  if (IS_VERBOSE) {
    printBacktestSummary(backtestResults, 5);
  }

  // Lower minimum bets requirement for finding optimal thresholds
  const optimalThresholds = findOptimalThresholds(backtestResults, 10);

  // Get best result for metrics
  const bestResult = backtestResults
    .filter((r) => r.total_bets >= 20)
    .sort((a, b) => b.roi - a.roi)[0];

  if (!bestResult) {
    console.error('❌ No valid backtest results found');
    process.exit(1);
  }

  const backtestMetrics = {
    accuracy: trainingResult.metrics.testAccuracy,
    logLoss: trainingResult.metrics.logLoss,
    roi: bestResult.roi,
    totalBets: bestResult.total_bets,
    winRate: bestResult.win_rate,
  };

  // Generate probability buckets for calibration
  const buckets = generateProbabilityBuckets(recommendations);
  console.log('\nProbability Calibration:');
  console.log('Bucket | Count | Accuracy | Avg EV  | ROI      | Home Bets | Away Bets | Strategy');
  console.log(
    '-------+-------+----------+---------+----------+-----------+-----------+-----------',
  );
  for (const bucket of buckets) {
    // Determine strategy based on home/away split
    let strategy = '';
    if (bucket.home_bet_percentage > 0.7) {
      strategy = 'Home Focus';
    } else if (bucket.away_bet_percentage > 0.7) {
      strategy = 'Away Focus';
    } else if (Math.abs(bucket.home_bet_percentage - 0.5) < 0.1) {
      strategy = 'Balanced';
    } else {
      strategy = 'Mixed';
    }

    console.log(
      `${bucket.bucket.padEnd(6)} | ${bucket.count.toString().padStart(5)} | ` +
      `${(bucket.accuracy * 100).toFixed(1).padStart(7)}% | ` +
      `${(bucket.avg_ev * 100).toFixed(2).padStart(6)}% | ` +
      `${(bucket.roi * 100).toFixed(1).padStart(7)}% | ` +
      `${bucket.home_bet_count.toString().padStart(9)} | ` +
      `${bucket.away_bet_count.toString().padStart(9)} | ` +
      `${strategy.padEnd(9)}`,
    );
  }

  // Save historical data for this sport
  console.log('\n[HISTORICAL] Saving historical ROI data...');
  const historicalBucketsForSave =
    config.market === 'spread' ? generateEdgeBuckets(recommendations) : buckets;

  const calibrationBuckets = historicalBucketsForSave.map((bucket) => ({
    bucket: bucket.bucket,
    count: bucket.count,
    accuracy: bucket.accuracy, // Keep as decimal (0.556 = 55.6%)
    avgEV: bucket.avg_ev, // Keep as decimal
    roi: bucket.roi, // Keep as decimal (0.0556 = 5.56% ROI)
  }));

  saveHistoricalData(
    options.sport,
    calibrationBuckets,
    trainingResult.metrics.testAccuracy, // Keep as decimal
    bestResult.roi, // Keep as decimal
    bestResult.total_bets,
    config.market,
  );

  // Clear cache so new data is loaded on next access
  clearHistoricalDataCache();

  // Step 7: Save model
  console.log('\n[7/7] Saving model...');
  const modelsDir = path.join(process.cwd(), `src/train/${sportCategory}/${options.sport}/models`);
  const modelFilename = generateModelFilename(config.sport, config.market);
  const modelPath = path.join(modelsDir, modelFilename);

  saveModel(trainingResult, config, featureMeans, optimalThresholds, backtestMetrics, modelPath);

  // Feature Importance Analysis
  console.log('\n🔍 Feature Importance Analysis:');
  const coeffImportance = calculateCoefficientImportance(
    trainingResult,
    trainingResult.featureKeys,
  );

  console.log('\n📊 Top 20 Most Important Features (Coefficient-based):');
  coeffImportance.slice(0, 20).forEach((item, i) => {
    const direction = item.coefficient >= 0 ? '📈' : '📉';
    console.log(
      `${(i + 1).toString().padStart(2)}. ${item.feature.padEnd(25)} | ${item.importance.toFixed(4)} | ${direction}`,
    );
  });

  console.log('\n🗑️  Bottom 10 Least Important Features:');
  coeffImportance.slice(-10).forEach((item, i) => {
    const rank = coeffImportance.length - 10 + i + 1;
    console.log(
      `${rank.toString().padStart(3)}. ${item.feature.padEnd(25)} | ${item.importance.toFixed(4)}`,
    );
  });

  // Recommendations
  const uselessFeatures = coeffImportance.filter((item) => item.importance < 0.001);
  const lowImportanceFeatures = coeffImportance.filter((item) => item.importance < 0.01);

  console.log(`\n💡 Recommendations:`);
  console.log(
    `  - ${uselessFeatures.length} features have importance < 0.001 (consider disabling)`,
  );
  console.log(`  - ${lowImportanceFeatures.length} features have importance < 0.01 (review these)`);
  console.log(
    `  - Top feature: ${coeffImportance[0].feature} (${coeffImportance[0].importance.toFixed(4)})`,
  );

  console.log(`\n🗑️ Features to Consider Disabling (< 0.001 importance):`);
  uselessFeatures.forEach((item, i) => {
    console.log(
      `${(i + 1).toString().padStart(3)}. ${item.feature.padEnd(30)} | ${item.importance.toFixed(6)}`,
    );
  });

  console.log(`\n⚠️  Features to Review (< 0.01 importance):`);
  lowImportanceFeatures.forEach((item, i) => {
    console.log(
      `${(i + 1).toString().padStart(3)}. ${item.feature.padEnd(30)} | ${item.importance.toFixed(6)}`,
    );
  });

  // Save run metadata to database
  const runId = `${config.sport}_${config.market}_${Date.now()}`;
  db.saveModelRun(
    runId,
    config.sport,
    config.seasons[config.seasons.length - 1],
    JSON.stringify(config),
    JSON.stringify(backtestMetrics),
    modelPath,
  );

  // Close database connection
  db.close();

  console.log('\n✅ Training complete!\n');
  console.log('Model Summary:');
  console.log(`  Type: ${trainingResult.modelType}`);
  console.log(`  Test Accuracy: ${(trainingResult.metrics.testAccuracy * 100).toFixed(2)}%`);
  console.log(`  Log Loss: ${trainingResult.metrics.logLoss.toFixed(4)}`);
  console.log(`  Expected ROI: ${(backtestMetrics.roi * 100).toFixed(2)}%`);
  console.log(`  Win Rate: ${(backtestMetrics.winRate * 100).toFixed(2)}%`);
  console.log(`  Optimal Thresholds:`);
  console.log(`    Min Edge: ${(optimalThresholds.min_edge * 100).toFixed(1)}%`);
  console.log(`    Min EV: ${(optimalThresholds.min_ev * 100).toFixed(1)}%`);
  console.log(`\nModel saved to: ${modelPath}`);
  console.log('\nRun "sportline recommend" to get betting recommendations!\n');
}

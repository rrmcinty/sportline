// Platt scaling: fit logistic regression to map raw scores to calibrated probabilities
function fitPlattScaling(preds: number[], labels: number[]): { a: number, b: number } {
  // Use Newton's method for logistic regression with no regularization
  let a = 0, b = 0, lr = 0.01;
  for (let iter = 0; iter < 200; iter++) {
    let da = 0, db = 0;
    for (let i = 0; i < preds.length; i++) {
      const x = preds[i];
      const y = labels[i];
      const p = 1 / (1 + Math.exp(-(a * x + b)));
      da += (p - y) * x;
      db += (p - y);
    }
    a -= lr * da / preds.length;
    b -= lr * db / preds.length;
  }
  return { a, b };
}

// Reliability diagram: bin predictions and compute average predicted/actual for each bin
function computeReliabilityDiagram(preds: number[], labels: number[], numBins = 10) {
  const bins = [];
  for (let i = 0; i < numBins; i++) {
    bins.push({
      binStart: i / numBins,
      binEnd: (i + 1) / numBins,
      predicted: 0,
      actual: 0,
      count: 0
    });
  }
  for (let i = 0; i < preds.length; i++) {
    const p = preds[i];
    const y = labels[i];
    const binIdx = Math.min(Math.floor(p * numBins), numBins - 1);
    bins[binIdx].predicted += p;
    bins[binIdx].actual += y;
    bins[binIdx].count++;
  }
  for (const bin of bins) {
    if (bin.count > 0) {
      bin.predicted /= bin.count;
      bin.actual /= bin.count;
    }
  }
  return bins;
}
/**
 * Model training command handlers
 */

import chalk from "chalk";
import type { Sport } from "../models/types.js";
import { getDb } from "../db/index.js";
import { computeFeatures, type GameFeatures } from "./features.js";
import { fitIsotonicCalibration, type CalibrationCurve } from "./calibration.js";
import { getOptimalSeasons, getOptimalConfig, shouldAvoidMarket } from "./optimal-config.js";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

/**
 * Simple logistic regression (gradient descent with L2 regularization)
 */
function trainLogisticRegression(
  features: number[][],
  labels: number[],
  learningRate: number = 0.01,
  iterations: number = 1000,
  lambda: number = 0.5,
  sampleWeights?: number[]
): number[] {
  const numFeatures = features[0].length;
  const weights = new Array(numFeatures).fill(0);
  const n = features.length;
  const useWeights = Array.isArray(sampleWeights) && sampleWeights.length === n;
  const weightSum = useWeights ? (sampleWeights as number[]).reduce((a, b) => a + b, 0) : n;

  for (let iter = 0; iter < iterations; iter++) {
    // Compute gradient
    const gradient = new Array(numFeatures).fill(0);

    for (let i = 0; i < n; i++) {
      const x = features[i];
      const y = labels[i];
      const prediction = sigmoid(dot(x, weights));
      const error = prediction - y;
      const w = useWeights ? (sampleWeights as number[])[i] : 1;

      for (let j = 0; j < numFeatures; j++) {
        gradient[j] += w * error * x[j];
      }
    }

    // Update weights with L2 regularization penalty
    for (let j = 0; j < numFeatures; j++) {
      weights[j] -= (learningRate / weightSum) * (gradient[j] + lambda * weights[j]);
    }
  }

  return weights;
}

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

function dot(a: number[], b: number[]): number {
  return a.reduce((sum, val, i) => sum + val * b[i], 0);
}

/**
 * Compute exponential-decay recency weights based on sample dates.
 * More recent dates receive higher weight. Half-life controls decay speed.
 */
function computeRecencyWeights(dates: string[], halfLifeDays: number = 120): number[] {
  if (!dates.length) return [];
  const msPerDay = 24 * 60 * 60 * 1000;
  const times = dates.map(d => new Date(d).getTime());
  const maxT = Math.max(...times);
  const hlMs = halfLifeDays * msPerDay;
  const ln2 = Math.log(2);
  const weights = times.map(t => Math.exp(-ln2 * (maxT - t) / hlMs));
  return weights;
}

/**
 * Train predictive model for a sport/season
 * Automatically uses optimal season configuration per market unless overridden
 */
export async function cmdModelTrain(
  sport: Sport,
  seasons: number[] | null,
  markets: string[],
  calibrate: string
): Promise<void> {
  try {
    const db = getDb();

    // Train models for each requested market
    for (const market of markets) {
      // Use optimal seasons for this sport/market if not specified
      const useSeasons = seasons || getOptimalSeasons(sport, market);
      
      // Check if this market should be avoided
      if (shouldAvoidMarket(sport, market)) {
        const config = getOptimalConfig(sport, market);
        console.log(chalk.yellow(`\n⚠️  WARNING: ${sport.toUpperCase()} ${market} is unprofitable (${config?.expectedROI.toFixed(2)}% ROI)`));
        console.log(chalk.yellow(`   Training anyway, but this market is NOT recommended for production use.\n`));
      }

      const optimalConfig = getOptimalConfig(sport, market);
      const seasonsStr = useSeasons.length === 1 ? `season ${useSeasons[0]}` : `seasons ${useSeasons.join(", ")}`;
      
      console.log(chalk.bold.cyan(`\n🤖 Training ${sport.toUpperCase()} ${market.toUpperCase()} for ${seasonsStr}...`));
      
      if (optimalConfig && (!seasons || seasons.length === 0)) {
        console.log(chalk.dim(`   Using optimal config: ${optimalConfig.reason}`));
        console.log(chalk.dim(`   Expected: ${optimalConfig.expectedROI >= 0 ? '+' : ''}${optimalConfig.expectedROI.toFixed(2)}% ROI, ${optimalConfig.expectedECE.toFixed(2)}% ECE`));
      }
      
      console.log(chalk.gray(`   Calibration: ${calibrate}\n`));

      // Compute features for all games
      console.log(chalk.dim("Computing features..."));
      const gameFeatures = computeFeatures(db, sport, useSeasons);
      console.log(chalk.dim(`Features computed for ${gameFeatures.length} games\n`));

      if (market === 'moneyline') {
        await trainMoneylineModel(db, sport, useSeasons, gameFeatures, calibrate);
      } else if (market === 'spread') {
        await trainSpreadModel(db, sport, useSeasons, gameFeatures, calibrate);
      } else if (market === 'total') {
        await trainTotalClassificationModel(db, sport, useSeasons, gameFeatures);
      }
    }
  } catch (error) {
    console.error(chalk.red("Error training model:"), error);
    process.exit(1);
  }
}

/**
 * Train moneyline ensemble: base model (no market feature) + market-aware model blended 70/30
 */
async function trainMoneylineModel(
  db: any,
  sport: Sport,
  seasons: number[],
  gameFeatures: any[],
  calibrate: string
): Promise<void> {
  console.log(chalk.bold.blue(`\n📊 Training MONEYLINE ENSEMBLE (base + market-aware)...\n`));

  // Load outcomes (home team wins)
  const seasonPlaceholders = seasons.map(() => '?').join(',');
  const gamesWithOutcomes = db.prepare(`
    SELECT id, home_score, away_score
    FROM games
    WHERE sport = ? AND season IN (${seasonPlaceholders}) AND home_score IS NOT NULL AND away_score IS NOT NULL
  `).all(sport, ...seasons) as Array<{
      id: number;
      home_score: number;
      away_score: number;
    }>;

    if (gamesWithOutcomes.length === 0) {
      console.log(chalk.yellow("⚠️  No completed games found. Run data ingest with completed games first."));
      return;
    }

    // Build training data with dates for temporal splitting
    const trainingData: { features: number[][]; labels: number[]; dates: string[] } = {
      features: [],
      labels: [],
      dates: []
    };

    const gameOutcomes = new Map(
      gamesWithOutcomes.map(g => [g.id, g.home_score > g.away_score ? 1 : 0])
    );

    // Build both base (9 features) and market-aware (10 features) datasets
    const baseData: { features: number[][]; labels: number[]; dates: string[] } = {
      features: [],
      labels: [],
      dates: []
    };
    const marketAwareData: { features: number[][]; labels: number[]; dates: string[] } = {
      features: [],
      labels: [],
      dates: []
    };

    for (const gf of gameFeatures) {
      const outcome = gameOutcomes.get(gf.gameId);
      if (outcome !== undefined) {
        // Base features (no market) - both 5-game and 10-game windows
        const baseFeat = [
          gf.homeWinRate5,
          gf.awayWinRate5,
          gf.homeAvgMargin5,
          gf.awayAvgMargin5,
          gf.homeAdvantage,
          gf.homeOppWinRate5,
          gf.awayOppWinRate5,
          gf.homeOppAvgMargin5,
          gf.awayOppAvgMargin5,
          gf.homeWinRate10,
          gf.awayWinRate10,
          gf.homeAvgMargin10,
          gf.awayAvgMargin10,
          gf.homeOppWinRate10,
          gf.awayOppWinRate10,
          gf.homeOppAvgMargin10,
          gf.awayOppAvgMargin10
        ];
        baseData.features.push(baseFeat);
        baseData.labels.push(outcome);
        baseData.dates.push(gf.date);

        // Market-aware features (with market implied prob)
        const marketFeat = [...baseFeat, gf.marketImpliedProb];
        marketAwareData.features.push(marketFeat);
        marketAwareData.labels.push(outcome);
        marketAwareData.dates.push(gf.date);

        // Legacy trainingData for backward compat
        trainingData.features.push(marketFeat);
        trainingData.labels.push(outcome);
        trainingData.dates.push(gf.date);
      }
    }

    console.log(chalk.dim(`Training on ${trainingData.features.length} completed games\n`));

    if (trainingData.features.length < 10) {
      console.log(chalk.yellow("⚠️  Not enough completed games (<10). Model training skipped."));
      return;
    }

    // Temporal split for both datasets
    const sortedIndices = baseData.dates
      .map((date, idx) => ({ date, idx }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(x => x.idx);

    const splitIdx = Math.floor(sortedIndices.length * 0.7);
    const trainIndices = sortedIndices.slice(0, splitIdx);
    const valIndices = sortedIndices.slice(splitIdx);

    const splitDate = baseData.dates[sortedIndices[splitIdx]];
    console.log(chalk.dim(`Temporal split at ${splitDate}: ${trainIndices.length} train, ${valIndices.length} validation\n`));

    // Train BASE model (9 features, no market)
    console.log(chalk.dim("Training BASE model (no market feature)..."));
    const baseTrain = trainIndices.map(i => baseData.features[i]);
    const baseTrainLabels = trainIndices.map(i => baseData.labels[i]);
    const baseVal = valIndices.map(i => baseData.features[i]);
    const baseValLabels = valIndices.map(i => baseData.labels[i]);
    const baseWeights = trainLogisticRegression(baseTrain, baseTrainLabels, 0.01, 1000, 0.5);
    
    // Train MARKET-AWARE model (10 features, with market)
    console.log(chalk.dim("Training MARKET-AWARE model (with market feature)..."));
    const marketTrain = trainIndices.map(i => marketAwareData.features[i]);
    const marketTrainLabels = trainIndices.map(i => marketAwareData.labels[i]);
    const marketVal = valIndices.map(i => marketAwareData.features[i]);
    const marketValLabels = valIndices.map(i => marketAwareData.labels[i]);
    const marketWeights = trainLogisticRegression(marketTrain, marketTrainLabels, 0.01, 1000, 0.5);

    // Compute ensemble predictions (70% base, 30% market-aware)
    const ensembleWeight = { base: 0.7, market: 0.3 };
    const valPredictionsBase = baseVal.map(f => sigmoid(dot(f, baseWeights)));
    const valPredictionsMarket = marketVal.map(f => sigmoid(dot(f, marketWeights)));
    const valPredictionsEnsemble = valPredictionsBase.map((pb, i) => 
      ensembleWeight.base * pb + ensembleWeight.market * valPredictionsMarket[i]
    );

    // Compute metrics for each variant
    function computeMetrics(predictions: number[], labels: number[], name: string) {
      let correct = 0;
      let brierSum = 0;
      let logLossSum = 0;
      for (let i = 0; i < predictions.length; i++) {
        const p = Math.max(0.001, Math.min(0.999, predictions[i]));
        const predicted = p > 0.5 ? 1 : 0;
        if (predicted === labels[i]) correct++;
        const error = p - labels[i];
        brierSum += error * error;
        logLossSum += labels[i] === 1 ? -Math.log(p) : -Math.log(1 - p);
      }
      const accuracy = (correct / predictions.length) * 100;
      const brierScore = brierSum / predictions.length;
      const logLoss = logLossSum / predictions.length;
      console.log(chalk.cyan(`  ${name}: Acc ${accuracy.toFixed(1)}%, Brier ${brierScore.toFixed(4)}, LogLoss ${logLoss.toFixed(4)}`));
      return { accuracy, brierScore, logLoss };
    }

    console.log(chalk.green(`\\nValidation Metrics:`));
    const baseMetrics = computeMetrics(valPredictionsBase, baseValLabels, 'Base');
    const marketMetrics = computeMetrics(valPredictionsMarket, marketValLabels, 'Market-Aware');
    const ensembleMetrics = computeMetrics(valPredictionsEnsemble, baseValLabels, 'Ensemble (70/30)');

    const valAccuracy = ensembleMetrics.accuracy;
    const brierScore = ensembleMetrics.brierScore;
    const logLoss = ensembleMetrics.logLoss;

    // Calibration curve: bin ensemble predictions and compute actual win rate
    const bins = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
    const calibrationData: Array<{ binStart: number; binEnd: number; predictedProb: number; actualWinRate: number; count: number }> = [];
    
    for (let b = 0; b < bins.length - 1; b++) {
      const binStart = bins[b];
      const binEnd = bins[b + 1];
      const binSamples: Array<{ pred: number; actual: number }> = [];
      
      for (let i = 0; i < valPredictionsEnsemble.length; i++) {
        if (valPredictionsEnsemble[i] >= binStart && valPredictionsEnsemble[i] < binEnd) {
          binSamples.push({ pred: valPredictionsEnsemble[i], actual: baseValLabels[i] });
        }
      }
      
      if (binSamples.length > 0) {
        const avgPred = binSamples.reduce((sum, s) => sum + s.pred, 0) / binSamples.length;
        const actualWins = binSamples.filter(s => s.actual === 1).length;
        const actualWinRate = actualWins / binSamples.length;
        
        calibrationData.push({
          binStart,
          binEnd,
          predictedProb: avgPred,
          actualWinRate,
          count: binSamples.length
        });
      }
    }

    console.log(chalk.green(`Validation accuracy: ${valAccuracy.toFixed(1)}%`));
    console.log(chalk.cyan(`Brier score: ${brierScore.toFixed(4)} (lower is better, 0.25 = random)`));
    console.log(chalk.cyan(`Log loss: ${logLoss.toFixed(4)} (lower is better)\n`));

    // Save ensemble model artifacts
    const seasonsStr = seasons.join('-');
    const runId = `${sport}_ensemble_${seasonsStr}_${Date.now()}`;
    const artifactsPath = join(process.cwd(), "models", sport, runId);
    mkdirSync(artifactsPath, { recursive: true });


    // Save base model
    const baseModel = {
      type: 'base',
      weights: baseWeights,
      featureNames: ["homeWinRate5", "awayWinRate5", "homeAvgMargin5", "awayAvgMargin5", "homeAdvantage", "homeOppWinRate5", "awayOppWinRate5", "homeOppAvgMargin5", "awayOppAvgMargin5", "homeWinRate10", "awayWinRate10", "homeAvgMargin10", "awayAvgMargin10", "homeOppWinRate10", "awayOppWinRate10", "homeOppAvgMargin10", "awayOppAvgMargin10"],
      sport,
      seasons,
      trainedAt: new Date().toISOString()
    };
    writeFileSync(join(artifactsPath, "base_model.json"), JSON.stringify(baseModel, null, 2));

    // Save market-aware model
    const marketModel = {
      type: 'market-aware',
      weights: marketWeights,
      featureNames: ["homeWinRate5", "awayWinRate5", "homeAvgMargin5", "awayAvgMargin5", "homeAdvantage", "homeOppWinRate5", "awayOppWinRate5", "homeOppAvgMargin5", "awayOppAvgMargin5", "homeWinRate10", "awayWinRate10", "homeAvgMargin10", "awayAvgMargin10", "homeOppWinRate10", "awayOppWinRate10", "homeOppAvgMargin10", "awayOppAvgMargin10", "marketImpliedProb"],
      sport,
      seasons,
      trainedAt: new Date().toISOString()
    };
    writeFileSync(join(artifactsPath, "market_model.json"), JSON.stringify(marketModel, null, 2));

    // Save ensemble config
    const ensembleConfig = {
      type: 'ensemble',
      baseWeight: ensembleWeight.base,
      marketWeight: ensembleWeight.market,
      sport,
      seasons,
      trainedAt: new Date().toISOString()
    };
    writeFileSync(join(artifactsPath, "ensemble.json"), JSON.stringify(ensembleConfig, null, 2));

    // Compute means/stds for normalization (market-aware features)
    const marketFeatureNames = [
      "homeWinRate5", "awayWinRate5", "homeAvgMargin5", "awayAvgMargin5", "homeAdvantage",
      "homeOppWinRate5", "awayOppWinRate5", "homeOppAvgMargin5", "awayOppAvgMargin5",
      "homeWinRate10", "awayWinRate10", "homeAvgMargin10", "awayAvgMargin10",
      "homeOppWinRate10", "awayOppWinRate10", "homeOppAvgMargin10", "awayOppAvgMargin10",
      "marketImpliedProb"
    ];
    const marketTrainFeatures = trainIndices.map(i => marketAwareData.features[i]);
    const means = new Array(marketFeatureNames.length).fill(0);
    const stds = new Array(marketFeatureNames.length).fill(0);
    for (let j = 0; j < means.length; j++) {
      for (let i = 0; i < marketTrainFeatures.length; i++) means[j] += marketTrainFeatures[i][j];
      means[j] /= marketTrainFeatures.length;
      for (let i = 0; i < marketTrainFeatures.length; i++) {
        stds[j] += Math.pow(marketTrainFeatures[i][j] - means[j], 2);
      }
      stds[j] = Math.sqrt(stds[j] / marketTrainFeatures.length) || 1;
    }

    // Fit isotonic calibration on validation set (market-aware model)


    // Calibration: Platt scaling and reliability diagram
    const valProbs = marketVal.map(f => sigmoid(dot(f, marketWeights)));
    const platt = fitPlattScaling(valProbs, marketValLabels);
    const reliability = computeReliabilityDiagram(valProbs, marketValLabels);


    // Unified model.json (for audit/compatibility)
    const unifiedModel = {
      market: 'moneyline',
      predictionType: 'classification',
      modelType: 'single',
      weights: marketWeights,
      means,
      stds,
      featureNames: marketFeatureNames,
      sport,
      seasons,
      trainedAt: new Date().toISOString(),
      calibration: {
        platt,
        reliability
      }
    };
    writeFileSync(join(artifactsPath, "model.json"), JSON.stringify(unifiedModel, null, 2));

    const metrics = {
      baseMetrics,
      marketMetrics,
      ensembleMetrics,
      validationAccuracy: valAccuracy,
      brierScore,
      logLoss,
      numTrainingSamples: trainIndices.length,
      numValidationSamples: valIndices.length,
      splitDate
    };

    writeFileSync(join(artifactsPath, "metrics.json"), JSON.stringify(metrics, null, 2));

    // Record run in database
    db.prepare(`
      INSERT INTO model_runs (run_id, sport, season, config_json, started_at, finished_at, metrics_json, artifacts_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      runId,
      sport,
      seasonsStr,
      JSON.stringify({ market: 'moneyline', type: 'ensemble', baseWeight: ensembleWeight.base, marketWeight: ensembleWeight.market }),
      new Date().toISOString(),
      new Date().toISOString(),
      JSON.stringify(metrics),
      artifactsPath
    );

    console.log(chalk.green.bold(`✅ Moneyline ensemble trained and saved to ${artifactsPath}\n`));
}

/**
 * Train spread (cover) model
 */
async function trainSpreadModel(
  db: any,
  sport: Sport,
  seasons: number[],
  gameFeatures: any[],
  calibrate: string
): Promise<void> {
  console.log(chalk.bold.blue(`\n📊 Training SPREAD model...\n`));

  // Load games with scores and spread lines
  const seasonPlaceholders = seasons.map(() => '?').join(',');
  const gamesWithSpreads = db.prepare(`
    SELECT g.id, g.home_score, g.away_score, o.line
    FROM games g
    JOIN odds o ON g.id = o.game_id
    WHERE g.sport = ? AND g.season IN (${seasonPlaceholders})
      AND g.home_score IS NOT NULL AND g.away_score IS NOT NULL
      AND o.market = 'spread'
      AND o.line IS NOT NULL
  `).all(sport, ...seasons) as Array<{
    id: number;
    home_score: number;
    away_score: number;
    line: number;
  }>;

  if (gamesWithSpreads.length === 0) {
    console.log(chalk.yellow("⚠️  No completed games with spread lines found.\n"));
    return;
  }

  // Build training data with dates for temporal splitting
  const trainingData: { features: number[][]; labels: number[]; dates: string[] } = {
    features: [],
    labels: [],
    dates: []
  };

  // Compute spread outcomes: did home team cover? (home_score + spread > away_score)
  const spreadOutcomes = new Map<number, number>();
  for (const game of gamesWithSpreads) {
    const covered = (game.home_score + game.line) > game.away_score ? 1 : 0;
    spreadOutcomes.set(game.id, covered);
  }

  for (const gf of gameFeatures) {
    const outcome = spreadOutcomes.get(gf.gameId);
    // Skip games without spread data
    if (outcome !== undefined && gf.spreadLine !== null && gf.spreadMarketImpliedProb !== null) {
      trainingData.features.push([
        gf.homeWinRate5,
        gf.awayWinRate5,
        gf.homeAvgMargin5,
        gf.awayAvgMargin5,
        gf.homeAdvantage,
        gf.homeOppWinRate5,
        gf.awayOppWinRate5,
        gf.homeOppAvgMargin5,
        gf.awayOppAvgMargin5,
        gf.homeWinRate10,
        gf.awayWinRate10,
        gf.homeAvgMargin10,
        gf.awayAvgMargin10,
        gf.homeOppWinRate10,
        gf.awayOppWinRate10,
        gf.homeOppAvgMargin10,
        gf.awayOppAvgMargin10,
        gf.spreadLine,  // Spread line as feature
        gf.spreadMarketImpliedProb  // Market probability for spread
      ]);
      trainingData.labels.push(outcome);
      trainingData.dates.push(gf.date);
    }
  }

  console.log(chalk.dim(`Training on ${trainingData.features.length} completed games with spreads\n`));

  if (trainingData.features.length < 10) {
    console.log(chalk.yellow("⚠️  Not enough completed games with spreads (<10). Model training skipped.\n"));
    return;
  }

  // Temporal split
  const sortedIndices = trainingData.dates
    .map((date, idx) => ({ date, idx }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(x => x.idx);

  const splitIdx = Math.floor(sortedIndices.length * 0.7);
  const trainIndices = sortedIndices.slice(0, splitIdx);
  const valIndices = sortedIndices.slice(splitIdx);

  const trainFeatures = trainIndices.map(i => trainingData.features[i]);
  const trainLabels = trainIndices.map(i => trainingData.labels[i]);
  const valFeatures = valIndices.map(i => trainingData.features[i]);
  const valLabels = valIndices.map(i => trainingData.labels[i]);

  const valDates = valIndices.map(i => trainingData.dates[i]);
  const splitDate = valDates[0];

  console.log(chalk.dim(`Temporal split at ${splitDate}: ${trainFeatures.length} train, ${valFeatures.length} validation\n`));

  // Train logistic regression
  console.log(chalk.dim("Training logistic regression..."));
  const weights = trainLogisticRegression(trainFeatures, trainLabels, 0.01, 1000, 0.5);

  // Compute training accuracy
  let trainCorrect = 0;
  for (let i = 0; i < trainFeatures.length; i++) {
    const prediction = sigmoid(dot(trainFeatures[i], weights));
    const predicted = prediction > 0.5 ? 1 : 0;
    if (predicted === trainLabels[i]) trainCorrect++;
  }
  const trainAccuracy = (trainCorrect / trainFeatures.length) * 100;

  console.log(chalk.green(`Training accuracy: ${trainAccuracy.toFixed(1)}%`));

  // Compute validation metrics
  const valPredictions = valFeatures.map(f => sigmoid(dot(f, weights)));
  
  let valCorrect = 0;
  for (let i = 0; i < valFeatures.length; i++) {
    const predicted = valPredictions[i] > 0.5 ? 1 : 0;
    if (predicted === valLabels[i]) valCorrect++;
  }
  const valAccuracy = (valCorrect / valFeatures.length) * 100;

  let brierSum = 0;
  for (let i = 0; i < valFeatures.length; i++) {
    const error = valPredictions[i] - valLabels[i];
    brierSum += error * error;
  }
  const brierScore = brierSum / valFeatures.length;

  let logLossSum = 0;
  for (let i = 0; i < valFeatures.length; i++) {
    const p = Math.max(0.001, Math.min(0.999, valPredictions[i]));
    logLossSum += valLabels[i] === 1 ? -Math.log(p) : -Math.log(1 - p);
  }
  const logLoss = logLossSum / valFeatures.length;

  // Calibration curve
  const bins = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
  const calibrationData: Array<{ binStart: number; binEnd: number; predictedProb: number; actualWinRate: number; count: number }> = [];
  
  for (let b = 0; b < bins.length - 1; b++) {
    const binStart = bins[b];
    const binEnd = bins[b + 1];
    const binSamples: Array<{ pred: number; actual: number }> = [];
    
    for (let i = 0; i < valPredictions.length; i++) {
      if (valPredictions[i] >= binStart && valPredictions[i] < binEnd) {
        binSamples.push({ pred: valPredictions[i], actual: valLabels[i] });
      }
    }
    
    if (binSamples.length > 0) {
      const avgPred = binSamples.reduce((sum, s) => sum + s.pred, 0) / binSamples.length;
      const actualWins = binSamples.filter(s => s.actual === 1).length;
      const actualWinRate = actualWins / binSamples.length;
      
      calibrationData.push({
        binStart,
        binEnd,
        predictedProb: avgPred,
        actualWinRate,
        count: binSamples.length
      });
    }
  }

  console.log(chalk.green(`Validation accuracy: ${valAccuracy.toFixed(1)}%`));
  console.log(chalk.cyan(`Brier score: ${brierScore.toFixed(4)} (lower is better, 0.25 = random)`));
  console.log(chalk.cyan(`Log loss: ${logLoss.toFixed(4)} (lower is better)\n`));

  // Fit calibration (skip for now)
  let calibrationCurve: CalibrationCurve | null = null;
  if (calibrate === "isotonic" && valFeatures.length >= 400) {
    console.log(chalk.dim("Fitting isotonic calibration on validation set..."));
    calibrationCurve = fitIsotonicCalibration(valPredictions, valLabels);
    console.log(chalk.green(`Calibration fitted with ${calibrationCurve.x.length} points\n`));
  } else {
    console.log(chalk.yellow(`⚠️  Skipping calibration (need ≥400 validation samples for stable isotonic regression, have ${valFeatures.length})\n`));
  }

  // Save model artifacts
  const seasonsStr = seasons.join('-');
  const runId = `${sport}_spread_${seasonsStr}_${Date.now()}`;
  const artifactsPath = join(process.cwd(), "models", sport, runId);
  mkdirSync(artifactsPath, { recursive: true });


  // Compute means/stds for normalization
  const means = new Array(trainFeatures[0].length).fill(0);
  const stds = new Array(trainFeatures[0].length).fill(0);
  for (let j = 0; j < means.length; j++) {
    for (let i = 0; i < trainFeatures.length; i++) means[j] += trainFeatures[i][j];
    means[j] /= trainFeatures.length;
    for (let i = 0; i < trainFeatures.length; i++) {
      stds[j] += Math.pow(trainFeatures[i][j] - means[j], 2);
    }
    stds[j] = Math.sqrt(stds[j] / trainFeatures.length) || 1;
  }

  // Fit isotonic calibration on validation set
  // Calibration: Platt scaling and reliability diagram
  const valProbs = valFeatures.map(f => sigmoid(dot(f, weights)));
  const platt = fitPlattScaling(valProbs, valLabels);
  const reliability = computeReliabilityDiagram(valProbs, valLabels);

  // Unified model.json (for audit/compatibility)
  const unifiedModel = {
    market: 'spread',
    predictionType: 'classification',
    modelType: 'single',
    weights,
    means,
    stds,
    featureNames: ["homeWinRate5", "awayWinRate5", "homeAvgMargin5", "awayAvgMargin5", "homeAdvantage", "homeOppWinRate5", "awayOppWinRate5", "homeOppAvgMargin5", "awayOppAvgMargin5", "homeWinRate10", "awayWinRate10", "homeAvgMargin10", "awayAvgMargin10", "homeOppWinRate10", "awayOppWinRate10", "homeOppAvgMargin10", "awayOppAvgMargin10", "spreadLine", "spreadMarketImpliedProb"],
    sport,
    seasons,
    trainedAt: new Date().toISOString(),
    calibration: {
      platt,
      reliability
    }
  };
  writeFileSync(join(artifactsPath, "model.json"), JSON.stringify(unifiedModel, null, 2));

  const metrics = {
    market: 'spread',
    trainingAccuracy: trainAccuracy,
    validationAccuracy: valAccuracy,
    brierScore,
    logLoss,
    numTrainingSamples: trainFeatures.length,
    numValidationSamples: valFeatures.length,
    splitDate,
    calibrationData,
    calibrated: calibrationCurve !== null
  };

  writeFileSync(join(artifactsPath, "metrics.json"), JSON.stringify(metrics, null, 2));

  // Record run in database
  db.prepare(`
    INSERT INTO model_runs (run_id, sport, season, config_json, started_at, finished_at, metrics_json, artifacts_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    runId,
    sport,
    seasonsStr,
    JSON.stringify({ market: 'spread', calibrate }),
    new Date().toISOString(),
    new Date().toISOString(),
    JSON.stringify(metrics),
    artifactsPath
  );

  console.log(chalk.green.bold(`✅ Spread model trained and saved to ${artifactsPath}\n`));
}

/**
 * Train total (over/under) model: predicts probability game goes OVER closing total line
 */
/**
 * Train total model using logistic regression to predict Over/Under directly (classification)
 * Similar to spread model approach - predict binary outcome with line and market as features
 */
/**
 * Train total ensemble: base model (no market feature) + market-aware model blended 70/30
 * Uses classification approach (predicting Over/Under directly) instead of regression
 */
async function trainTotalClassificationModel(
  db: any,
  sport: Sport,
  seasons: number[],
  gameFeatures: any[]
): Promise<void> {
  console.log(chalk.bold.blue(`\n📊 Training TOTAL (classification) ensemble model...\n`));

  const seasonPlaceholders = seasons.map(() => '?').join(',');
  const gamesWithTotals = db.prepare(`
    SELECT g.id, g.home_score, g.away_score, o.line
    FROM games g
    JOIN odds o ON g.id = o.game_id
    WHERE g.sport = ? AND g.season IN (${seasonPlaceholders})
      AND g.home_score IS NOT NULL AND g.away_score IS NOT NULL
      AND o.market = 'total'
      AND o.line IS NOT NULL
      AND o.provider NOT LIKE '%Live Odds%'
  `).all(sport, ...seasons) as Array<{ id:number; home_score:number; away_score:number; line:number }>;

  if (!gamesWithTotals.length) {
    console.log(chalk.yellow('⚠️  No completed games with total lines found.'));
    return;
  }

  // Map id -> total line and outcome
  const totalLineMap = new Map(gamesWithTotals.map(g => [g.id, g.line]));
  const combinedScoreMap = new Map(gamesWithTotals.map(g => [g.id, g.home_score + g.away_score]));

  // Prepare base features (37 features: 36 base stats + line)
  const baseData: { features: number[]; label: number; date: string }[] = [];
  
  // Prepare market-aware features (38 features: 36 base stats + line + totalMarketImpliedProb)
  const marketData: { features: number[]; label: number; date: string }[] = [];
  
  for (const gf of gameFeatures) {
    const line = totalLineMap.get(gf.gameId);
    const combined = combinedScoreMap.get(gf.gameId);
    if (line !== undefined && combined !== undefined) {
      // Binary classification target: 1 = Over, 0 = Under
      const overLabel = combined > line ? 1 : 0;
      
      // Base features (no market info)
      const baseFeat = [
        gf.homePointsAvg5, gf.awayPointsAvg5, gf.homeOppPointsAvg5, gf.awayOppPointsAvg5,
        gf.homeWinRate5, gf.awayWinRate5, gf.homeAvgMargin5, gf.awayAvgMargin5,
        gf.homeOppAvgMargin5, gf.awayOppAvgMargin5, gf.homeOppWinRate5, gf.awayOppWinRate5,
        gf.homePace5, gf.awayPace5, gf.homeOffEff5, gf.awayOffEff5, gf.homeDefEff5, gf.awayDefEff5,
        gf.homePointsAvg10, gf.awayPointsAvg10, gf.homeOppPointsAvg10, gf.awayOppPointsAvg10,
        gf.homeWinRate10, gf.awayWinRate10, gf.homeAvgMargin10, gf.awayAvgMargin10,
        gf.homeOppAvgMargin10, gf.awayOppAvgMargin10, gf.homeOppWinRate10, gf.awayOppWinRate10,
        gf.homePace10, gf.awayPace10, gf.homeOffEff10, gf.awayOffEff10,
        gf.homeDefEff10, gf.awayDefEff10,
        line  // 37th feature
      ];
      baseData.push({ features: baseFeat, label: overLabel, date: gf.date });
      
      // Market-aware features (adds totalMarketImpliedProb)
      if (gf.totalMarketImpliedProb !== null) {
        const marketFeat = [...baseFeat, gf.totalMarketImpliedProb];  // 38th feature
        marketData.push({ features: marketFeat, label: overLabel, date: gf.date });
      }
    }
  }

  console.log(chalk.dim(`Base model: ${baseData.length} games`));
  console.log(chalk.dim(`Market-aware model: ${marketData.length} games\n`));

  if (baseData.length < 10 || marketData.length < 10) {
    console.log(chalk.yellow("⚠️  Not enough completed games (<10). Model training skipped."));
    return;
  }

  // ========== TRAIN BASE MODEL (no market feature) ==========
  console.log(chalk.bold("Training base model (no market info)..."));
  
  // Temporal split (70/30)
  const baseSortedIndices = baseData
    .map((d, idx) => ({ date: d.date, idx }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(x => x.idx);
  
  const baseSplitIdx = Math.floor(baseSortedIndices.length * 0.7);
  const baseTrainIndices = baseSortedIndices.slice(0, baseSplitIdx);
  const baseValIndices = baseSortedIndices.slice(baseSplitIdx);
  
  const baseXtrain = baseTrainIndices.map(i => baseData[i].features);
  const baseYtrain = baseTrainIndices.map(i => baseData[i].label);
  const baseXval = baseValIndices.map(i => baseData[i].features);
  const baseYval = baseValIndices.map(i => baseData[i].label);
  
  console.log(chalk.dim(`  Split: ${baseXtrain.length} train, ${baseXval.length} validation`));
  
  // Standardize features
  const baseMeans = new Array(baseXtrain[0].length).fill(0);
  const baseStds = new Array(baseXtrain[0].length).fill(0);
  for (let j = 0; j < baseMeans.length; j++) {
    for (let i = 0; i < baseXtrain.length; i++) baseMeans[j] += baseXtrain[i][j];
    baseMeans[j] /= baseXtrain.length;
    for (let i = 0; i < baseXtrain.length; i++) {
      baseStds[j] += Math.pow(baseXtrain[i][j] - baseMeans[j], 2);
    }
    baseStds[j] = Math.sqrt(baseStds[j] / baseXtrain.length) || 1;
  }
  
  const scaleBase = (row: number[]) => row.map((v, j) => (v - baseMeans[j]) / baseStds[j]);
  const baseXtrainScaled = baseXtrain.map(scaleBase);
  const baseXvalScaled = baseXval.map(scaleBase);
  
  // Train logistic regression with recency weights
  const baseWeights = trainLogisticRegression(baseXtrainScaled, baseYtrain, 0.01, 1000, 0.5);
  
  // Validation metrics
  const baseValPreds = baseXvalScaled.map(x => sigmoid(dot(x, baseWeights)));
  let baseCorrect = 0;
  let baseBrierSum = 0;
  for (let i = 0; i < baseValPreds.length; i++) {
    const p = baseValPreds[i];
    const y = baseYval[i];
    baseBrierSum += Math.pow(p - y, 2);
    if ((p > 0.5 ? 1 : 0) === y) baseCorrect++;
  }
  const baseValAcc = (baseCorrect / baseValPreds.length) * 100;
  const baseValBrier = baseBrierSum / baseValPreds.length;
  console.log(chalk.green(`  Base model validation accuracy: ${baseValAcc.toFixed(1)}%`));
  console.log(chalk.cyan(`  Base model Brier score: ${baseValBrier.toFixed(4)}\n`));

  // ========== TRAIN MARKET-AWARE MODEL ==========
  console.log(chalk.bold("Training market-aware model (with totalMarketImpliedProb)..."));
  
  // Temporal split
  const marketSortedIndices = marketData
    .map((d, idx) => ({ date: d.date, idx }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(x => x.idx);
  
  const marketSplitIdx = Math.floor(marketSortedIndices.length * 0.7);
  const marketTrainIndices = marketSortedIndices.slice(0, marketSplitIdx);
  const marketValIndices = marketSortedIndices.slice(marketSplitIdx);
  
  const marketXtrain = marketTrainIndices.map(i => marketData[i].features);
  const marketYtrain = marketTrainIndices.map(i => marketData[i].label);
  const marketXval = marketValIndices.map(i => marketData[i].features);
  const marketYval = marketValIndices.map(i => marketData[i].label);
  
  console.log(chalk.dim(`  Split: ${marketXtrain.length} train, ${marketXval.length} validation`));
  
  // Standardize features
  const marketMeans = new Array(marketXtrain[0].length).fill(0);
  const marketStds = new Array(marketXtrain[0].length).fill(0);
  for (let j = 0; j < marketMeans.length; j++) {
    for (let i = 0; i < marketXtrain.length; i++) marketMeans[j] += marketXtrain[i][j];
    marketMeans[j] /= marketXtrain.length;
    for (let i = 0; i < marketXtrain.length; i++) {
      marketStds[j] += Math.pow(marketXtrain[i][j] - marketMeans[j], 2);
    }
    marketStds[j] = Math.sqrt(marketStds[j] / marketXtrain.length) || 1;
  }
  
  const scaleMarket = (row: number[]) => row.map((v, j) => (v - marketMeans[j]) / marketStds[j]);
  const marketXtrainScaled = marketXtrain.map(scaleMarket);
  const marketXvalScaled = marketXval.map(scaleMarket);
  
  // Train logistic regression with recency weights
  const marketWeights = trainLogisticRegression(marketXtrainScaled, marketYtrain, 0.01, 1000, 0.5);
  
  // Validation metrics
  const marketValPreds = marketXvalScaled.map(x => sigmoid(dot(x, marketWeights)));
  let marketCorrect = 0;
  let marketBrierSum = 0;
  for (let i = 0; i < marketValPreds.length; i++) {
    const p = marketValPreds[i];
    const y = marketYval[i];
    marketBrierSum += Math.pow(p - y, 2);
    if ((p > 0.5 ? 1 : 0) === y) marketCorrect++;
  }
  const marketValAcc = (marketCorrect / marketValPreds.length) * 100;
  const marketValBrier = marketBrierSum / marketValPreds.length;
  console.log(chalk.green(`  Market-aware validation accuracy: ${marketValAcc.toFixed(1)}%`));
  console.log(chalk.cyan(`  Market-aware Brier score: ${marketValBrier.toFixed(4)}\n`));

  // ========== ENSEMBLE (70% base + 30% market-aware) ==========
  console.log(chalk.bold("Computing ensemble predictions (70% base + 30% market)..."));
  
  // Use market validation set for ensemble (both models can predict on it)
  const ensembleBaseValPreds = marketXval.map(x => {
    const baseFeatures = x.slice(0, 37);  // First 37 features (without market)
    const scaled = scaleBase(baseFeatures);
    return sigmoid(dot(scaled, baseWeights));
  });
  
  const ensembleMarketValPreds = marketXvalScaled.map(x => sigmoid(dot(x, marketWeights)));
  
  const ensembleValPreds = ensembleBaseValPreds.map((base, i) => 
    0.7 * base + 0.3 * ensembleMarketValPreds[i]
  );
  
  let ensembleCorrect = 0;
  let ensembleBrierSum = 0;
  for (let i = 0; i < ensembleValPreds.length; i++) {
    const p = ensembleValPreds[i];
    const y = marketYval[i];
    ensembleBrierSum += Math.pow(p - y, 2);
    if ((p > 0.5 ? 1 : 0) === y) ensembleCorrect++;
  }
  const ensembleValAcc = (ensembleCorrect / ensembleValPreds.length) * 100;
  const ensembleValBrier = ensembleBrierSum / ensembleValPreds.length;
  
  console.log(chalk.green.bold(`  ✓ Ensemble validation accuracy: ${ensembleValAcc.toFixed(1)}%`));
  console.log(chalk.cyan.bold(`  ✓ Ensemble Brier score: ${ensembleValBrier.toFixed(4)}\n`));

  // ========== SAVE MODELS ==========
  const seasonsStr = seasons.join('-');
  const runId = `${sport}_total_classification_${seasonsStr}_${Date.now()}`;
  const artifactsPath = join(process.cwd(), 'models', sport, runId);
  mkdirSync(artifactsPath, { recursive: true });
  
  // Base model
  const baseModel = {
    market: 'total',
    predictionType: 'classification',
    modelType: 'base',
    weights: baseWeights,
    means: baseMeans,
    stds: baseStds,
    featureCount: 37,
    sport,
    seasons,
    trainedAt: new Date().toISOString()
  };
  writeFileSync(join(artifactsPath, 'base_model.json'), JSON.stringify(baseModel, null, 2));

  // Market-aware model
  const marketModel = {
    market: 'total',
    predictionType: 'classification',
    modelType: 'market',
    weights: marketWeights,
    means: marketMeans,
    stds: marketStds,
    featureCount: 38,
    sport,
    seasons,
    trainedAt: new Date().toISOString()
  };
  writeFileSync(join(artifactsPath, 'market_model.json'), JSON.stringify(marketModel, null, 2));

  // Fit isotonic calibration on validation set
  // Calibration: Platt scaling and reliability diagram for market-aware model
  const marketFeatureNames = [
    'homePointsAvg5', 'awayPointsAvg5', 'homeOppPointsAvg5', 'awayOppPointsAvg5',
    'homeWinRate5', 'awayWinRate5', 'homeAvgMargin5', 'awayAvgMargin5',
    'homeOppAvgMargin5', 'awayOppAvgMargin5', 'homeOppWinRate5', 'awayOppWinRate5',
    'homePace5', 'awayPace5', 'homeOffEff5', 'awayOffEff5', 'homeDefEff5', 'awayDefEff5',
    'homePointsAvg10', 'awayPointsAvg10', 'homeOppPointsAvg10', 'awayOppPointsAvg10',
    'homeWinRate10', 'awayWinRate10', 'homeAvgMargin10', 'awayAvgMargin10',
    'homeOppAvgMargin10', 'awayOppAvgMargin10', 'homeOppWinRate10', 'awayOppWinRate10',
    'homePace10', 'awayPace10', 'homeOffEff10', 'awayOffEff10',
    'homeDefEff10', 'awayDefEff10',
    'line', 'totalMarketImpliedProb'
  ];
  const valProbs = marketXvalScaled.map(f => sigmoid(dot(f, marketWeights)));
  const platt = fitPlattScaling(valProbs, marketYval);
  const reliability = computeReliabilityDiagram(valProbs, marketYval);

  // Unified model.json (for audit/compatibility)
  const unifiedModel = {
    market: 'total',
    predictionType: 'classification',
    modelType: 'single',
    weights: marketWeights,
    means: marketMeans,
    stds: marketStds,
    featureNames: marketFeatureNames,
    sport,
    seasons,
    trainedAt: new Date().toISOString(),
    calibration: {
      platt,
      reliability
    }
  };
  writeFileSync(join(artifactsPath, "model.json"), JSON.stringify(unifiedModel, null, 2));

  // Ensemble config
  const ensembleConfig = {
    market: 'total',
    predictionType: 'classification',
    modelType: 'ensemble',
    baseWeight: 0.7,
    marketWeight: 0.3,
    sport,
    seasons,
    trainedAt: new Date().toISOString()
  };
  writeFileSync(join(artifactsPath, 'ensemble.json'), JSON.stringify(ensembleConfig, null, 2));

  // Metrics
  const metrics = {
    market: 'total',
    predictionType: 'classification',
    baseValidationAccuracy: baseValAcc,
    baseBrierScore: baseValBrier,
    marketValidationAccuracy: marketValAcc,
    marketBrierScore: marketValBrier,
    ensembleValidationAccuracy: ensembleValAcc,
    ensembleBrierScore: ensembleValBrier,
    numTrainingSamples: baseXtrain.length,
    numValidationSamples: baseXval.length
  };
  writeFileSync(join(artifactsPath, 'metrics.json'), JSON.stringify(metrics, null, 2));

  // Insert into model_runs
  db.prepare(`INSERT INTO model_runs (run_id, sport, season, config_json, started_at, finished_at, metrics_json, artifacts_path)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      runId,
      sport,
      seasonsStr,
      JSON.stringify({ market: 'total', type: 'classification', ensemble: true }),
      new Date().toISOString(),
      new Date().toISOString(),
      JSON.stringify(metrics),
      artifactsPath
    );

  console.log(chalk.green.bold(`✅ Total classification ensemble trained and saved to ${artifactsPath}\n`));
}

/**
 * Model training command handlers
 */

import chalk from "chalk";
import type { Sport } from "../models/types.js";
import { getDb } from "../db/index.js";
import { computeFeatures, type GameFeatures } from "./features.js";
import { fitIsotonicCalibration, type CalibrationCurve } from "./calibration.js";
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
  lambda: number = 0.5
): number[] {
  const numFeatures = features[0].length;
  const weights = new Array(numFeatures).fill(0);
  const n = features.length;

  for (let iter = 0; iter < iterations; iter++) {
    // Compute gradient
    const gradient = new Array(numFeatures).fill(0);

    for (let i = 0; i < n; i++) {
      const x = features[i];
      const y = labels[i];
      const prediction = sigmoid(dot(x, weights));
      const error = prediction - y;

      for (let j = 0; j < numFeatures; j++) {
        gradient[j] += error * x[j];
      }
    }

    // Update weights with L2 regularization penalty
    for (let j = 0; j < numFeatures; j++) {
      weights[j] -= (learningRate / n) * (gradient[j] + lambda * weights[j]);
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
 * Train predictive model for a sport/season
 */
export async function cmdModelTrain(
  sport: Sport,
  season: number,
  markets: string[],
  calibrate: string
): Promise<void> {
  try {
    console.log(chalk.bold.cyan(`\n🤖 Training ${sport.toUpperCase()} model for season ${season}...\n`));
    console.log(chalk.gray(`Markets: ${markets.join(", ")}`));
    console.log(chalk.gray(`Calibration: ${calibrate}\n`));

    const db = getDb();

    // Compute features for all games
    console.log(chalk.dim("Computing features..."));
    const gameFeatures = computeFeatures(db, sport, season);
    console.log(chalk.dim(`Features computed for ${gameFeatures.length} games\n`));

    // Train models for each requested market
    for (const market of markets) {
      if (market === 'moneyline') {
        await trainMoneylineModel(db, sport, season, gameFeatures, calibrate);
      } else if (market === 'spread') {
        await trainSpreadModel(db, sport, season, gameFeatures, calibrate);
      } else if (market === 'total') {
        await trainTotalRegressionModel(db, sport, season, gameFeatures);
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
  season: number,
  gameFeatures: any[],
  calibrate: string
): Promise<void> {
  console.log(chalk.bold.blue(`\n📊 Training MONEYLINE ENSEMBLE (base + market-aware)...\n`));

  // Load outcomes (home team wins)
  const gamesWithOutcomes = db.prepare(`
    SELECT id, home_score, away_score
    FROM games
    WHERE sport = ? AND season = ? AND home_score IS NOT NULL AND away_score IS NOT NULL
  `).all(sport, season) as Array<{
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
        // Base features (no market)
        const baseFeat = [
          gf.homeWinRate5,
          gf.awayWinRate5,
          gf.homeAvgMargin5,
          gf.awayAvgMargin5,
          gf.homeAdvantage,
          gf.homeOppWinRate5,
          gf.awayOppWinRate5,
          gf.homeOppAvgMargin5,
          gf.awayOppAvgMargin5
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
    const baseWeights = trainLogisticRegression(baseTrain, baseTrainLabels);
    
    // Train MARKET-AWARE model (10 features, with market)
    console.log(chalk.dim("Training MARKET-AWARE model (with market feature)..."));
    const marketTrain = trainIndices.map(i => marketAwareData.features[i]);
    const marketTrainLabels = trainIndices.map(i => marketAwareData.labels[i]);
    const marketVal = valIndices.map(i => marketAwareData.features[i]);
    const marketValLabels = valIndices.map(i => marketAwareData.labels[i]);
    const marketWeights = trainLogisticRegression(marketTrain, marketTrainLabels);

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
    const runId = `${sport}_ensemble_${season}_${Date.now()}`;
    const artifactsPath = join(process.cwd(), "models", sport, runId);
    mkdirSync(artifactsPath, { recursive: true });

    // Save base model
    const baseModel = {
      type: 'base',
      weights: baseWeights,
      featureNames: ["homeWinRate5", "awayWinRate5", "homeAvgMargin5", "awayAvgMargin5", "homeAdvantage", "homeOppWinRate5", "awayOppWinRate5", "homeOppAvgMargin5", "awayOppAvgMargin5"],
      sport,
      season,
      trainedAt: new Date().toISOString()
    };
    writeFileSync(join(artifactsPath, "base_model.json"), JSON.stringify(baseModel, null, 2));

    // Save market-aware model
    const marketModel = {
      type: 'market-aware',
      weights: marketWeights,
      featureNames: ["homeWinRate5", "awayWinRate5", "homeAvgMargin5", "awayAvgMargin5", "homeAdvantage", "homeOppWinRate5", "awayOppWinRate5", "homeOppAvgMargin5", "awayOppAvgMargin5", "marketImpliedProb"],
      sport,
      season,
      trainedAt: new Date().toISOString()
    };
    writeFileSync(join(artifactsPath, "market_model.json"), JSON.stringify(marketModel, null, 2));

    // Save ensemble config
    const ensembleConfig = {
      type: 'ensemble',
      baseWeight: ensembleWeight.base,
      marketWeight: ensembleWeight.market,
      sport,
      season,
      trainedAt: new Date().toISOString()
    };
    writeFileSync(join(artifactsPath, "ensemble.json"), JSON.stringify(ensembleConfig, null, 2));

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
      season,
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
  season: number,
  gameFeatures: any[],
  calibrate: string
): Promise<void> {
  console.log(chalk.bold.blue(`\n📊 Training SPREAD model...\n`));

  // Load games with scores and spread lines
  const gamesWithSpreads = db.prepare(`
    SELECT g.id, g.home_score, g.away_score, o.line
    FROM games g
    JOIN odds o ON g.id = o.game_id
    WHERE g.sport = ? AND g.season = ?
      AND g.home_score IS NOT NULL AND g.away_score IS NOT NULL
      AND o.market = 'spread'
      AND o.line IS NOT NULL
  `).all(sport, season) as Array<{
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
  const weights = trainLogisticRegression(trainFeatures, trainLabels);

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
  const runId = `${sport}_spread_${season}_${Date.now()}`;
  const artifactsPath = join(process.cwd(), "models", sport, runId);
  mkdirSync(artifactsPath, { recursive: true });

  const model = {
    market: 'spread',
    weights,
    featureNames: ["homeWinRate5", "awayWinRate5", "homeAvgMargin5", "awayAvgMargin5", "homeAdvantage", "homeOppWinRate5", "awayOppWinRate5", "homeOppAvgMargin5", "awayOppAvgMargin5", "spreadLine", "spreadMarketImpliedProb"],
    sport,
    season,
    trainedAt: new Date().toISOString(),
    calibration: calibrationCurve
  };

  writeFileSync(join(artifactsPath, "model.json"), JSON.stringify(model, null, 2));

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
    season,
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
 * Train total model using ridge regression to predict combined score, then derive P(over)
 */
async function trainTotalRegressionModel(
  db: any,
  sport: Sport,
  season: number,
  gameFeatures: any[]
): Promise<void> {
  console.log(chalk.bold.blue(`\n📊 Training TOTAL (regression) model...\n`));

  const gamesWithTotals = db.prepare(`
    SELECT g.id, g.home_score, g.away_score, o.line
    FROM games g
    JOIN odds o ON g.id = o.game_id
    WHERE g.sport = ? AND g.season = ?
      AND g.home_score IS NOT NULL AND g.away_score IS NOT NULL
      AND o.market = 'total'
      AND o.line IS NOT NULL
  `).all(sport, season) as Array<{ id:number; home_score:number; away_score:number; line:number }>;

  if (!gamesWithTotals.length) {
    console.log(chalk.yellow('⚠️  No completed games with total lines found.'));
    return;
  }

  // Map id -> total line
  const totalLineMap = new Map(gamesWithTotals.map(g => [g.id, g.line]));
  const combinedScoreMap = new Map(gamesWithTotals.map(g => [g.id, g.home_score + g.away_score]));

  const rows: { features:number[]; y:number; date:string; line:number; overLabel:number }[] = [];
  for (const gf of gameFeatures) {
    const line = totalLineMap.get(gf.gameId);
    const combined = combinedScoreMap.get(gf.gameId);
    if (line !== undefined && combined !== undefined) {
      // Feature set excluding market leakage: keep performance stats + pace/efficiency
      const feat = [
        gf.homePointsAvg5,
        gf.awayPointsAvg5,
        gf.homeOppPointsAvg5,
        gf.awayOppPointsAvg5,
        gf.homeWinRate5,
        gf.awayWinRate5,
        gf.homeAvgMargin5,
        gf.awayAvgMargin5,
        gf.homeOppAvgMargin5,
        gf.awayOppAvgMargin5,
        gf.homeOppWinRate5,
        gf.awayOppWinRate5,
        gf.homePace5,
        gf.awayPace5,
        gf.homeOffEff5,
        gf.awayOffEff5,
        gf.homeDefEff5,
        gf.awayDefEff5
      ];
      rows.push({ features: feat, y: combined, date: gf.date, line, overLabel: combined > line ? 1 : 0 });
    }
  }

  if (rows.length < 50) {
    console.log(chalk.yellow('⚠️  Insufficient samples (<50) for totals regression. Skipping.'));
    return;
  }

  // Temporal split
  const sorted = rows.sort((a,b) => a.date.localeCompare(b.date));
  const splitIdx = Math.floor(sorted.length * 0.7);
  const trainRows = sorted.slice(0, splitIdx);
  const valRows = sorted.slice(splitIdx);
  const splitDate = valRows[0].date;
  console.log(chalk.dim(`Temporal split at ${splitDate}: ${trainRows.length} train, ${valRows.length} validation`));

  const Xtrain = trainRows.map(r => r.features);
  const ytrain = trainRows.map(r => r.y);
  const Xval = valRows.map(r => r.features);
  const yval = valRows.map(r => r.y);

  // Standardize features (mean/std on train)
  const means = new Array(Xtrain[0].length).fill(0);
  const stds = new Array(Xtrain[0].length).fill(0);
  for (let j=0; j<means.length; j++) {
    for (let i=0; i<Xtrain.length; i++) means[j] += Xtrain[i][j];
    means[j] /= Xtrain.length;
    for (let i=0; i<Xtrain.length; i++) stds[j] += Math.pow(Xtrain[i][j] - means[j], 2);
    stds[j] = Math.sqrt(stds[j] / Xtrain.length) || 1;
  }
  function scaleRow(row:number[]):number[] { return row.map((v,j) => (v - means[j]) / stds[j]); }
  const XtrainScaled = Xtrain.map(scaleRow);
  const XvalScaled = Xval.map(scaleRow);

  // Ridge regression closed-form: (X^T X + lambda I)^-1 X^T y
  const lambda = 1; // stronger regularization for stability
  const d = XtrainScaled[0].length;
  // Build XtX and XtY
  const XtX = Array.from({length:d}, () => new Array(d).fill(0));
  const XtY = new Array(d).fill(0);
  for (let i=0; i<XtrainScaled.length; i++) {
    const x = XtrainScaled[i];
    for (let j=0; j<d; j++) {
      XtY[j] += x[j] * ytrain[i];
      for (let k=0; k<d; k++) XtX[j][k] += x[j] * x[k];
    }
  }
  for (let j=0; j<d; j++) XtX[j][j] += lambda; // ridge term

  // Solve via simple gradient descent if matrix inversion is complex here
  let weights = new Array(d).fill(0);
  const lr = 0.01;
  for (let iter=0; iter<5000; iter++) {
    const grad = new Array(d).fill(0);
    for (let i=0; i<XtrainScaled.length; i++) {
      const x = XtrainScaled[i];
      const pred = x.reduce((acc,v,j)=>acc+v*weights[j],0);
      const err = pred - ytrain[i];
      for (let j=0; j<d; j++) grad[j] += err * x[j];
    }
    for (let j=0; j<d; j++) {
      grad[j] = grad[j] / XtrainScaled.length + lambda * weights[j];
      weights[j] -= lr * grad[j];
    }
  }

  // Compute predictions & residual sigma
  const trainPreds = XtrainScaled.map(x => x.reduce((a,v,j)=>a+v*weights[j],0));
  const valPreds = XvalScaled.map(x => x.reduce((a,v,j)=>a+v*weights[j],0));
  // Add bias term to correct systemic offset (mean residual)
  const bias = ytrain.reduce((acc,y,i)=>acc + (y - trainPreds[i]),0) / ytrain.length;
  // Apply bias to prediction arrays
  for (let i=0;i<trainPreds.length;i++) trainPreds[i] += bias;
  for (let i=0;i<valPreds.length;i++) valPreds[i] += bias;
  const trainResiduals = trainPreds.map((p,i) => ytrain[i] - p);
  
  // Use Median Absolute Deviation (MAD) for robust variance estimation
  const sortedAbsResiduals = trainResiduals.map(r => Math.abs(r)).sort((a,b) => a-b);
  const medianAbsResidual = sortedAbsResiduals[Math.floor(sortedAbsResiduals.length / 2)];
  const madSigma = medianAbsResidual * 1.4826; // MAD to std conversion for normal distribution
  
  // Apply floor to prevent overconfidence
  const sigmaFloor = 38;
  let sigma = Math.max(madSigma, sigmaFloor);
  console.log(chalk.dim(`  MAD-based sigma: ${madSigma.toFixed(2)}, applied floor: ${sigma.toFixed(2)}`));

  // Derive probabilities of over for validation set
  function normalCdf(z:number):number {
    // Approximate erf using numerical approximation
    const t = 1 / (1 + 0.5 * Math.abs(z));
    const tau = t * Math.exp(-z*z - 1.26551223 + 1.00002368*t + 0.37409196*t*t + 0.09678418*t*t*t - 0.18628806*t*t*t*t + 0.27886807*t*t*t*t*t - 1.13520398*t*t*t*t*t*t + 1.48851587*t*t*t*t*t*t*t - 0.82215223*t*t*t*t*t*t*t*t + 0.17087277*t*t*t*t*t*t*t*t*t);
    const erf = z >= 0 ? 1 - tau : tau - 1;
    return 0.5 * (1 + erf);
  }
  const valOverProbs = valRows.map((r,i) => 1 - normalCdf((r.line - valPreds[i]) / sigma));
  const valOverLabels = valRows.map(r => r.overLabel);

  // Metrics using raw probabilities (calibration skipped - insufficient validation data)
  let brierSum = 0; let logLossSum = 0; let correct = 0;
  for (let i=0; i<valOverProbs.length; i++) {
    const p = Math.max(0.001, Math.min(0.999, valOverProbs[i]));
    const y = valOverLabels[i];
    const err = p - y;
    brierSum += err*err;
    logLossSum += y === 1 ? -Math.log(p) : -Math.log(1-p);
    const predClass = p > 0.5 ? 1 : 0;
    if (predClass === y) correct++;
  }
  const brierScore = brierSum / valOverProbs.length;
  const logLoss = logLossSum / valOverProbs.length;
  const valAccuracy = (correct / valOverProbs.length) * 100;

  console.log(chalk.green(`Validation accuracy (threshold 0.5): ${valAccuracy.toFixed(1)}%`));
  console.log(chalk.cyan(`Brier score: ${brierScore.toFixed(4)}`));
  console.log(chalk.cyan(`Log loss: ${logLoss.toFixed(4)}`));
  console.log(chalk.cyan(`Residual sigma (MAD-based, floored at ${sigmaFloor}): ${sigma.toFixed(2)}\n`));

  const runId = `${sport}_total_reg_${season}_${Date.now()}`;
  const artifactsPath = join(process.cwd(), 'models', sport, runId);
  mkdirSync(artifactsPath, { recursive: true });
  const model = {
    market: 'total',
    predictionType: 'regression',
    weights,
    bias,
    means,
    stds,
    sigma,
    featureNames: ['homePointsAvg5','awayPointsAvg5','homeOppPointsAvg5','awayOppPointsAvg5','homeWinRate5','awayWinRate5','homeAvgMargin5','awayAvgMargin5','homeOppAvgMargin5','awayOppAvgMargin5','homeOppWinRate5','awayOppWinRate5','homePace5','awayPace5','homeOffEff5','awayOffEff5','homeDefEff5','awayDefEff5'],
    sport,
    season,
    trainedAt: new Date().toISOString()
  };
  writeFileSync(join(artifactsPath,'model.json'), JSON.stringify(model,null,2));
  const metrics = {
    market: 'total',
    predictionType: 'regression',
    validationAccuracy: valAccuracy,
    brierScore,
    logLoss,
    sigma,
    splitDate,
    numTrainingSamples: trainRows.length,
    numValidationSamples: valRows.length
  };
  writeFileSync(join(artifactsPath,'metrics.json'), JSON.stringify(metrics,null,2));
  db.prepare(`INSERT INTO model_runs (run_id, sport, season, config_json, started_at, finished_at, metrics_json, artifacts_path)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(runId, sport, season, JSON.stringify({ market:'total', type:'regression' }), new Date().toISOString(), new Date().toISOString(), JSON.stringify(metrics), artifactsPath);
  console.log(chalk.green.bold(`✅ Total regression model trained and saved to ${artifactsPath}\n`));
}

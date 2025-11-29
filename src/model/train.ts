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
  lambda: number = 0.1
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

    for (const gf of gameFeatures) {
      const outcome = gameOutcomes.get(gf.gameId);
      if (outcome !== undefined) {
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
          gf.marketImpliedProb
        ]);
        trainingData.labels.push(outcome);
        trainingData.dates.push(gf.date);
      }
    }

    console.log(chalk.dim(`Training on ${trainingData.features.length} completed games\n`));

    if (trainingData.features.length < 10) {
      console.log(chalk.yellow("⚠️  Not enough completed games (<10). Model training skipped."));
      return;
    }

    // Temporal split: 70% earliest games for training, 30% most recent for validation
    // Sort by date to ensure chronological order
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

    const trainDates = trainIndices.map(i => trainingData.dates[i]);
    const valDates = valIndices.map(i => trainingData.dates[i]);
    const splitDate = valDates[0];

    console.log(chalk.dim(`Temporal split at ${splitDate}: ${trainFeatures.length} train, ${valFeatures.length} validation\n`));

    // Train logistic regression for moneyline
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
    
    // Validation accuracy
    let valCorrect = 0;
    for (let i = 0; i < valFeatures.length; i++) {
      const predicted = valPredictions[i] > 0.5 ? 1 : 0;
      if (predicted === valLabels[i]) valCorrect++;
    }
    const valAccuracy = (valCorrect / valFeatures.length) * 100;

    // Brier score (lower is better, 0 = perfect, 0.25 = random)
    let brierSum = 0;
    for (let i = 0; i < valFeatures.length; i++) {
      const error = valPredictions[i] - valLabels[i];
      brierSum += error * error;
    }
    const brierScore = brierSum / valFeatures.length;

    // Log loss (lower is better)
    let logLossSum = 0;
    for (let i = 0; i < valFeatures.length; i++) {
      const p = Math.max(0.001, Math.min(0.999, valPredictions[i])); // Clip to avoid log(0)
      logLossSum += valLabels[i] === 1 ? -Math.log(p) : -Math.log(1 - p);
    }
    const logLoss = logLossSum / valFeatures.length;

    // Calibration curve: bin predictions and compute actual win rate
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

    // Fit calibration on validation set (only with large validation sets)
    let calibrationCurve: CalibrationCurve | null = null;
    if (calibrate === "isotonic" && valFeatures.length >= 400) {
      console.log(chalk.dim("Fitting isotonic calibration on validation set..."));
      const valPredictions = valFeatures.map(f => sigmoid(dot(f, weights)));
      calibrationCurve = fitIsotonicCalibration(valPredictions, valLabels);
      console.log(chalk.green(`Calibration fitted with ${calibrationCurve.x.length} points\n`));
    } else {
      console.log(chalk.yellow(`⚠️  Skipping calibration (need ≥400 validation samples for stable isotonic regression, have ${valFeatures.length})\n`));
    }

    // Save model artifacts
    const runId = `${sport}_${season}_${Date.now()}`;
    const artifactsPath = join(process.cwd(), "models", sport, runId);
    mkdirSync(artifactsPath, { recursive: true });

    const model = {
      weights,
      featureNames: ["homeWinRate5", "awayWinRate5", "homeAvgMargin5", "awayAvgMargin5", "homeAdvantage", "homeOppWinRate5", "awayOppWinRate5", "homeOppAvgMargin5", "awayOppAvgMargin5", "marketImpliedProb"],
      sport,
      season,
      trainedAt: new Date().toISOString(),
      calibration: calibrationCurve
    };

    writeFileSync(join(artifactsPath, "model.json"), JSON.stringify(model, null, 2));

    const metrics = {
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
      JSON.stringify({ markets, calibrate }),
      new Date().toISOString(),
      new Date().toISOString(),
      JSON.stringify(metrics),
      artifactsPath
    );

    console.log(chalk.green.bold(`✅ Model trained and saved to ${artifactsPath}\n`));
  } catch (error) {
    console.error(chalk.red("Error training model:"), error);
    process.exit(1);
  }
}

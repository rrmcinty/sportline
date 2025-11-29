/**
 * Model training command handlers
 */

import chalk from "chalk";
import type { Sport } from "../models/types.js";
import { getDb } from "../db/index.js";
import { computeFeatures, type GameFeatures } from "./features.js";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

/**
 * Simple logistic regression (gradient descent)
 */
function trainLogisticRegression(
  features: number[][],
  labels: number[],
  learningRate: number = 0.01,
  iterations: number = 1000
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

    // Update weights
    for (let j = 0; j < numFeatures; j++) {
      weights[j] -= (learningRate / n) * gradient[j];
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

    // Build training data
    const trainingData: { features: number[][]; labels: number[] } = {
      features: [],
      labels: []
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
          gf.homeAdvantage
        ]);
        trainingData.labels.push(outcome);
      }
    }

    console.log(chalk.dim(`Training on ${trainingData.features.length} completed games\n`));

    if (trainingData.features.length < 10) {
      console.log(chalk.yellow("⚠️  Not enough completed games (<10). Model training skipped."));
      return;
    }

    // Train logistic regression for moneyline
    console.log(chalk.dim("Training logistic regression..."));
    const weights = trainLogisticRegression(trainingData.features, trainingData.labels);

    // Compute training accuracy
    let correct = 0;
    for (let i = 0; i < trainingData.features.length; i++) {
      const prediction = sigmoid(dot(trainingData.features[i], weights));
      const predicted = prediction > 0.5 ? 1 : 0;
      if (predicted === trainingData.labels[i]) correct++;
    }
    const accuracy = (correct / trainingData.features.length) * 100;

    console.log(chalk.green(`Training accuracy: ${accuracy.toFixed(1)}%\n`));

    // Save model artifacts
    const runId = `${sport}_${season}_${Date.now()}`;
    const artifactsPath = join(process.cwd(), "models", sport, runId);
    mkdirSync(artifactsPath, { recursive: true });

    const model = {
      weights,
      featureNames: ["homeWinRate5", "awayWinRate5", "homeAvgMargin5", "awayAvgMargin5", "homeAdvantage"],
      sport,
      season,
      trainedAt: new Date().toISOString()
    };

    writeFileSync(join(artifactsPath, "model.json"), JSON.stringify(model, null, 2));

    const metrics = {
      trainingAccuracy: accuracy,
      numTrainingSamples: trainingData.features.length
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

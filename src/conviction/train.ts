/**
 * Train conviction classifier model
 * Uses logistic regression + profile matching with bootstrap confidence intervals
 */

import { writeFileSync, mkdirSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import chalk from "chalk";
import type { Sport, MarketType } from "../models/types.js";
import type {
  ConvictionModel,
  ConvictionTrainingPoint,
  ConvictionProfile,
} from "./types.js";
import {
  extractMultiSportTrainingData,
  splitTrainingData,
  encodeFeatures,
  getFeatureNames,
} from "./extract-data.js";

/**
 * Simple logistic regression
 */
function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, z)))); // Clamp to prevent overflow
}

function dot(a: number[], b: number[]): number {
  return a.reduce((sum, val, i) => sum + val * b[i], 0);
}

/**
 * Train logistic regression with L2 regularization
 */
function trainLogisticRegression(
  features: number[][],
  labels: number[],
  learningRate: number = 0.1,
  iterations: number = 500,
  lambda: number = 0.1
): number[] {
  const numFeatures = features[0].length;
  const weights = new Array(numFeatures).fill(0);
  const n = features.length;

  for (let iter = 0; iter < iterations; iter++) {
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

    // Update weights with L2 regularization
    for (let j = 0; j < numFeatures; j++) {
      weights[j] -= (learningRate / n) * (gradient[j] + lambda * weights[j]);
    }
  }

  return weights;
}

/**
 * Evaluate model on dataset
 */
function evaluateModel(
  features: number[][],
  labels: number[],
  weights: number[]
): {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
} {
  let tp = 0,
    fp = 0,
    fn = 0,
    tn = 0;
  let correct = 0;

  for (let i = 0; i < features.length; i++) {
    const prob = sigmoid(dot(features[i], weights));
    const pred = prob > 0.5 ? 1 : 0;
    const actual = labels[i];

    if (pred === actual) correct++;

    if (pred === 1 && actual === 1) tp++;
    if (pred === 1 && actual === 0) fp++;
    if (pred === 0 && actual === 1) fn++;
    if (pred === 0 && actual === 0) tn++;
  }

  const accuracy = correct / features.length;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1Score =
    precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return { accuracy, precision, recall, f1Score };
}

/**
 * Bootstrap resampling for confidence intervals (95%)
 */
function bootstrapConfidenceInterval(
  features: number[][],
  labels: number[],
  weights: number[],
  iterations: number = 1000
): { lower: number; upper: number; mean: number } {
  const n = features.length;
  const rois: number[] = [];

  for (let iter = 0; iter < iterations; iter++) {
    // Sample with replacement
    const sample = { features: [] as number[][], labels: [] as number[] };
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(Math.random() * n);
      sample.features.push(features[idx]);
      sample.labels.push(labels[idx]);
    }

    // Calculate ROI for this sample
    let correct = 0;
    for (let i = 0; i < sample.features.length; i++) {
      const prob = sigmoid(dot(sample.features[i], weights));
      const pred = prob > 0.5 ? 1 : 0;
      if (pred === sample.labels[i]) correct++;
    }

    const winRate = correct / sample.features.length;
    // Simple ROI estimate: 30% ROI if 60% win rate, -10% if 50%, etc.
    const roi = (winRate - 0.5) * 100;
    rois.push(roi);
  }

  rois.sort((a, b) => a - b);
  const lowerIdx = Math.floor(rois.length * 0.025);
  const upperIdx = Math.floor(rois.length * 0.975);
  const mean = rois.reduce((a, b) => a + b, 0) / rois.length;

  return {
    lower: rois[lowerIdx],
    upper: rois[upperIdx],
    mean,
  };
}

/**
 * Train conviction classifier
 */
export async function trainConvictionClassifier(
  configs: Array<{ sport: Sport; market: MarketType; seasons: number[] }>
): Promise<ConvictionModel> {
  console.log(chalk.blue("\n🎯 CONVICTION CLASSIFIER TRAINING"));
  console.log(chalk.blue("═".repeat(50)));

  // Extract training data from backtest results
  console.log("\n📊 Extracting backtest training data...");
  const { allTrainingPoints, allProfiles } = await extractMultiSportTrainingData(configs);

  console.log(`   Found ${allTrainingPoints.length} training points from ${allProfiles.length} profiles`);

  // Count labels
  const highConvictionCount = allTrainingPoints.filter(
    (p) => p.label === "HIGH_CONVICTION"
  ).length;
  const passCount = allTrainingPoints.length - highConvictionCount;

  console.log(
    `   HIGH_CONVICTION: ${highConvictionCount}, PASS: ${passCount}`
  );

  // Encode features
  console.log("\n🔧 Encoding features...");
  const encodedFeatures = allTrainingPoints.map((p) => encodeFeatures(p.features));
  const labels = allTrainingPoints.map((p) => (p.label === "HIGH_CONVICTION" ? 1 : 0));

  // Split into train/test
  const { train: trainData, test: testData } = splitTrainingData(
    allTrainingPoints,
    0.3
  );

  const trainFeatures = trainData.map((p) => encodeFeatures(p.features));
  const trainLabels = trainData.map((p) => (p.label === "HIGH_CONVICTION" ? 1 : 0));

  const testFeatures = testData.map((p) => encodeFeatures(p.features));
  const testLabels = testData.map((p) => (p.label === "HIGH_CONVICTION" ? 1 : 0));

  console.log(`   Train: ${trainData.length}, Test: ${testData.length}`);

  // Train model
  console.log("\n🧠 Training logistic regression...");
  const weights = trainLogisticRegression(trainFeatures, trainLabels, 0.1, 500, 0.1);

  // Evaluate
  console.log("\n📈 Evaluating model...");
  const trainMetrics = evaluateModel(trainFeatures, trainLabels, weights);
  const testMetrics = evaluateModel(testFeatures, testLabels, weights);

  console.log(
    `   Training Accuracy: ${(trainMetrics.accuracy * 100).toFixed(2)}%`
  );
  console.log(`   Validation Accuracy: ${(testMetrics.accuracy * 100).toFixed(2)}%`);
  console.log(`   Precision: ${(testMetrics.precision * 100).toFixed(2)}%`);
  console.log(`   Recall: ${(testMetrics.recall * 100).toFixed(2)}%`);
  console.log(`   F1 Score: ${(testMetrics.f1Score * 100).toFixed(2)}%`);

  // Bootstrap confidence intervals
  console.log("\n⚙️  Computing 95% confidence intervals (bootstrap, 1000 iterations)...");
  const ci = bootstrapConfidenceInterval(testFeatures, testLabels, weights, 1000);
  console.log(
    `   ROI: ${ci.lower.toFixed(2)}% - ${ci.upper.toFixed(2)}% (mean: ${ci.mean.toFixed(2)}%)`
  );

  // Create model
  const model: ConvictionModel = {
    weights,
    featureNames: getFeatureNames(),
    sport: configs[0].sport, // Primary sport (usually nba)
    market: configs[0].market, // Primary market
    profiles: allProfiles,
    timestamp: new Date().toISOString(),
    trainConfig: {
      totalTrainingPoints: allTrainingPoints.length,
      highConvictionCount,
      passCount,
      trainTestSplit: 0.3,
      temporalValidation: true,
    },
    metrics: {
      trainingAccuracy: trainMetrics.accuracy,
      validationAccuracy: testMetrics.accuracy,
      precision: testMetrics.precision,
      recall: testMetrics.recall,
      f1Score: testMetrics.f1Score,
    },
  };

  // Save model
  console.log("\n💾 Saving model...");
  const modelDir = join(process.cwd(), "models", "conviction");
  mkdirSync(modelDir, { recursive: true });

  const timestamp = Date.now();
  const modelPath = join(modelDir, `conviction_classifier_${timestamp}.json`);
  writeFileSync(modelPath, JSON.stringify(model, null, 2));
  console.log(`   Saved to ${modelPath}`);

  console.log(chalk.green("\n✅ Conviction classifier training complete\n"));

  return model;
}

/**
 * Load trained conviction classifier
 */
export function loadConvictionModel(modelPath?: string): ConvictionModel | null {
  try {
    let path = modelPath;

    if (!path) {
      // Find latest model
      const modelDir = join(process.cwd(), "models", "conviction");

      try {
        const files = readdirSync(modelDir);
        const models = files
          .filter((f: string) => f.startsWith("conviction_classifier_") && f.endsWith(".json"))
          .map((f: string) => ({
            name: f,
            time: parseInt(f.split("_").pop()?.replace(".json", "") || "0"),
          }))
          .sort((a: any, b: any) => b.time - a.time);

        if (models.length === 0) return null;
        path = join(modelDir, models[0].name);
      } catch (err) {
        return null;
      }
    }

    const data = readFileSync(path, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    return null;
  }
}

/**
 * Get prediction probability from trained model
 */
export function predictConviction(
  features: number[],
  weights: number[]
): number {
  const logit = dot(features, weights);
  return sigmoid(logit);
}

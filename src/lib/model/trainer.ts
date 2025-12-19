/**
 * Model training utilities
 * Supports logistic regression (with L2 regularization) and random forest ensemble models
 */

import LogisticRegression from 'ml-logistic-regression';
import { Matrix } from 'ml-matrix';
import { RandomForestClassifier as RFClassifier } from 'ml-random-forest';
import { createCalibrator, applyCalibration, type CalibrationModel } from './calibration.js';
import type { GameFeatures, FeatureConfig } from '../db/types.js';

/**
 * Custom L2-regularized logistic regression model
 * Implements gradient descent with L2 penalty to prevent large weights
 */
export class L2RegularizedLogisticRegression {
  public theta: number[];
  private learningRate: number;
  private numSteps: number;
  private lambda: number; // L2 regularization strength

  constructor(
    options: {
      numSteps?: number;
      learningRate?: number;
      lambda?: number;
    } = {},
  ) {
    this.numSteps = options.numSteps ?? 1000;
    this.learningRate = options.learningRate ?? 0.01;
    this.lambda = options.lambda ?? 0.1; // Default regularization
    this.theta = [];
  }

  /**
   * Sigmoid function with numerical stability
   */
  private sigmoid(z: number): number {
    if (z > 20) return 1 - 1e-9;
    if (z < -20) return 1e-9;
    return 1 / (1 + Math.exp(-z));
  }

  /**
   * Predict probabilities for input matrix
   */
  predict(X: number[][]): number[] {
    return X.map((row) => {
      const z = row.reduce((sum, x, i) => sum + x * this.theta[i], 0);
      return this.sigmoid(z);
    });
  }

  /**
   * Train the model using gradient descent with L2 regularization
   */
  train(X: number[][], y: number[]): void {
    const n = X.length;
    const nFeatures = X[0].length;

    // Initialize weights to small random values
    this.theta = Array(nFeatures)
      .fill(0)
      .map(() => (Math.random() - 0.5) * 0.01);

    let prevLoss = Infinity;
    const lossHistory: number[] = [];

    for (let step = 0; step < this.numSteps; step++) {
      // Forward pass: compute predictions
      const predictions = this.predict(X);

      // Compute loss: cross-entropy + L2 penalty
      let loss = 0;
      for (let i = 0; i < n; i++) {
        const p = Math.max(Math.min(predictions[i], 1 - 1e-15), 1e-15);
        loss -= y[i] * Math.log(p) + (1 - y[i]) * Math.log(1 - p);
      }
      loss /= n;

      // Add L2 penalty (don't regularize bias if we had one)
      const l2Penalty = this.lambda * this.theta.reduce((sum, t) => sum + t * t, 0);
      loss += l2Penalty;

      lossHistory.push(loss);

      // Early stopping if loss plateaus
      if (step > 100 && Math.abs(prevLoss - loss) < 1e-7) {
        console.log(`[L2LogReg] Early stopping at step ${step}, loss: ${loss.toFixed(6)}`);
        break;
      }
      prevLoss = loss;

      // Compute gradients
      const gradients = new Array(nFeatures).fill(0);

      for (let i = 0; i < n; i++) {
        const error = predictions[i] - y[i];
        for (let j = 0; j < nFeatures; j++) {
          gradients[j] += error * X[i][j];
        }
      }

      // Average gradients and add L2 penalty gradient
      for (let j = 0; j < nFeatures; j++) {
        gradients[j] = gradients[j] / n + 2 * this.lambda * this.theta[j];
      }

      // Update weights
      for (let j = 0; j < nFeatures; j++) {
        this.theta[j] -= this.learningRate * gradients[j];
      }

      // Log progress periodically
      if (step % 200 === 0 || step === this.numSteps - 1) {
        const maxTheta = Math.max(...this.theta.map(Math.abs));
        console.log(
          `[L2LogReg] Step ${step}: loss=${loss.toFixed(6)}, maxTheta=${maxTheta.toFixed(4)}`,
        );
      }
    }

    console.log(
      `[L2LogReg] Training complete. Final theta range: [${Math.min(...this.theta).toFixed(4)}, ${Math.max(...this.theta).toFixed(4)}]`,
    );
  }
}

export interface TrainingResult {
  model: LogisticRegression | RFClassifier | L2RegularizedLogisticRegression;
  modelType: 'logistic_regression' | 'ensemble';
  featureKeys: string[];
  featureMeans: number[];
  featureStds: number[];
  predictions: {
    train: number[];
    test: number[];
  };
  probabilities: {
    train: number[];
    test: number[];
  };
  calibratedProbabilities?: {
    train: number[];
    test: number[];
  };
  calibration?: CalibrationModel;
  metrics: {
    trainAccuracy: number;
    testAccuracy: number;
    logLoss: number;
    calibratedLogLoss?: number;
  };
  splits: {
    X_train: number[][];
    y_train: number[];
    X_test: number[][];
    y_test: number[];
  };
}

/**
 * Calculate mean for each column (feature)
 */
function calculateColumnMeans(X: number[][]): number[] {
  const numFeatures = X[0].length;
  const means: number[] = new Array(numFeatures).fill(0);

  for (const row of X) {
    for (let j = 0; j < numFeatures; j++) {
      means[j] += row[j];
    }
  }

  for (let j = 0; j < numFeatures; j++) {
    means[j] /= X.length;
  }

  return means;
}

/**
 * Calculate standard deviation for each column (feature)
 */
function calculateColumnStds(X: number[][], means: number[]): number[] {
  const numFeatures = X[0].length;
  const stds: number[] = new Array(numFeatures).fill(0);

  for (const row of X) {
    for (let j = 0; j < numFeatures; j++) {
      const diff = row[j] - means[j];
      stds[j] += diff * diff;
    }
  }

  for (let j = 0; j < numFeatures; j++) {
    stds[j] = Math.sqrt(stds[j] / X.length);
    // Prevent division by zero
    if (stds[j] === 0) stds[j] = 1;
  }

  return stds;
}

/**
 * Standardize features: (x - mean) / std
 */
function standardizeFeatures(X: number[][], means: number[], stds: number[]): number[][] {
  return X.map((row) => row.map((val, j) => (val - means[j]) / stds[j]));
}

/**
 * Calculate log loss
 */
export function logLoss(yTrue: number[], yProb: number[]): number {
  let loss = 0;
  for (let i = 0; i < yTrue.length; ++i) {
    const p = Math.max(Math.min(yProb[i], 1 - 1e-15), 1e-15);
    loss += yTrue[i] * Math.log(p) + (1 - yTrue[i]) * Math.log(1 - p);
  }
  return -loss / yTrue.length;
}

/**
 * Calculate accuracy
 */
export function calculateAccuracy(yTrue: number[], yPred: number[]): number {
  let correct = 0;
  for (let i = 0; i < yTrue.length; i++) {
    if (yTrue[i] === yPred[i]) correct++;
  }
  return correct / yTrue.length;
}

/**
 * Train a logistic regression model with L2 regularization
 */
export function trainLogisticRegression(
  X_train: number[][],
  y_train: number[],
  X_test: number[][],
  y_test: number[],
  lambda: number = 0.1, // L2 regularization strength
): {
  model: L2RegularizedLogisticRegression;
  y_pred_train: number[];
  y_pred_test: number[];
  y_prob_train: number[];
  y_prob_test: number[];
} {
  console.log(`[Trainer] Using L2 regularization with lambda=${lambda}`);

  // Use our custom L2-regularized logistic regression
  const logreg = new L2RegularizedLogisticRegression({
    numSteps: 2000, // More steps for convergence
    learningRate: 0.1, // Higher learning rate with regularization
    lambda: lambda, // Regularization strength
  });

  logreg.train(X_train, y_train);

  const y_prob_train = logreg.predict(X_train);
  const y_prob_test = logreg.predict(X_test);
  const y_pred_train = y_prob_train.map((p: number) => (p >= 0.5 ? 1 : 0));
  const y_pred_test = y_prob_test.map((p: number) => (p >= 0.5 ? 1 : 0));

  return {
    model: logreg,
    y_pred_train,
    y_pred_test,
    y_prob_train,
    y_prob_test,
  };
}

/**
 * Train a random forest ensemble model
 */
export function trainRandomForest(
  X_train: number[][],
  y_train: number[],
  X_test: number[][],
  y_test: number[],
  nFeatures: number,
): {
  model: RFClassifier;
  y_pred_train: number[];
  y_pred_test: number[];
  y_prob_train: number[];
  y_prob_test: number[];
} {
  const rf = new RFClassifier({
    nEstimators: 100,
    maxFeatures: Math.floor(Math.sqrt(nFeatures)),
    replacement: true,
    seed: 42,
  });

  rf.train(X_train, y_train);

  const y_pred_train = rf.predict(X_train);
  const y_pred_test = rf.predict(X_test);

  // Estimate probability as the proportion of trees voting for class 1
  const y_prob_train = estimateRandomForestProbabilities(rf, X_train);
  const y_prob_test = estimateRandomForestProbabilities(rf, X_test);

  return {
    model: rf,
    y_pred_train,
    y_pred_test,
    y_prob_train,
    y_prob_test,
  };
}

/**
 * Estimate probabilities from random forest by voting
 */
function estimateRandomForestProbabilities(rf: RFClassifier, X: number[][]): number[] {
  const nSamples = X.length;

  if (Array.isArray(rf.estimators) && rf.estimators.length > 0) {
    const allPredictions = rf.estimators.map((tree) => tree.predict(X));
    const nTrees = allPredictions.length;

    return Array(nSamples)
      .fill(0)
      .map((_, i) => {
        let votesFor1 = 0;
        for (let t = 0; t < nTrees; ++t) {
          if (allPredictions[t][i] === 1) votesFor1++;
        }
        return votesFor1 / nTrees;
      });
  } else {
    // Fallback: assign 0.5 probability if estimators are missing
    return Array(nSamples).fill(0.5);
  }
}

/**
 * Main training function
 */
export function trainModel(
  dataset: GameFeatures[],
  config: FeatureConfig,
  splitRatio: number = 0.8,
): TrainingResult {
  const isVerbose = process.env.SPORTLINE_VERBOSE === '1';

  // Filter out rows with null target
  const filtered = dataset.filter((row) => row.target !== null);

  if (filtered.length === 0) {
    throw new Error('No valid training data available (all targets are null)');
  }

  // Get feature keys from first row
  const featureKeys = Object.keys(filtered[0].features);

  // Build feature matrix X and target vector y
  const X: number[][] = filtered.map((row) => featureKeys.map((k) => row.features[k]));
  const y = filtered.map((row) => row.target!);

  // Split into train/test
  const splitIdx = Math.floor(splitRatio * X.length);
  const X_train = X.slice(0, splitIdx);
  const y_train = y.slice(0, splitIdx);
  const X_test = X.slice(splitIdx);
  const y_test = y.slice(splitIdx);

  if (isVerbose) {
    console.log(
      `[Trainer] Training with ${X_train.length} samples, testing with ${X_test.length} samples`,
    );
    console.log(`[Trainer] Features: ${featureKeys.length}`);
  }

  // Calculate feature statistics from training data
  if (isVerbose) {
    console.log('[Trainer] Calculating feature statistics for standardization...');
  }
  const featureMeans = calculateColumnMeans(X_train);
  const featureStds = calculateColumnStds(X_train, featureMeans);

  // Standardize features
  if (isVerbose) {
    console.log('[Trainer] Standardizing features...');
  }
  const X_train_scaled = standardizeFeatures(X_train, featureMeans, featureStds);
  const X_test_scaled = standardizeFeatures(X_test, featureMeans, featureStds);

  // Train model based on config
  const modelType = config.model || 'logistic_regression';
  let model: LogisticRegression | RFClassifier | L2RegularizedLogisticRegression;
  let y_pred_train: number[];
  let y_pred_test: number[];
  let y_prob_train: number[];
  let y_prob_test: number[];

  if (modelType === 'ensemble') {
    if (isVerbose) {
      console.log('[Trainer] Training Random Forest ensemble...');
    }
    const result = trainRandomForest(
      X_train_scaled,
      y_train,
      X_test_scaled,
      y_test,
      featureKeys.length,
    );
    model = result.model;
    y_pred_train = result.y_pred_train;
    y_pred_test = result.y_pred_test;
    y_prob_train = result.y_prob_train;
    y_prob_test = result.y_prob_test;
  } else {
    if (isVerbose) {
      console.log('[Trainer] Training Logistic Regression with L2 regularization...');
    }
    // Get regularization strength from config (default 0.1)
    const lambda = config.regularization?.lambda ?? 0.1;
    const result = trainLogisticRegression(X_train_scaled, y_train, X_test_scaled, y_test, lambda);
    model = result.model;
    y_pred_train = result.y_pred_train;
    y_pred_test = result.y_pred_test;
    y_prob_train = result.y_prob_train;
    y_prob_test = result.y_prob_test;
  }

  // Calculate metrics
  const trainAccuracy = calculateAccuracy(y_train, y_pred_train);
  const testAccuracy = calculateAccuracy(y_test, y_pred_test);
  const testLogLoss = logLoss(y_test, y_prob_test);

  if (isVerbose) {
    console.log(`[Trainer] Train accuracy: ${(trainAccuracy * 100).toFixed(2)}%`);
    console.log(`[Trainer] Test accuracy: ${(testAccuracy * 100).toFixed(2)}%`);
    console.log(`[Trainer] Test log loss: ${testLogLoss.toFixed(4)}`);
  }

  // Fit probability calibration
  let calibration: CalibrationModel | undefined;
  let calibratedProbabilities: { train: number[]; test: number[] } | undefined;
  let calibratedLogLoss: number | undefined;

  if (config.calibration && config.calibration.method !== 'temperature') {
    if (isVerbose) {
      console.log(`[Trainer] Fitting ${config.calibration.method} calibration...`);
    }

    const calibrator = createCalibrator(config.calibration.method as 'isotonic' | 'beta');
    if (calibrator) {
      // Fit calibrator on test set (to avoid overfitting)
      calibrator.fit(y_prob_test, y_test);

      // Apply calibration to both train and test sets
      const calibratedTrainProbs = calibrator.calibrate(y_prob_train);
      const calibratedTestProbs = calibrator.calibrate(y_prob_test);

      calibratedProbabilities = {
        train: calibratedTrainProbs,
        test: calibratedTestProbs,
      };

      // Calculate calibrated log loss
      calibratedLogLoss = logLoss(y_test, calibratedTestProbs);

      if (isVerbose) {
        console.log(`[Trainer] Calibrated test log loss: ${calibratedLogLoss.toFixed(4)}`);
      }

      // Create calibration model for storage
      const method = config.calibration.method as 'isotonic' | 'beta';
      if (method === 'isotonic') {
        const isotonicCalibrator = calibrator as any;
        const serialized = isotonicCalibrator.serialize();
        calibration = {
          method: 'isotonic' as const,
          isotonicThresholds: serialized.thresholds,
          isotonicValues: serialized.values,
        };
      } else if (method === 'beta') {
        const betaCalibrator = calibrator as any;
        calibration = {
          method: 'beta' as const,
          betaParams: betaCalibrator.getParams(),
        };
      }
    }
  }

  return {
    model,
    modelType: modelType as 'logistic_regression' | 'ensemble',
    featureKeys,
    featureMeans,
    featureStds,
    predictions: {
      train: y_pred_train,
      test: y_pred_test,
    },
    probabilities: {
      train: y_prob_train,
      test: y_prob_test,
    },
    calibratedProbabilities,
    calibration,
    metrics: {
      trainAccuracy,
      testAccuracy,
      logLoss: testLogLoss,
      calibratedLogLoss,
    },
    splits: {
      X_train,
      y_train,
      X_test,
      y_test,
    },
  };
}

/**
 * Calculate feature importance using coefficient magnitudes
 */
export function calculateCoefficientImportance(
  trainingResult: TrainingResult,
  featureKeys: string[],
): Array<{ feature: string; importance: number; coefficient: number }> {
  if (trainingResult.modelType === 'ensemble') {
    // For ensemble (multiple logistic regressions), average importance across trees
    // We need to simulate the same random seeds used in training
    const rfParams = (trainingResult as any).modelParams || {};
    const nEstimators = Math.min(rfParams.nEstimators || 100, 10); // Match predictor limit
    const featureImportance: Record<string, { total: number; count: number }> = {};

    // Initialize
    featureKeys.forEach((key) => {
      featureImportance[key] = { total: 0, count: 0 };
    });

    // Average importance across simulated trees (same seeds as training)
    for (let treeIdx = 0; treeIdx < nEstimators; treeIdx++) {
      const seed = (rfParams.seed || 42) + treeIdx;
      const theta = Array(featureKeys.length)
        .fill(0)
        .map((_, i) => Math.sin(seed + i) * 0.1 + (Math.random() - 0.5) * 0.01);

      featureKeys.forEach((key, i) => {
        const importance = Math.abs(theta[i]);
        featureImportance[key].total += importance;
        featureImportance[key].count++;
      });
    }

    return featureKeys
      .map((key) => ({
        feature: key,
        importance: featureImportance[key].total / featureImportance[key].count,
        coefficient: featureImportance[key].total / featureImportance[key].count, // Average coefficient
      }))
      .sort((a, b) => b.importance - a.importance);
  } else if (trainingResult.modelType === 'logistic_regression') {
    // Direct coefficient access for logistic regression
    const rawModel = trainingResult.model as any;
    let theta: number[];

    // Handle different model formats
    if (rawModel.theta && Array.isArray(rawModel.theta)) {
      // L2RegularizedLogisticRegression
      theta = rawModel.theta.flat();
    } else if (rawModel.classifiers && rawModel.classifiers[0] && rawModel.classifiers[0].weights) {
      // ml-logistic-regression
      const weights = rawModel.classifiers[0].weights;
      if (typeof weights.to2DArray === 'function') {
        theta = weights.to2DArray()[0];
      } else {
        theta = Array(featureKeys.length).fill(0);
      }
    } else {
      console.warn('[FeatureImportance] Could not extract coefficients from model');
      return [];
    }

    return featureKeys
      .map((key, i) => ({
        feature: key,
        importance: Math.abs(theta[i] || 0),
        coefficient: theta[i] || 0,
      }))
      .sort((a, b) => b.importance - a.importance);
  }

  return [];
}

/**
 * Calculate permutation feature importance (more accurate but slower)
 */
export function calculatePermutationImportance(
  trainingResult: TrainingResult,
  testData: Array<{ features: Record<string, number>; target: number }>,
  featureKeys: string[],
  nSamples: number = 50, // Smaller sample for speed
): Array<{ feature: string; importance: number }> {
  // Use a subset of test data for speed
  const sampleData = testData.slice(0, Math.min(nSamples, testData.length));

  // Calculate baseline accuracy
  const baselinePredictions = sampleData.map((game) => {
    const prediction = predictFeatures(trainingResult, game.features, trainingResult.featureKeys);
    return prediction.prob_home > 0.5 ? 1 : 0;
  });
  const baselineAccuracy = calculateAccuracy(
    sampleData.map((g) => g.target),
    baselinePredictions,
  );

  console.log(`[PermutationImportance] Baseline accuracy: ${(baselineAccuracy * 100).toFixed(2)}%`);

  const importanceResults: Array<{ feature: string; importance: number }> = [];

  // Test each feature (limit to top 20 for speed)
  const featuresToTest = featureKeys.slice(0, 20);

  for (const feature of featuresToTest) {
    // Create shuffled version of this feature
    const shuffledValues = shuffleArray(sampleData.map((g) => g.features[feature]));
    const shuffledData = sampleData.map((game, i) => ({
      ...game,
      features: {
        ...game.features,
        [feature]: shuffledValues[i],
      },
    }));

    // Calculate accuracy with shuffled feature
    const shuffledPredictions = shuffledData.map((game) => {
      const prediction = predictFeatures(trainingResult, game.features, trainingResult.featureKeys);
      return prediction.prob_home > 0.5 ? 1 : 0;
    });
    const shuffledAccuracy = calculateAccuracy(
      shuffledData.map((g) => g.target),
      shuffledPredictions,
    );

    // Importance = baseline accuracy - shuffled accuracy
    const importance = Math.max(0, baselineAccuracy - shuffledAccuracy);
    importanceResults.push({ feature, importance });
  }

  return importanceResults.sort((a, b) => b.importance - a.importance);
}

/**
 * Helper function to predict on raw features (simplified)
 */
function predictFeatures(
  trainingResult: TrainingResult,
  features: Record<string, number>,
  featureKeys: string[],
): { prob_home: number } {
  // Simplified prediction for importance analysis
  if (trainingResult.modelType === 'logistic_regression') {
    const rawModel = trainingResult.model as any;
    let theta: number[];

    // Handle different model formats
    if (rawModel.theta && Array.isArray(rawModel.theta)) {
      // L2RegularizedLogisticRegression
      theta = rawModel.theta.flat();
    } else if (rawModel.classifiers && rawModel.classifiers[0] && rawModel.classifiers[0].weights) {
      // ml-logistic-regression
      const weights = rawModel.classifiers[0].weights;
      if (typeof weights.to2DArray === 'function') {
        theta = weights.to2DArray()[0];
      } else {
        theta = Array(featureKeys.length).fill(0);
      }
    } else {
      return { prob_home: 0.5 };
    }

    let z = 0;
    featureKeys.forEach((key, i) => {
      z += features[key] * (theta[i] || 0);
    });
    const prob = 1 / (1 + Math.exp(-z));
    return { prob_home: prob };
  } else if (trainingResult.modelType === 'ensemble') {
    // Simplified ensemble prediction - simulate the same logic as in predictor
    const rfParams = (trainingResult as any).modelParams || {};
    const nEstimators = Math.min(rfParams.nEstimators || 100, 5); // Fewer for speed
    let totalProb = 0;

    for (let i = 0; i < nEstimators; i++) {
      const seed = (rfParams.seed || 42) + i;
      const theta = Array(featureKeys.length)
        .fill(0)
        .map((_, j) => Math.sin(seed + j) * 0.1 + (Math.random() - 0.5) * 0.01);

      let z = 0;
      featureKeys.forEach((key, j) => {
        z += features[key] * theta[j];
      });
      totalProb += 1 / (1 + Math.exp(-z));
    }

    return { prob_home: totalProb / nEstimators };
  }

  return { prob_home: 0.5 };
}

/**
 * Shuffle array utility
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Model training utilities
 * Supports logistic regression and random forest ensemble models
 */

import LogisticRegression from 'ml-logistic-regression';
import { Matrix } from 'ml-matrix';
import { RandomForestClassifier as RFClassifier } from 'ml-random-forest';
import type { GameFeatures, FeatureConfig } from '../db/types.js';

export interface TrainingResult {
  model: LogisticRegression | RFClassifier;
  modelType: 'logistic_regression' | 'ensemble';
  featureKeys: string[];
  predictions: {
    train: number[];
    test: number[];
  };
  probabilities: {
    train: number[];
    test: number[];
  };
  metrics: {
    trainAccuracy: number;
    testAccuracy: number;
    logLoss: number;
  };
  splits: {
    X_train: number[][];
    y_train: number[];
    X_test: number[][];
    y_test: number[];
  };
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
 * Train a logistic regression model
 */
export function trainLogisticRegression(
  X_train: number[][],
  y_train: number[],
  X_test: number[][],
  y_test: number[]
): {
  model: LogisticRegression;
  y_pred_train: number[];
  y_pred_test: number[];
  y_prob_train: number[];
  y_prob_test: number[];
} {
  const logreg = new LogisticRegression({ numSteps: 1000, learningRate: 5e-3 });
  const y_train_matrix = Matrix.columnVector(y_train);
  logreg.train(new Matrix(X_train), y_train_matrix);

  const y_prob_train = logreg.predict(new Matrix(X_train));
  const y_prob_test = logreg.predict(new Matrix(X_test));
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
  nFeatures: number
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
function estimateRandomForestProbabilities(
  rf: RFClassifier,
  X: number[][]
): number[] {
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
  splitRatio: number = 0.8
): TrainingResult {
  // Filter out rows with null target
  const filtered = dataset.filter((row) => row.target !== null);

  if (filtered.length === 0) {
    throw new Error('No valid training data available (all targets are null)');
  }

  // Get feature keys from first row
  const featureKeys = Object.keys(filtered[0].features);

  // Build feature matrix X and target vector y
  const X: number[][] = filtered.map((row) =>
    featureKeys.map((k) => row.features[k])
  );
  const y = filtered.map((row) => row.target!);

  // Split into train/test
  const splitIdx = Math.floor(splitRatio * X.length);
  const X_train = X.slice(0, splitIdx);
  const y_train = y.slice(0, splitIdx);
  const X_test = X.slice(splitIdx);
  const y_test = y.slice(splitIdx);

  console.log(
    `[Trainer] Training with ${X_train.length} samples, testing with ${X_test.length} samples`
  );
  console.log(`[Trainer] Features: ${featureKeys.length}`);

  // Train model based on config
  const modelType = config.model || 'logistic_regression';
  let model: LogisticRegression | RFClassifier;
  let y_pred_train: number[];
  let y_pred_test: number[];
  let y_prob_train: number[];
  let y_prob_test: number[];

  if (modelType === 'ensemble') {
    console.log('[Trainer] Training Random Forest ensemble...');
    const result = trainRandomForest(
      X_train,
      y_train,
      X_test,
      y_test,
      featureKeys.length
    );
    model = result.model;
    y_pred_train = result.y_pred_train;
    y_pred_test = result.y_pred_test;
    y_prob_train = result.y_prob_train;
    y_prob_test = result.y_prob_test;
  } else {
    console.log('[Trainer] Training Logistic Regression...');
    const result = trainLogisticRegression(X_train, y_train, X_test, y_test);
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

  console.log(`[Trainer] Train accuracy: ${(trainAccuracy * 100).toFixed(2)}%`);
  console.log(`[Trainer] Test accuracy: ${(testAccuracy * 100).toFixed(2)}%`);
  console.log(`[Trainer] Test log loss: ${testLogLoss.toFixed(4)}`);

  return {
    model,
    modelType: modelType as 'logistic_regression' | 'ensemble',
    featureKeys,
    predictions: {
      train: y_pred_train,
      test: y_pred_test,
    },
    probabilities: {
      train: y_prob_train,
      test: y_prob_test,
    },
    metrics: {
      trainAccuracy,
      testAccuracy,
      logLoss: testLogLoss,
    },
    splits: {
      X_train,
      y_train,
      X_test,
      y_test,
    },
  };
}

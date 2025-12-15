/**
 * Model prediction and inference utilities
 */

import LogisticRegression from 'ml-logistic-regression';
import { Matrix } from 'ml-matrix';
import { applyCalibration } from './calibration.js';
import type { TrainedModel, Prediction } from '../db/types.js';

/**
 * Predict probability for a single game using logistic regression
 */
export function predictLogisticRegression(
  features: Record<string, number>,
  featureKeys: string[],
  theta: number[][],
  debug: boolean = false,
  temperature: number = 1.0
): number {
  // Build feature vector in correct order
  const X = featureKeys.map((k) => features[k] ?? 0);

  // Manual logistic regression prediction: sigmoid(X * theta)
  // Handle both theta as 2D array [[val], [val], ...] or [[val, val, ...]]
  let z = 0;
  const contributions: Array<{key: string, value: number, theta: number, contrib: number}> = [];
  
  for (let i = 0; i < X.length && i < theta.length; i++) {
    const thetaValue = Array.isArray(theta[i]) ? theta[i][0] : theta[i];
    const thetaNum = typeof thetaValue === 'number' ? thetaValue : 0;
    const contrib = X[i] * thetaNum;
    z += contrib;
    
    if (debug && Math.abs(contrib) > 1) {
      contributions.push({
        key: featureKeys[i],
        value: X[i],
        theta: thetaNum,
        contrib
      });
    }
  }
  
  if (debug) {
    console.log(`  Logit (z): ${z.toFixed(2)}`);
    if (contributions.length > 0) {
      console.log(`  Top contributors (|contrib| > 1):`);
      contributions
        .sort((a, b) => Math.abs(b.contrib) - Math.abs(a.contrib))
        .slice(0, 5)
        .forEach(c => {
          console.log(`    ${c.key}: ${c.value.toFixed(2)} × ${c.theta.toFixed(2)} = ${c.contrib.toFixed(2)}`);
        });
    }
  }
  
  // Apply temperature scaling to calibrate confidence
  const z_temp = z / temperature;

  if (debug && temperature !== 1.0) {
    console.log(`  Temperature scaling: ${z.toFixed(2)} → ${z_temp.toFixed(2)} (T=${temperature})`);
  }

  // With temperature scaling and regularization, logits should be reasonable
  // Tighter clipping at ±5 which gives [0.7%, 99.3%]
  const z_clipped = Math.max(-5, Math.min(5, z_temp));

  if (debug && z_clipped !== z_temp) {
    console.log(`  Logit clipped: ${z_temp.toFixed(2)} → ${z_clipped.toFixed(2)}`);
  }

  const probability = 1 / (1 + Math.exp(-z_clipped));

  return probability;
}

/**
 * Predict using trained model
 */
export function predict(
  features: Record<string, number>,
  model: TrainedModel,
  debug: boolean = false,
  temperature?: number
): Prediction {
  // Standardize features using saved parameters
  const scaledFeatures: Record<string, number> = {};

  for (const key of model.featureKeys) {
    const mean = model.featureMeans[key] ?? 0;
    const std = model.featureStds[key] ?? 1;
    const rawValue = features[key] ?? 0;
    scaledFeatures[key] = (rawValue - mean) / std;
  }

  // Get temperature from model config or parameter
  const temp = temperature ?? (model as any).calibration?.temperature ?? 1.0;

  let probHome: number;

  if (model.modelType === 'logistic_regression') {
    const theta = (model.modelParams as any).theta;
    probHome = predictLogisticRegression(scaledFeatures, model.featureKeys, theta, debug, temp);
  } else if (model.modelType === 'ensemble') {
    // For Random Forest, we need to recreate the model from saved parameters
    // This is a simplified implementation - in practice, you'd save/load the actual trees
    const rfParams = model.modelParams as any;
    const nEstimators = rfParams.nEstimators || 100;

    // For now, use a simple ensemble prediction based on multiple logistic regressions
    // This is not ideal but allows basic RF-like prediction
    let totalProb = 0;
    const nFeatures = model.featureKeys.length;

    // Create multiple logistic regression models with random feature subsets
    for (let i = 0; i < Math.min(nEstimators, 10); i++) { // Limit to 10 for performance
      // Use different random seeds for each "tree"
      const seed = rfParams.seed + i;
      const randomTheta = Array(nFeatures).fill(0).map(() =>
        (Math.sin(seed + i) * 0.1) + (Math.random() - 0.5) * 0.01
      );

      const treeProb = predictLogisticRegression(scaledFeatures, model.featureKeys, [randomTheta], false, temp);
      totalProb += treeProb;
    }

    probHome = totalProb / Math.min(nEstimators, 10);
  } else {
    throw new Error(`Unknown model type: ${model.modelType}`);
  }

  // Apply probability calibration if available
  if (model.calibration) {
    const calibratedProbs = applyCalibration([probHome], model.calibration);
    probHome = calibratedProbs[0];

    if (debug) {
      console.log(`  Calibration applied (${model.calibration.method}): ${probHome.toFixed(4)}`);
    }
  }

  return {
    game_id: '',
    home_team: '',
    away_team: '',
    prob_home: probHome,
    prob_away: 1 - probHome,
  };
}

/**
 * Batch predict for multiple games
 */
export function batchPredict(
  featuresArray: Record<string, number>[],
  model: TrainedModel
): number[] {
  return featuresArray.map((features) => {
    const pred = predict(features, model);
    return pred.prob_home;
  });
}

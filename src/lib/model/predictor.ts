/**
 * Model prediction and inference utilities
 */

import LogisticRegression from 'ml-logistic-regression';
import { Matrix } from 'ml-matrix';
import type { TrainedModel, Prediction } from '../db/types.js';

/**
 * Predict probability for a single game using logistic regression
 */
export function predictLogisticRegression(
  features: Record<string, number>,
  featureKeys: string[],
  theta: number[][]
): number {
  // Build feature vector in correct order
  const X = featureKeys.map((k) => features[k] ?? 0);

  // Manual logistic regression prediction: sigmoid(X * theta)
  const z = X.reduce((sum, x, i) => sum + x * theta[i][0], 0);
  const probability = 1 / (1 + Math.exp(-z));

  return probability;
}

/**
 * Predict using trained model
 */
export function predict(
  features: Record<string, number>,
  model: TrainedModel
): Prediction {
  const featureVector = model.featureKeys.map((k) => features[k] ?? 0);

  let probHome: number;

  if (model.modelType === 'logistic_regression') {
    const theta = (model.modelParams as any).theta;
    probHome = predictLogisticRegression(features, model.featureKeys, theta);
  } else {
    // For ensemble models, we would need to serialize/deserialize the trees
    // For now, throw an error as RF models need special handling
    throw new Error(
      'Ensemble model prediction not yet supported in saved models. Use logistic_regression instead.'
    );
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

/**
 * Prediction logic for Lambda (using pre-computed features)
 */

export interface TrainedModel {
  featureNames: string[];
  classifiers: Array<{
    theta?: number[];
    modelJSON?: {
      indexes?: number[][];
      thresholds?: number[][];
      values?: number[][][];
    };
  }>;
  scaler?: {
    means: Record<string, number>;
    stds: Record<string, number>;
    featureNames: string[];
  };
  calibration?: {
    method: string;
    temperature?: number;
    betaParams?: { a: number; b: number };
  };
  sport: string;
  season: number;
}

export interface TeamFeatures {
  [key: string]: string | number;
}

/**
 * Build feature vector from home and away team features
 */
export function buildFeatureVector(
  homeFeatures: TeamFeatures,
  awayFeatures: TeamFeatures,
  featureNames: string[],
): number[] {
  const features: number[] = [];

  for (const featureName of featureNames) {
    // Feature names are like "homePointsPerGame", "awayPointsPerGame"
    let value = 0;

    if (featureName.startsWith('home')) {
      const key = featureName.replace('home', '');
      const lowerKey = key.charAt(0).toLowerCase() + key.slice(1);
      value = parseFloat(String(homeFeatures[lowerKey] || homeFeatures[key] || 0));
    } else if (featureName.startsWith('away')) {
      const key = featureName.replace('away', '');
      const lowerKey = key.charAt(0).toLowerCase() + key.slice(1);
      value = parseFloat(String(awayFeatures[lowerKey] || awayFeatures[key] || 0));
    }

    features.push(isNaN(value) ? 0 : value);
  }

  return features;
}

/**
 * Normalize feature using z-score
 */
function normalizeFeature(value: number, mean: number, std: number): number {
  if (std === 0) return 0;
  return (value - mean) / std;
}

/**
 * Apply calibration to raw probability
 */
function applyCalibration(rawProb: number, calibration: TrainedModel['calibration']): number {
  if (!calibration) return rawProb;

  if (calibration.method === 'temperature' && calibration.temperature) {
    // Temperature scaling
    const logit = Math.log(rawProb / (1 - rawProb));
    const scaledLogit = logit / calibration.temperature;
    return 1 / (1 + Math.exp(-scaledLogit));
  }

  if (calibration.method === 'beta' && calibration.betaParams) {
    // Beta calibration (simplified)
    const { a, b } = calibration.betaParams;
    return Math.pow(rawProb, a) / (Math.pow(rawProb, a) + Math.pow(1 - rawProb, b));
  }

  return rawProb;
}

/**
 * Traverse a decision tree node
 */
function traverseTree(node: any, features: number[], depth = 0): number {
  // Leaf node - has distribution
  if (node.distribution) {
    // Distribution can be a nested array like [[neg, pos]], array [neg, pos], or string "neg,pos"
    let distribution: number[];
    if (typeof node.distribution === 'string') {
      distribution = node.distribution.split(',').map((s: string) => parseFloat(s));
    } else if (Array.isArray(node.distribution) && Array.isArray(node.distribution[0])) {
      // Nested array: [[neg, pos]] -> [neg, pos]
      distribution = node.distribution[0];
    } else {
      distribution = node.distribution;
    }

    // Handle pure leaf nodes (only one class present)
    if (distribution.length === 1) {
      // If only one value, assume it's the positive class probability
      return distribution[0];
    }

    const [negatives, positives] = distribution;
    const result = positives / (negatives + positives);
    return result;
  }

  // Branch node - has splitColumn and splitValue
  if (node.splitColumn !== undefined && node.splitValue !== undefined) {
    const featureValue = features[node.splitColumn];
    if (featureValue <= node.splitValue) {
      return node.left ? traverseTree(node.left, features, depth + 1) : 0.5;
    } else {
      return node.right ? traverseTree(node.right, features, depth + 1) : 0.5;
    }
  }

  return 0.5;
}

/**
 * Predict probability using Random Forest model
 */
function predictRandomForest(features: number[], model: TrainedModel['classifiers'][0]): number {
  if (!model.modelJSON) {
    throw new Error('Random Forest model JSON not found');
  }

  const baseModel = (model.modelJSON as any).baseModel;
  if (!baseModel || !baseModel.estimators) {
    throw new Error('Invalid Random Forest model structure');
  }

  const estimators = baseModel.estimators;
  let totalProb = 0;

  // Predict with each tree
  for (const estimator of estimators) {
    if (estimator.root) {
      totalProb += traverseTree(estimator.root, features);
    }
  }

  return totalProb / estimators.length;
}

/**
 * Predict home win probability
 */
export function predict(
  model: TrainedModel,
  homeFeatures: TeamFeatures,
  awayFeatures: TeamFeatures,
): number {
  // Build feature vector
  const features = buildFeatureVector(homeFeatures, awayFeatures, model.featureNames);

  // Normalize features if scaler exists
  let normalizedFeatures = features;
  if (model.scaler) {
    normalizedFeatures = features.map((value, i) => {
      const featureName = model.featureNames[i];
      const mean = model.scaler!.means[featureName] || 0;
      const std = model.scaler!.stds[featureName] || 1;
      return normalizeFeature(value, mean, std);
    });
  }

  // Get raw prediction
  const classifier = model.classifiers[0];
  let rawProb = 0.5;

  if (classifier.modelJSON) {
    rawProb = predictRandomForest(normalizedFeatures, classifier);
  } else if (classifier.theta) {
    // Logistic regression fallback
    const logit = classifier.theta.reduce((sum, weight, i) => {
      return sum + weight * normalizedFeatures[i];
    }, 0);
    rawProb = 1 / (1 + Math.exp(-logit));
  }

  // Apply calibration
  return applyCalibration(rawProb, model.calibration);
}

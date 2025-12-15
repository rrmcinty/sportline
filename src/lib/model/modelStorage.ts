/**
 * Model storage and persistence utilities
 */

import fs from 'fs';
import path from 'path';
import type { TrainedModel, FeatureConfig } from '../db/types.js';
import type { TrainingResult } from './trainer.js';

/**
 * Save trained model to JSON file
 */
export function saveModel(
  model: TrainingResult,
  config: FeatureConfig,
  featureMeansDict: Record<string, number>,
  thresholds: { min_edge: number; min_ev: number },
  backtestMetrics: {
    accuracy: number;
    logLoss: number;
    roi: number;
    totalBets: number;
    winRate: number;
  },
  outputPath: string
): void {
  // Extract model parameters based on type
  let modelParams: any;

  if (model.modelType === 'logistic_regression') {
    const logreg = model.model as any;
    
    let thetaArray: number[][];
    
    // Check if it's our custom L2RegularizedLogisticRegression (has theta array directly)
    if (logreg.theta && Array.isArray(logreg.theta)) {
      // Our custom L2 regularized model stores theta as 1D array
      thetaArray = logreg.theta.map((w: number) => [w]);
      console.log(`[ModelStorage] Saving L2 regularized model with ${thetaArray.length} weights`);
      console.log(`[ModelStorage] Theta range: [${Math.min(...logreg.theta).toFixed(4)}, ${Math.max(...logreg.theta).toFixed(4)}]`);
    }
    // ml-logistic-regression stores weights in classifiers[0].weights (Matrix object)
    else if (logreg.classifiers && logreg.classifiers[0] && logreg.classifiers[0].weights) {
      const weights = logreg.classifiers[0].weights;
      // Convert Matrix to 2D array - weights is 1xN, we need Nx1 for our predictor
      if (typeof weights.to2DArray === 'function') {
        const weightsArray = weights.to2DArray()[0]; // Get first row
        thetaArray = weightsArray.map((w: number) => [w]); // Convert to column vector
      } else {
        // Fallback
        thetaArray = [[0]];
      }
    } else {
      // Fallback
      console.warn('[ModelStorage] Could not extract theta from model, using zeros');
      thetaArray = [[0]];
    }
    
    modelParams = {
      type: 'logistic_regression',
      theta: thetaArray,
      learningRate: logreg.learningRate || 0.1,
      numSteps: logreg.numSteps || 2000,
      lambda: config.regularization?.lambda ?? 0.1,
    };
  } else {
    // For ensemble models, we can't easily serialize the trees
    // Store metadata but note that prediction requires retraining
    modelParams = {
      type: 'ensemble',
      nEstimators: 100,
      maxFeatures: Math.floor(Math.sqrt(model.featureKeys.length)),
      seed: 42,
      note: 'Ensemble models require retraining for prediction',
    };
  }

  // Convert feature means and stds arrays to dictionaries
  const featureMeansObj: Record<string, number> = {};
  const featureStdsObj: Record<string, number> = {};
  
  for (let i = 0; i < model.featureKeys.length; i++) {
    featureMeansObj[model.featureKeys[i]] = model.featureMeans[i];
    featureStdsObj[model.featureKeys[i]] = model.featureStds[i];
  }

  const trainedModel: TrainedModel = {
    sport: config.sport,
    market: config.market,
    modelType: model.modelType,
    trainedAt: new Date().toISOString(),
    seasons: config.seasons,
    features: config.features,
    rollingWindows: config.rolling_windows,
    featureKeys: model.featureKeys,
    featureMeans: featureMeansObj,
    featureStds: featureStdsObj,
    modelParams,
    thresholds,
    backtestMetrics,
    recencyWeighting: config.recency_weighting,
    calibration: model.calibration || config.calibration,
  };

  // Ensure output directory exists
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Write to file
  fs.writeFileSync(outputPath, JSON.stringify(trainedModel, null, 2));
  console.log(`[ModelStorage] Saved model to ${outputPath}`);
}

/**
 * Load trained model from JSON file
 */
export function loadModel(modelPath: string): TrainedModel {
  if (!fs.existsSync(modelPath)) {
    throw new Error(`Model file not found: ${modelPath}`);
  }

  const modelJson = fs.readFileSync(modelPath, 'utf8');
  const model = JSON.parse(modelJson) as TrainedModel;

  console.log(`[ModelStorage] Loaded model from ${modelPath}`);
  console.log(`[ModelStorage] Model type: ${model.modelType}`);
  console.log(`[ModelStorage] Trained: ${model.trainedAt}`);
  console.log(`[ModelStorage] Test accuracy: ${(model.backtestMetrics.accuracy * 100).toFixed(2)}%`);
  console.log(`[ModelStorage] ROI: ${(model.backtestMetrics.roi * 100).toFixed(2)}%`);

  return model;
}

/**
 * Find the latest model file for a sport
 */
export function findLatestModel(
  sport: string,
  market: string,
  modelsDir: string
): string | null {
  if (!fs.existsSync(modelsDir)) {
    return null;
  }

  const files = fs.readdirSync(modelsDir);
  const modelFiles = files.filter(
    (f) =>
      f.startsWith(`${sport}_${market}_`) &&
      f.endsWith('.json')
  );

  if (modelFiles.length === 0) {
    return null;
  }

  // Sort by filename (assumes YYYYMMDD format in filename)
  modelFiles.sort().reverse();

  return path.join(modelsDir, modelFiles[0]);
}

/**
 * Generate model filename based on config and date
 */
export function generateModelFilename(
  sport: string,
  market: string,
  date?: Date
): string {
  const d = date || new Date();
  const dateStr = d.toISOString().split('T')[0].replace(/-/g, '');
  return `${sport}_${market}_${dateStr}.json`;
}

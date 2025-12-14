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
  featureMeans: Record<string, number>,
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
    // The theta might already be a 2D array or need conversion
    let thetaArray;
    if (logreg.theta && typeof logreg.theta.to2DArray === 'function') {
      thetaArray = logreg.theta.to2DArray();
    } else if (Array.isArray(logreg.theta)) {
      thetaArray = logreg.theta;
    } else {
      // Fallback: extract from object
      thetaArray = [[0]]; // Placeholder
    }
    
    modelParams = {
      type: 'logistic_regression',
      theta: thetaArray,
      learningRate: logreg.options?.learningRate || 5e-3,
      numSteps: logreg.options?.numSteps || 1000,
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

  const trainedModel: TrainedModel = {
    sport: config.sport,
    market: config.market,
    modelType: model.modelType,
    trainedAt: new Date().toISOString(),
    seasons: config.seasons,
    features: config.features,
    rollingWindows: config.rolling_windows,
    featureKeys: model.featureKeys,
    featureMeans,
    modelParams,
    thresholds,
    backtestMetrics,
    recencyWeighting: config.recency_weighting,
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

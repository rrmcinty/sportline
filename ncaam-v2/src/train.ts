/**
 * Model training for NCAAM moneyline predictions
 * Simple logistic regression with L2 regularization
 */

import type { Database } from 'better-sqlite3';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { computeFeatures, featuresToVector, getFeatureNames, getOutcomes } from './features.js';

/**
 * Sigmoid activation function
 */
function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

/**
 * Dot product
 */
function dot(a: number[], b: number[]): number {
  return a.reduce((sum, val, i) => sum + val * b[i], 0);
}

/**
 * Train logistic regression with gradient descent + L2 regularization
 */
function trainLogisticRegression(
  X: number[][],
  y: number[],
  learningRate: number = 0.01,
  iterations: number = 1000,
  lambda: number = 0.1
): number[] {
  const numFeatures = X[0].length;
  const weights = new Array(numFeatures).fill(0);
  const n = X.length;
  
  for (let iter = 0; iter < iterations; iter++) {
    const gradient = new Array(numFeatures).fill(0);
    
    // Compute gradient
    for (let i = 0; i < n; i++) {
      const prediction = sigmoid(dot(X[i], weights));
      const error = prediction - y[i];
      
      for (let j = 0; j < numFeatures; j++) {
        gradient[j] += error * X[i][j];
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
 * Compute Expected Calibration Error (ECE)
 * Measures how well predicted probabilities match actual frequencies
 */
function computeECE(predictions: number[], labels: number[], numBins: number = 10): number {
  const bins: Array<{ predictions: number[]; labels: number[] }> = Array(numBins).fill(null).map(() => ({ predictions: [], labels: [] }));
  
  // Assign predictions to bins
  for (let i = 0; i < predictions.length; i++) {
    const binIdx = Math.min(Math.floor(predictions[i] * numBins), numBins - 1);
    bins[binIdx].predictions.push(predictions[i]);
    bins[binIdx].labels.push(labels[i]);
  }
  
  // Compute ECE
  let ece = 0;
  const totalSamples = predictions.length;
  
  for (const bin of bins) {
    if (bin.predictions.length === 0) continue;
    
    const avgPrediction = bin.predictions.reduce((a, b) => a + b, 0) / bin.predictions.length;
    const avgLabel = bin.labels.reduce((a, b) => a + b, 0) / bin.labels.length;
    const binWeight = bin.predictions.length / totalSamples;
    
    ece += binWeight * Math.abs(avgPrediction - avgLabel);
  }
  
  return ece;
}

/**
 * Train NCAAM moneyline model
 */
export async function trainModel(
  db: Database,
  seasons: number[],
  outputDir: string = './models/moneyline'
): Promise<void> {
  console.log(`\n🏀 Training NCAAM moneyline model for seasons ${seasons.join(', ')}...\n`);
  
  // Compute features
  console.log('Computing features...');
  const allFeatures = computeFeatures(db, seasons);
  console.log(`✓ Computed features for ${allFeatures.length} games\n`);
  
  if (allFeatures.length < 100) {
    console.error('❌ Not enough games with features (<100). Need more data.');
    return;
  }
  
  // Split into base (no market) and market-aware features
  const baseX = allFeatures.map(f => featuresToVector(f, false));
  const marketX = allFeatures.filter(f => f.marketImpliedProb !== undefined).map(f => featuresToVector(f, true));
  const gameIds = allFeatures.map(f => f.gameId);
  const marketGameIds = allFeatures.filter(f => f.marketImpliedProb !== undefined).map(f => f.gameId);
  
  // Get outcomes
  const baseY = getOutcomes(db, gameIds);
  const marketY = getOutcomes(db, marketGameIds);
  
  console.log(`Training samples: ${baseX.length} (base), ${marketX.length} (market-aware)\n`);
  
  // Temporal split: 70% train, 30% validate
  const baseSplitIdx = Math.floor(baseX.length * 0.7);
  const marketSplitIdx = Math.floor(marketX.length * 0.7);
  
  const baseXtrain = baseX.slice(0, baseSplitIdx);
  const baseYtrain = baseY.slice(0, baseSplitIdx);
  const baseXval = baseX.slice(baseSplitIdx);
  const baseYval = baseY.slice(baseSplitIdx);
  
  const marketXtrain = marketX.slice(0, marketSplitIdx);
  const marketYtrain = marketY.slice(0, marketSplitIdx);
  const marketXval = marketX.slice(marketSplitIdx);
  const marketYval = marketY.slice(marketSplitIdx);
  
  console.log(`Split: ${baseXtrain.length} train, ${baseXval.length} validation\n`);
  
  // Train base model
  console.log('Training base model (no market data)...');
  const baseWeights = trainLogisticRegression(baseXtrain, baseYtrain, 0.01, 1000, 0.1);
  
  // Validate base model
  const basePreds = baseXval.map(x => sigmoid(dot(x, baseWeights)));
  const baseAcc = basePreds.filter((p, i) => (p > 0.5 ? 1 : 0) === baseYval[i]).length / basePreds.length;
  const baseECE = computeECE(basePreds, baseYval);
  
  console.log(`✓ Base model: ${(baseAcc * 100).toFixed(1)}% accuracy, ${(baseECE * 100).toFixed(2)}% ECE\n`);
  
  // Train market-aware model
  console.log('Training market-aware model...');
  const marketWeights = trainLogisticRegression(marketXtrain, marketYtrain, 0.01, 1000, 0.1);
  
  // Validate market-aware model
  const marketPreds = marketXval.map(x => sigmoid(dot(x, marketWeights)));
  const marketAcc = marketPreds.filter((p, i) => (p > 0.5 ? 1 : 0) === marketYval[i]).length / marketPreds.length;
  const marketECE = computeECE(marketPreds, marketYval);
  
  console.log(`✓ Market-aware model: ${(marketAcc * 100).toFixed(1)}% accuracy, ${(marketECE * 100).toFixed(2)}% ECE\n`);
  
  // Compute ensemble (70% base, 30% market)
  const ensemblePreds = basePreds.slice(0, Math.min(basePreds.length, marketPreds.length)).map((base, i) => {
    if (i >= marketPreds.length) return base;
    return 0.7 * base + 0.3 * marketPreds[i];
  });
  const ensembleLabels = baseYval.slice(0, ensemblePreds.length);
  const ensembleAcc = ensemblePreds.filter((p, i) => (p > 0.5 ? 1 : 0) === ensembleLabels[i]).length / ensemblePreds.length;
  const ensembleECE = computeECE(ensemblePreds, ensembleLabels);
  
  console.log(`✓ Ensemble (70/30): ${(ensembleAcc * 100).toFixed(1)}% accuracy, ${(ensembleECE * 100).toFixed(2)}% ECE\n`);
  
  // Check if model meets minimum requirements
  if (ensembleECE > 0.10) {
    console.warn(`⚠️  WARNING: ECE ${(ensembleECE * 100).toFixed(2)}% exceeds 10% threshold`);
    console.warn(`   Model may not be well-calibrated. Consider collecting more data or adjusting features.\n`);
  }
  
  // Save models
  mkdirSync(outputDir, { recursive: true });
  const version = `v2.0_${new Date().toISOString().split('T')[0]}`;
  
  const baseModel = {
    version,
    type: 'base',
    weights: baseWeights,
    features: getFeatureNames(false),
    seasons,
    trainedAt: new Date().toISOString()
  };
  
  const marketModel = {
    version,
    type: 'market',
    weights: marketWeights,
    features: getFeatureNames(true),
    seasons,
    trainedAt: new Date().toISOString()
  };
  
  const ensemble = {
    version,
    type: 'ensemble',
    baseWeight: 0.7,
    marketWeight: 0.3,
    seasons,
    trainedAt: new Date().toISOString()
  };
  
  const metrics = {
    version,
    baseAccuracy: baseAcc,
    baseECE,
    marketAccuracy: marketAcc,
    marketECE,
    ensembleAccuracy: ensembleAcc,
    ensembleECE,
    trainSamples: baseXtrain.length,
    valSamples: baseXval.length
  };
  
  writeFileSync(join(outputDir, 'base_model.json'), JSON.stringify(baseModel, null, 2));
  writeFileSync(join(outputDir, 'market_model.json'), JSON.stringify(marketModel, null, 2));
  writeFileSync(join(outputDir, 'ensemble.json'), JSON.stringify(ensemble, null, 2));
  writeFileSync(join(outputDir, 'metrics.json'), JSON.stringify(metrics, null, 2));
  
  console.log(`✅ Models saved to ${outputDir}\n`);
  console.log(`📊 Next step: Run backtest to validate ROI before production use`);
}

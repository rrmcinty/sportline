/**
 * Training pipeline for NFL spread models
 */

import chalk from "chalk";
import type Database from "better-sqlite3";
import { getDb } from "../../db/index.js";
import { computeNFLSpreadFeatures, filterSpreadGames } from "./nfl-spread-features.js";
import type { NFLSpreadModel, NFLSpreadGameFeatures } from "./types.js";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { existsSync } from "fs";

/**
 * Simple logistic regression
 */
function trainLogisticRegression(
  features: number[][],
  labels: number[],
  learningRate: number = 0.01,
  iterations: number = 1000,
  lambda: number = 0.5,
  sampleWeights?: number[]
): number[] {
  const numFeatures = features[0].length;
  const weights = new Array(numFeatures).fill(0);
  const n = features.length;
  const useWeights = Array.isArray(sampleWeights) && sampleWeights.length === n;
  const weightSum = useWeights ? (sampleWeights as number[]).reduce((a, b) => a + b, 0) : n;

  for (let iter = 0; iter < iterations; iter++) {
    const gradient = new Array(numFeatures).fill(0);

    for (let i = 0; i < n; i++) {
      const x = features[i];
      const y = labels[i];
      const prediction = sigmoid(dot(x, weights));
      const error = prediction - y;
      const w = useWeights ? (sampleWeights as number[])[i] : 1;

      for (let j = 0; j < numFeatures; j++) {
        gradient[j] += w * error * x[j];
      }
    }

    for (let j = 0; j < numFeatures; j++) {
      weights[j] -= (learningRate / weightSum) * (gradient[j] + lambda * weights[j]);
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
 * Isotonic regression calibration
 */
function isotonicCalibration(predictions: number[], actuals: number[]): (p: number) => number {
  if (predictions.length === 0) return (p: number) => p;
  
  const pairs = predictions.map((pred, i) => ({ pred, actual: actuals[i] }));
  pairs.sort((a, b) => a.pred - b.pred);
  
  const binSize = Math.max(10, Math.floor(pairs.length / 20));
  const calibrationMap: Array<{ predRange: [number, number]; calibratedProb: number }> = [];
  
  for (let i = 0; i < pairs.length; i += binSize) {
    const bin = pairs.slice(i, i + binSize);
    const minPred = bin[0].pred;
    const maxPred = bin[bin.length - 1].pred;
    const avgActual = bin.reduce((sum, p) => sum + p.actual, 0) / bin.length;
    calibrationMap.push({ predRange: [minPred, maxPred], calibratedProb: avgActual });
  }
  
  return (p: number) => {
    for (const entry of calibrationMap) {
      if (p >= entry.predRange[0] && p <= entry.predRange[1]) {
        return entry.calibratedProb;
      }
    }
    return p;
  };
}

/**
 * Extract feature vector for home team covering spread
 */
function extractSpreadFeatures(game: NFLSpreadGameFeatures, includeMarket: boolean): number[] {
  const features = [
    // Home team features (5-game window)
    game.homeWinRate5,
    game.homeAvgMargin5,
    game.homeOppWinRate5,
    game.homeOppAvgMargin5,
    game.homePointsAvg5,
    game.homeOppPointsAvg5,
    game.homePace5,
    game.homeOffEff5,
    game.homeDefEff5,
    
    // Away team features (5-game window)
    game.awayWinRate5,
    game.awayAvgMargin5,
    game.awayOppWinRate5,
    game.awayOppAvgMargin5,
    game.awayPointsAvg5,
    game.awayOppPointsAvg5,
    game.awayPace5,
    game.awayOffEff5,
    game.awayDefEff5,
    
    // Home team features (10-game window)
    game.homeWinRate10,
    game.homeAvgMargin10,
    game.homeOppWinRate10,
    game.homeOppAvgMargin10,
    game.homePointsAvg10,
    game.homeOppPointsAvg10,
    game.homePace10,
    game.homeOffEff10,
    game.homeDefEff10,
    
    // Away team features (10-game window)
    game.awayWinRate10,
    game.awayAvgMargin10,
    game.awayOppWinRate10,
    game.awayOppAvgMargin10,
    game.awayPointsAvg10,
    game.awayOppPointsAvg10,
    game.awayPace10,
    game.awayOffEff10,
    game.awayDefEff10,
    
    // Spread-specific features
    game.homeATSRecord5,
    game.awayATSRecord5,
    game.homeATSRecord10,
    game.awayATSRecord10,
    game.homeATSMargin5,
    game.awayATSMargin5,
    game.homeATSMargin10,
    game.awayATSMargin10,
    game.spreadSize,
    game.isTightSpread,
    game.marketOverreaction,
    game.homeAdvantage,
  ];
  
  if (includeMarket) {
    features.push(game.spreadMarketImpliedProb || 0.5);
  }
  
  return features;
}

/**
 * Get feature names
 */
function getFeatureNames(includeMarket: boolean): string[] {
  const names = [
    "homeWinRate5", "homeAvgMargin5", "homeOppWinRate5", "homeOppAvgMargin5",
    "homePointsAvg5", "homeOppPointsAvg5", "homePace5", "homeOffEff5", "homeDefEff5",
    "awayWinRate5", "awayAvgMargin5", "awayOppWinRate5", "awayOppAvgMargin5",
    "awayPointsAvg5", "awayOppPointsAvg5", "awayPace5", "awayOffEff5", "awayDefEff5",
    "homeWinRate10", "homeAvgMargin10", "homeOppWinRate10", "homeOppAvgMargin10",
    "homePointsAvg10", "homeOppPointsAvg10", "homePace10", "homeOffEff10", "homeDefEff10",
    "awayWinRate10", "awayAvgMargin10", "awayOppWinRate10", "awayOppAvgMargin10",
    "awayPointsAvg10", "awayOppPointsAvg10", "awayPace10", "awayOffEff10", "awayDefEff10",
    "homeATSRecord5", "awayATSRecord5", "homeATSRecord10", "awayATSRecord10",
    "homeATSMargin5", "awayATSMargin5", "homeATSMargin10", "awayATSMargin10",
    "spreadSize", "isTightSpread", "marketOverreaction", "homeAdvantage"
  ];
  
  if (includeMarket) {
    names.push("spreadMarketImpliedProb");
  }
  
  return names;
}

/**
 * Train NFL spread model
 */
export async function trainNFLSpreadModel(
  seasons: number[],
  learningRate: number = 0.005,
  iterations: number = 800,
  lambda: number = 1.0
): Promise<void> {
  console.log(chalk.bold.cyan(`\n🏈 Training NFL SPREAD MODEL for seasons ${seasons.join(", ")}...\n`));
  console.log(chalk.dim(`   Approach: Base + market-aware ensemble with isotonic calibration\n`));
  
  const db = getDb();
  
  // Compute features
  console.log("Computing spread features...");
  const allFeatures = computeNFLSpreadFeatures(db, seasons);
  const spreadGames = filterSpreadGames(allFeatures);
  console.log(`Computed features for ${allFeatures.length} total games`);
  console.log(`Filtered to ${spreadGames.length} games with spreads\n`);
  
  // Filter to completed games with outcomes
  const completedGames = spreadGames.filter(g => {
    const game = db.prepare(`
      SELECT home_score, away_score
      FROM games
      WHERE id = ?
    `).get(g.gameId) as { home_score: number | null; away_score: number | null } | undefined;
    
    return game && game.home_score !== null && game.away_score !== null;
  });
  
  console.log(`Games with outcomes: ${completedGames.length}\n`);
  
  if (completedGames.length < 100) {
    console.log(chalk.yellow(`⚠️  Insufficient data (${completedGames.length} games). Need at least 100 completed games.`));
    return;
  }
  
  // Temporal split: 70% train, 30% validation
  const splitIndex = Math.floor(completedGames.length * 0.7);
  const trainGames = completedGames.slice(0, splitIndex);
  const valGames = completedGames.slice(splitIndex);
  
  console.log(`Train set: ${trainGames.length} games`);
  console.log(`Validation set: ${valGames.length} games\n`);
  
  // Extract labels (home team covers spread = 1, away covers = 0, push excluded for simplicity)
  const getLabel = (game: NFLSpreadGameFeatures): number | null => {
    const g = db.prepare(`
      SELECT home_score, away_score
      FROM games
      WHERE id = ?
    `).get(game.gameId) as { home_score: number; away_score: number } | undefined;
    
    if (!g || game.spreadLine === null) return null;
    
    const actualMargin = g.home_score - g.away_score;
    const marginVsSpread = actualMargin + game.spreadLine;  // If home is -7 and wins by 10, margin is +3
    
    if (Math.abs(marginVsSpread) < 0.5) return null;  // Push
    return marginVsSpread > 0 ? 1 : 0;
  };
  
  const trainLabels = trainGames.map(getLabel).filter((l): l is number => l !== null);
  const trainFeats = trainGames.filter((_, i) => getLabel(trainGames[i]) !== null);
  
  const valLabels = valGames.map(getLabel).filter((l): l is number => l !== null);
  const valFeats = valGames.filter((_, i) => getLabel(valGames[i]) !== null);
  
  // Train BASE model (no market feature)
  console.log("Training BASE model (no market feature)...");
  const trainX_base = trainFeats.map(g => extractSpreadFeatures(g, false));
  const baseWeights = trainLogisticRegression(trainX_base, trainLabels, learningRate, iterations, lambda);
  console.log(chalk.green("✓ Base model trained\n"));
  
  // Train MARKET-AWARE model
  console.log("Training MARKET-AWARE model...");
  const trainX_market = trainFeats.map(g => extractSpreadFeatures(g, true));
  const marketWeights = trainLogisticRegression(trainX_market, trainLabels, learningRate, iterations, lambda);
  console.log(chalk.green("✓ Market-aware model trained\n"));
  
  // Validate ensemble (50% base + 50% market-aware)
  console.log("Validating ensemble (50% base + 50% market-aware)...\n");
  
  const valX_base = valFeats.map(g => extractSpreadFeatures(g, false));
  const valX_market = valFeats.map(g => extractSpreadFeatures(g, true));
  
  const basePreds = valX_base.map(x => sigmoid(dot(x, baseWeights)));
  const marketPreds = valX_market.map(x => sigmoid(dot(x, marketWeights)));
  const ensemblePreds = basePreds.map((bp, i) => 0.5 * bp + 0.5 * marketPreds[i]);
  
  // Apply isotonic calibration if we have enough validation data
  let calibratedPreds = ensemblePreds;
  if (valLabels.length >= 400) {
    console.log(chalk.dim("Applying isotonic calibration...\n"));
    const calibrator = isotonicCalibration(ensemblePreds, valLabels);
    calibratedPreds = ensemblePreds.map(calibrator);
  } else {
    console.log(chalk.yellow(`⚠️  Skipping calibration (need ≥400 validation samples, have ${valLabels.length})\n`));
  }
  
  // Compute metrics
  const accuracy = calibratedPreds.filter((p, i) => (p >= 0.5 ? 1 : 0) === valLabels[i]).length / valLabels.length;
  const brier = calibratedPreds.reduce((sum, p, i) => sum + Math.pow(p - valLabels[i], 2), 0) / valLabels.length;
  const logLoss = -calibratedPreds.reduce((sum, p, i) => {
    const clipped = Math.max(1e-15, Math.min(1 - 1e-15, p));
    return sum + valLabels[i] * Math.log(clipped) + (1 - valLabels[i]) * Math.log(1 - clipped);
  }, 0) / valLabels.length;
  const ece = calculateECE(calibratedPreds, valLabels, 10);
  
  // Simulate betting with -110 odds
  let profit = 0;
  for (let i = 0; i < calibratedPreds.length; i++) {
    const outcome = valLabels[i];
    const stake = 10;
    if (outcome === 1) {
      profit += stake * (100 / 110);  // Win $10 to win $9.09
    } else {
      profit -= stake;
    }
  }
  const roi = (profit / (valLabels.length * 10)) * 100;
  
  console.log(chalk.bold("✅ Validation Results:"));
  console.log(`   Accuracy: ${(accuracy * 100).toFixed(1)}%`);
  console.log(`   Brier Score: ${brier.toFixed(4)}`);
  console.log(`   Log Loss: ${logLoss.toFixed(4)}`);
  console.log(`   ECE: ${(ece * 100).toFixed(2)}%`);
  console.log(`   ROI: ${roi >= 0 ? '+' : ''}${roi.toFixed(2)}%`);
  console.log(`   Total Profit: $${profit >= 0 ? '+' : ''}${profit.toFixed(2)}\n`);
  
  // Save model
  const timestamp = Date.now();
  const modelDir = join(process.cwd(), "models", "nfl-spread");
  if (!existsSync(modelDir)) {
    mkdirSync(modelDir, { recursive: true });
  }
  
  const baseModel: NFLSpreadModel = {
    weights: baseWeights,
    featureNames: getFeatureNames(false),
    seasons,
    timestamp: new Date().toISOString(),
    metrics: { accuracy, roi, ece, brier, logLoss, sampleSize: valLabels.length }
  };
  
  const marketModel: NFLSpreadModel = {
    weights: marketWeights,
    featureNames: getFeatureNames(true),
    seasons,
    timestamp: new Date().toISOString(),
    metrics: { accuracy, roi, ece, brier, logLoss, sampleSize: valLabels.length }
  };
  
  const modelPath = join(modelDir, `nfl_spread_${seasons.join('-')}_${timestamp}`);
  mkdirSync(modelPath, { recursive: true });
  
  writeFileSync(join(modelPath, "base_model.json"), JSON.stringify(baseModel, null, 2));
  writeFileSync(join(modelPath, "market_model.json"), JSON.stringify(marketModel, null, 2));
  
  console.log(chalk.green(`✓ Model saved to: ${modelPath}\n`));
}

/**
 * Calculate Expected Calibration Error (ECE)
 */
function calculateECE(predictions: number[], actuals: number[], numBins: number = 10): number {
  const bins: Array<{ predictions: number[]; actuals: number[] }> = Array.from(
    { length: numBins },
    () => ({ predictions: [], actuals: [] })
  );
  
  for (let i = 0; i < predictions.length; i++) {
    const binIndex = Math.min(Math.floor(predictions[i] * numBins), numBins - 1);
    bins[binIndex].predictions.push(predictions[i]);
    bins[binIndex].actuals.push(actuals[i]);
  }
  
  let ece = 0;
  const totalSamples = predictions.length;
  
  for (const bin of bins) {
    if (bin.predictions.length === 0) continue;
    
    const avgPred = bin.predictions.reduce((a, b) => a + b, 0) / bin.predictions.length;
    const avgActual = bin.actuals.reduce((a, b) => a + b, 0) / bin.actuals.length;
    const binWeight = bin.predictions.length / totalSamples;
    
    ece += binWeight * Math.abs(avgPred - avgActual);
  }
  
  return ece;
}

/**
 * Training pipeline for underdog-specific models
 */

import chalk from "chalk";
import type Database from "better-sqlite3";
import { getDb } from "../db/index.js";
import { computeUnderdogFeatures, filterUnderdogGames } from "./underdog-features.js";
import type { UnderdogTier, UnderdogModel, UnderdogGameFeatures } from "./types.js";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { existsSync } from "fs";

/**
 * Simple logistic regression with class balancing
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
 * Compute exponential-decay recency weights (more recent games weighted higher)
 */
function computeRecencyWeights(dates: string[], halfLifeDays: number = 120): number[] {
  if (!dates.length) return [];
  const msPerDay = 24 * 60 * 60 * 1000;
  const times = dates.map(d => new Date(d).getTime());
  const maxT = Math.max(...times);
  const hlMs = halfLifeDays * msPerDay;
  const ln2 = Math.log(2);
  const weights = times.map(t => Math.exp(-ln2 * (maxT - t) / hlMs));
  return weights;
}

/**
 * Compute class-balanced weights (oversample underdog wins)
 */
function computeClassBalancedWeights(labels: number[], tier: UnderdogTier): number[] {
  const numWins = labels.filter(l => l === 1).length;
  const numLosses = labels.length - numWins;
  
  // Oversample wins more aggressively for rarer tiers
  let winMultiplier = 2.0;  // Default for moderate dogs
  if (tier === "heavy") winMultiplier = 3.0;
  if (tier === "extreme") winMultiplier = 5.0;
  
  const winWeight = (numLosses / numWins) * winMultiplier;
  const lossWeight = 1.0;
  
  return labels.map(l => l === 1 ? winWeight : lossWeight);
}

/**
 * Extract feature vector for underdog team
 */
function extractUnderdogFeatures(game: UnderdogGameFeatures, includeMarket: boolean): number[] {
  const isHomeUnderdog = game.underdogTeam === "home";
  
  // Core features (team performance)
  const features = [
    // 5-game window
    isHomeUnderdog ? game.homeWinRate5 : game.awayWinRate5,
    isHomeUnderdog ? game.awayWinRate5 : game.homeWinRate5,  // Opponent win rate
    isHomeUnderdog ? game.homeAvgMargin5 : game.awayAvgMargin5,
    isHomeUnderdog ? game.awayAvgMargin5 : game.homeAvgMargin5,  // Opponent margin
    isHomeUnderdog ? game.homeOppWinRate5 : game.awayOppWinRate5,  // SoS
    isHomeUnderdog ? game.homeOppAvgMargin5 : game.awayOppAvgMargin5,
    isHomeUnderdog ? game.homePointsAvg5 : game.awayPointsAvg5,
    isHomeUnderdog ? game.awayPointsAvg5 : game.homePointsAvg5,  // Opponent points
    isHomeUnderdog ? game.homePace5 : game.awayPace5,
    isHomeUnderdog ? game.awayPace5 : game.homePace5,
    
    // 10-game window
    isHomeUnderdog ? game.homeWinRate10 : game.awayWinRate10,
    isHomeUnderdog ? game.awayWinRate10 : game.homeWinRate10,
    isHomeUnderdog ? game.homeAvgMargin10 : game.awayAvgMargin10,
    isHomeUnderdog ? game.awayAvgMargin10 : game.homeAvgMargin10,
    isHomeUnderdog ? game.homeOppWinRate10 : game.awayOppWinRate10,
    isHomeUnderdog ? game.homeOppAvgMargin10 : game.awayOppAvgMargin10,
    isHomeUnderdog ? game.homePointsAvg10 : game.awayPointsAvg10,
    isHomeUnderdog ? game.awayPointsAvg10 : game.homePointsAvg10,
    isHomeUnderdog ? game.homePace10 : game.awayPace10,
    isHomeUnderdog ? game.awayPace10 : game.homePace10,
    
    // Underdog-specific features
    isHomeUnderdog ? game.homeUpsetRate5 : game.awayUpsetRate5,
    isHomeUnderdog ? game.homeUpsetRate10 : game.awayUpsetRate10,
    game.homeDogAdvantage,
    game.paceDifferential,
    game.confStrengthDiff,
    game.recentDogTrend5,
    game.recentDogTrend10,
    game.marketOverreaction,
    isHomeUnderdog ? 1 : 0,  // Home underdog indicator
  ];
  
  // Optionally add market feature
  if (includeMarket) {
    const underdogMarketProb = isHomeUnderdog 
      ? game.marketImpliedProb 
      : (1 - game.marketImpliedProb);
    features.push(underdogMarketProb);
  }
  
  return features;
}

/**
 * Get feature names for model artifacts
 */
function getFeatureNames(includeMarket: boolean): string[] {
  const names = [
    "underdogWinRate5",
    "favoriteWinRate5",
    "underdogAvgMargin5",
    "favoriteAvgMargin5",
    "underdogOppWinRate5",
    "underdogOppAvgMargin5",
    "underdogPointsAvg5",
    "favoritePointsAvg5",
    "underdogPace5",
    "favoritePace5",
    "underdogWinRate10",
    "favoriteWinRate10",
    "underdogAvgMargin10",
    "favoriteAvgMargin10",
    "underdogOppWinRate10",
    "underdogOppAvgMargin10",
    "underdogPointsAvg10",
    "favoritePointsAvg10",
    "underdogPace10",
    "favoritePace10",
    "upsetRate5",
    "upsetRate10",
    "homeDogAdvantage",
    "paceDifferential",
    "confStrengthDiff",
    "recentDogTrend5",
    "recentDogTrend10",
    "marketOverreaction",
    "isHomeUnderdog",
  ];
  
  if (includeMarket) {
    names.push("underdogMarketImpliedProb");
  }
  
  return names;
}

/**
 * Train underdog model for specific tier(s)
 */
export async function trainUnderdogModel(
  sport: "ncaam" | "cfb" | "nfl" | "nba" | "nhl",
  seasons: number[],
  tiers: UnderdogTier[]
): Promise<void> {
  console.log(chalk.bold.cyan(`\n🐕 Training UNDERDOG MODEL for ${sport.toUpperCase()}...\n`));
  console.log(chalk.dim(`   Seasons: ${seasons.join(", ")}`));
  console.log(chalk.dim(`   Tiers: ${tiers.join(", ")}`));
  console.log(chalk.dim(`   Approach: 50/50 ensemble (base + market-aware) with class balancing\n`));
  
  const db = getDb();
  
  // Compute underdog-specific features
  console.log(chalk.dim("Computing underdog features..."));
  const allFeatures = computeUnderdogFeatures(db, sport, seasons);
  console.log(chalk.dim(`Computed features for ${allFeatures.length} total games\n`));
  
  // Filter to underdog games only
  const underdogGames = filterUnderdogGames(allFeatures, tiers);
  console.log(chalk.dim(`Filtered to ${underdogGames.length} underdog games (${tiers.join(", ")})\n`));
  
  if (underdogGames.length < 50) {
    console.log(chalk.red(`❌ Not enough underdog games (need at least 50, found ${underdogGames.length})`));
    return;
  }
  
  // Get outcomes for underdog games
  const gamesWithOutcomes = underdogGames.filter(g => {
    const game = db.prepare(`
      SELECT home_score, away_score
      FROM games
      WHERE id = ?
    `).get(g.gameId) as { home_score: number | null; away_score: number | null } | undefined;
    
    return game && game.home_score !== null && game.away_score !== null;
  });
  
  console.log(chalk.dim(`Games with outcomes: ${gamesWithOutcomes.length}\n`));
  
  // Build training/validation data
  const outcomes = gamesWithOutcomes.map(g => {
    const game = db.prepare(`
      SELECT home_score, away_score
      FROM games
      WHERE id = ?
    `).get(g.gameId) as { home_score: number; away_score: number };
    
    const isHomeUnderdog = g.underdogTeam === "home";
    const underdogWon = isHomeUnderdog 
      ? game.home_score > game.away_score
      : game.away_score > game.home_score;
    
    return underdogWon ? 1 : 0;
  });
  
  // Temporal split (70% train, 30% validation)
  const sortedIndices = gamesWithOutcomes
    .map((g, idx) => ({ date: g.date, idx }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(x => x.idx);
  
  const splitIdx = Math.floor(sortedIndices.length * 0.7);
  const trainIndices = sortedIndices.slice(0, splitIdx);
  const valIndices = sortedIndices.slice(splitIdx);
  
  console.log(chalk.dim(`Train set: ${trainIndices.length} games`));
  console.log(chalk.dim(`Validation set: ${valIndices.length} games\n`));
  
  // Train ensemble: base model + market-aware model
  console.log(chalk.bold.blue("Training BASE model (no market feature)..."));
  const baseFeatures = trainIndices.map(i => extractUnderdogFeatures(gamesWithOutcomes[i], false));
  const baseLabels = trainIndices.map(i => outcomes[i]);
  const baseDates = trainIndices.map(i => gamesWithOutcomes[i].date);
  
  // Compute sample weights: recency * class balance
  const recencyWeights = computeRecencyWeights(baseDates, 120);
  const tier = tiers[0];  // Use first tier for class balance computation
  const classWeights = computeClassBalancedWeights(baseLabels, tier);
  const sampleWeights = recencyWeights.map((r, i) => r * classWeights[i]);
  
  const baseWeights = trainLogisticRegression(
    baseFeatures,
    baseLabels,
    0.003, // learning rate (even lower)
    600,   // iterations (reduced more)
    3.0,   // lambda (stronger regularization: 1.5 -> 3.0)
    sampleWeights
  );
  
  console.log(chalk.green("✓ Base model trained\n"));
  
  console.log(chalk.bold.blue("Training MARKET-AWARE model..."));
  const marketFeatures = trainIndices.map(i => extractUnderdogFeatures(gamesWithOutcomes[i], true));
  const marketWeights = trainLogisticRegression(
    marketFeatures,
    baseLabels,
    0.003,
    600,
    3.0,
    sampleWeights
  );
  
  console.log(chalk.green("✓ Market-aware model trained\n"));
  
  // Validate ensemble (50/50 blend for underdogs - trust model more than market)
  console.log(chalk.bold.blue("Validating ensemble (50% base + 50% market-aware)...\n"));
  
  let correct = 0;
  let totalProfit = 0;
  const predictions: number[] = [];
  const actuals: number[] = [];
  
  for (const i of valIndices) {
    const game = gamesWithOutcomes[i];
    const baseFeatureVec = extractUnderdogFeatures(game, false);
    const marketFeatureVec = extractUnderdogFeatures(game, true);
    
    const baseProb = sigmoid(dot(baseFeatureVec, baseWeights));
    const marketProb = sigmoid(dot(marketFeatureVec, marketWeights));
    const ensembleProb = 0.5 * baseProb + 0.5 * marketProb;  // 50/50 for underdogs
    
    predictions.push(ensembleProb);
    actuals.push(outcomes[i]);
    
    if (ensembleProb > 0.5 && outcomes[i] === 1) correct++;
    if (ensembleProb <= 0.5 && outcomes[i] === 0) correct++;
    
    // Calculate profit (American odds)
    const underdogMarketProb = game.underdogTeam === "home"
      ? game.marketImpliedProb
      : (1 - game.marketImpliedProb);
    const odds = underdogMarketProb > 0 
      ? Math.round((1 / underdogMarketProb - 1) * 100)
      : 100;
    
    if (ensembleProb > underdogMarketProb + 0.03) {  // 3% edge threshold
      const betAmount = 10;
      if (outcomes[i] === 1) {
        totalProfit += betAmount * (odds / 100);
      } else {
        totalProfit -= betAmount;
      }
    }
  }
  
  const accuracy = (correct / valIndices.length * 100).toFixed(1);
  const winRate = actuals.filter(a => a === 1).length / actuals.length;
  const roi = (totalProfit / (valIndices.length * 10) * 100).toFixed(2);
  
  // Calculate ECE
  const ece = calculateECE(predictions, actuals);
  
  console.log(chalk.bold.green(`\n✅ Validation Results:`));
  console.log(chalk.dim(`   Accuracy: ${accuracy}%`));
  console.log(chalk.dim(`   Underdog Win Rate: ${(winRate * 100).toFixed(1)}%`));
  console.log(chalk.dim(`   Total Profit: $${totalProfit.toFixed(2)}`));
  console.log(chalk.dim(`   ROI: ${roi}%`));
  console.log(chalk.dim(`   ECE: ${ece.toFixed(2)}%\n`));
  
  // Save model artifacts
  const timestamp = Date.now();
  const modelDir = join(process.cwd(), "models", `underdog-${sport}`, `underdog_${tiers.join("-")}_${seasons.join("-")}_${timestamp}`);
  
  if (!existsSync(modelDir)) {
    mkdirSync(modelDir, { recursive: true });
  }
  
  const baseModel: UnderdogModel = {
    weights: baseWeights,
    featureNames: getFeatureNames(false),
    tier: tier,
    sport,
    seasons,
    timestamp: new Date().toISOString(),
    metrics: {
      roi: parseFloat(roi),
      ece: ece,
      winRate: winRate,
      sampleSize: valIndices.length
    }
  };
  
  const marketModel: UnderdogModel = {
    weights: marketWeights,
    featureNames: getFeatureNames(true),
    tier: tier,
    sport,
    seasons,
    timestamp: new Date().toISOString(),
    metrics: {
      roi: parseFloat(roi),
      ece: ece,
      winRate: winRate,
      sampleSize: valIndices.length
    }
  };
  
  writeFileSync(join(modelDir, "base-model.json"), JSON.stringify(baseModel, null, 2));
  writeFileSync(join(modelDir, "market-aware-model.json"), JSON.stringify(marketModel, null, 2));
  
  const metadata = {
    sport,
    seasons,
    tiers,
    ensembleWeight: { base: 0.5, marketAware: 0.5 },
    trainSize: trainIndices.length,
    valSize: valIndices.length,
    timestamp: new Date().toISOString()
  };
  
  writeFileSync(join(modelDir, "ensemble-metadata.json"), JSON.stringify(metadata, null, 2));
  
  console.log(chalk.green(`✓ Model saved to: ${modelDir}\n`));
}

/**
 * Calculate Expected Calibration Error
 */
function calculateECE(predictions: number[], actuals: number[], numBins: number = 10): number {
  const bins: Array<{ predicted: number[]; actual: number[] }> = Array.from({ length: numBins }, () => ({
    predicted: [],
    actual: []
  }));
  
  for (let i = 0; i < predictions.length; i++) {
    const binIdx = Math.min(Math.floor(predictions[i] * numBins), numBins - 1);
    bins[binIdx].predicted.push(predictions[i]);
    bins[binIdx].actual.push(actuals[i]);
  }
  
  let totalError = 0;
  let totalCount = 0;
  
  for (const bin of bins) {
    if (bin.predicted.length === 0) continue;
    
    const avgPredicted = bin.predicted.reduce((a, b) => a + b, 0) / bin.predicted.length;
    const avgActual = bin.actual.reduce((a, b) => a + b, 0) / bin.actual.length;
    
    totalError += Math.abs(avgPredicted - avgActual) * bin.predicted.length;
    totalCount += bin.predicted.length;
  }
  
  return totalCount > 0 ? (totalError / totalCount) * 100 : 0;
}

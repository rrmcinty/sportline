/**
 * Backtest NFL spread model by confidence buckets
 */

import chalk from "chalk";
import type Database from "better-sqlite3";
import { getDb } from "../../db/index.js";
import {
  computeNFLSpreadFeatures,
  filterSpreadGames,
} from "./nfl-spread-features.js";
import type {
  NFLSpreadBacktestResults,
  NFLSpreadGameFeatures,
  SpreadConfidenceBucket,
} from "./types.js";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

/**
 * Sigmoid function
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
 * Extract feature vector (must match training)
 */
function extractSpreadFeatures(
  game: NFLSpreadGameFeatures,
  includeMarket: boolean,
): number[] {
  const features = [
    game.homeWinRate5,
    game.homeAvgMargin5,
    game.homeOppWinRate5,
    game.homeOppAvgMargin5,
    game.homePointsAvg5,
    game.homeOppPointsAvg5,
    game.homePace5,
    game.homeOffEff5,
    game.homeDefEff5,
    game.awayWinRate5,
    game.awayAvgMargin5,
    game.awayOppWinRate5,
    game.awayOppAvgMargin5,
    game.awayPointsAvg5,
    game.awayOppPointsAvg5,
    game.awayPace5,
    game.awayOffEff5,
    game.awayDefEff5,
    game.homeWinRate10,
    game.homeAvgMargin10,
    game.homeOppWinRate10,
    game.homeOppAvgMargin10,
    game.homePointsAvg10,
    game.homeOppPointsAvg10,
    game.homePace10,
    game.homeOffEff10,
    game.homeDefEff10,
    game.awayWinRate10,
    game.awayAvgMargin10,
    game.awayOppWinRate10,
    game.awayOppAvgMargin10,
    game.awayPointsAvg10,
    game.awayOppPointsAvg10,
    game.awayPace10,
    game.awayOffEff10,
    game.awayDefEff10,
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
 * Load latest NFL spread model
 */
function loadLatestModel(
  seasons: number[],
): { baseWeights: number[]; marketWeights: number[]; modelDir: string } | null {
  const modelsDir = join(process.cwd(), "models", "nfl-spread");

  try {
    const dirs = readdirSync(modelsDir)
      .filter((d) => {
        const fullPath = join(modelsDir, d);
        return statSync(fullPath).isDirectory();
      })
      .map((d) => ({
        name: d,
        path: join(modelsDir, d),
        timestamp: parseInt(d.split("_").pop() || "0", 10),
      }))
      .sort((a, b) => b.timestamp - a.timestamp);

    if (dirs.length === 0) return null;

    const latest = dirs[0];
    const basePath = join(latest.path, "base_model.json");
    const marketPath = join(latest.path, "market_model.json");

    const baseModel = JSON.parse(readFileSync(basePath, "utf-8"));
    const marketModel = JSON.parse(readFileSync(marketPath, "utf-8"));

    return {
      baseWeights: baseModel.weights,
      marketWeights: marketModel.weights,
      modelDir: latest.path,
    };
  } catch (err) {
    return null;
  }
}

/**
 * Get confidence bucket for a probability
 */
function getConfidenceBucket(prob: number): SpreadConfidenceBucket {
  if (prob < 0.1) return "0-10%";
  if (prob < 0.2) return "10-20%";
  if (prob < 0.3) return "20-30%";
  if (prob < 0.4) return "30-40%";
  if (prob < 0.5) return "40-50%";
  if (prob < 0.6) return "50-60%";
  if (prob < 0.7) return "60-70%";
  if (prob < 0.8) return "70-80%";
  if (prob < 0.9) return "80-90%";
  return "90-100%";
}

/**
 * Backtest NFL spread model
 */
export async function backtestNFLSpreadModel(seasons: number[]): Promise<void> {
  console.log(
    chalk.bold.cyan(
      `\n🏈 Backtesting NFL SPREAD MODEL for seasons ${seasons.join(", ")}...\n`,
    ),
  );

  const db = getDb();

  // Load model
  const model = loadLatestModel(seasons);
  if (!model) {
    console.log(
      chalk.red("❌ No trained model found. Run train command first.\n"),
    );
    return;
  }

  console.log(chalk.dim(`Loaded model from: ${model.modelDir}\n`));

  // Compute features
  console.log("Computing features...");
  const allFeatures = computeNFLSpreadFeatures(db, seasons);
  const spreadGames = filterSpreadGames(allFeatures);

  // Filter to completed games
  const completedGames = spreadGames.filter((g) => {
    const game = db
      .prepare(
        `
      SELECT home_score, away_score
      FROM games
      WHERE id = ?
    `,
      )
      .get(g.gameId) as
      | { home_score: number | null; away_score: number | null }
      | undefined;

    return game && game.home_score !== null && game.away_score !== null;
  });

  console.log(
    `Analyzing ${completedGames.length} completed games with spreads\n`,
  );

  // Get outcomes and predictions
  const results: Array<{
    game: NFLSpreadGameFeatures;
    outcome: number; // 1 = home covers, 0 = away covers, -1 = push
    prediction: number;
    bucket: SpreadConfidenceBucket;
    spreadSize: number;
  }> = [];

  for (const game of completedGames) {
    const g = db
      .prepare(
        `
      SELECT home_score, away_score
      FROM games
      WHERE id = ?
    `,
      )
      .get(game.gameId) as
      | { home_score: number; away_score: number }
      | undefined;

    if (!g || game.spreadLine === null) continue;

    const actualMargin = g.home_score - g.away_score;
    const marginVsSpread = actualMargin + game.spreadLine;

    let outcome: number;
    if (Math.abs(marginVsSpread) < 0.5) {
      outcome = -1; // Push
    } else {
      outcome = marginVsSpread > 0 ? 1 : 0;
    }

    // Generate ensemble prediction
    const featuresBase = extractSpreadFeatures(game, false);
    const featuresMarket = extractSpreadFeatures(game, true);

    const basePred = sigmoid(dot(featuresBase, model.baseWeights));
    const marketPred = sigmoid(dot(featuresMarket, model.marketWeights));
    const ensemblePred = 0.5 * basePred + 0.5 * marketPred;

    const bucket = getConfidenceBucket(ensemblePred);

    results.push({
      game,
      outcome,
      prediction: ensemblePred,
      bucket,
      spreadSize: Math.abs(game.spreadLine),
    });
  }

  // Exclude pushes for most metrics
  const resultsNoPush = results.filter((r) => r.outcome !== -1);

  // Overall metrics
  const wins = resultsNoPush.filter((r) => r.outcome === 1).length;
  const losses = resultsNoPush.filter((r) => r.outcome === 0).length;
  const pushes = results.filter((r) => r.outcome === -1).length;
  const winRate = wins / resultsNoPush.length;

  // Simulate betting with -110 odds
  let totalProfit = 0;
  for (const r of resultsNoPush) {
    const stake = 10;
    if (r.outcome === 1) {
      totalProfit += stake * (100 / 110);
    } else {
      totalProfit -= stake;
    }
  }
  const roi = (totalProfit / (resultsNoPush.length * 10)) * 100;

  // Compute ECE and Brier
  const predictions = resultsNoPush.map((r) => r.prediction);
  const actuals = resultsNoPush.map((r) => r.outcome);
  const ece = calculateECE(predictions, actuals);
  const brier =
    predictions.reduce((sum, p, i) => sum + Math.pow(p - actuals[i], 2), 0) /
    predictions.length;
  const logLoss =
    -predictions.reduce((sum, p, i) => {
      const clipped = Math.max(1e-15, Math.min(1 - 1e-15, p));
      return (
        sum +
        actuals[i] * Math.log(clipped) +
        (1 - actuals[i]) * Math.log(1 - clipped)
      );
    }, 0) / predictions.length;

  console.log(chalk.bold("📊 Overall Results:\n"));
  console.log(`   Total Bets: ${resultsNoPush.length}`);
  console.log(`   Wins: ${wins} | Losses: ${losses} | Pushes: ${pushes}`);
  console.log(`   Win Rate: ${(winRate * 100).toFixed(1)}%`);
  console.log(
    `   Total Profit: $${totalProfit >= 0 ? "+" : ""}${totalProfit.toFixed(2)}`,
  );
  console.log(`   ROI: ${roi >= 0 ? "+" : ""}${roi.toFixed(2)}%`);
  console.log(`   ECE: ${(ece * 100).toFixed(2)}%`);
  console.log(`   Brier: ${brier.toFixed(4)}`);
  console.log(`   Log Loss: ${logLoss.toFixed(4)}\n`);

  // Bucket analysis
  console.log(chalk.bold("📊 Results by Confidence Bucket:\n"));

  const buckets: SpreadConfidenceBucket[] = [
    "0-10%",
    "10-20%",
    "20-30%",
    "30-40%",
    "40-50%",
    "50-60%",
    "60-70%",
    "70-80%",
    "80-90%",
    "90-100%",
  ];

  const bucketResults: NFLSpreadBacktestResults["byConfidenceBucket"] = [];

  for (const bucket of buckets) {
    const bucketGames = resultsNoPush.filter((r) => r.bucket === bucket);
    if (bucketGames.length === 0) continue;

    const bucketWins = bucketGames.filter((r) => r.outcome === 1).length;
    const bucketLosses = bucketGames.filter((r) => r.outcome === 0).length;
    const bucketPushes = results.filter(
      (r) => r.bucket === bucket && r.outcome === -1,
    ).length;
    const bucketWinRate = bucketWins / bucketGames.length;

    let bucketProfit = 0;
    for (const r of bucketGames) {
      const stake = 10;
      if (r.outcome === 1) {
        bucketProfit += stake * (100 / 110);
      } else {
        bucketProfit -= stake;
      }
    }
    const bucketROI = (bucketProfit / (bucketGames.length * 10)) * 100;

    bucketResults.push({
      bucket,
      bets: bucketGames.length,
      wins: bucketWins,
      losses: bucketLosses,
      pushes: bucketPushes,
      winRate: bucketWinRate,
      profit: bucketProfit,
      roi: bucketROI,
    });

    const roiColor = bucketROI >= 0 ? chalk.green : chalk.red;
    const roiIndicator = bucketROI >= 0 ? "✅" : "❌";

    console.log(
      `${roiIndicator} ${bucket.padEnd(10)} | ${bucketGames.length.toString().padStart(3)} bets | ${(bucketWinRate * 100).toFixed(1)}% win rate | ${roiColor(`${bucketROI >= 0 ? "+" : ""}${bucketROI.toFixed(1)}% ROI`)}`,
    );
  }

  console.log();

  // Spread size analysis
  console.log(chalk.bold("📊 Results by Spread Size:\n"));

  const spreadRanges = [
    { label: "0-3", min: 0, max: 3 },
    { label: "3.5-7", min: 3.5, max: 7 },
    { label: "7.5+", min: 7.5, max: 999 },
  ];

  for (const range of spreadRanges) {
    const rangeGames = resultsNoPush.filter(
      (r) => r.spreadSize >= range.min && r.spreadSize <= range.max,
    );
    if (rangeGames.length === 0) continue;

    const rangeWins = rangeGames.filter((r) => r.outcome === 1).length;
    const rangeWinRate = rangeWins / rangeGames.length;

    let rangeProfit = 0;
    for (const r of rangeGames) {
      const stake = 10;
      if (r.outcome === 1) {
        rangeProfit += stake * (100 / 110);
      } else {
        rangeProfit -= stake;
      }
    }
    const rangeROI = (rangeProfit / (rangeGames.length * 10)) * 100;

    const roiColor = rangeROI >= 0 ? chalk.green : chalk.red;
    const roiIndicator = rangeROI >= 0 ? "✅" : "❌";

    console.log(
      `${roiIndicator} ${range.label.padEnd(8)} | ${rangeGames.length.toString().padStart(3)} bets | ${(rangeWinRate * 100).toFixed(1)}% win rate | ${roiColor(`${rangeROI >= 0 ? "+" : ""}${rangeROI.toFixed(1)}% ROI`)}`,
    );
  }

  console.log();

  // Identify profitable buckets
  const profitableBuckets = bucketResults.filter((b) => b.roi > 0);

  if (profitableBuckets.length > 0) {
    console.log(
      chalk.bold.green(
        `\n✨ Found ${profitableBuckets.length} profitable confidence bucket(s):\n`,
      ),
    );
    for (const bucket of profitableBuckets) {
      console.log(
        chalk.green(
          `   ${bucket.bucket}: +${bucket.roi.toFixed(1)}% ROI (${bucket.bets} bets, ${(bucket.winRate * 100).toFixed(1)}% win rate)`,
        ),
      );
    }
    console.log();
  } else {
    console.log(
      chalk.yellow("\n⚠️  No profitable confidence buckets found.\n"),
    );
  }
}

/**
 * Calculate Expected Calibration Error (ECE)
 */
function calculateECE(
  predictions: number[],
  actuals: number[],
  numBins: number = 10,
): number {
  const bins: Array<{ predictions: number[]; actuals: number[] }> = Array.from(
    { length: numBins },
    () => ({ predictions: [], actuals: [] }),
  );

  for (let i = 0; i < predictions.length; i++) {
    const binIndex = Math.min(
      Math.floor(predictions[i] * numBins),
      numBins - 1,
    );
    bins[binIndex].predictions.push(predictions[i]);
    bins[binIndex].actuals.push(actuals[i]);
  }

  let ece = 0;
  const totalSamples = predictions.length;

  for (const bin of bins) {
    if (bin.predictions.length === 0) continue;

    const avgPred =
      bin.predictions.reduce((a, b) => a + b, 0) / bin.predictions.length;
    const avgActual =
      bin.actuals.reduce((a, b) => a + b, 0) / bin.actuals.length;
    const binWeight = bin.predictions.length / totalSamples;

    ece += binWeight * Math.abs(avgPred - avgActual);
  }

  return ece;
}

/**
 * Backtest conviction classifier against historical games
 * Validates performance on 2+ seasons with 95% confidence intervals
 */

import chalk from "chalk";
import { promises as fs } from "fs";
import * as path from "path";
import { getDb } from "../db/index.js";
import {
  getHomeWinModelProbabilities,
  getTotalOverModelProbabilities,
  getHomeSpreadCoverProbabilities,
} from "../model/apply.js";
import type { Sport, MarketType } from "../models/types.js";
import type {
  ConvictionBacktestResults,
  ConvictionModel,
  ConvictionPrediction,
} from "./types.js";
import { createConvictionFeatures, makeConvictionPrediction } from "./apply.js";

/**
 * Bootstrap resampling for confidence intervals
 */
function bootstrapConfidenceInterval(
  rois: number[],
  iterations: number = 10000
): { lower: number; upper: number; mean: number; sd: number } {
  if (rois.length === 0) {
    return { lower: 0, upper: 0, mean: 0, sd: 0 };
  }

  const samples: number[] = [];

  for (let i = 0; i < iterations; i++) {
    let sampleSum = 0;
    for (let j = 0; j < rois.length; j++) {
      const idx = Math.floor(Math.random() * rois.length);
      sampleSum += rois[idx];
    }
    samples.push((sampleSum / rois.length) * 100);
  }

  samples.sort((a, b) => a - b);

  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const variance = samples.reduce((sum, x) => sum + (x - mean) ** 2, 0) / samples.length;
  const sd = Math.sqrt(variance);

  const lowerIdx = Math.floor(samples.length * 0.025);
  const upperIdx = Math.floor(samples.length * 0.975);

  return {
    lower: samples[lowerIdx],
    upper: samples[upperIdx],
    mean,
    sd,
  };
}

/**
 * Backtest conviction classifier
 */
export async function backtestConvictionClassifier(
  sport: Sport,
  market: MarketType,
  seasons: number[],
  model: ConvictionModel
): Promise<ConvictionBacktestResults> {
  console.log(chalk.blue(`\n🎯 CONVICTION BACKTEST - ${sport.toUpperCase()} ${market}`));
  console.log(chalk.blue("═".repeat(60)));

  const db = getDb();

  // Get all completed games for these seasons
  const seasonPlaceholders = seasons.map(() => "?").join(",");
  const games = db.prepare(
    `
    SELECT g.id, g.espn_event_id, g.date, g.home_score, g.away_score,
           g.home_team_id, g.away_team_id, t1.name home_name, t2.name away_name
    FROM games g
    JOIN teams t1 ON g.home_team_id = t1.id
    JOIN teams t2 ON g.away_team_id = t2.id
    WHERE g.sport = ? 
      AND g.season IN (${seasonPlaceholders})
      AND g.home_score IS NOT NULL 
      AND g.away_score IS NOT NULL
    ORDER BY g.date
  `
  ).all(sport, ...seasons) as Array<{
    id: number;
    espn_event_id: string;
    date: string;
    home_score: number;
    away_score: number;
    home_team_id: number;
    away_team_id: number;
    home_name: string;
    away_name: string;
  }>;

  if (games.length === 0) {
    console.log(`\n⚠️  No completed games found for ${sport.toUpperCase()} ${seasons.join(", ")}`);
    return {
      sport,
      market,
      seasons,
      timestamp: new Date().toISOString(),
      totalBets: 0,
      totalHighConvictionBets: 0,
      wins: 0,
      losses: 0,
      pushes: 0,
      winRate: 0,
      roi: 0,
      totalProfit: 0,
      roiLowerBound: 0,
      roiUpperBound: 0,
      roiPointEstimate: 0,
      byProfile: [],
      precision: 0,
      recall: 0,
      rollingPerformance: [],
    };
  }

  console.log(`\n📊 Backtesting ${games.length} completed games`);

  // Get model predictions for each date
  const predictions = new Map<
    string,
    { prob: number; calibBin: string; roi: number; winRate: number; sampleSize: number }
  >();

  const dateSet = new Set(games.map((g) => g.date.slice(0, 10).replace(/-/g, "")));

  console.log(`\n🔮 Generating model predictions for ${dateSet.size} dates...`);

  let predictedGames = 0;

  for (const date of dateSet) {
    try {
      const probs = await getHomeWinModelProbabilities(sport, date);
      if (probs) {
        // Also get backtest calibration for this date
        const backtestData = await getBacktestCalibrationForDate(
          sport,
          market,
          seasons,
          date
        );

        probs.forEach((prob, eventId) => {
          const calibData = backtestData.get(prob);
          predictions.set(eventId, {
            prob,
            calibBin: calibData?.bin || "",
            roi: calibData?.roi || 0,
            winRate: calibData?.winRate || 0,
            sampleSize: calibData?.sampleSize || 0,
          });
          predictedGames++;
        });
      }
    } catch (err) {
      // Skip dates without predictions
    }
  }

  console.log(`✅ Got predictions for ${predictedGames} games`);

  // Evaluate each game
  const convictionPredictions: ConvictionPrediction[] = [];
  const profileStats = new Map<string, { bets: number; wins: number; roi: number; profit: number }>();

  console.log(`\n🎲 Evaluating convictions...`);

  for (const game of games) {
    const predData = predictions.get(game.espn_event_id);
    if (!predData) continue;

    const modelProb = predData.prob;
    const homeWon = game.home_score > game.away_score;

    // Get market odds
    const odds = db.prepare(
      `
      SELECT price_home, price_away
      FROM odds
      WHERE game_id = ? AND market = ?
      ORDER BY timestamp ASC
      LIMIT 1
    `
    ).get(game.id, market) as { price_home: number; price_away: number } | undefined;

    if (!odds) continue;

    // Calculate market implied probability
    const homeDecimal = odds.price_home < 0 ? 100 / Math.abs(odds.price_home) + 1 : odds.price_home / 100 + 1;
    const awayDecimal = odds.price_away < 0 ? 100 / Math.abs(odds.price_away) + 1 : odds.price_away / 100 + 1;
    const homeImplied = 1 / homeDecimal;
    const awayImplied = 1 / awayDecimal;
    const marketProb = homeImplied / (homeImplied + awayImplied);

    // Choose side based on model prediction
    const pickOdds = modelProb > 0.5 ? odds.price_home : odds.price_away;
    const pickProb = modelProb > 0.5 ? modelProb : 1 - modelProb;
    const pickWon = modelProb > 0.5 ? homeWon : !homeWon;

    // Create conviction features
    const features = createConvictionFeatures({
      gameId: game.id,
      date: game.date,
      sport,
      market,
      homeTeam: game.home_name,
      awayTeam: game.away_name,
      modelProbability: modelProb,
      marketProbability: marketProb,
      odds: pickOdds,
      bucketLabel: predData.calibBin,
      bucketHistoricalROI: predData.roi,
      bucketWinRate: predData.winRate,
      bucketSampleSize: predData.sampleSize,
    });

    // Make conviction prediction
    const pick = modelProb > 0.5 ? `${game.home_name} ML ${pickOdds}` : `${game.away_name} ML ${pickOdds}`;
    const prediction = makeConvictionPrediction(features, model, pick);

    // Calculate actual profit
    const decimal = pickOdds < 0 ? 100 / Math.abs(pickOdds) + 1 : pickOdds / 100 + 1;
    const profit = pickWon ? (decimal - 1) * 10 : -10;

    // Track high-conviction predictions
    if (prediction.isHighConviction) {
      convictionPredictions.push(prediction);

      // Update profile stats
      const profileName = prediction.matchedProfileName;
      const current = profileStats.get(profileName) || { bets: 0, wins: 0, roi: 0, profit: 0 };
      current.bets++;
      if (pickWon) current.wins++;
      current.profit += profit;
      current.roi = (current.profit / (current.bets * 10)) * 100;
      profileStats.set(profileName, current);
    }
  }

  // Calculate overall metrics
  const wins = convictionPredictions.filter((p) => {
    // Determine if prediction won by checking the original game
    const game = games.find((g) => g.id === p.gameId);
    if (!game) return false;

    const homeWon = game.home_score > game.away_score;
    const pickHome = p.pick.includes(game.home_name);
    return (pickHome && homeWon) || (!pickHome && !homeWon);
  }).length;

  const losses = convictionPredictions.length - wins;
  const winRate = convictionPredictions.length > 0 ? wins / convictionPredictions.length : 0;

  // Calculate total profit
  let totalProfit = 0;
  for (const pred of convictionPredictions) {
    const game = games.find((g) => g.id === pred.gameId);
    if (game) {
      const homeWon = game.home_score > game.away_score;
      const pickHome = pred.pick.includes(game.home_name);
      const won = (pickHome && homeWon) || (!pickHome && !homeWon);

      const decimal = pred.odds < 0 ? 100 / Math.abs(pred.odds) + 1 : pred.odds / 100 + 1;
      totalProfit += won ? (decimal - 1) * 10 : -10;
    }
  }

  const roi = convictionPredictions.length > 0 ? (totalProfit / (convictionPredictions.length * 10)) * 100 : 0;

  // Bootstrap confidence interval for ROI
  const rois: number[] = [];
  for (const pred of convictionPredictions) {
    const game = games.find((g) => g.id === pred.gameId);
    if (game) {
      const homeWon = game.home_score > game.away_score;
      const pickHome = pred.pick.includes(game.home_name);
      const won = (pickHome && homeWon) || (!pickHome && !homeWon);

      const decimal = pred.odds < 0 ? 100 / Math.abs(pred.odds) + 1 : pred.odds / 100 + 1;
      const profit = won ? (decimal - 1) * 10 : -10;
      rois.push(profit / 10);
    }
  }

  const ci = bootstrapConfidenceInterval(rois, 10000);

  // Build per-profile breakdown
  const byProfile = Array.from(profileStats.entries()).map(([name, stats]) => ({
    profileName: name,
    bets: stats.bets,
    wins: stats.wins,
    winRate: stats.bets > 0 ? stats.wins / stats.bets : 0,
    roi: stats.roi,
    profit: stats.profit,
  }));

  // Print results
  console.log("\n" + "═".repeat(60));
  console.log(`Total HIGH-CONVICTION bets: ${convictionPredictions.length}`);
  console.log(`Wins: ${wins}, Losses: ${losses}`);
  console.log(`Win Rate: ${(winRate * 100).toFixed(2)}%`);
  console.log(`ROI: ${roi.toFixed(2)}%`);
  console.log(`95% CI: ${ci.lower.toFixed(2)}% - ${ci.upper.toFixed(2)}%`);
  console.log(`Total Profit: $${totalProfit.toFixed(2)}`);

  if (byProfile.length > 0) {
    console.log("\n📊 BY PROFILE:");
    for (const p of byProfile) {
      console.log(
        `  ${p.profileName}: ${p.bets} bets, ${(p.winRate * 100).toFixed(1)}% win, ${p.roi.toFixed(2)}% ROI`
      );
    }
  }

  console.log("\n" + chalk.green("✅ Backtest complete\n"));

  return {
    sport,
    market,
    seasons,
    timestamp: new Date().toISOString(),
    totalBets: convictionPredictions.length,
    totalHighConvictionBets: convictionPredictions.length,
    wins,
    losses,
    pushes: 0,
    winRate,
    roi,
    totalProfit,
    roiLowerBound: ci.lower,
    roiUpperBound: ci.upper,
    roiPointEstimate: ci.mean,
    byProfile,
    precision: wins / convictionPredictions.length,
    recall: convictionPredictions.length / games.length,
    rollingPerformance: generateRollingPerformance(convictionPredictions, games),
  };
}

/**
 * Get calibration data for a specific probability
 */
async function getBacktestCalibrationForDate(
  sport: Sport,
  market: MarketType,
  seasons: number[],
  date: string
): Promise<
  Map<
    number,
    { bin: string; roi: number; winRate: number; sampleSize: number }
  >
> {
  // This would normally fetch from backtest results
  // For now, return empty map
  return new Map();
}

/**
 * Generate rolling performance series
 */
function generateRollingPerformance(
  predictions: ConvictionPrediction[],
  games: Array<{ id: number; home_score: number; away_score: number; home_name: string }>
): Array<{ bets: number; roi: number }> {
  const rolling: Array<{ bets: number; roi: number }> = [];
  let cumulativeProfit = 0;

  for (let i = 0; i < predictions.length; i++) {
    const pred = predictions[i];
    const game = games.find((g) => g.id === pred.gameId);
    if (!game) continue;

    const homeWon = game.home_score > game.away_score;
    const pickHome = pred.pick.includes(game.home_name);
    const won = (pickHome && homeWon) || (!pickHome && !homeWon);

    const decimal = pred.odds < 0 ? 100 / Math.abs(pred.odds) + 1 : pred.odds / 100 + 1;
    cumulativeProfit += won ? (decimal - 1) * 10 : -10;

    const roi = (cumulativeProfit / ((i + 1) * 10)) * 100;
    rolling.push({ bets: i + 1, roi });
  }

  return rolling;
}

/**
 * Save backtest results
 */
export async function saveConvictionBacktestResults(
  results: ConvictionBacktestResults
): Promise<void> {
  const backestDir = path.join(process.cwd(), "data", "conviction-backtests");
  await fs.mkdir(backestDir, { recursive: true });

  const seasonStr = results.seasons.sort((a, b) => a - b).join("-");
  const filename = path.join(backestDir, `${results.sport}_${results.market}_${seasonStr}.json`);

  await fs.writeFile(filename, JSON.stringify(results, null, 2), "utf-8");
}

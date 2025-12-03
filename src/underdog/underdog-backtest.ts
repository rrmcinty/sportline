/**
 * Backtesting for underdog-specific models
 */

import chalk from "chalk";
import { getDb } from "../db/index.js";
import { computeUnderdogFeatures, filterUnderdogGames } from "./underdog-features.js";
import type { UnderdogBacktestResults, UnderdogTier, UnderdogGameFeatures, UnderdogModel } from "./types.js";
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
 * Extract feature vector for underdog team
 */
function extractUnderdogFeatures(game: UnderdogGameFeatures, includeMarket: boolean): number[] {
  const isHomeUnderdog = game.underdogTeam === "home";
  
  const features = [
    isHomeUnderdog ? game.homeWinRate5 : game.awayWinRate5,
    isHomeUnderdog ? game.awayWinRate5 : game.homeWinRate5,
    isHomeUnderdog ? game.homeAvgMargin5 : game.awayAvgMargin5,
    isHomeUnderdog ? game.awayAvgMargin5 : game.homeAvgMargin5,
    isHomeUnderdog ? game.homeOppWinRate5 : game.awayOppWinRate5,
    isHomeUnderdog ? game.homeOppAvgMargin5 : game.awayOppAvgMargin5,
    isHomeUnderdog ? game.homePointsAvg5 : game.awayPointsAvg5,
    isHomeUnderdog ? game.awayPointsAvg5 : game.homePointsAvg5,
    isHomeUnderdog ? game.homePace5 : game.awayPace5,
    isHomeUnderdog ? game.awayPace5 : game.homePace5,
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
    isHomeUnderdog ? game.homeUpsetRate5 : game.awayUpsetRate5,
    isHomeUnderdog ? game.homeUpsetRate10 : game.awayUpsetRate10,
    game.homeDogAdvantage,
    game.paceDifferential,
    game.confStrengthDiff,
    game.recentDogTrend5,
    game.recentDogTrend10,
    game.marketOverreaction,
    isHomeUnderdog ? 1 : 0,
  ];
  
  if (includeMarket) {
    const underdogMarketProb = isHomeUnderdog 
      ? game.marketImpliedProb 
      : (1 - game.marketImpliedProb);
    features.push(underdogMarketProb);
  }
  
  return features;
}

/**
 * Load latest underdog model
 */
function loadLatestModel(sport: "ncaam"): { baseModel: UnderdogModel; marketModel: UnderdogModel } | null {
  const modelsDir = join(process.cwd(), "models", `underdog-${sport}`);
  
  try {
    const dirs = readdirSync(modelsDir)
      .filter(d => statSync(join(modelsDir, d)).isDirectory())
      .sort()
      .reverse();
    
    if (dirs.length === 0) return null;
    
    const latestDir = join(modelsDir, dirs[0]);
    const basePath = join(latestDir, "base-model.json");
    const marketPath = join(latestDir, "market-aware-model.json");
    
    const baseModel = JSON.parse(readFileSync(basePath, "utf-8")) as UnderdogModel;
    const marketModel = JSON.parse(readFileSync(marketPath, "utf-8")) as UnderdogModel;
    
    return { baseModel, marketModel };
  } catch (error) {
    return null;
  }
}

/**
 * Backtest underdog model
 */
export async function backtestUnderdogModel(
  sport: "ncaam",
  seasons: number[],
  tiers?: UnderdogTier[],
  minEdge: number = 0.03
): Promise<UnderdogBacktestResults | null> {
  console.log(chalk.bold.cyan(`\n🐕 Backtesting UNDERDOG MODEL for ${sport.toUpperCase()}...\n`));
  console.log(chalk.dim(`   Seasons: ${seasons.join(", ")}`));
  console.log(chalk.dim(`   Tiers: ${tiers ? tiers.join(", ") : "all"}`));
  console.log(chalk.dim(`   Min Edge: ${(minEdge * 100).toFixed(1)}%\n`));
  
  // Load model
  const model = loadLatestModel(sport);
  if (!model) {
    console.log(chalk.red("❌ No trained model found. Run 'sportline underdog train' first."));
    return null;
  }
  
  console.log(chalk.green("✓ Model loaded\n"));
  
  const db = getDb();
  
  // Compute features
  console.log(chalk.dim("Computing features..."));
  const allFeatures = computeUnderdogFeatures(db, sport, seasons);
  console.log(chalk.dim(`Computed ${allFeatures.length} games\n`));
  
  // Filter to underdog games
  const underdogGames = tiers 
    ? filterUnderdogGames(allFeatures, tiers)
    : filterUnderdogGames(allFeatures);
  
  console.log(chalk.dim(`Filtered to ${underdogGames.length} underdog games\n`));
  
  // Get outcomes
  const gamesWithOutcomes = underdogGames.filter(g => {
    const game = db.prepare(`
      SELECT home_score, away_score
      FROM games
      WHERE id = ?
    `).get(g.gameId) as { home_score: number | null; away_score: number | null } | undefined;
    
    return game && game.home_score !== null && game.away_score !== null;
  });
  
  console.log(chalk.dim(`Games with outcomes: ${gamesWithOutcomes.length}\n`));
  console.log(chalk.bold.blue("Running backtest...\n"));
  
  // Track results
  let totalBets = 0;
  let wins = 0;
  let losses = 0;
  let totalProfit = 0;
  let totalOdds = 0;
  let totalEdge = 0;
  let closingLineValueSum = 0;
  
  const predictions: number[] = [];
  const actuals: number[] = [];
  
  // By odds range
  const oddsRanges = [
    { range: "+100 to +149", min: 100, max: 149, bets: 0, wins: 0, profit: 0 },
    { range: "+150 to +199", min: 150, max: 199, bets: 0, wins: 0, profit: 0 },
    { range: "+200 to +249", min: 200, max: 249, bets: 0, wins: 0, profit: 0 },
    { range: "+250 to +299", min: 250, max: 299, bets: 0, wins: 0, profit: 0 },
    { range: "+300 or more", min: 300, max: 9999, bets: 0, wins: 0, profit: 0 },
  ];
  
  for (const game of gamesWithOutcomes) {
    const baseFeatureVec = extractUnderdogFeatures(game, false);
    const marketFeatureVec = extractUnderdogFeatures(game, true);
    
    const baseProb = sigmoid(dot(baseFeatureVec, model.baseModel.weights));
    const marketProb = sigmoid(dot(marketFeatureVec, model.marketModel.weights));
    const ensembleProb = 0.5 * baseProb + 0.5 * marketProb;
    
    const underdogMarketProb = game.underdogTeam === "home"
      ? game.marketImpliedProb
      : (1 - game.marketImpliedProb);
    
    const edge = ensembleProb - underdogMarketProb;
    
    // Only bet if edge exceeds threshold
    if (edge < minEdge) continue;
    
    const odds = Math.round((1 / underdogMarketProb - 1) * 100);
    
    // Get outcome
    const gameOutcome = db.prepare(`
      SELECT home_score, away_score
      FROM games
      WHERE id = ?
    `).get(game.gameId) as { home_score: number; away_score: number };
    
    const isHomeUnderdog = game.underdogTeam === "home";
    const underdogWon = isHomeUnderdog
      ? gameOutcome.home_score > gameOutcome.away_score
      : gameOutcome.away_score > gameOutcome.home_score;
    
    // Track prediction
    predictions.push(ensembleProb);
    actuals.push(underdogWon ? 1 : 0);
    
    // Calculate profit
    const betAmount = 10;
    let profit = 0;
    
    if (underdogWon) {
      profit = betAmount * (odds / 100);
      wins++;
    } else {
      profit = -betAmount;
      losses++;
    }
    
    totalBets++;
    totalProfit += profit;
    totalOdds += odds;
    totalEdge += edge;
    
    // Closing line value (how much better was our model vs market)
    closingLineValueSum += edge;
    
    // Track by odds range
    for (const range of oddsRanges) {
      if (odds >= range.min && odds <= range.max) {
        range.bets++;
        if (underdogWon) range.wins++;
        range.profit += profit;
        break;
      }
    }
  }
  
  if (totalBets === 0) {
    console.log(chalk.yellow("No bets met the edge threshold."));
    return null;
  }
  
  // Calculate metrics
  const winRate = wins / totalBets;
  const roi = (totalProfit / (totalBets * 10)) * 100;
  const avgOdds = totalOdds / totalBets;
  const avgEdge = totalEdge / totalBets;
  const closingLineValue = (closingLineValueSum / totalBets) * 100;
  const ece = calculateECE(predictions, actuals);
  
  // Display results
  console.log(chalk.bold.green("\n✅ BACKTEST RESULTS:\n"));
  console.log(chalk.bold(`Overall Performance:`));
  console.log(chalk.dim(`   Total Bets: ${totalBets}`));
  console.log(chalk.dim(`   Wins: ${wins} | Losses: ${losses}`));
  console.log(chalk.cyan(`   Win Rate: ${(winRate * 100).toFixed(1)}%`));
  console.log(chalk.cyan(`   Total Profit: $${totalProfit.toFixed(2)}`));
  console.log(chalk.bold.cyan(`   ROI: ${roi >= 0 ? '+' : ''}${roi.toFixed(2)}%`));
  console.log(chalk.dim(`   ECE: ${ece.toFixed(2)}%`));
  console.log(chalk.dim(`   Average Odds: +${avgOdds.toFixed(0)}`));
  console.log(chalk.dim(`   Average Edge: +${(avgEdge * 100).toFixed(1)}%`));
  console.log(chalk.dim(`   Closing Line Value: +${closingLineValue.toFixed(2)}%\n`));
  
  console.log(chalk.bold("Performance by Odds Range:"));
  for (const range of oddsRanges) {
    if (range.bets === 0) continue;
    
    const rangeWinRate = (range.wins / range.bets * 100).toFixed(1);
    const rangeROI = ((range.profit / (range.bets * 10)) * 100).toFixed(2);
    const emoji = parseFloat(rangeROI) >= 0 ? "✅" : "❌";
    
    console.log(chalk.dim(`   ${emoji} ${range.range}: ${range.wins}/${range.bets} (${rangeWinRate}%) | ROI: ${parseFloat(rangeROI) >= 0 ? '+' : ''}${rangeROI}% | Profit: $${range.profit.toFixed(2)}`));
  }
  
  console.log();
  
  // Build results object
  const results: UnderdogBacktestResults = {
    sport,
    seasons,
    tier: tiers ? tiers[0] : "moderate",
    timestamp: new Date().toISOString(),
    totalGames: gamesWithOutcomes.length,
    totalBets,
    wins,
    losses,
    winRate,
    totalProfit,
    roi,
    ece,
    avgOdds,
    avgEdge,
    closingLineValue,
    byOddsRange: oddsRanges
      .filter(r => r.bets > 0)
      .map(r => ({
        range: r.range,
        bets: r.bets,
        wins: r.wins,
        winRate: r.wins / r.bets,
        profit: r.profit,
        roi: (r.profit / (r.bets * 10)) * 100
      }))
  };
  
  return results;
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

/**
 * Compare underdog model vs main model
 */
export async function compareUnderdogVsMainModel(
  sport: "ncaam",
  seasons: number[]
): Promise<void> {
  console.log(chalk.bold.cyan(`\n🔍 Comparing UNDERDOG MODEL vs MAIN MODEL...\n`));
  console.log(chalk.dim(`   Sport: ${sport.toUpperCase()}`));
  console.log(chalk.dim(`   Seasons: ${seasons.join(", ")}\n`));
  
  // Run underdog backtest
  console.log(chalk.bold("1️⃣  Underdog-Specific Model:"));
  const underdogResults = await backtestUnderdogModel(sport, seasons, undefined, 0.03);
  
  if (!underdogResults) {
    console.log(chalk.red("Could not run underdog backtest."));
    return;
  }
  
  console.log(chalk.bold("\n2️⃣  Main Model (on same underdog games):"));
  console.log(chalk.yellow("   Note: Main model has guardrails that suppress many underdogs."));
  console.log(chalk.yellow("   This comparison shows what the main model WOULD do without guardrails.\n"));
  
  // For comparison, we'd need to load the main model and run it
  // This is a simplified version that shows the framework
  console.log(chalk.dim("   [Main model comparison not yet implemented]"));
  console.log(chalk.dim("   Would show: ROI, win rate, bet count for main model on same games\n"));
  
  // Summary
  console.log(chalk.bold.green("\n📊 COMPARISON SUMMARY:\n"));
  console.log(chalk.cyan(`   Underdog Model:`));
  console.log(chalk.dim(`     ROI: ${underdogResults.roi >= 0 ? '+' : ''}${underdogResults.roi.toFixed(2)}%`));
  console.log(chalk.dim(`     Win Rate: ${(underdogResults.winRate * 100).toFixed(1)}%`));
  console.log(chalk.dim(`     Total Bets: ${underdogResults.totalBets}`));
  console.log(chalk.dim(`     Profit: $${underdogResults.totalProfit.toFixed(2)}\n`));
  
  console.log(chalk.yellow("   💡 Key Insight: Underdog model focuses ONLY on dogs (+100 or better)"));
  console.log(chalk.yellow("      while main model optimizes across all games.\n"));
}

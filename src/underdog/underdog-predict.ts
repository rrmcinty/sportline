/**
 * Prediction interface for underdog models
 */

import chalk from "chalk";
import { getDb } from "../db/index.js";
import { computeUnderdogFeatures, filterUnderdogGames } from "./underdog-features.js";
import type { UnderdogPrediction, UnderdogModel, UnderdogTier, UnderdogGameFeatures } from "./types.js";
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
 * Load latest underdog model for sport
 */
function loadLatestModel(sport: "ncaam"): { baseModel: UnderdogModel; marketModel: UnderdogModel; modelDir: string } | null {
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
    
    return { baseModel, marketModel, modelDir: latestDir };
  } catch (error) {
    console.error(chalk.red("Error loading model:"), error);
    return null;
  }
}

/**
 * Calculate Kelley criterion bet sizing
 */
function kelleySizing(modelProb: number, odds: number): number {
  // Kelley = (bp - q) / b
  // where b = decimal odds - 1, p = win prob, q = 1 - p
  const decimalOdds = odds > 0 ? (odds / 100) + 1 : (100 / -odds) + 1;
  const b = decimalOdds - 1;
  const p = modelProb;
  const q = 1 - p;
  
  const kelly = (b * p - q) / b;
  
  // Cap at 10% of bankroll (fractional Kelly for safety)
  return Math.max(0, Math.min(kelly * 0.25, 0.10));
}

/**
 * Check if game matches optimal winning profile
 */
function matchesOptimalProfile(game: UnderdogGameFeatures): boolean {
  // Based on analysis of +100 to +149 bucket:
  // 1. Home underdogs win more (47.8% vs 41.1%)
  // 2. Conference strength diff positive (0.047 vs 0.023)
  // 3. Recent dog trend negative (bounce-back candidates: -3.1 vs -0.14)
  // 4. Market overreaction present (75.7% have >5%)
  // 5. Losing favorites have narrow conference gap and are overvalued
  
  const isHomeUnderdog = game.homeAsUnderdog === 1;
  const hasRecentDogLosses = game.recentDogTrend10 < -1.5; // Bounce-back spot
  const hasConfStrength = game.confStrengthDiff > 0; // Decent conference
  const hasMarketOverreaction = game.marketOverreaction > 0.05; // 5%+ overreaction
  
  // Must be home dog with at least 2 of the 3 other factors
  if (!isHomeUnderdog) return false;
  
  let factorCount = 0;
  if (hasRecentDogLosses) factorCount++;
  if (hasConfStrength) factorCount++;
  if (hasMarketOverreaction) factorCount++;
  
  return factorCount >= 2;
}

/**
 * Generate underdog predictions for upcoming games
 */
export async function predictUnderdogs(
  sport: "ncaam",
  date: string,
  minOdds: number = 110,
  maxOdds: number = 300,
  filterOptimal: boolean = false
): Promise<UnderdogPrediction[]> {
  console.log(chalk.bold.cyan(`\n🐕 Generating underdog predictions for ${sport.toUpperCase()}...\n`));
  console.log(chalk.dim(`   Date: ${date}`));
  console.log(chalk.dim(`   Odds range: +${minOdds} to +${maxOdds}\n`));
  
  // Load model
  const model = loadLatestModel(sport);
  if (!model) {
    console.log(chalk.red("❌ No trained model found. Run 'sportline underdog train' first."));
    return [];
  }
  
  console.log(chalk.green(`✓ Loaded model: ${model.modelDir}`));
  console.log(chalk.dim(`   Seasons: ${model.baseModel.seasons.join(", ")}`));
  console.log(chalk.dim(`   ROI: ${model.baseModel.metrics.roi.toFixed(2)}%`));
  console.log(chalk.dim(`   ECE: ${model.baseModel.metrics.ece.toFixed(2)}%\n`));
  
  const db = getDb();
  
  // Convert YYYYMMDD to YYYY-MM-DD for comparison
  const isoDate = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
  
  // Get the actual season from database for this date
  const seasonQuery = db.prepare(`
    SELECT DISTINCT season 
    FROM games 
    WHERE sport = ? AND date LIKE ?
    LIMIT 1
  `).get(sport, `${isoDate}%`) as { season: number } | undefined;
  
  const currentSeason = seasonQuery ? seasonQuery.season : 2025;
  
  // Compute features for games on this date
  console.log(chalk.dim("Computing features..."));
  const allFeatures = computeUnderdogFeatures(db, sport, [currentSeason]);
  const gamesOnDate = allFeatures.filter(f => f.date.startsWith(isoDate));
  
  console.log(chalk.dim(`Found ${gamesOnDate.length} games on ${date}\n`));
  
  // Filter to underdog games in odds range
  let underdogGames = gamesOnDate.filter(g => {
    if (!g.underdogTier) return false;
    
    const underdogMarketProb = g.underdogTeam === "home"
      ? g.marketImpliedProb
      : (1 - g.marketImpliedProb);
    
    const odds = Math.round((1 / underdogMarketProb - 1) * 100);
    
    return odds >= minOdds && odds <= maxOdds;
  });
  
  console.log(chalk.dim(`Filtered to ${underdogGames.length} underdogs in odds range`));
  
  // Apply optimal profile filter if requested
  if (filterOptimal) {
    const beforeFilter = underdogGames.length;
    underdogGames = underdogGames.filter(matchesOptimalProfile);
    console.log(chalk.dim(`Applied optimal profile filter: ${underdogGames.length}/${beforeFilter} games match\n`));
  } else {
    console.log();
  }
  
  if (underdogGames.length === 0) {
    console.log(chalk.yellow("No underdog games found in specified range."));
    return [];
  }
  
  // Generate predictions
  const predictions: UnderdogPrediction[] = [];
  
  for (const game of underdogGames) {
    const baseFeatureVec = extractUnderdogFeatures(game, false);
    const marketFeatureVec = extractUnderdogFeatures(game, true);
    
    const baseProb = sigmoid(dot(baseFeatureVec, model.baseModel.weights));
    const marketProb = sigmoid(dot(marketFeatureVec, model.marketModel.weights));
    const ensembleProb = 0.5 * baseProb + 0.5 * marketProb;
    
    const underdogMarketProb = game.underdogTeam === "home"
      ? game.marketImpliedProb
      : (1 - game.marketImpliedProb);
    
    const odds = Math.round((1 / underdogMarketProb - 1) * 100);
    const edge = ensembleProb - underdogMarketProb;
    
    // Calculate expected value of $10 bet
    const betAmount = 10;
    const expectedValue = (ensembleProb * betAmount * (odds / 100)) - ((1 - ensembleProb) * betAmount);
    
    // Kelley sizing
    const kelley = kelleySizing(ensembleProb, odds);
    
    // Confidence based on edge and model probability
    let confidence: "high" | "medium" | "low";
    if (edge > 0.10 && ensembleProb > 0.40) {
      confidence = "high";
    } else if (edge > 0.05 && ensembleProb > 0.30) {
      confidence = "medium";
    } else {
      confidence = "low";
    }
    
    // Get team names
    const teams = db.prepare(`
      SELECT 
        h.name as home_team,
        a.name as away_team
      FROM games g
      JOIN teams h ON h.id = g.home_team_id
      JOIN teams a ON a.id = g.away_team_id
      WHERE g.id = ?
    `).get(game.gameId) as { home_team: string; away_team: string } | undefined;
    
    if (!teams) continue;
    
    // Only include if edge > 3% (minimum threshold)
    if (edge > 0.03) {
      predictions.push({
        gameId: game.gameId,
        date: game.date,
        homeTeam: teams.home_team,
        awayTeam: teams.away_team,
        underdogTeam: game.underdogTeam!,
        underdogTier: game.underdogTier!,
        modelProbability: ensembleProb,
        marketProbability: underdogMarketProb,
        edge: edge,
        odds: odds,
        expectedValue: expectedValue,
        kelleySizing: kelley,
        confidence: confidence
      });
    }
  }
  
  // Sort by edge (best opportunities first)
  predictions.sort((a, b) => b.edge - a.edge);
  
  return predictions;
}

/**
 * Display underdog predictions in a formatted table
 */
export function displayUnderdogPredictions(predictions: UnderdogPrediction[], filterOptimal: boolean = false): void {
  if (predictions.length === 0) {
    console.log(chalk.yellow("\nNo underdog opportunities found with sufficient edge.\n"));
    return;
  }
  
  const header = filterOptimal 
    ? `\n✅ Found ${predictions.length} OPTIMAL underdog opportunities (home dogs, bounce-back spots):\n`
    : `\n✅ Found ${predictions.length} underdog opportunities:\n`;
  
  console.log(chalk.bold.green(header));
  
  for (let i = 0; i < predictions.length; i++) {
    const p = predictions[i];
    const underdogName = p.underdogTeam === "home" ? p.homeTeam : p.awayTeam;
    const favoriteName = p.underdogTeam === "home" ? p.awayTeam : p.homeTeam;
    
    const confidenceEmoji = p.confidence === "high" ? "🔥" : p.confidence === "medium" ? "⚠️" : "ℹ️";
    const tierBadge = `[${p.underdogTier.toUpperCase()}]`;
    
    console.log(chalk.bold(`${i + 1}. ${confidenceEmoji} ${underdogName} +${p.odds} ${tierBadge}`));
    console.log(chalk.dim(`   vs ${favoriteName}`));
    console.log(chalk.cyan(`   Model: ${(p.modelProbability * 100).toFixed(1)}% | Market: ${(p.marketProbability * 100).toFixed(1)}% | Edge: +${(p.edge * 100).toFixed(1)}%`));
    console.log(chalk.dim(`   Expected Value: $${p.expectedValue.toFixed(2)} per $10 bet`));
    console.log(chalk.dim(`   Kelley Sizing: ${(p.kelleySizing * 100).toFixed(1)}% of bankroll`));
    console.log();
  }
  
  const totalEV = predictions.reduce((sum, p) => sum + p.expectedValue, 0);
  const avgEdge = predictions.reduce((sum, p) => sum + p.edge, 0) / predictions.length;
  
  console.log(chalk.bold.cyan(`📊 Summary:`));
  console.log(chalk.dim(`   Total Expected Value: $${totalEV.toFixed(2)} (if betting $10 on each)`));
  console.log(chalk.dim(`   Average Edge: +${(avgEdge * 100).toFixed(1)}%`));
  console.log(chalk.dim(`   High Confidence: ${predictions.filter(p => p.confidence === "high").length}`));
  console.log(chalk.dim(`   Medium Confidence: ${predictions.filter(p => p.confidence === "medium").length}`));
  console.log(chalk.dim(`   Low Confidence: ${predictions.filter(p => p.confidence === "low").length}\n`));
}

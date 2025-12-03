/**
 * Analyze winning vs losing traits in profitable NFL spread buckets
 */

import chalk from "chalk";
import type Database from "better-sqlite3";
import { getDb } from "../../db/index.js";
import { computeNFLSpreadFeatures, filterSpreadGames } from "./nfl-spread-features.js";
import type { NFLSpreadGameFeatures, SpreadConfidenceBucket, SpreadTraitsAnalysis } from "./types.js";
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
 * Extract feature vector
 */
function extractSpreadFeatures(game: NFLSpreadGameFeatures, includeMarket: boolean): number[] {
  const features = [
    game.homeWinRate5, game.homeAvgMargin5, game.homeOppWinRate5, game.homeOppAvgMargin5,
    game.homePointsAvg5, game.homeOppPointsAvg5, game.homePace5, game.homeOffEff5, game.homeDefEff5,
    game.awayWinRate5, game.awayAvgMargin5, game.awayOppWinRate5, game.awayOppAvgMargin5,
    game.awayPointsAvg5, game.awayOppPointsAvg5, game.awayPace5, game.awayOffEff5, game.awayDefEff5,
    game.homeWinRate10, game.homeAvgMargin10, game.homeOppWinRate10, game.homeOppAvgMargin10,
    game.homePointsAvg10, game.homeOppPointsAvg10, game.homePace10, game.homeOffEff10, game.homeDefEff10,
    game.awayWinRate10, game.awayAvgMargin10, game.awayOppWinRate10, game.awayOppAvgMargin10,
    game.awayPointsAvg10, game.awayOppPointsAvg10, game.awayPace10, game.awayOffEff10, game.awayDefEff10,
    game.homeATSRecord5, game.awayATSRecord5, game.homeATSRecord10, game.awayATSRecord10,
    game.homeATSMargin5, game.awayATSMargin5, game.homeATSMargin10, game.awayATSMargin10,
    game.spreadSize, game.isTightSpread, game.marketOverreaction, game.homeAdvantage
  ];
  
  if (includeMarket) {
    features.push(game.spreadMarketImpliedProb || 0.5);
  }
  
  return features;
}

/**
 * Load latest NFL spread model
 */
function loadLatestModel(seasons: number[]): { baseWeights: number[]; marketWeights: number[] } | null {
  const modelsDir = join(process.cwd(), "models", "nfl-spread");
  
  try {
    const dirs = readdirSync(modelsDir)
      .filter(d => {
        const fullPath = join(modelsDir, d);
        return statSync(fullPath).isDirectory();
      })
      .map(d => ({
        name: d,
        path: join(modelsDir, d),
        timestamp: parseInt(d.split('_').pop() || '0', 10)
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
      marketWeights: marketModel.weights
    };
  } catch (err) {
    return null;
  }
}

/**
 * Get confidence bucket
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
 * Analyze winning vs losing traits in profitable buckets
 */
export async function analyzeNFLSpreadTraits(
  seasons: number[],
  targetBuckets?: SpreadConfidenceBucket[]
): Promise<void> {
  console.log(chalk.bold.cyan(`\n🏈 Analyzing NFL SPREAD TRAITS for seasons ${seasons.join(", ")}...\n`));
  
  const db = getDb();
  
  // Load model
  const model = loadLatestModel(seasons);
  if (!model) {
    console.log(chalk.red("❌ No trained model found. Run train command first.\n"));
    return;
  }
  
  // Compute features
  const allFeatures = computeNFLSpreadFeatures(db, seasons);
  const spreadGames = filterSpreadGames(allFeatures);
  
  // Filter to completed games
  const completedGames = spreadGames.filter(g => {
    const game = db.prepare(`
      SELECT home_score, away_score
      FROM games
      WHERE id = ?
    `).get(g.gameId) as { home_score: number | null; away_score: number | null } | undefined;
    
    return game && game.home_score !== null && game.away_score !== null;
  });
  
  // Get predictions and outcomes
  const results: Array<{
    game: NFLSpreadGameFeatures;
    outcome: number;
    prediction: number;
    bucket: SpreadConfidenceBucket;
  }> = [];
  
  for (const game of completedGames) {
    const g = db.prepare(`
      SELECT home_score, away_score
      FROM games
      WHERE id = ?
    `).get(game.gameId) as { home_score: number; away_score: number } | undefined;
    
    if (!g || game.spreadLine === null) continue;
    
    const actualMargin = g.home_score - g.away_score;
    const marginVsSpread = actualMargin + game.spreadLine;
    
    if (Math.abs(marginVsSpread) < 0.5) continue;  // Skip pushes
    
    const outcome = marginVsSpread > 0 ? 1 : 0;
    
    const featuresBase = extractSpreadFeatures(game, false);
    const featuresMarket = extractSpreadFeatures(game, true);
    
    const basePred = sigmoid(dot(featuresBase, model.baseWeights));
    const marketPred = sigmoid(dot(featuresMarket, model.marketWeights));
    const ensemblePred = 0.5 * basePred + 0.5 * marketPred;
    
    const bucket = getConfidenceBucket(ensemblePred);
    
    results.push({ game, outcome, prediction: ensemblePred, bucket });
  }
  
  // Determine which buckets to analyze
  let bucketsToAnalyze: SpreadConfidenceBucket[];
  
  if (targetBuckets) {
    bucketsToAnalyze = targetBuckets;
  } else {
    // Auto-detect profitable buckets
    const allBuckets: SpreadConfidenceBucket[] = [
      "0-10%", "10-20%", "20-30%", "30-40%", "40-50%",
      "50-60%", "60-70%", "70-80%", "80-90%", "90-100%"
    ];
    
    bucketsToAnalyze = allBuckets.filter(bucket => {
      const bucketGames = results.filter(r => r.bucket === bucket);
      if (bucketGames.length < 10) return false;
      
      const wins = bucketGames.filter(r => r.outcome === 1).length;
      let profit = 0;
      for (const r of bucketGames) {
        if (r.outcome === 1) {
          profit += 10 * (100 / 110);
        } else {
          profit -= 10;
        }
      }
      const roi = (profit / (bucketGames.length * 10)) * 100;
      
      return roi > 0;
    });
  }
  
  if (bucketsToAnalyze.length === 0) {
    console.log(chalk.yellow("⚠️  No profitable buckets found. Run backtest first to identify profitable ranges.\n"));
    return;
  }
  
  console.log(chalk.bold(`Analyzing ${bucketsToAnalyze.length} bucket(s): ${bucketsToAnalyze.join(", ")}\n`));
  
  // Analyze each bucket
  for (const bucket of bucketsToAnalyze) {
    const bucketGames = results.filter(r => r.bucket === bucket);
    if (bucketGames.length === 0) continue;
    
    const winners = bucketGames.filter(r => r.outcome === 1);
    const losers = bucketGames.filter(r => r.outcome === 0);
    
    console.log(chalk.bold.cyan(`\n📊 ${bucket} Bucket Analysis`));
    console.log(chalk.dim(`   Winners: ${winners.length} | Losers: ${losers.length}\n`));
    
    // Compute average features for winners
    const winnerFeatures = {
      homeATSRecord5: winners.reduce((sum, r) => sum + r.game.homeATSRecord5, 0) / winners.length,
      awayATSRecord5: winners.reduce((sum, r) => sum + r.game.awayATSRecord5, 0) / winners.length,
      homeATSMargin5: winners.reduce((sum, r) => sum + r.game.homeATSMargin5, 0) / winners.length,
      awayATSMargin5: winners.reduce((sum, r) => sum + r.game.awayATSMargin5, 0) / winners.length,
      spreadSize: winners.reduce((sum, r) => sum + r.game.spreadSize, 0) / winners.length,
      isTightSpread: winners.filter(r => r.game.isTightSpread === 1).length / winners.length,
      marketOverreaction: winners.reduce((sum, r) => sum + r.game.marketOverreaction, 0) / winners.length,
      homeMarginDelta: winners.reduce((sum, r) => sum + (r.game.homeAvgMargin10 - r.game.awayAvgMargin10), 0) / winners.length,
    };
    
    // Compute average features for losers
    const loserFeatures = {
      homeATSRecord5: losers.reduce((sum, r) => sum + r.game.homeATSRecord5, 0) / losers.length,
      awayATSRecord5: losers.reduce((sum, r) => sum + r.game.awayATSRecord5, 0) / losers.length,
      homeATSMargin5: losers.reduce((sum, r) => sum + r.game.homeATSMargin5, 0) / losers.length,
      awayATSMargin5: losers.reduce((sum, r) => sum + r.game.awayATSMargin5, 0) / losers.length,
      spreadSize: losers.reduce((sum, r) => sum + r.game.spreadSize, 0) / losers.length,
      isTightSpread: losers.filter(r => r.game.isTightSpread === 1).length / losers.length,
      marketOverreaction: losers.reduce((sum, r) => sum + r.game.marketOverreaction, 0) / losers.length,
      homeMarginDelta: losers.reduce((sum, r) => sum + (r.game.homeAvgMargin10 - r.game.awayAvgMargin10), 0) / losers.length,
    };
    
    console.log(chalk.bold.green("✅ Winning Bets - Average Features:"));
    console.log(`   Home ATS Record (5g): ${(winnerFeatures.homeATSRecord5 * 100).toFixed(1)}%`);
    console.log(`   Away ATS Record (5g): ${(winnerFeatures.awayATSRecord5 * 100).toFixed(1)}%`);
    console.log(`   Home ATS Margin (5g): ${winnerFeatures.homeATSMargin5 >= 0 ? '+' : ''}${winnerFeatures.homeATSMargin5.toFixed(2)}`);
    console.log(`   Away ATS Margin (5g): ${winnerFeatures.awayATSMargin5 >= 0 ? '+' : ''}${winnerFeatures.awayATSMargin5.toFixed(2)}`);
    console.log(`   Spread Size: ${winnerFeatures.spreadSize.toFixed(1)}`);
    console.log(`   Tight Spread (≤3): ${(winnerFeatures.isTightSpread * 100).toFixed(1)}%`);
    console.log(`   Market Overreaction: ${winnerFeatures.marketOverreaction.toFixed(2)}`);
    console.log(`   Home Margin Delta: ${winnerFeatures.homeMarginDelta >= 0 ? '+' : ''}${winnerFeatures.homeMarginDelta.toFixed(2)}\n`);
    
    console.log(chalk.bold.red("❌ Losing Bets - Average Features:"));
    console.log(`   Home ATS Record (5g): ${(loserFeatures.homeATSRecord5 * 100).toFixed(1)}%`);
    console.log(`   Away ATS Record (5g): ${(loserFeatures.awayATSRecord5 * 100).toFixed(1)}%`);
    console.log(`   Home ATS Margin (5g): ${loserFeatures.homeATSMargin5 >= 0 ? '+' : ''}${loserFeatures.homeATSMargin5.toFixed(2)}`);
    console.log(`   Away ATS Margin (5g): ${loserFeatures.awayATSMargin5 >= 0 ? '+' : ''}${loserFeatures.awayATSMargin5.toFixed(2)}`);
    console.log(`   Spread Size: ${loserFeatures.spreadSize.toFixed(1)}`);
    console.log(`   Tight Spread (≤3): ${(loserFeatures.isTightSpread * 100).toFixed(1)}%`);
    console.log(`   Market Overreaction: ${loserFeatures.marketOverreaction.toFixed(2)}`);
    console.log(`   Home Margin Delta: ${loserFeatures.homeMarginDelta >= 0 ? '+' : ''}${loserFeatures.homeMarginDelta.toFixed(2)}\n`);
    
    // Highlight key differences
    console.log(chalk.bold.yellow("🔍 Key Differentiators:"));
    
    const atsDiff = Math.abs(winnerFeatures.homeATSRecord5 - loserFeatures.homeATSRecord5);
    if (atsDiff > 0.05) {
      console.log(`   • ATS Record: Winners have ${winnerFeatures.homeATSRecord5 > loserFeatures.homeATSRecord5 ? 'stronger' : 'weaker'} home ATS trend (${(atsDiff * 100).toFixed(1)}% difference)`);
    }
    
    const spreadDiff = Math.abs(winnerFeatures.spreadSize - loserFeatures.spreadSize);
    if (spreadDiff > 1.0) {
      console.log(`   • Spread Size: Winners avg ${winnerFeatures.spreadSize.toFixed(1)}, losers avg ${loserFeatures.spreadSize.toFixed(1)}`);
    }
    
    const tightSpreadDiff = Math.abs(winnerFeatures.isTightSpread - loserFeatures.isTightSpread);
    if (tightSpreadDiff > 0.1) {
      console.log(`   • Tight Spreads (≤3): ${winnerFeatures.isTightSpread > loserFeatures.isTightSpread ? 'More common' : 'Less common'} in winners (${(tightSpreadDiff * 100).toFixed(1)}% difference)`);
    }
    
    const marginDeltaDiff = Math.abs(winnerFeatures.homeMarginDelta - loserFeatures.homeMarginDelta);
    if (marginDeltaDiff > 2.0) {
      console.log(`   • Margin Delta: Winners have ${winnerFeatures.homeMarginDelta > loserFeatures.homeMarginDelta ? 'stronger' : 'weaker'} home team relative performance`);
    }
  }
  
  console.log();
}

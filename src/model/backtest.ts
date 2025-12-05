/**
 * Backtest model predictions against actual outcomes
 * Validates if model probabilities are well-calibrated
 */

import { getDb } from "../db/index.js";
import { getHomeWinModelProbabilities, getTotalOverModelProbabilities, getHomeSpreadCoverProbabilities } from "./apply.js";
import { computeFeatures } from "./features.js";
import type { Sport } from "../models/types.js";
import { saveBacktestResults, type BacktestResults, type CalibrationBin } from "./backtest-storage.js";

interface BacktestResult {
  bin: string;
  predicted: number;
  actual: number;
  count: number;
  bets: number;
  profit: number;
}

/**
 * Backtest moneyline model predictions
 * Groups predictions into bins and checks if actual win rates match predicted rates
 */
export async function backtestMoneyline(sport: Sport, seasons: number[]): Promise<void> {
  const db = getDb();
  
  // Get all completed games with odds for these seasons
  const seasonPlaceholders = seasons.map(() => '?').join(',');
  const games = db.prepare(`
    SELECT g.id, g.espn_event_id, g.date, g.home_score, g.away_score,
           g.home_team_id, g.away_team_id
    FROM games g
    WHERE g.sport = ? 
      AND g.season IN (${seasonPlaceholders})
      AND g.home_score IS NOT NULL 
      AND g.away_score IS NOT NULL
    ORDER BY g.date
  `).all(sport, ...seasons) as Array<{
    id: number;
    espn_event_id: string;
    date: string;
    home_score: number;
    away_score: number;
    home_team_id: number;
    away_team_id: number;
  }>;

  if (games.length === 0) {
    console.log(`\n⚠️  No completed games found for ${sport.toUpperCase()} season${seasons.length > 1 ? 's' : ''} ${seasons.join(', ')}`);
    console.log(`Skipping backtest for this sport.\n`);
    return;
  }

  console.log(`\n📊 MONEYLINE MODEL BACKTEST - ${sport.toUpperCase()} ${seasons.join(', ')}`);
  console.log(`Testing ${games.length} completed games\n`);

  // Get model predictions for each date
  const predictions = new Map<string, number>();
  const dateSet = new Set(games.map(g => g.date.slice(0, 10).replace(/-/g, '')));
  
  let predictedGames = 0;
  for (const date of dateSet) {
    try {
      const probs = await getHomeWinModelProbabilities(sport, date);
      if (probs) {
        probs.forEach((prob, eventId) => predictions.set(eventId, prob));
        predictedGames += probs.size;
      }
    } catch (err) {
      // Skip dates without predictions
    }
  }

  console.log(`Model generated predictions for ${predictedGames} games`);
  console.log(`Validating against ${games.length} actual outcomes\n`);

  // For each game, check if we have odds and predictions
  const results: Array<{
    eventId: string;
    modelProb: number;
    marketProb: number;
    homeWon: boolean;
    homeOdds: number;
    awayOdds: number;
  }> = [];

  for (const game of games) {
    const modelProb = predictions.get(game.espn_event_id);
    if (!modelProb) continue; // No model prediction for this game

    // Get opening market odds (earliest available, reflects initial market assessment)
    const odds = db.prepare(`
      SELECT market, line, price_home, price_away
      FROM odds
      WHERE game_id = ? AND market = 'moneyline'
      ORDER BY timestamp ASC
      LIMIT 1
    `).get(game.id) as { market: string; line: number | null; price_home: number; price_away: number } | undefined;

    if (!odds || !odds.price_home || !odds.price_away) continue;

    // Calculate market implied probability (with vig)
    const homeDecimal = odds.price_home < 0 ? (100 / Math.abs(odds.price_home)) + 1 : (odds.price_home / 100) + 1;
    const awayDecimal = odds.price_away < 0 ? (100 / Math.abs(odds.price_away)) + 1 : (odds.price_away / 100) + 1;
    const homeImplied = 1 / homeDecimal;
    const awayImplied = 1 / awayDecimal;
    const marketProb = homeImplied / (homeImplied + awayImplied); // Vig-free

    const homeWon = game.home_score > game.away_score;

    results.push({
      eventId: game.espn_event_id,
      modelProb,
      marketProb,
      homeWon,
      homeOdds: odds.price_home,
      awayOdds: odds.price_away
    });
  }

  console.log(`Matched ${results.length} games with both predictions and odds\n`);

  // Bin predictions and calculate calibration
  const bins = [
    { min: 0, max: 0.10, label: "0-10%" },
    { min: 0.10, max: 0.20, label: "10-20%" },
    { min: 0.20, max: 0.30, label: "20-30%" },
    { min: 0.30, max: 0.40, label: "30-40%" },
    { min: 0.40, max: 0.50, label: "40-50%" },
    { min: 0.50, max: 0.60, label: "50-60%" },
    { min: 0.60, max: 0.70, label: "60-70%" },
    { min: 0.70, max: 0.80, label: "70-80%" },
    { min: 0.80, max: 0.90, label: "80-90%" },
    { min: 0.90, max: 1.00, label: "90-100%" }
  ];

  const calibration: BacktestResult[] = [];

  for (const bin of bins) {
    const binResults = results.filter(r => r.modelProb >= bin.min && r.modelProb < bin.max);
    if (binResults.length === 0) continue;

    const avgPredicted = binResults.reduce((sum, r) => sum + r.modelProb, 0) / binResults.length;
    const actualWins = binResults.filter(r => r.homeWon).length;
    const actualRate = actualWins / binResults.length;

    // Calculate profit if we bet on every game in this bin
    let profit = 0;
    let bets = 0;
    for (const r of binResults) {
      // Bet on home if model thinks home will win, away otherwise
      if (r.modelProb > 0.5) {
        bets++;
        if (r.homeWon) {
          // Won home bet
          const payout = r.homeOdds < 0 ? (100 / Math.abs(r.homeOdds)) + 1 : (r.homeOdds / 100) + 1;
          profit += (payout - 1) * 10; // $10 bet
        } else {
          profit -= 10;
        }
      } else {
        bets++;
        if (!r.homeWon) {
          // Won away bet
          const payout = r.awayOdds < 0 ? (100 / Math.abs(r.awayOdds)) + 1 : (r.awayOdds / 100) + 1;
          profit += (payout - 1) * 10;
        } else {
          profit -= 10;
        }
      }
    }

    calibration.push({
      bin: bin.label,
      predicted: avgPredicted,
      actual: actualRate,
      count: binResults.length,
      bets,
      profit
    });
  }

  // Print calibration table
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("CALIBRATION ANALYSIS");
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("Bin       | Predicted | Actual | Count | Error  | Profit (if bet all)");
  console.log("───────────────────────────────────────────────────────────────────────");

  for (const c of calibration) {
    const error = Math.abs(c.predicted - c.actual);
    const profitStr = c.profit >= 0 ? `+$${c.profit.toFixed(2)}` : `-$${Math.abs(c.profit).toFixed(2)}`;
    const roi = c.bets > 0 ? ((c.profit / (c.bets * 10)) * 100).toFixed(1) : "0.0";
    console.log(
      `${c.bin.padEnd(9)} | ${(c.predicted * 100).toFixed(1)}%`.padEnd(12) +
      `| ${(c.actual * 100).toFixed(1)}%`.padEnd(8) +
      `| ${c.count.toString().padEnd(5)} | ${(error * 100).toFixed(1)}%`.padEnd(8) +
      `| ${profitStr.padEnd(10)} (${roi}% ROI)`
    );
  }

  // Calculate overall metrics
  const totalError = calibration.reduce((sum, c) => sum + Math.abs(c.predicted - c.actual) * c.count, 0) / 
                     calibration.reduce((sum, c) => sum + c.count, 0);
  const totalProfit = calibration.reduce((sum, c) => sum + c.profit, 0);
  const totalBets = calibration.reduce((sum, c) => sum + c.bets, 0);
  const totalROI = totalBets > 0 ? ((totalProfit / (totalBets * 10)) * 100) : 0;

  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log(`Overall Calibration Error: ${(totalError * 100).toFixed(2)}%`);
  console.log(`Total Profit (if bet all): ${totalProfit >= 0 ? '+' : ''}$${totalProfit.toFixed(2)} on ${totalBets} bets`);
  console.log(`Return on Investment: ${totalROI >= 0 ? '+' : ''}${totalROI.toFixed(2)}%`);
  console.log("═══════════════════════════════════════════════════════════════════════\n");

  // Analyze underdog performance specifically
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("UNDERDOG ANALYSIS");
  console.log("═══════════════════════════════════════════════════════════════════════");
  
  const underdogThresholds = [
    { label: "+200 or worse", minOdds: 200 },
    { label: "+300 or worse", minOdds: 300 },
    { label: "+500 or worse", minOdds: 500 },
    { label: "+1000 or worse", minOdds: 1000 }
  ];

  for (const threshold of underdogThresholds) {
    const underdogs = results.filter(r => {
      const isHomeUnderdog = r.homeOdds >= threshold.minOdds;
      const isAwayUnderdog = r.awayOdds >= threshold.minOdds;
      return isHomeUnderdog || isAwayUnderdog;
    });

    if (underdogs.length === 0) continue;

    let correctPicks = 0;
    let profit = 0;

    for (const r of underdogs) {
      const isHomeUnderdog = r.homeOdds >= threshold.minOdds;
      
      if (isHomeUnderdog) {
        // Home is underdog - did model favor home AND did home win?
        if (r.modelProb > r.marketProb) {
          // Model thinks home is undervalued
          if (r.homeWon) {
            correctPicks++;
            const payout = r.homeOdds < 0 ? (100 / Math.abs(r.homeOdds)) + 1 : (r.homeOdds / 100) + 1;
            profit += (payout - 1) * 10;
          } else {
            profit -= 10;
          }
        }
      } else {
        // Away is underdog - did model favor away AND did away win?
        if (r.modelProb < r.marketProb) {
          // Model thinks away is undervalued
          if (!r.homeWon) {
            correctPicks++;
            const payout = r.awayOdds < 0 ? (100 / Math.abs(r.awayOdds)) + 1 : (r.awayOdds / 100) + 1;
            profit += (payout - 1) * 10;
          } else {
            profit -= 10;
          }
        }
      }
    }

    const modelFavored = results.filter(r => {
      const isHomeUnderdog = r.homeOdds >= threshold.minOdds;
      return (isHomeUnderdog && r.modelProb > r.marketProb) || (!isHomeUnderdog && r.modelProb < r.marketProb);
    }).length;

    console.log(`\n${threshold.label} underdogs:`);
    console.log(`  Total games: ${underdogs.length}`);
    console.log(`  Model favored underdog: ${modelFavored} times`);
    console.log(`  Correct picks: ${correctPicks}/${modelFavored} (${modelFavored > 0 ? ((correctPicks / modelFavored) * 100).toFixed(1) : '0.0'}%)`);
    console.log(`  Profit if bet model's picks: ${profit >= 0 ? '+' : ''}$${profit.toFixed(2)}`);
    console.log(`  ROI: ${modelFavored > 0 ? ((profit / (modelFavored * 10)) * 100).toFixed(1) : '0.0'}%`);
  }

  console.log("\n═══════════════════════════════════════════════════════════════════════\n");

  // FEATURE ANALYSIS: What stats correlate with profitable predictions?
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("FEATURE ANALYSIS: Winners vs Losers");
  console.log("═══════════════════════════════════════════════════════════════════════\n");

  // Compute features for all games
  const allFeatures = computeFeatures(db, sport, seasons);
  const featureMap = new Map(allFeatures.map(f => [f.gameId, f]));

  // Match games with features
  const gamesWithFeatures = results
    .map(r => {
      const game = games.find(g => g.espn_event_id === r.eventId);
      if (!game) return null;
      const features = featureMap.get(game.id);
      if (!features) return null;
      
      // Determine if this was a profitable bet
      const betOnHome = r.modelProb > 0.5;
      const won = betOnHome ? r.homeWon : !r.homeWon;
      const odds = betOnHome ? r.homeOdds : r.awayOdds;
      const payout = odds < 0 ? (100 / Math.abs(odds)) + 1 : (odds / 100) + 1;
      const profit = won ? (payout - 1) * 10 : -10;
      
      return {
        ...r,
        features,
        betOnHome,
        won,
        profit,
        divergence: Math.abs(r.modelProb - r.marketProb)
      };
    })
    .filter(g => g !== null);

  if (gamesWithFeatures.length === 0) {
    console.log("⚠️  No games with features available for analysis\n");
    return;
  }

  // Split into winners and losers
  const winners = gamesWithFeatures.filter(g => g.profit > 0);
  const losers = gamesWithFeatures.filter(g => g.profit < 0);

  console.log(`Analyzing ${winners.length} profitable bets vs ${losers.length} losing bets\n`);

  // Key stats to analyze
  const statsToAnalyze = [
    { name: "Win Rate 5-game (Home)", getHome: (f: any) => f.homeWinRate5, getAway: (f: any) => f.awayWinRate5 },
    { name: "Win Rate 10-game (Home)", getHome: (f: any) => f.homeWinRate10, getAway: (f: any) => f.awayWinRate10 },
    { name: "Avg Margin 5-game (Home)", getHome: (f: any) => f.homeAvgMargin5, getAway: (f: any) => f.awayAvgMargin5 },
    { name: "Avg Margin 10-game (Home)", getHome: (f: any) => f.homeAvgMargin10, getAway: (f: any) => f.awayAvgMargin10 },
    { name: "Opp Win Rate 5-game (SoS)", getHome: (f: any) => f.homeOppWinRate5, getAway: (f: any) => f.awayOppWinRate5 },
    { name: "Opp Win Rate 10-game (SoS)", getHome: (f: any) => f.homeOppWinRate10, getAway: (f: any) => f.awayOppWinRate10 },
    { name: "Opp Margin 5-game (SoS Quality)", getHome: (f: any) => f.homeOppAvgMargin5, getAway: (f: any) => f.awayOppAvgMargin5 },
    { name: "Opp Margin 10-game (SoS Quality)", getHome: (f: any) => f.homeOppAvgMargin10, getAway: (f: any) => f.awayOppAvgMargin10 },
    { name: "Points Scored 5-game", getHome: (f: any) => f.homePointsAvg5, getAway: (f: any) => f.awayPointsAvg5 },
    { name: "Points Scored 10-game", getHome: (f: any) => f.homePointsAvg10, getAway: (f: any) => f.awayPointsAvg10 },
    { name: "Points Allowed 5-game (Defense)", getHome: (f: any) => f.homeDefEff5, getAway: (f: any) => f.awayDefEff5 },
    { name: "Points Allowed 10-game (Defense)", getHome: (f: any) => f.homeDefEff10, getAway: (f: any) => f.awayDefEff10 },
    { name: "Pace 5-game (Tempo)", getHome: (f: any) => f.homePace5, getAway: (f: any) => f.awayPace5 },
    { name: "Pace 10-game (Tempo)", getHome: (f: any) => f.homePace10, getAway: (f: any) => f.awayPace10 },
    { name: "Model-Market Divergence", getHome: (f: any, g: any) => g.divergence, getAway: (f: any, g: any) => g.divergence }
  ];

  console.log("Average Feature Values (Team Bet On):");
  console.log("─".repeat(95));
  console.log("Feature".padEnd(40) + "Winners".padEnd(15) + "Losers".padEnd(15) + "Difference".padEnd(15) + "Edge");
  console.log("─".repeat(95));

  for (const stat of statsToAnalyze) {
    const winnerValues = winners.map(g => {
      const val = g.betOnHome ? stat.getHome(g.features, g) : stat.getAway(g.features, g);
      return val !== undefined ? val : 0;
    });
    const loserValues = losers.map(g => {
      const val = g.betOnHome ? stat.getHome(g.features, g) : stat.getAway(g.features, g);
      return val !== undefined ? val : 0;
    });

    const winnerAvg = winnerValues.reduce((a, b) => a + b, 0) / winnerValues.length;
    const loserAvg = loserValues.reduce((a, b) => a + b, 0) / loserValues.length;
    const diff = winnerAvg - loserAvg;
    const edge = diff > 0 ? "✓ Winners higher" : diff < 0 ? "✗ Losers higher" : "= Equal";

    console.log(
      stat.name.padEnd(40) +
      winnerAvg.toFixed(3).padEnd(15) +
      loserAvg.toFixed(3).padEnd(15) +
      (diff >= 0 ? '+' : '') + diff.toFixed(3).padEnd(15) +
      edge
    );
  }

  console.log("─".repeat(95));
  console.log("\n💡 Key Insights:");
  
  // Find biggest differentiators
  const diffs = statsToAnalyze.map(stat => {
    const winnerValues = winners.map(g => {
      const val = g.betOnHome ? stat.getHome(g.features, g) : stat.getAway(g.features, g);
      return val !== undefined ? val : 0;
    });
    const loserValues = losers.map(g => {
      const val = g.betOnHome ? stat.getHome(g.features, g) : stat.getAway(g.features, g);
      return val !== undefined ? val : 0;
    });
    const winnerAvg = winnerValues.reduce((a, b) => a + b, 0) / winnerValues.length;
    const loserAvg = loserValues.reduce((a, b) => a + b, 0) / loserValues.length;
    return { name: stat.name, diff: Math.abs(winnerAvg - loserAvg), direction: winnerAvg > loserAvg ? 'higher' : 'lower' };
  }).sort((a, b) => b.diff - a.diff);

  console.log(`   Top 3 predictive features (by difference):`);
  for (let i = 0; i < Math.min(3, diffs.length); i++) {
    console.log(`   ${i + 1}. ${diffs[i].name} (winners ${diffs[i].direction} by ${diffs[i].diff.toFixed(3)})`);
  }

  // Analyze high-confidence vs low-confidence bets
  const highConfidence = gamesWithFeatures.filter(g => Math.abs(g.modelProb - 0.5) > 0.2);
  const lowConfidence = gamesWithFeatures.filter(g => Math.abs(g.modelProb - 0.5) <= 0.2);
  
  const highConfWinRate = highConfidence.filter(g => g.won).length / highConfidence.length;
  const lowConfWinRate = lowConfidence.filter(g => g.won).length / lowConfidence.length;
  
  console.log(`\n   High-confidence bets (>70% or <30%): ${(highConfWinRate * 100).toFixed(1)}% win rate (${highConfidence.length} bets)`);
  console.log(`   Low-confidence bets (40-60%): ${(lowConfWinRate * 100).toFixed(1)}% win rate (${lowConfidence.length} bets)`);

  console.log("\n═══════════════════════════════════════════════════════════════════════\n");

  // Save backtest results to disk
  const backtestResults: BacktestResults = {
    sport,
    market: "moneyline",
    seasons,
    timestamp: new Date().toISOString(),
    totalGames: games.length,
    gamesWithPredictions: predictedGames,
    gamesWithOdds: results.length,
    overallROI: totalROI,
    overallECE: totalError,
    totalProfit,
    totalBets,
    calibration: calibration.map(c => ({
      ...c,
      roi: c.bets > 0 ? ((c.profit / (c.bets * 10)) * 100) : 0
    }))
  };
  await saveBacktestResults(backtestResults);
}

/**
 * Backtest spread model predictions
 * Groups predictions into bins and checks if actual cover rates match predicted rates
 */
export async function backtestSpreads(sport: Sport, seasons: number[]): Promise<void> {
  const db = getDb();
  
  // Get all completed games with odds for these seasons
  const seasonPlaceholders = seasons.map(() => '?').join(',');
  const games = db.prepare(`
    SELECT g.id, g.espn_event_id, g.date, g.home_score, g.away_score,
           g.home_team_id, g.away_team_id
    FROM games g
    WHERE g.sport = ? 
      AND g.season IN (${seasonPlaceholders})
      AND g.home_score IS NOT NULL 
      AND g.away_score IS NOT NULL
    ORDER BY g.date
  `).all(sport, ...seasons) as Array<{
    id: number;
    espn_event_id: string;
    date: string;
    home_score: number;
    away_score: number;
    home_team_id: number;
    away_team_id: number;
  }>;

  if (games.length === 0) {
    console.log(`\n⚠️  No completed games found for ${sport.toUpperCase()} season${seasons.length > 1 ? 's' : ''} ${seasons.join(', ')}`);
    console.log(`Skipping spread backtest for this sport.\n`);
    return;
  }

  console.log(`\n📊 SPREAD MODEL BACKTEST - ${sport.toUpperCase()} ${seasons.join(', ')}`);
  console.log(`Testing ${games.length} completed games\n`);

  // Get model predictions for each date
  const predictions = new Map<string, number>();
  const dateSet = new Set(games.map(g => g.date.slice(0, 10).replace(/-/g, '')));
  
  let predictedGames = 0;
  for (const date of dateSet) {
    try {
      const probs = await getHomeSpreadCoverProbabilities(sport, date);
      if (probs) {
        probs.forEach((prob, eventId) => predictions.set(eventId, prob));
        predictedGames += probs.size;
      }
    } catch (err) {
      // Skip dates without predictions
    }
  }

  console.log(`Model generated predictions for ${predictedGames} games`);
  console.log(`Validating against ${games.length} actual outcomes\n`);

  // For each game, check if we have odds and predictions
  const results: Array<{
    eventId: string;
    modelProb: number;
    marketProb: number;
    homeCovered: boolean;
    line: number;
    homeOdds: number;
    awayOdds: number;
  }> = [];

  for (const game of games) {
    const modelProb = predictions.get(game.espn_event_id);
    if (!modelProb) continue; // No model prediction for this game

    // Get opening spread odds (earliest available, reflects initial market assessment)
    const odds = db.prepare(`
      SELECT market, line, price_home, price_away
      FROM odds
      WHERE game_id = ? AND market = 'spread'
      ORDER BY timestamp ASC
      LIMIT 1
    `).get(game.id) as { market: string; line: number | null; price_home: number; price_away: number } | undefined;

    if (!odds || odds.line === null || !odds.price_home || !odds.price_away) continue;

    // Calculate market implied probability (with vig)
    const homeDecimal = odds.price_home < 0 ? (100 / Math.abs(odds.price_home)) + 1 : (odds.price_home / 100) + 1;
    const awayDecimal = odds.price_away < 0 ? (100 / Math.abs(odds.price_away)) + 1 : (odds.price_away / 100) + 1;
    const homeImplied = 1 / homeDecimal;
    const awayImplied = 1 / awayDecimal;
    const marketProb = homeImplied / (homeImplied + awayImplied); // Vig-free

    // Home covers if: home_score + line > away_score
    const homeCovered = (game.home_score + odds.line) > game.away_score;

    results.push({
      eventId: game.espn_event_id,
      modelProb,
      marketProb,
      homeCovered,
      line: odds.line,
      homeOdds: odds.price_home,
      awayOdds: odds.price_away
    });
  }

  console.log(`Matched ${results.length} games with both predictions and odds\n`);

  // Bin predictions and calculate calibration
  const bins = [
    { min: 0, max: 0.10, label: "0-10%" },
    { min: 0.10, max: 0.20, label: "10-20%" },
    { min: 0.20, max: 0.30, label: "20-30%" },
    { min: 0.30, max: 0.40, label: "30-40%" },
    { min: 0.40, max: 0.50, label: "40-50%" },
    { min: 0.50, max: 0.60, label: "50-60%" },
    { min: 0.60, max: 0.70, label: "60-70%" },
    { min: 0.70, max: 0.80, label: "70-80%" },
    { min: 0.80, max: 0.90, label: "80-90%" },
    { min: 0.90, max: 1.00, label: "90-100%" }
  ];

  const calibration: BacktestResult[] = [];

  for (const bin of bins) {
    const binResults = results.filter(r => r.modelProb >= bin.min && r.modelProb < bin.max);
    if (binResults.length === 0) continue;

    const avgPredicted = binResults.reduce((sum, r) => sum + r.modelProb, 0) / binResults.length;
    const actualCovers = binResults.filter(r => r.homeCovered).length;
    const actualRate = actualCovers / binResults.length;

    // Calculate profit if we bet on every game in this bin
    let profit = 0;
    let bets = 0;
    for (const r of binResults) {
      // Bet on home spread if model thinks home will cover, away spread otherwise
      if (r.modelProb > 0.5) {
        bets++;
        if (r.homeCovered) {
          // Won home spread bet
          const payout = r.homeOdds < 0 ? (100 / Math.abs(r.homeOdds)) + 1 : (r.homeOdds / 100) + 1;
          profit += (payout - 1) * 10; // $10 bet
        } else {
          profit -= 10;
        }
      } else {
        bets++;
        if (!r.homeCovered) {
          // Won away spread bet
          const payout = r.awayOdds < 0 ? (100 / Math.abs(r.awayOdds)) + 1 : (r.awayOdds / 100) + 1;
          profit += (payout - 1) * 10;
        } else {
          profit -= 10;
        }
      }
    }

    calibration.push({
      bin: bin.label,
      predicted: avgPredicted,
      actual: actualRate,
      count: binResults.length,
      bets,
      profit
    });
  }

  // Calculate Expected Calibration Error (ECE)
  const ece = calibration.reduce((sum, bin) => {
    return sum + (bin.count / results.length) * Math.abs(bin.predicted - bin.actual);
  }, 0);

  // Calculate total profit and ROI
  const totalProfit = calibration.reduce((sum, bin) => sum + bin.profit, 0);
  const totalBets = calibration.reduce((sum, bin) => sum + bin.bets, 0);
  const roi = (totalProfit / (totalBets * 10)) * 100;

  // Print results
  console.log("CALIBRATION ANALYSIS");
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("Bin       | Predicted | Actual | Count | Error  | Profit (if bet all)");
  console.log("───────────────────────────────────────────────────────────────────────");
  
  for (const bin of calibration) {
    const error = Math.abs(bin.predicted - bin.actual);
    const roiBin = (bin.profit / (bin.bets * 10)) * 100;
    console.log(
      `${bin.bin.padEnd(10)}| ${(bin.predicted * 100).toFixed(1).padStart(5)}%` +
      `| ${(bin.actual * 100).toFixed(1).padStart(6)}% ` +
      `| ${String(bin.count).padStart(5)} ` +
      `| ${(error * 100).toFixed(1).padStart(5)}%` +
      `| ${bin.profit >= 0 ? '+' : ''}$${bin.profit.toFixed(2).padStart(8)}  ` +
      `(${roiBin >= 0 ? '+' : ''}${roiBin.toFixed(1)}% ROI)`
    );
  }
  
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log(`Overall Calibration Error: ${(ece * 100).toFixed(2)}%`);
  console.log(`Total Profit (if bet all): $${totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(2)} on ${totalBets} bets`);
  console.log(`Return on Investment: ${roi >= 0 ? '+' : ''}${roi.toFixed(2)}%`);
  console.log("═══════════════════════════════════════════════════════════════════════\n");

  // Underdog performance analysis
  console.log("UNDERDOG PERFORMANCE (when model favored underdog on spread)");
  console.log("═══════════════════════════════════════════════════════════════════════");
  
  const thresholds = [
    { label: "+200 or worse", minOdds: 200 },
    { label: "+300 or worse", minOdds: 300 },
    { label: "+500 or worse", minOdds: 500 },
    { label: "+1000 or worse", minOdds: 1000 }
  ];

  for (const threshold of thresholds) {
    const underdogBets = results.filter(r => {
      const isUnderdog = r.marketProb < 0.5;
      const modelFavors = r.modelProb > r.marketProb;
      const meetsThreshold = r.homeOdds >= threshold.minOdds || r.awayOdds >= threshold.minOdds;
      return isUnderdog && modelFavors && meetsThreshold;
    });

    if (underdogBets.length === 0) continue;

    const wins = underdogBets.filter(r => {
      if (r.modelProb > 0.5) return r.homeCovered;
      else return !r.homeCovered;
    }).length;

    let underdogProfit = 0;
    for (const r of underdogBets) {
      if (r.modelProb > 0.5) {
        if (r.homeCovered) {
          const payout = r.homeOdds < 0 ? (100 / Math.abs(r.homeOdds)) + 1 : (r.homeOdds / 100) + 1;
          underdogProfit += (payout - 1) * 10;
        } else {
          underdogProfit -= 10;
        }
      } else {
        if (!r.homeCovered) {
          const payout = r.awayOdds < 0 ? (100 / Math.abs(r.awayOdds)) + 1 : (r.awayOdds / 100) + 1;
          underdogProfit += (payout - 1) * 10;
        } else {
          underdogProfit -= 10;
        }
      }
    }

    const underdogRoi = (underdogProfit / (underdogBets.length * 10)) * 100;
    console.log(`${threshold.label}: ${wins}/${underdogBets.length} correct (${(wins / underdogBets.length * 100).toFixed(1)}%), ROI: ${underdogRoi >= 0 ? '+' : ''}${underdogRoi.toFixed(1)}%`);
  }

  console.log("\n═══════════════════════════════════════════════════════════════════════\n");

  // Save backtest results to disk
  const backtestResults: BacktestResults = {
    sport,
    market: "spread",
    seasons,
    timestamp: new Date().toISOString(),
    totalGames: games.length,
    gamesWithPredictions: predictedGames,
    gamesWithOdds: results.length,
    overallROI: roi,
    overallECE: ece,
    totalProfit,
    totalBets,
    calibration: calibration.map(c => {
      const roiBin = (c.profit / (c.bets * 10)) * 100;
      return { ...c, roi: roiBin };
    })
  };
  await saveBacktestResults(backtestResults);
}

/**
 * Backtest totals (over/under) model predictions
 * Groups predictions into bins and checks if actual over rates match predicted rates
 */
export async function backtestTotals(sport: Sport, seasons: number[]): Promise<void> {
  const db = getDb();
  
  // Get all completed games with odds for these seasons
  const seasonPlaceholders = seasons.map(() => '?').join(',');
  const games = db.prepare(`
    SELECT g.id, g.espn_event_id, g.date, g.home_score, g.away_score,
           g.home_team_id, g.away_team_id
    FROM games g
    WHERE g.sport = ? 
      AND g.season IN (${seasonPlaceholders})
      AND g.home_score IS NOT NULL 
      AND g.away_score IS NOT NULL
    ORDER BY g.date
  `).all(sport, ...seasons) as Array<{
    id: number;
    espn_event_id: string;
    date: string;
    home_score: number;
    away_score: number;
    home_team_id: number;
    away_team_id: number;
  }>;

  if (games.length === 0) {
    console.log(`\n⚠️  No completed games found for ${sport.toUpperCase()} season${seasons.length > 1 ? 's' : ''} ${seasons.join(', ')}`);
    console.log(`Skipping totals backtest for this sport.\n`);
    return;
  }

  console.log(`\n📊 TOTALS (OVER/UNDER) MODEL BACKTEST - ${sport.toUpperCase()} ${seasons.join(', ')}`);
  console.log(`Testing ${games.length} completed games\n`);

  // Get model predictions for each date
  const predictions = new Map<string, number>();
  const dateSet = new Set(games.map(g => g.date.slice(0, 10).replace(/-/g, '')));
  
  let predictedGames = 0;
  for (const date of dateSet) {
    try {
      const probs = await getTotalOverModelProbabilities(sport, date);
      if (probs) {
        probs.forEach((prob, eventId) => predictions.set(eventId, prob));
        predictedGames += probs.size;
      }
    } catch (err) {
      // Skip dates without predictions
    }
  }

  console.log(`Model generated predictions for ${predictedGames} games`);
  console.log(`Validating against ${games.length} actual outcomes\n`);

  // For each game, check if we have odds and predictions
  const results: Array<{
    eventId: string;
    modelProb: number;
    marketProb: number;
    wentOver: boolean;
    overOdds: number;
    underOdds: number;
    totalLine: number;
    totalScore: number;
  }> = [];

  for (const game of games) {
    const modelProb = predictions.get(game.espn_event_id);
    if (!modelProb) continue; // No model prediction for this game

    // Get market odds (EXCLUDE live odds to prevent contamination)
    const odds = db.prepare(`
      SELECT market, line, price_over, price_under
      FROM odds
      WHERE game_id = ? 
        AND market = 'total'
        AND provider NOT LIKE '%Live Odds%'
      ORDER BY timestamp ASC
      LIMIT 1
    `).get(game.id) as { market: string; line: number; price_over: number; price_under: number } | undefined;

    if (!odds || !odds.line || !odds.price_over || !odds.price_under) continue;

    // Calculate market implied probability (with vig)
    const overDecimal = odds.price_over < 0 ? (100 / Math.abs(odds.price_over)) + 1 : (odds.price_over / 100) + 1;
    const underDecimal = odds.price_under < 0 ? (100 / Math.abs(odds.price_under)) + 1 : (odds.price_under / 100) + 1;
    const overImplied = 1 / overDecimal;
    const underImplied = 1 / underDecimal;
    const marketProb = overImplied / (overImplied + underImplied); // Vig-free

    const totalScore = game.home_score + game.away_score;
    const wentOver = totalScore > odds.line;

    results.push({
      eventId: game.espn_event_id,
      modelProb,
      marketProb,
      wentOver,
      overOdds: odds.price_over,
      underOdds: odds.price_under,
      totalLine: odds.line,
      totalScore
    });
  }

  console.log(`Matched ${results.length} games with both predictions and odds\n`);

  if (results.length === 0) {
    console.log(`⚠️  No games with totals odds found. Skipping backtest.\n`);
    return;
  }

  // Bin predictions and calculate calibration
  const bins = [
    { min: 0, max: 0.10, label: "0-10%" },
    { min: 0.10, max: 0.20, label: "10-20%" },
    { min: 0.20, max: 0.30, label: "20-30%" },
    { min: 0.30, max: 0.40, label: "30-40%" },
    { min: 0.40, max: 0.50, label: "40-50%" },
    { min: 0.50, max: 0.60, label: "50-60%" },
    { min: 0.60, max: 0.70, label: "60-70%" },
    { min: 0.70, max: 0.80, label: "70-80%" },
    { min: 0.80, max: 0.90, label: "80-90%" },
    { min: 0.90, max: 1.00, label: "90-100%" }
  ];

  const calibration: BacktestResult[] = [];

  for (const bin of bins) {
    const binResults = results.filter(r => r.modelProb >= bin.min && r.modelProb < bin.max);
    if (binResults.length === 0) continue;

    const avgPredicted = binResults.reduce((sum, r) => sum + r.modelProb, 0) / binResults.length;
    const actualOvers = binResults.filter(r => r.wentOver).length;
    const actualRate = actualOvers / binResults.length;

    // Calculate profit if we bet on every game in this bin
    let profit = 0;
    let bets = 0;
    for (const r of binResults) {
      // Bet on Over if model thinks it will go over, Under otherwise
      if (r.modelProb > 0.5) {
        bets++;
        if (r.wentOver) {
          // Won Over bet
          const payout = r.overOdds < 0 ? (100 / Math.abs(r.overOdds)) + 1 : (r.overOdds / 100) + 1;
          profit += (payout - 1) * 10; // $10 bet
        } else {
          profit -= 10;
        }
      } else {
        bets++;
        if (!r.wentOver) {
          // Won Under bet
          const payout = r.underOdds < 0 ? (100 / Math.abs(r.underOdds)) + 1 : (r.underOdds / 100) + 1;
          profit += (payout - 1) * 10;
        } else {
          profit -= 10;
        }
      }
    }

    calibration.push({
      bin: bin.label,
      predicted: avgPredicted,
      actual: actualRate,
      count: binResults.length,
      bets,
      profit
    });
  }

  // Print calibration table
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("CALIBRATION ANALYSIS");
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("Bin       | Predicted | Actual | Count | Error  | Profit (if bet all)");
  console.log("───────────────────────────────────────────────────────────────────────");

  for (const c of calibration) {
    const error = Math.abs(c.predicted - c.actual);
    const profitStr = c.profit >= 0 ? `+$${c.profit.toFixed(2)}` : `-$${Math.abs(c.profit).toFixed(2)}`;
    const roi = c.bets > 0 ? ((c.profit / (c.bets * 10)) * 100).toFixed(1) : "0.0";
    console.log(
      `${c.bin.padEnd(9)} | ${(c.predicted * 100).toFixed(1)}%`.padEnd(12) +
      `| ${(c.actual * 100).toFixed(1)}%`.padEnd(8) +
      `| ${c.count.toString().padEnd(5)} | ${(error * 100).toFixed(1)}%`.padEnd(8) +
      `| ${profitStr.padEnd(10)} (${roi}% ROI)`
    );
  }

  // Calculate overall metrics
  const totalError = calibration.reduce((sum, c) => sum + Math.abs(c.predicted - c.actual) * c.count, 0) / 
                     calibration.reduce((sum, c) => sum + c.count, 0);
  const totalProfit = calibration.reduce((sum, c) => sum + c.profit, 0);
  const totalBets = calibration.reduce((sum, c) => sum + c.bets, 0);
  const totalROI = totalBets > 0 ? ((totalProfit / (totalBets * 10)) * 100) : 0;

  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log(`Overall Calibration Error: ${(totalError * 100).toFixed(2)}%`);
  console.log(`Total Profit (if bet all): ${totalProfit >= 0 ? '+' : ''}$${totalProfit.toFixed(2)} on ${totalBets} bets`);
  console.log(`Return on Investment: ${totalROI >= 0 ? '+' : ''}${totalROI.toFixed(2)}%`);
  console.log("═══════════════════════════════════════════════════════════════════════\n");

  // Analyze model-market divergence
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("MODEL-MARKET DIVERGENCE ANALYSIS");
  console.log("═══════════════════════════════════════════════════════════════════════");
  
  const divergenceThresholds = [
    { label: "High divergence (>10%)", minDivergence: 0.10 },
    { label: "Moderate divergence (5-10%)", minDivergence: 0.05, maxDivergence: 0.10 },
    { label: "Low divergence (<5%)", maxDivergence: 0.05 }
  ];

  for (const threshold of divergenceThresholds) {
    const divergentGames = results.filter(r => {
      const div = Math.abs(r.modelProb - r.marketProb);
      if (threshold.maxDivergence !== undefined) {
        return div < threshold.maxDivergence && (threshold.minDivergence === undefined || div >= threshold.minDivergence);
      }
      return threshold.minDivergence !== undefined && div >= threshold.minDivergence;
    });

    if (divergentGames.length === 0) continue;

    let correctPicks = 0;
    let profit = 0;
    let bets = 0;

    for (const r of divergentGames) {
      // Only count as a "pick" if model disagrees with market (different side)
      const modelFavorsOver = r.modelProb > 0.5;
      const marketFavorsOver = r.marketProb > 0.5;
      
      if (modelFavorsOver !== marketFavorsOver) {
        bets++;
        if (modelFavorsOver) {
          // Model says Over
          if (r.wentOver) {
            correctPicks++;
            const payout = r.overOdds < 0 ? (100 / Math.abs(r.overOdds)) + 1 : (r.overOdds / 100) + 1;
            profit += (payout - 1) * 10;
          } else {
            profit -= 10;
          }
        } else {
          // Model says Under
          if (!r.wentOver) {
            correctPicks++;
            const payout = r.underOdds < 0 ? (100 / Math.abs(r.underOdds)) + 1 : (r.underOdds / 100) + 1;
            profit += (payout - 1) * 10;
          } else {
            profit -= 10;
          }
        }
      }
    }

    console.log(`\n${threshold.label}:`);
    console.log(`  Total games: ${divergentGames.length}`);
    console.log(`  Model disagrees with market: ${bets} times`);
    console.log(`  Correct picks: ${correctPicks}/${bets} (${bets > 0 ? ((correctPicks / bets) * 100).toFixed(1) : '0.0'}%)`);
    console.log(`  Profit if bet disagreements: ${profit >= 0 ? '+' : ''}$${profit.toFixed(2)}`);
    console.log(`  ROI: ${bets > 0 ? ((profit / (bets * 10)) * 100).toFixed(1) : '0.0'}%`);
  }

  console.log("\n═══════════════════════════════════════════════════════════════════════\n");

  // FEATURE ANALYSIS: What stats correlate with profitable totals predictions?
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("FEATURE ANALYSIS: Winners vs Losers");
  console.log("═══════════════════════════════════════════════════════════════════════\n");

  // Compute features for all games
  const allFeatures = computeFeatures(db, sport, seasons);
  const featureMap = new Map(allFeatures.map(f => [f.gameId, f]));

  // Match games with features
  const gamesWithFeatures = results
    .map(r => {
      const game = games.find(g => g.espn_event_id === r.eventId);
      if (!game) return null;
      const features = featureMap.get(game.id);
      if (!features) return null;
      
      // Determine if this was a profitable bet
      const betOnOver = r.modelProb > 0.5;
      const won = betOnOver ? r.wentOver : !r.wentOver;
      const odds = betOnOver ? r.overOdds : r.underOdds;
      const payout = odds < 0 ? (100 / Math.abs(odds)) + 1 : (odds / 100) + 1;
      const profit = won ? (payout - 1) * 10 : -10;
      
      return {
        ...r,
        features,
        betOnOver,
        won,
        profit,
        divergence: Math.abs(r.modelProb - r.marketProb)
      };
    })
    .filter(g => g !== null);

  if (gamesWithFeatures.length === 0) {
    console.log("⚠️  No games with features available for analysis\n");
    return;
  }

  // Split into winners and losers
  const winners = gamesWithFeatures.filter(g => g.profit > 0);
  const losers = gamesWithFeatures.filter(g => g.profit < 0);

  console.log(`Analyzing ${winners.length} profitable bets vs ${losers.length} losing bets\n`);

  // Key stats to analyze for totals
  const statsToAnalyze = [
    { name: "Combined Points/Game 5-game", getValue: (f: any) => (f.homePointsAvg5 + f.awayPointsAvg5) },
    { name: "Combined Points/Game 10-game", getValue: (f: any) => (f.homePointsAvg10 + f.awayPointsAvg10) },
    { name: "Combined Pace 5-game", getValue: (f: any) => (f.homePace5 + f.awayPace5) },
    { name: "Combined Pace 10-game", getValue: (f: any) => (f.homePace10 + f.awayPace10) },
    { name: "Combined Defense 5-game", getValue: (f: any) => (f.homeDefEff5 + f.awayDefEff5) },
    { name: "Combined Defense 10-game", getValue: (f: any) => (f.homeDefEff10 + f.awayDefEff10) },
    { name: "Home Points/Game 5-game", getValue: (f: any) => f.homePointsAvg5 },
    { name: "Away Points/Game 5-game", getValue: (f: any) => f.awayPointsAvg5 },
    { name: "Home Points/Game 10-game", getValue: (f: any) => f.homePointsAvg10 },
    { name: "Away Points/Game 10-game", getValue: (f: any) => f.awayPointsAvg10 },
    { name: "Home Pace 5-game", getValue: (f: any) => f.homePace5 },
    { name: "Away Pace 5-game", getValue: (f: any) => f.awayPace5 },
    { name: "Home Pace 10-game", getValue: (f: any) => f.homePace10 },
    { name: "Away Pace 10-game", getValue: (f: any) => f.awayPace10 },
    { name: "Model-Market Divergence", getValue: (f: any, g: any) => g.divergence }
  ];

  console.log("Average Feature Values:");
  console.log("─".repeat(95));
  console.log("Feature".padEnd(40) + "Winners".padEnd(15) + "Losers".padEnd(15) + "Difference".padEnd(15) + "Edge");
  console.log("─".repeat(95));

  for (const stat of statsToAnalyze) {
    const winnerValues = winners.map(g => {
      const val = stat.getValue(g.features, g);
      return val !== undefined ? val : 0;
    });
    const loserValues = losers.map(g => {
      const val = stat.getValue(g.features, g);
      return val !== undefined ? val : 0;
    });

    const winnerAvg = winnerValues.reduce((a, b) => a + b, 0) / winnerValues.length;
    const loserAvg = loserValues.reduce((a, b) => a + b, 0) / loserValues.length;
    const diff = winnerAvg - loserAvg;
    const edge = diff > 0 ? "✓ Winners higher" : diff < 0 ? "✗ Losers higher" : "= Equal";

    console.log(
      stat.name.padEnd(40) +
      winnerAvg.toFixed(3).padEnd(15) +
      loserAvg.toFixed(3).padEnd(15) +
      (diff >= 0 ? '+' : '') + diff.toFixed(3).padEnd(15) +
      edge
    );
  }

  console.log("─".repeat(95));
  console.log("\n💡 Key Insights:");
  
  // Find biggest differentiators
  const diffs = statsToAnalyze.map(stat => {
    const winnerValues = winners.map(g => {
      const val = stat.getValue(g.features, g);
      return val !== undefined ? val : 0;
    });
    const loserValues = losers.map(g => {
      const val = stat.getValue(g.features, g);
      return val !== undefined ? val : 0;
    });
    const winnerAvg = winnerValues.reduce((a, b) => a + b, 0) / winnerValues.length;
    const loserAvg = loserValues.reduce((a, b) => a + b, 0) / loserValues.length;
    return { name: stat.name, diff: Math.abs(winnerAvg - loserAvg), direction: winnerAvg > loserAvg ? 'higher' : 'lower' };
  }).sort((a, b) => b.diff - a.diff);

  console.log(`   Top 3 predictive features (by difference):`);
  for (let i = 0; i < Math.min(3, diffs.length); i++) {
    console.log(`   ${i + 1}. ${diffs[i].name} (winners ${diffs[i].direction} by ${diffs[i].diff.toFixed(3)})`);
  }

  // Analyze high-confidence vs low-confidence bets
  const highConfidence = gamesWithFeatures.filter(g => Math.abs(g.modelProb - 0.5) > 0.2);
  const lowConfidence = gamesWithFeatures.filter(g => Math.abs(g.modelProb - 0.5) <= 0.2);
  
  const highConfWinRate = highConfidence.filter(g => g.won).length / highConfidence.length;
  const lowConfWinRate = lowConfidence.filter(g => g.won).length / lowConfidence.length;
  
  console.log(`\n   High-confidence bets (>70% or <30%): ${(highConfWinRate * 100).toFixed(1)}% win rate (${highConfidence.length} bets)`);
  console.log(`   Low-confidence bets (40-60%): ${(lowConfWinRate * 100).toFixed(1)}% win rate (${lowConfidence.length} bets)`);

  console.log("\n═══════════════════════════════════════════════════════════════════════\n");

  // Save backtest results to disk
  const backtestResults: BacktestResults = {
    sport,
    market: "total",
    seasons,
    timestamp: new Date().toISOString(),
    totalGames: games.length,
    gamesWithPredictions: predictedGames,
    gamesWithOdds: results.length,
    overallROI: totalROI,
    overallECE: totalError,
    totalProfit,
    totalBets,
    calibration: calibration.map(c => ({
      ...c,
      roi: c.bets > 0 ? ((c.profit / (c.bets * 10)) * 100) : 0
    }))
  };
  await saveBacktestResults(backtestResults);
}

/**
 * Backtest model predictions against actual outcomes
 * Validates if model probabilities are well-calibrated
 */

import { getDb } from "../db/index.js";
import { getHomeWinModelProbabilities } from "./apply.js";
import type { Sport } from "../models/types.js";

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
export async function backtestMoneyline(sport: Sport, season: number): Promise<void> {
  const db = getDb();
  
  // Get all completed games with odds for this season
  const games = db.prepare(`
    SELECT g.id, g.espn_event_id, g.date, g.home_score, g.away_score,
           g.home_team_id, g.away_team_id
    FROM games g
    WHERE g.sport = ? 
      AND g.season = ?
      AND g.home_score IS NOT NULL 
      AND g.away_score IS NOT NULL
    ORDER BY g.date
  `).all(sport, season) as Array<{
    id: number;
    espn_event_id: string;
    date: string;
    home_score: number;
    away_score: number;
    home_team_id: number;
    away_team_id: number;
  }>;

  console.log(`\n📊 MONEYLINE MODEL BACKTEST - ${sport.toUpperCase()} ${season}`);
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

    // Get market odds
    const odds = db.prepare(`
      SELECT market, line, price_home, price_away
      FROM odds
      WHERE game_id = ? AND market = 'moneyline'
      ORDER BY timestamp DESC
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
}

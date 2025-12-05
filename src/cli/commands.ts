// Helper to format a game date string for display
function formatGameDate(dateStr: string | Date | undefined): string {
  if (!dateStr) return '';
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
    timeZoneName: 'short'
  });
}
// Helper to build a date range array from a start date and number of days
function buildDateRange(start: string, days: number): string[] {
  const dates: string[] = [];
  const baseDate = new Date(
    parseInt(start.slice(0, 4)),
    parseInt(start.slice(4, 6)) - 1,
    parseInt(start.slice(6, 8))
  );
  for (let i = 0; i < days; i++) {
    const d = new Date(baseDate);
    d.setDate(baseDate.getDate() + i);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    dates.push(`${year}${month}${day}`);
  }
  return dates;
}
/**
 * CLI command handlers
 */

import chalk from "chalk";
import type { Sport } from "../models/types.js";
import { fetchEvents as fetchEventsNcaam } from "../espn/ncaam/events.js";
import { fetchOdds as fetchOddsNcaam, normalizeOdds as normalizeOddsNcaam } from "../espn/ncaam/odds.js";
import { fetchEvents as fetchEventsCfb } from "../espn/cfb/events.js";
import { fetchOdds as fetchOddsCfb, normalizeOdds as normalizeOddsCfb } from "../espn/cfb/odds.js";
import { fetchEvents as fetchEventsNfl } from "../espn/nfl/events.js";
import { fetchOdds as fetchOddsNfl, normalizeOdds as normalizeOddsNfl } from "../espn/nfl/odds.js";
import { fetchEvents as fetchEventsNba } from "../espn/nba/events.js";
import { fetchOdds as fetchOddsNba, normalizeOdds as normalizeOddsNba } from "../espn/nba/odds.js";
import { evaluateParlay, generateParlays, rankParlaysByEV, filterPositiveEV } from "../parlay/eval.js";
import { getHomeWinModelProbabilities, getHomeSpreadCoverProbabilities, getTotalOverModelProbabilities } from "../model/apply.js";
import type { BetLeg, Competition, ParlayResult } from "../models/types.js";
import { getLatestBacktestForConfig, type BacktestResults } from "../model/backtest-storage.js";
import { getOptimalSeasons } from "../model/optimal-config.js";
import { logRecommendedBet, markBetsAsPlaced, type TrackedBet } from "../tracking/bet-logger.js";
import * as readline from "readline";
import { trainUnderdogModel } from "../underdog/underdog-train.js";
import { predictUnderdogs, displayUnderdogPredictions } from "../underdog/underdog-predict.js";
import { backtestUnderdogModel, compareUnderdogVsMainModel } from "../underdog/underdog-backtest.js";
import { analyzeWinningUnderdogs } from "../underdog/analyze-winners.js";
import { computeUnderdogFeatures } from "../underdog/underdog-features.js";
import type { UnderdogTier, UnderdogPrediction, UnderdogGameFeatures } from "../underdog/types.js";
import { cmdOddsRefresh } from "../data/ingest.js";

/**
 * Underdog ROI by sport (from comprehensive analysis across all sports)
 * 
 * Analysis Summary:
 * - NFL +100-149: +6.71% ROI, 47.3% win rate, HOME dogs win more (47.8%)
 * - NBA +100-149: +5.27% ROI, 46.8% win rate, AWAY dogs win more (54.4%)
 * - CFB +100-149: +4.90% ROI, 46.8% win rate, AWAY dogs win more (58.9%)
 * - NCAAM +100-149: -7.55% ROI ❌ NOT PROFITABLE
 * - NHL +150-199: -0.12% ROI ❌ NOT PROFITABLE
 */
const UNDERDOG_ROI_BY_SPORT: Record<string, { roi: number; bucket: string }> = {
  nfl: { roi: 6.71, bucket: "+100 to +149" },
  nba: { roi: 5.27, bucket: "+100 to +149" },
  cfb: { roi: 4.90, bucket: "+100 to +149" }
  // NCAAM and NHL excluded - negative ROI
};

/**
 * NFL Spread ROI by confidence bucket (from backtest analysis)
 */
const NFL_SPREAD_ROI_BY_BUCKET: Record<string, { roi: number; winRate: number; count: number }> = {
  "50-60%": { roi: 36.4, winRate: 71.4, count: 14 }
};

/**
 * Sport-specific underdog home/away preferences from analysis
 * 
 * Key Finding: Home vs Away varies significantly by sport!
 * - NFL: Home dogs win more (47.8% vs 41.1% away)
 * - NBA: Away dogs win more (54.4% away)
 * - CFB: Away dogs win more (58.9% away)
 * - NCAAM: Home dogs win more (47.8%) - but NOT profitable overall
 * - NHL: Away dogs win more (77.8%) - but NOT profitable overall
 */
const UNDERDOG_HOME_AWAY_PREFERENCE: Record<string, 'home' | 'away'> = {
  nfl: 'home',    // +6.71% ROI - Home dogs: 47.8% win rate
  nba: 'away',    // +5.27% ROI - Away dogs: 54.4% win rate
  cfb: 'away'     // +4.90% ROI - Away dogs: 58.9% win rate
  // NCAAM and NHL excluded - not profitable
};

/**
 * Load latest NFL spread model
 */
function loadNFLSpreadModel(): { baseWeights: number[]; marketWeights: number[] } | null {
  const { readdirSync, statSync, readFileSync } = require("fs");
  const { join } = require("path");
  
  const modelsDir = join(process.cwd(), "models", "nfl-spread");
  
  try {
    const dirs = readdirSync(modelsDir)
      .filter((d: string) => {
        const fullPath = join(modelsDir, d);
        return statSync(fullPath).isDirectory();
      })
      .map((d: string) => ({
        name: d,
        path: join(modelsDir, d),
        timestamp: parseInt(d.split('_').pop() || '0', 10)
      }))
      .sort((a: any, b: any) => b.timestamp - a.timestamp);
    
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
 * Check if NFL spread bet matches profitable profile
 * Returns { isProfitable, bucket, roi } if match found, null otherwise
 */
function checkNFLSpreadProfile(
  sport: string,
  market: string,
  line: number | null,
  homeATSRecord: number | null,
  modelProbability: number
): { isProfitable: boolean; bucket: string; roi: number; winRate: number } | null {
  // Only apply to NFL spreads
  if (sport !== 'nfl' || market !== 'spread') return null;
  
  // Check if in profitable bucket (50-60% confidence)
  if (modelProbability < 0.5 || modelProbability >= 0.6) return null;
  
  // Check spread size (avoid tight spreads ≤3, prefer ≥3.5)
  const spreadSize = Math.abs(line || 0);
  if (spreadSize < 3.5) return null;
  
  // Check home ATS record (weaker is better, ≤35%)
  if (homeATSRecord !== null && homeATSRecord > 0.35) return null;
  
  const bucketData = NFL_SPREAD_ROI_BY_BUCKET["50-60%"];
  return {
    isProfitable: true,
    bucket: "50-60%",
    roi: bucketData.roi,
    winRate: bucketData.winRate
  };
}

/**
 * Fetch and display games for a date
 */
async function getFetchers(sport: Sport) {
  if (sport === "cfb") {
    return {
      fetchEvents: fetchEventsCfb,
      fetchOdds: fetchOddsCfb,
      normalizeOdds: normalizeOddsCfb,
    };
  }
  if (sport === "nfl") {
    return {
      fetchEvents: fetchEventsNfl,
      fetchOdds: fetchOddsNfl,
      normalizeOdds: normalizeOddsNfl,
    };
  }
  if (sport === "nba") {
    return {
      fetchEvents: fetchEventsNba,
      fetchOdds: fetchOddsNba,
      normalizeOdds: normalizeOddsNba,
    };
  }
  if (sport === "nhl") {
    const { fetchNHLEvents } = await import("../espn/nhl/events.js");
    const { fetchNHLOdds, normalizeOdds } = await import("../espn/nhl/odds.js");
    return {
      fetchEvents: fetchNHLEvents,
      fetchOdds: fetchNHLOdds,
      normalizeOdds,
    };
  }
  // default to ncaam
  return {
    fetchEvents: fetchEventsNcaam,
    fetchOdds: fetchOddsNcaam,
    normalizeOdds: normalizeOddsNcaam,
  };
}

export async function cmdGamesFetch(sport: Sport, date: string): Promise<void> {
  try {
    const { fetchEvents } = await getFetchers(sport);
    const competitions = await fetchEvents(date);

    if (competitions.length === 0) {
      console.log(chalk.yellow(`No games found for ${date}`));
      return;
    }

    console.log(chalk.bold.cyan(`\n📅 ${competitions.length} game(s) on ${date}:\n`));

    for (const comp of competitions) {
      console.log(chalk.bold(`Event ID: ${comp.eventId}`));
      console.log(chalk.gray(`  ${comp.awayTeam.name} @ ${comp.homeTeam.name}`));
      console.log(chalk.gray(`  Venue: ${comp.venue || "N/A"}`));
      console.log(chalk.gray(`  Date: ${new Date(comp.date).toLocaleString()}`));
      console.log();
    }

    console.log(chalk.dim(`💡 Tip: Use ${chalk.white('odds --sport ' + sport + ' --event <eventId> --date <date>')} to see betting lines`));
  } catch (error) {
    console.error(chalk.red("Error fetching games:"), error);
    process.exit(1);
  }
}

/**
 * Fetch and display odds for an event
 */
export async function cmdOddsImport(sport: Sport, eventId: string, date: string): Promise<void> {
  try {
    const { fetchEvents, fetchOdds, normalizeOdds } = await getFetchers(sport);
    const competitions = await fetchEvents(date);
    const comp = competitions.find((c: Competition) => c.eventId === eventId);

    if (!comp) {
      console.error(chalk.red(`Event ${eventId} not found on ${date}`));
      process.exit(1);
    }

    console.log(chalk.bold.cyan(`\n🎯 ${comp.awayTeam.name} @ ${comp.homeTeam.name}\n`));

    const oddsEntries = await fetchOdds(eventId);

    if (oddsEntries.length === 0) {
      console.log(chalk.yellow("No odds available for this event"));
      return;
    }

    const legs = normalizeOdds(
      eventId,
      oddsEntries,
      comp.homeTeam.abbreviation || comp.homeTeam.name,
      comp.awayTeam.abbreviation || comp.awayTeam.name
    );

    console.log(chalk.gray(`Provider: ${legs[0]?.provider || "N/A"}`));
    console.log(chalk.dim(`(Probabilities shown are "vig-free" - the bookmaker's edge has been removed)\n`));

    const moneylines = legs.filter((l: BetLeg) => l.market === "moneyline");
    const spreads = legs.filter((l: BetLeg) => l.market === "spread");
    const totals = legs.filter((l: BetLeg) => l.market === "total");

    if (moneylines.length > 0) {
      console.log(chalk.bold("💰 Moneylines") + chalk.dim(" (bet on who wins straight-up):"));
      for (const leg of moneylines) {
        const color = leg.impliedProbability > 0.5 ? chalk.green : chalk.yellow;
        console.log(`  ${color(leg.description)} → ${(leg.impliedProbability * 100).toFixed(1)}% chance`);
      }
      console.log();
    }

    if (spreads.length > 0) {
      console.log(chalk.bold("📊 Spreads") + chalk.dim(" (bet on margin of victory):"));
      for (const leg of spreads) {
        console.log(`  ${chalk.cyan(leg.description)} → ${(leg.impliedProbability * 100).toFixed(1)}% chance`);
      }
      console.log();
    }

    if (totals.length > 0) {
      console.log(chalk.bold("🎲 Totals") + chalk.dim(" (bet on combined score over/under):"));
      for (const leg of totals) {
        console.log(`  ${chalk.magenta(leg.description)} → ${(leg.impliedProbability * 100).toFixed(1)}% chance`);
      }
      console.log();
    }

    console.log(chalk.dim(`💡 Tip: Lower vig = better value. Moneylines typically have the lowest bookmaker edge.`));
  } catch (error) {
    console.error(chalk.red("Error importing odds:"), error);
    process.exit(1);
  }
}

/**
 * Show all available bet legs for a single event with EV/ROI
 */
export async function cmdBets(
  sport: Sport,
  eventId: string,
  date: string,
  stake: number
): Promise<void> {
  try {
    const { fetchEvents, fetchOdds, normalizeOdds } = await getFetchers(sport);
    const competitions = await fetchEvents(date);
    const comp = competitions.find((c: Competition) => c.eventId === eventId);
    if (!comp) {
      console.error(chalk.red(`Event ${eventId} not found on ${date}`));
      process.exit(1);
    }

    console.log(chalk.bold.cyan(`\n🎯 Bets for ${comp.awayTeam.name} @ ${comp.homeTeam.name} (stake $${stake.toFixed(2)})\n`));
    const oddsEntries = await fetchOdds(eventId);
    if (oddsEntries.length === 0) {
      console.log(chalk.yellow("No odds available for this event"));
      return;
    }
    const legs = normalizeOdds(
      eventId,
      oddsEntries,
      comp.homeTeam.abbreviation || comp.homeTeam.name,
      comp.awayTeam.abbreviation || comp.awayTeam.name
    );
    if (!legs.length) {
      console.log(chalk.yellow("No bet legs normalized"));
      return;
    }
    console.log(chalk.gray(`Provider: ${legs[0].provider}`));
    console.log(chalk.dim(`(Market probabilities shown - vig removed | Model predictions in brackets)\n`));

    // Load model predictions
    let modelProbs: Map<string, number> | undefined;
    let spreadModelProbs: Map<string, number> | undefined;
    let totalModelProbs: Map<string, number> | undefined;
    
    try {
      modelProbs = await getHomeWinModelProbabilities(sport, date);
      spreadModelProbs = await getHomeSpreadCoverProbabilities(sport, date);
      totalModelProbs = await getTotalOverModelProbabilities(sport, date);
      
      // Debug: show if models loaded but have no predictions for this event
      if (modelProbs && !modelProbs.has(eventId)) {
        console.log(chalk.dim(`\n⚠️  No moneyline model prediction for this event (${modelProbs.size} events have predictions)\n`));
      }
      if (spreadModelProbs && !spreadModelProbs.has(eventId)) {
        console.log(chalk.dim(`⚠️  No spread model prediction for this event (${spreadModelProbs.size} events have predictions)\n`));
      }
      if (totalModelProbs && !totalModelProbs.has(eventId)) {
        console.log(chalk.dim(`⚠️  No totals model prediction for this event (${totalModelProbs.size} events have predictions)\n`));
      }
    } catch (err) {
      console.log(chalk.dim(`\n⚠️  Model predictions unavailable: ${err instanceof Error ? err.message : String(err)}\n`));
    }

    // Group by market
    const markets: Record<string, BetLeg[]> = {
      moneyline: legs.filter((l: BetLeg) => l.market === "moneyline"),
      spread: legs.filter((l: BetLeg) => l.market === "spread"),
      total: legs.filter((l: BetLeg) => l.market === "total")
    };

    for (const [market, mLegs] of Object.entries(markets)) {
      if (!mLegs.length) continue;
      const title = market === "moneyline" ? "Moneylines" : market === "spread" ? "Spreads" : "Totals";
      console.log(chalk.bold(`${title}`));
      const minProfitPercent = 0.4; // Only show bets with at least 40% ROI
      for (const leg of mLegs) {
        const result = evaluateParlay({ legs: [leg], stake });
        const profit = result.payout - stake;
        if (profit < stake * minProfitPercent) continue;
        const evColor = result.ev >= 0 ? chalk.green : chalk.red;
        const evSign = result.ev >= 0 ? "+" : "";

        // Get model prediction for this leg
        let modelPrediction = "";
        if (market === "moneyline" && modelProbs) {
          const homeProb = modelProbs.get(eventId);
          if (homeProb !== undefined) {
            const prob = leg.description.includes(comp.homeTeam.abbreviation || comp.homeTeam.name) ? homeProb : 1 - homeProb;
            modelPrediction = ` [Model: ${(prob * 100).toFixed(1)}%]`;
          }
        } else if (market === "spread" && spreadModelProbs) {
          const homeCoverProb = spreadModelProbs.get(eventId);
          if (homeCoverProb !== undefined) {
            const prob = leg.description.includes(comp.homeTeam.abbreviation || comp.homeTeam.name) ? homeCoverProb : 1 - homeCoverProb;
            modelPrediction = ` [Model: ${(prob * 100).toFixed(1)}%]`;
          }
        } else if (market === "total" && totalModelProbs) {
          const overProb = totalModelProbs.get(eventId);
          if (overProb !== undefined) {
            const prob = leg.description.startsWith("Over") ? overProb : 1 - overProb;
            modelPrediction = ` [Model: ${(prob * 100).toFixed(1)}%]`;
          }
        }

        const profitDisplay = profit > 0 ? ` | Profit: ${chalk.green("$" + profit.toFixed(2))}` : "";

        console.log(
          `  ${leg.description} → ${(leg.impliedProbability * 100).toFixed(2)}%${chalk.cyan(modelPrediction)} | EV: ${evColor(evSign + "$" + result.ev.toFixed(2))} (${evColor(evSign + result.roi.toFixed(2) + "%")})${profitDisplay}`
        );
      }
      console.log();
    }

    const minProfitPercent = 0.4; // Only show bets with at least 40% ROI
    const allLegs = markets.moneyline
      .concat(markets.spread)
      .concat(markets.total);
    const filteredResults = allLegs
      .map(l => evaluateParlay({ legs: [l], stake }))
      .filter(r => (r.payout - stake) >= stake * minProfitPercent);
    const best = filteredResults.sort((a,b) => b.ev - a.ev)[0];
    if (best) {
      const prefix = best.ev >= 0 ? chalk.green.bold("✨ Potential +EV") : chalk.dim("Least negative EV");
      console.log(prefix + chalk.dim(`: ${best.legs[0].description} (EV $${best.ev.toFixed(2)}, ROI ${best.roi.toFixed(2)}%)`));
    }
    console.log(chalk.dim(`\n💡 Use recommend for multi-leg parlays: recommend --sport ${sport} --date ${date} --min-legs 2`));
  } catch (err) {
    console.error(chalk.red("Error showing bets:"), err);
    process.exit(1);
  }
}
/**
 * Get backtest stats for a specific market/sport combination
 * If probability is provided, returns stats for that probability bin
 */
async function getBacktestStats(
  sport: Sport, 
  market: "moneyline" | "spread" | "total",
  probability?: number
): Promise<{
  roi: number | null;
  ece: number | null;
  winRate: number | null;
  seasons: number[];
  gamesAnalyzed: number;
  hasData: boolean;
} | null> {
  try {
    const optimalSeasons = getOptimalSeasons(sport, market);
    if (!optimalSeasons) return null;

    const backtest = await getLatestBacktestForConfig(sport, market, optimalSeasons);
    if (!backtest) return null;

    // If probability specified, find the matching calibration bin
    if (probability !== undefined) {
      const bin = backtest.calibration.find(b => {
        const [minStr, maxStr] = b.bin.split('-').map(s => parseFloat(s.replace('%', '')) / 100);
        return probability >= minStr && probability < maxStr;
      });

      if (bin && bin.count > 0) {
        const binWinRate = bin.actual; // Actual win rate in this bin
        return {
          roi: bin.roi,
          ece: Math.abs(bin.predicted - bin.actual),
          winRate: binWinRate,
          seasons: backtest.seasons,
          gamesAnalyzed: bin.count,
          hasData: true
        };
      }
    }

    // Fall back to overall stats if no probability specified or bin not found
    const totalWins = backtest.calibration.reduce((sum, bin) => {
      const binWinRate = bin.roi > 0 ? 0.5 + (bin.roi / 200) : 0.5 + (bin.roi / 200);
      return sum + (bin.bets * binWinRate);
    }, 0);
    const totalBets = backtest.totalBets;
    const winRate = totalBets > 0 ? (totalWins / totalBets) : null;

    return {
      roi: backtest.overallROI,
      ece: backtest.overallECE,
      winRate,
      seasons: backtest.seasons,
      gamesAnalyzed: backtest.gamesWithOdds,
      hasData: true
    };
  } catch (err) {
    return null;
  }
}

/**
 * Generate and rank parlay recommendations
 */
export async function cmdRecommend(
  sports: Sport[] | undefined,
  date: string,
  stake: number,
  minLegs: number,
  maxLegs: number,
  topN: number,
  days: number = 1,
  divergenceThreshold: number = 0,
  favoritesOnly: boolean = false,
  includeDogsFlag: boolean = false,
  includeParlays: boolean = false,
  interactive: boolean = false,
  showAllBets: boolean = false
): Promise<void> {
  try {
    // If no sports specified, check all sports
    const sportsToCheck: Sport[] = sports || ["ncaam", "cfb", "nfl", "nba", "nhl"];
    // Generate date range
    const dates = buildDateRange(date, days);
    const dateRangeDisplay = days === 1 
      ? date 
      : `${date} through ${dates[dates.length - 1]} (${days} days)`;
    
    const sportDisplay = sports ? sports.join(", ").toUpperCase() : "ALL SPORTS";
    console.log(chalk.bold.cyan(`\n🔍 Analyzing ${sportDisplay} games on ${dateRangeDisplay}...\n`));

    // Show all pending bets (your active positions) and build a lookup for annotation later
    const { loadTrackedBets } = await import("../tracking/bet-logger.js");
    const trackedData = await loadTrackedBets();
    const pendingBets = trackedData.bets.filter(b => b.actuallyBet && b.status === 'pending');
    // Build a map for quick lookup: key = `${sport}:${eventId}:${market}:${sideAbbrev}`
    const placedLookup = new Map<string, { stake: number; odds: number }>();
    for (const b of pendingBets) {
      const placements = b.placements || [];
      const totalStake = placements.reduce((sum, p) => sum + (p.stake || 0), 0) || (b.stake || 0);
      const key = `${b.sport}:${b.eventId}:${b.market}:${b.side}`;
      placedLookup.set(key, { stake: totalStake, odds: b.odds });
    }
    
    if (pendingBets.length > 0) {
      console.log(chalk.bold.green('📌 Your Pending Bets:\n'));
      for (const bet of pendingBets) {
        const placements = bet.placements || [];
        const totalStake = placements.reduce((sum, p) => sum + (p.stake || 0), 0) || (bet.stake || 0);
        const betDate = new Date(bet.date);
        const dateStr = betDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const oddsDisplay = typeof bet.odds === 'number' ? (bet.odds >= 0 ? `+${bet.odds}` : `${bet.odds}`) : '';
        // Display: ✓ MATCHUP PICK - $STAKE - DATE [SPORT]
        console.log(chalk.green(`  ✓ ${bet.matchup} - ${bet.pick.split('[')[0].trim()} [${bet.sport.toUpperCase()}] - $${totalStake.toFixed(2)} - ${dateStr}`));
      }
      console.log();
    }

    // Fetch all games and odds across all sports and dates
    const allCompetitions: Array<Competition & { sport: Sport }> = [];
    
    for (const sport of sportsToCheck) {
      const { fetchEvents } = await getFetchers(sport);
      for (const d of dates) {
        try {
          const competitions = await fetchEvents(d);
          allCompetitions.push(...competitions.map((c: Competition) => ({ ...c, sport })));
        } catch (err) {
          // Silently skip if no games for this sport/date
        }
      }
    }

    if (allCompetitions.length === 0) {
      console.log(chalk.yellow("No games found for this date range"));
      return;
    }

    console.log(chalk.gray(`Found ${allCompetitions.length} games across ${sportsToCheck.length} sport(s) and ${days} day(s)\n`));

    // First, fetch all odds and save them to database so models can use them
    const db = (await import("../db/index.js")).getDb();
    for (const comp of allCompetitions) {
      try {
        const { fetchOdds } = await getFetchers(comp.sport);
        const oddsEntries = await fetchOdds(comp.eventId);
        
        // Get or create game_id for this event
        const gameRow = db.prepare(`SELECT id FROM games WHERE espn_event_id = ?`).get(comp.eventId) as { id: number } | undefined;
        if (gameRow) {
          // Delete old odds for this game to replace with fresh data
          db.prepare(`DELETE FROM odds WHERE game_id = ?`).run(gameRow.id);
          
          // Insert new odds
          const insertOdds = db.prepare(`INSERT INTO odds (game_id, provider, market, line, price_home, price_away, price_over, price_under, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
          const timestamp = new Date().toISOString();
          
          for (const entry of oddsEntries) {
            if (entry.homeTeamOdds.moneyLine && entry.awayTeamOdds.moneyLine) {
              insertOdds.run(gameRow.id, entry.provider.name, "moneyline", null, entry.homeTeamOdds.moneyLine, entry.awayTeamOdds.moneyLine, null, null, timestamp);
            }
            if (entry.homeTeamOdds.spreadOdds && entry.awayTeamOdds.spreadOdds && entry.spread !== undefined) {
              insertOdds.run(gameRow.id, entry.provider.name, "spread", entry.spread, entry.homeTeamOdds.spreadOdds, entry.awayTeamOdds.spreadOdds, null, null, timestamp);
            }
            if (entry.overOdds && entry.underOdds && entry.overUnder !== undefined) {
              insertOdds.run(gameRow.id, entry.provider.name, "total", entry.overUnder, null, null, entry.overOdds, entry.underOdds, timestamp);
            }
          }
        }
      } catch (err) {
        // Silently skip games with missing odds
      }
    }

    // Now compute model predictions (they can access today's odds from database)
    const allLegs: BetLeg[] = [];
    const eventIdToMatchup = new Map<string, { away: string; home: string; sport: Sport; date: string }>();
    
    // Load model predictions for each sport across all dates
    const modelProbs = new Map<string, number>();
    const spreadModelProbs = new Map<string, number>();
    const totalModelProbs = new Map<string, number>();
    
    for (const sport of sportsToCheck) {
      for (const d of dates) {
        try {
          const dayModelProbs = await getHomeWinModelProbabilities(sport, d);
          const daySpreadProbs = await getHomeSpreadCoverProbabilities(sport, d);
          const dayTotalProbs = await getTotalOverModelProbabilities(sport, d);
          
          if (dayModelProbs) {
            dayModelProbs.forEach((v, k) => modelProbs.set(k, v));
          }
          if (daySpreadProbs) {
            daySpreadProbs.forEach((v, k) => spreadModelProbs.set(k, v));
          }
          if (dayTotalProbs) {
            dayTotalProbs.forEach((v, k) => totalModelProbs.set(k, v));
          }
        } catch (err) {
          // silently ignore model failure for this sport/date
        }
      }
    }

    for (const comp of allCompetitions) {
      // Store matchup info for later display
      eventIdToMatchup.set(comp.eventId, {
        away: comp.awayTeam.abbreviation || comp.awayTeam.name,
        home: comp.homeTeam.abbreviation || comp.homeTeam.name,
        sport: comp.sport,
        date: comp.date
      });
      
      try {
        const { fetchOdds, normalizeOdds } = await getFetchers(comp.sport);
        const oddsEntries = await fetchOdds(comp.eventId);
        let legs = normalizeOdds(
          comp.eventId,
          oddsEntries,
          comp.homeTeam.abbreviation || comp.homeTeam.name,
          comp.awayTeam.abbreviation || comp.awayTeam.name
        );

        // If model probabilities available, override moneyline implied probabilities
        if (modelProbs.has(comp.eventId)) {
          const pHome = modelProbs.get(comp.eventId)!;
          for (const leg of legs) {
            if (leg.market === "moneyline") {
              leg.marketImpliedProbability = leg.impliedProbability; // Save original
              if (leg.team === "home") {
                leg.impliedProbability = pHome;
                leg.description = `${leg.description} [${comp.sport.toUpperCase()}] (model)`;
              } else if (leg.team === "away") {
                leg.impliedProbability = 1 - pHome;
                leg.description = `${leg.description} [${comp.sport.toUpperCase()}] (model)`;
              }
            }
          }
        }

        // If spread model probabilities available, override spread implied probabilities
        if (spreadModelProbs.has(comp.eventId)) {
          const pHomeCover = spreadModelProbs.get(comp.eventId)!;
          for (const leg of legs) {
            if (leg.market === "spread") {
              leg.marketImpliedProbability = leg.impliedProbability; // Save original
              if (leg.team === "home") {
                leg.impliedProbability = pHomeCover;
                leg.description = `${leg.description} [${comp.sport.toUpperCase()}] (model)`;
              } else if (leg.team === "away") {
                leg.impliedProbability = 1 - pHomeCover;
                leg.description = `${leg.description} [${comp.sport.toUpperCase()}] (model)`;
              }
            }
          }
        }

        // If total model probabilities available, override total implied probabilities
        if (totalModelProbs.has(comp.eventId)) {
          const pOver = totalModelProbs.get(comp.eventId)!;
          for (const leg of legs) {
            if (leg.market === 'total') {
              leg.marketImpliedProbability = leg.impliedProbability; // Save original
              if (leg.description.startsWith('Over')) {
                leg.impliedProbability = pOver;
                leg.description = `${leg.description} [${comp.sport.toUpperCase()}] (model)`;
              } else if (leg.description.startsWith('Under')) {
                leg.impliedProbability = 1 - pOver;
                leg.description = `${leg.description} [${comp.sport.toUpperCase()}] (model)`;
              }
            }
          }
        }
        
        // Add sport tag to legs without model predictions
        for (const leg of legs) {
          if (!leg.description.includes('[')) {
            leg.description = `${leg.description} [${comp.sport.toUpperCase()}]`;
          }
        }
        
        // Guardrails: suppress extreme underdogs unless explicitly included
        // Exclude bets where model probability is below threshold (default: 0.10)
        const includeDogsEnv = process.env.SPORTLINE_INCLUDE_DOGS === '1' || false;
        const includeDogs = includeDogsEnv || includeDogsFlag;
        const EXTREME_UNDERDOG_THRESHOLD = 0.10; // <10% model probability
        if (!includeDogs) {
          legs = legs.filter((leg: BetLeg) => {
            // Only show moneyline and total bets, never spreads
            if (leg.market === 'spread') {
              return false;
            }
            if (['moneyline', 'total'].includes(leg.market)) {
              if (typeof leg.impliedProbability === 'number' && leg.impliedProbability < EXTREME_UNDERDOG_THRESHOLD) {
                // Suppress extreme underdogs
                return false;
              }
            }
            return true;
          });
        }

        // Optional: favorites-only filter
        if (favoritesOnly) {
          legs = legs.filter((leg: BetLeg) => {
            if (leg.market !== 'moneyline') return true; // allow spreads/totals regardless
            const baseProb = leg.marketImpliedProbability ?? leg.impliedProbability;
            return baseProb >= 0.5; // keep favorites only
          });
        }

        allLegs.push(...legs);
      } catch (error) {
        console.warn(chalk.yellow(`⚠️  Failed to fetch odds for ${comp.eventId}`));
      }
    }

    if (allLegs.length === 0) {
      console.log(chalk.yellow("No odds available for any games"));
      return;
    }

    console.log(chalk.gray(`Found ${allLegs.length} betting opportunities across ${allCompetitions.length} games`));
    if (modelProbs.size > 0 || spreadModelProbs.size > 0 || totalModelProbs.size > 0) {
      const markets: string[] = [];
      if (modelProbs.size > 0) markets.push('moneylines');
      if (spreadModelProbs.size > 0) markets.push('spreads');
      if (totalModelProbs.size > 0) markets.push('totals');
      console.log(chalk.green.dim(`Model probabilities applied to ${markets.join(' and ')}`));
    } else {
      console.log(chalk.dim("Using vig-free market probabilities (no model override)"));
    }
    
    // Apply divergence filter if threshold set
    if (divergenceThreshold > 0) {
      const beforeFilter = allLegs.length;
      allLegs.splice(0, allLegs.length, ...allLegs.filter(leg => {
        if (!leg.marketImpliedProbability) return false; // No model override, exclude
        const divergence = Math.abs(leg.impliedProbability - leg.marketImpliedProbability) * 100;
        return divergence >= divergenceThreshold;
      }));
      console.log(chalk.cyan(`🔍 Divergence filter: showing only ${allLegs.length}/${beforeFilter} bets where |model - market| ≥ ${divergenceThreshold}%`));
      if (allLegs.length === 0) {
        console.log(chalk.yellow("\nNo bets meet the divergence threshold. Try a lower value or remove the --divergence flag."));
        return;
      }
    }
    
    // Limit legs to prevent memory overflow
    // Filter to only positive or near-positive EV legs for parlays
    const MAX_LEGS_FOR_PARLAYS = 50;
    if (allLegs.length > MAX_LEGS_FOR_PARLAYS) {
      console.log(chalk.yellow(`⚠️  Too many betting opportunities (${allLegs.length}). Filtering to top ${MAX_LEGS_FOR_PARLAYS} by EV for parlay generation.`));
      const singleBetEVs = allLegs.map(leg => ({
        leg,
        ev: evaluateParlay({ legs: [leg], stake }).ev
      }));
      singleBetEVs.sort((a, b) => b.ev - a.ev);
      allLegs.splice(0, allLegs.length, ...singleBetEVs.slice(0, MAX_LEGS_FOR_PARLAYS).map(x => x.leg));
      console.log(chalk.gray(`Filtered to ${allLegs.length} legs for parlay combinations\n`));
    }
    // Provide distribution summary for totals model probabilities (regression-derived)
    if (totalModelProbs && totalModelProbs.size > 0) {
      const probs = Array.from(totalModelProbs.values());
      const n = probs.length;
      const mean = probs.reduce((a,b) => a + b, 0) / n;
      const variance = probs.reduce((a,b) => a + Math.pow(b - mean, 2), 0) / n;
      const std = Math.sqrt(variance);
      const min = Math.min(...probs);
      const max = Math.max(...probs);
      const high = probs.filter(p => p > 0.7).length;
      const low = probs.filter(p => p < 0.3).length;
      console.log(chalk.magenta.dim(`Totals model distribution: n=${n}, mean=${(mean*100).toFixed(1)}%, std=${(std*100).toFixed(1)}%, range=[${(min*100).toFixed(1)}%, ${(max*100).toFixed(1)}%], >70%: ${high}, <30%: ${low}`));
    }
    console.log(chalk.dim(`Calculating expected value (EV) with fair probabilities...\n`));

    // Categorize bets by confidence tier based on backtest results
    function getConfidenceTier(prob: number): { tier: string; emoji: string; historicalWinRate: string; avgROI: string } {
      if (prob >= 0.80 || prob <= 0.20) {
        return {
          tier: 'ELITE',
          emoji: '🏆',
          historicalWinRate: '85-91%',
          avgROI: '+25% to +56%'
        };
      } else if (prob >= 0.70 || prob <= 0.30) {
        return {
          tier: 'HIGH',
          emoji: '⭐',
          historicalWinRate: '67-84%',
          avgROI: '+6% to +27%'
        };
      } else if (prob >= 0.60 || prob <= 0.40) {
        return {
          tier: 'MEDIUM',
          emoji: '📊',
          historicalWinRate: '50-67%',
          avgROI: '-8% to +3%'
        };
      } else {
        return {
          tier: 'COIN FLIP',
          emoji: '⚠️',
          historicalWinRate: '42-58%',
          avgROI: '-20% to -1%'
        };
      }
    }

    // Calculate value score: combines EV with confidence level
    // High-confidence bets get bonus, coin-flip bets get penalty
    function getValueScore(bet: ParlayResult): number {
      const legProb = bet.legs[0]?.impliedProbability || 0.5;
      const tier = getConfidenceTier(legProb);
      let confidenceMultiplier = 1.0;
      
      if (tier.tier === 'ELITE') {
        confidenceMultiplier = 2.0; // Double weight for elite confidence
      } else if (tier.tier === 'HIGH') {
        confidenceMultiplier = 1.5; // 50% bonus for high confidence
      } else if (tier.tier === 'COIN FLIP') {
        confidenceMultiplier = 0.5; // Penalty for close games
      }
      
      return bet.ev * confidenceMultiplier;
    }

    // Show best single bets first
    if (minLegs === 1 || allLegs.length > 0) {
      console.log(chalk.bold.green(`📊 BEST SINGLE BETS`) + chalk.dim(` (ranked by confidence + EV)\n`));
      console.log(chalk.dim(`What's EV? It's the average $ you'd win/lose per $${stake} bet over many tries.`));
      console.log(chalk.dim(`Positive EV = good bet. Negative EV = bookmaker has the edge.\n`));
      
      const singleBets = allLegs.map(leg => evaluateParlay({ legs: [leg], stake }));
      
      // ONLY SHOW BETS WITH BACKTEST DATA
      const backtestedSingles = [];
      for (const bet of singleBets) {
        const leg = bet.legs[0];
        const matchupInfo = eventIdToMatchup.get(leg.eventId);
        const sportName: Sport = matchupInfo?.sport?.toLowerCase() as Sport || 'nba';
        const marketType = leg.market as "moneyline" | "spread" | "total";
        
        // Check if we have backtest data for this sport/market
        let displayProb = bet.probability;
        if (displayProb > 0.97) displayProb = 0.97;
        if (displayProb < 0.03) displayProb = 0.03;
        
        const backtestStats = await getBacktestStats(sportName, marketType, displayProb);
        
        // Filter out bets without backtest data OR with poor historical performance (ROI < -10%)
        // Unless showAllBets flag is set
        if (backtestStats && backtestStats.hasData) {
          const roi = backtestStats.roi !== null && backtestStats.roi !== undefined ? backtestStats.roi : -999;
          if (showAllBets || roi >= -10) {
            backtestedSingles.push(bet);
          }
        }
      }
      
      // Sort by EV (Expected Value) - highest to lowest
      // EV represents the forward-looking profit expectation for THIS specific bet
      const rankedSingles = [];
      for (const bet of backtestedSingles) {
        const leg = bet.legs[0];
        let displayProb = bet.probability;
        if (displayProb > 0.97) displayProb = 0.97;
        if (displayProb < 0.03) displayProb = 0.03;
        
        const matchupInfo = eventIdToMatchup.get(leg.eventId);
        const sportName: Sport = matchupInfo?.sport?.toLowerCase() as Sport || 'nba';
        const marketType = leg.market as "moneyline" | "spread" | "total";
        const backtestStats = await getBacktestStats(sportName, marketType, displayProb);
        
        let roi = backtestStats?.roi !== null && backtestStats?.roi !== undefined ? backtestStats.roi : -999;
        
        // Check for profitable underdog (sport-specific home/away preference)
        // Only moderate underdogs (+150 to +300) from sports with historical +ROI
        let underdogBoost = 0;
        let underdogInfo: { isProfitableUnderdog: boolean; roi: number; sport: string } | null = null;
        
        if (marketType === "moneyline" && leg.odds >= 150 && leg.odds <= 300) {
          const underdogData = UNDERDOG_ROI_BY_SPORT[sportName];
          
          // Only proceed if sport has positive underdog ROI
          if (underdogData && underdogData.roi > 0) {
            const preference = UNDERDOG_HOME_AWAY_PREFERENCE[sportName] || 'home';
            const isHomeUnderdog = leg.description.includes(matchupInfo?.home || '___NOMATCH___');
            const isAwayUnderdog = leg.description.includes(matchupInfo?.away || '___NOMATCH___');
            
            // Check if this underdog matches the sport's preferred location
            const matchesPreference = (preference === 'home' && isHomeUnderdog) || 
                                     (preference === 'away' && isAwayUnderdog);
            
            if (matchesPreference) {
              // Apply boost to ranking - profitable underdog gets 3-5 percentage point boost
              underdogBoost = underdogData.roi * 0.5; // 50% of historical ROI as boost
              roi += underdogBoost;
              underdogInfo = {
                isProfitableUnderdog: true,
                roi: underdogData.roi,
                sport: sportName
              };
            }
          }
        }
        
        // Check for profitable NFL spread (50-60% confidence bucket)
        let spreadBoost = 0;
        let spreadInfo: { isProfitableSpread: boolean; bucket: string; roi: number; winRate: number } | null = null;
        
        if (marketType === "spread" && sportName === "nfl") {
          // We need home ATS record - for now, use placeholder (TODO: compute from features)
          const homeATSRecord = null; // Placeholder - would need to compute from game data
          const spreadLine = leg.line ?? null;
          const spreadProfile = checkNFLSpreadProfile(sportName, marketType, spreadLine, homeATSRecord, displayProb);
          
          if (spreadProfile && spreadProfile.isProfitable) {
            // Apply boost to ranking - profitable spread gets 50% of historical ROI as boost
            spreadBoost = spreadProfile.roi * 0.5; // ~18 point boost for 36.4% ROI
            roi += spreadBoost;
            spreadInfo = {
              isProfitableSpread: true,
              bucket: spreadProfile.bucket,
              roi: spreadProfile.roi,
              winRate: spreadProfile.winRate
            };
          }
        }
        
        // Use EV as primary sort key (bet.ev is already calculated)
        // Keep roi for display purposes (historical validation)
        rankedSingles.push({ bet, ev: bet.ev, roi, underdogInfo, spreadInfo });
      }
      
      // Sort by EV (Expected Value) with tiebreaker by historical ROI
      rankedSingles.sort((a, b) => {
        // Primary: Sort by EV
        if (Math.abs(a.ev - b.ev) > 0.001) {
          return b.ev - a.ev;
        }
        
        // Secondary: If EVs are essentially equal, sort by historical ROI (higher is better)
        return b.roi - a.roi;
      });
      const topRankedSingles = rankedSingles.slice(0, topN).map(x => x.bet);
      
      // Auto-log all recommendations to tracking file
      const loggedBetIds: string[] = [];
      for (const { bet, roi: binRoi } of rankedSingles.slice(0, topN)) {
        const leg = bet.legs[0];
        let displayProb = bet.probability;
        if (displayProb > 0.97) displayProb = 0.97;
        if (displayProb < 0.03) displayProb = 0.03;
        
        const matchupInfo = eventIdToMatchup.get(leg.eventId);
        const sportName: Sport = matchupInfo?.sport?.toLowerCase() as Sport || 'nba';
        const marketType = leg.market as "moneyline" | "spread" | "total";
        const backtestStats = await getBacktestStats(sportName, marketType, displayProb);
        
        // Extract team/side from description (e.g., "SYR ML +190 [NCAAM]")
        const sideMatch = leg.description.match(/^([A-Z]+)/);
        const side = sideMatch ? sideMatch[1] : 'unknown';
        
        // Generate unique bet ID
        const datePart = matchupInfo?.date ? new Date(matchupInfo.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        const betId = `${datePart}-${sportName}-${leg.eventId}-${marketType}-${side}`;
        loggedBetIds.push(betId);
        
        // Determine bin from probability
        let bin = '50-60%';
        if (displayProb < 0.10) bin = '0-10%';
        else if (displayProb < 0.20) bin = '10-20%';
        else if (displayProb < 0.30) bin = '20-30%';
        else if (displayProb < 0.40) bin = '30-40%';
        else if (displayProb < 0.50) bin = '40-50%';
        else if (displayProb < 0.60) bin = '50-60%';
        else if (displayProb < 0.70) bin = '60-70%';
        else if (displayProb < 0.80) bin = '70-80%';
        else if (displayProb < 0.90) bin = '80-90%';
        else bin = '90-100%';
        
        // Log this recommendation
        await logRecommendedBet({
          id: betId,
          timestamp: new Date().toISOString(),
          sport: sportName,
          eventId: leg.eventId,
          matchup: matchupInfo ? `${matchupInfo.away} @ ${matchupInfo.home}` : '',
          date: matchupInfo?.date || '',
          pick: leg.description,
          side,
          market: marketType,
          line: leg.line,
          odds: leg.odds,
          modelProbability: displayProb,
          bin,
          historicalROI: backtestStats?.roi || 0,
          historicalWinRate: backtestStats?.winRate || 0,
          historicalSampleSize: backtestStats?.gamesAnalyzed || 0,
          expectedValue: bet.ev
        });
      }
      
      // Show confidence tier distribution
      const tiers = { ELITE: 0, HIGH: 0, MEDIUM: 0, 'COIN FLIP': 0 };
      backtestedSingles.forEach(bet => {
        const prob = bet.legs[0]?.impliedProbability || 0.5;
        const tier = getConfidenceTier(prob).tier;
        tiers[tier as keyof typeof tiers]++;
      });
      console.log(chalk.dim(`Confidence distribution: 🏆 ${tiers.ELITE} Elite | ⭐ ${tiers.HIGH} High | 📊 ${tiers.MEDIUM} Medium | ⚠️ ${tiers['COIN FLIP']} Coin Flip\n`));
      
      const MIN_SAMPLE_FOR_STRONG = 100; // require 100+ games before bold historical claims

      for (let i = 0; i < topRankedSingles.length; i++) {
        const bet = topRankedSingles[i];
        const leg = bet.legs[0];
        const evColor = bet.ev >= 0 ? chalk.green : chalk.red;
        const evSign = bet.ev >= 0 ? '+' : '';

        // Cap displayed probability at 97%
        let displayProb = bet.probability;
        if (displayProb > 0.97) displayProb = 0.97;
        if (displayProb < 0.03) displayProb = 0.03;

        // Get market type
        const marketType = leg.market;
        // Get sport from eventIdToMatchup map
        let sportName: Sport = 'nba';
        const matchupInfo = eventIdToMatchup.get(leg.eventId);
        if (matchupInfo && matchupInfo.sport) sportName = matchupInfo.sport.toLowerCase() as Sport;

        // Retrieve underdog info for this bet
        const rankedEntry = rankedSingles.find(r => r.bet === bet);
        const underdogInfo = rankedEntry?.underdogInfo;
        const spreadInfo = rankedEntry?.spreadInfo;

        // Load actual backtest stats for this sport/market
        const backtestStats = await getBacktestStats(sportName, marketType as "moneyline" | "spread" | "total", displayProb);
        let marketStats = { 
          winRate: 'N/A', 
          roi: 'N/A', 
          label: '',
          seasonsLabel: '',
          gamesLabel: ''
        };
        let sampleSize = 0;
        
        if (backtestStats && backtestStats.hasData) {
          const roiSign = backtestStats.roi! >= 0 ? '+' : '';
          sampleSize = backtestStats.gamesAnalyzed || 0;
          marketStats = {
            winRate: backtestStats.winRate ? `${(backtestStats.winRate * 100).toFixed(1)}%` : 'N/A',
            roi: backtestStats.roi !== null ? `${roiSign}${backtestStats.roi.toFixed(1)}%` : 'N/A',
            label: `${sportName.toUpperCase()} ${marketType}`,
            seasonsLabel: `${backtestStats.seasons.join(', ')}`,
            gamesLabel: `${backtestStats.gamesAnalyzed} games`
          };
        } else {
          marketStats = { 
            winRate: 'N/A', 
            roi: 'N/A', 
            label: `${sportName.toUpperCase()} ${marketType}: no backtest data`, 
            seasonsLabel: '',
            gamesLabel: ''
          };
        }

        // Get confidence tier
        const tier = getConfidenceTier(displayProb);

        // Check if this probability came from model
        const isModelProb = leg.description.includes('(model)');
        const cleanDescription = leg.description.replace(' (model)', '');

        // Get matchup info
        const matchup = eventIdToMatchup.get(leg.eventId);
        let matchupDisplay = '';
        if (matchup) {
          const dateStr = formatGameDate(matchup.date);
          matchupDisplay = chalk.dim(`${matchup.away} @ ${matchup.home} - ${dateStr}`);
        }

        // Calculate potential profit if bet wins
        const potentialProfit = bet.payout - stake;

        // Create descriptive label based on probability and ROI
        let confidenceLabel = '';
        if (displayProb >= 0.80 || displayProb <= 0.20) {
          confidenceLabel = `${(displayProb * 100).toFixed(0)}% probability`;
        } else if (displayProb >= 0.70 || displayProb <= 0.30) {
          confidenceLabel = `${(displayProb * 100).toFixed(0)}% probability`;
        } else if (displayProb >= 0.60 || displayProb <= 0.40) {
          confidenceLabel = `${(displayProb * 100).toFixed(0)}% probability`;
        } else {
          confidenceLabel = `${(displayProb * 100).toFixed(0)}% probability (toss-up)`;
        }

        // Add ROI-based qualifier if we have backtest data
        if (marketStats.roi !== 'N/A') {
          const roiNum = parseFloat(marketStats.roi.replace('%', ''));
          if (roiNum >= 10) {
            confidenceLabel += ' - Strong value';
          } else if (roiNum >= 0) {
            confidenceLabel += ' - Slight edge';
          } else if (roiNum >= -10) {
            confidenceLabel += ' - Bookmaker edge';
          } else {
            confidenceLabel += ' - Poor value';
          }
        }

        // Build title with special indicators first, then tier emoji
        let titlePrefix = '';
        if (underdogInfo?.isProfitableUnderdog) {
          titlePrefix += chalk.bold.magenta('🐶 ');
        }
        if (spreadInfo?.isProfitableSpread) {
          titlePrefix += chalk.bold.green('🏈 ');
        }
        
        let titleLine = titlePrefix + chalk.bold(`${i + 1}. ${tier.emoji} ${cleanDescription}`) + chalk.dim(` [${confidenceLabel}]`);

        console.log(titleLine);
        
        // If this exact leg is already placed, annotate with stake and original odds
        if (matchup) {
          let placedKey = '';
          if (leg.market === 'total') {
            // For totals, extract Over/Under from description
            const isOver = leg.description.includes('Over');
            const side = isOver ? 'O' : 'U';  // 'O' for Over, 'U' for Under (as stored in bet-tracking.json)
            placedKey = `${matchup.sport}:${leg.eventId}:${leg.market}:${side}`;
          } else {
            // For moneyline/spread, use home/away abbreviation
            const sideAbbrev = (leg.team === 'home') ? matchup.home : (leg.team === 'away') ? matchup.away : undefined;
            placedKey = sideAbbrev ? `${matchup.sport}:${leg.eventId}:${leg.market}:${sideAbbrev}` : '';
          }
          if (placedKey && placedLookup.has(placedKey)) {
            const placed = placedLookup.get(placedKey)!;
            const placedOddsDisplay = placed.odds >= 0 ? `+${placed.odds}` : `${placed.odds}`;
            console.log(chalk.yellow(`   📌 Already placed: $${placed.stake.toFixed(2)} at ${placedOddsDisplay}`));
          }
        }
        
        // Add underdog info line if applicable
        if (underdogInfo?.isProfitableUnderdog) {
          console.log(chalk.magenta(`   💎 Profitable underdog profile: +${underdogInfo.roi.toFixed(1)}% historical ROI in ${underdogInfo.sport.toUpperCase()} ${UNDERDOG_ROI_BY_SPORT[underdogInfo.sport].bucket}`));
        }
        
        // Add NFL spread info line if applicable
        if (spreadInfo?.isProfitableSpread) {
          console.log(chalk.green(`   🏈 Profitable NFL spread profile: +${spreadInfo.roi.toFixed(1)}% historical ROI in ${spreadInfo.bucket} confidence bucket (${spreadInfo.winRate.toFixed(1)}% win rate)`));
        }
        
        if (matchupDisplay) {
          console.log(`   ${matchupDisplay}`);
        }
        console.log(chalk.dim(`   Market: ${marketType === 'moneyline' ? 'Moneyline (win outright)' : marketType === 'spread' ? 'Point Spread' : 'Total Points'}`));
        
        // Display opening and current odds
        const openingOddsStr = `${leg.odds >= 0 ? '+' : ''}${leg.odds}`;
        if (leg.currentOdds !== undefined) {
          const currentOddsStr = `${leg.currentOdds >= 0 ? '+' : ''}${leg.currentOdds}`;
          const oddsChange = leg.currentOdds - leg.odds;
          const oddsChangeStr = oddsChange > 0 ? chalk.green(`+${oddsChange}`) : chalk.red(`${oddsChange}`);
          console.log(`   Odds: ${chalk.cyan(openingOddsStr)} (opening) → ${chalk.yellow(currentOddsStr)} ${oddsChangeStr}`);
        } else {
          console.log(`   Odds: ${chalk.cyan(openingOddsStr)}`);
        }
        
        console.log(`   If you win: ${chalk.green('$' + bet.payout.toFixed(2) + ' total')} ${chalk.dim('($' + potentialProfit.toFixed(2) + ' profit)')}`);
        console.log(`   Win chance: ${chalk.cyan((displayProb * 100).toFixed(1) + '%')}${isModelProb ? chalk.dim(' (model)') : ''}`);
        const smallSample = sampleSize > 0 && sampleSize < MIN_SAMPLE_FOR_STRONG;

        if (marketStats.label) {
          const gamesInfo = marketStats.gamesLabel ? chalk.dim(` | ${marketStats.gamesLabel}`) : '';
          const seasonsInfo = marketStats.seasonsLabel ? chalk.dim(` | seasons ${marketStats.seasonsLabel}`) : '';
          const sampleNote = smallSample ? chalk.yellow.dim(' | small sample') : '';
          console.log(chalk.dim(`   Historical: ${marketStats.winRate} win rate, ${marketStats.roi} ROI - ${marketStats.label}${gamesInfo}${seasonsInfo}${sampleNote}`));
        }
        console.log(`   Expected value: ${evColor(evSign + '$' + bet.ev.toFixed(2))} ${chalk.dim('per $10 bet')}${isModelProb ? chalk.dim(' (model)') : ''}`);
        if (marketStats.winRate !== 'N/A' && marketStats.roi !== 'N/A') {
          const roiNum = parseFloat(marketStats.roi.replace('%', ''));
          if (smallSample) {
            console.log(chalk.yellow(`   ⚠️ Historical sample too small for confidence (${sampleSize} games).`));
          } else if (roiNum >= 10) {
            console.log(chalk.green.bold(`   ${tier.emoji} Strong historical performance: ${marketStats.winRate} win rate, ${marketStats.roi} ROI in this range!`));
          } else if (roiNum >= 0) {
            console.log(chalk.green(`   ${tier.emoji} Profitable historically: ${marketStats.winRate} win rate, ${marketStats.roi} ROI in this range.`));
          } else if (roiNum >= -10) {
            console.log(chalk.yellow(`   ⚠️ Bookmaker has edge: ${marketStats.winRate} win rate, ${marketStats.roi} ROI historically.`));
          } else {
            console.log(chalk.red(`   ❌ Poor value: ${marketStats.winRate} win rate, ${marketStats.roi} ROI historically.`));
          }
        }
        if (bet.ev >= 0) {
          console.log(chalk.green.bold(`   ✨ This bet has positive expected value!`));
        }
        console.log();
      }

      // Show interpretation
      const bestBet = topRankedSingles.length > 0 ? topRankedSingles[0] : null;
      const bestEV = bestBet?.ev || 0;
      const bestTier = bestBet ? getConfidenceTier(bestBet.probability) : null;
      
      if (bestEV >= 0 && bestTier && (bestTier.tier === 'ELITE' || bestTier.tier === 'HIGH')) {
        console.log(chalk.green.bold(`🎯 RECOMMENDATION: ${bestTier.emoji} ${bestTier.tier} confidence bet with +EV! Backtests show ${bestTier.historicalWinRate} success rate.`));
      } else if (bestEV >= 0) {
        console.log(chalk.green.bold(`🎯 RECOMMENDATION: This bet has +EV, but lower confidence. Consider smaller stake.`));
      } else if (bestTier && (bestTier.tier === 'ELITE' || bestTier.tier === 'HIGH')) {
        console.log(chalk.yellow(`💡 INSIGHT: ${bestTier.tier} confidence bets available, but market is efficient (-EV). Wait for better opportunities.`));
      } else if (bestEV > -0.50) {
        console.log(chalk.yellow(`💡 INSIGHT: Moneylines have the lowest bookmaker edge (~${Math.abs(bestEV * 10).toFixed(0)}%). Still negative EV though.`));
      } else {
        console.log(chalk.yellow(`⚠️  INSIGHT: High bookmaker edge today. All bets lose ${Math.abs(rankedSingles[0]?.roi || 0).toFixed(1)}% on average.`));
      }
      console.log();
      
      // Interactive prompt to mark bets as actually placed
      if (interactive && loggedBetIds.length > 0) {
        console.log(chalk.bold.cyan('\n📝 Track Your Bets\n'));
        console.log(chalk.dim('Which of these bets did you actually place?'));
        console.log(chalk.dim(`Enter numbers (e.g., "1,3,5"), "all", or "none":\n`));
        
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });
        
        const answer = await new Promise<string>((resolve) => {
          rl.question(chalk.cyan('Your selection: '), (ans) => {
            rl.close();
            resolve(ans.trim().toLowerCase());
          });
        });
        
        if (answer && answer !== 'none') {
          let selectedIndices: number[] = [];
          
          if (answer === 'all') {
            selectedIndices = loggedBetIds.map((_, i) => i);
          } else {
            // Parse comma-separated numbers
            const parts = answer.split(',').map(s => s.trim());
            selectedIndices = parts
              .map(p => parseInt(p) - 1) // Convert to 0-indexed
              .filter(n => n >= 0 && n < loggedBetIds.length);
          }
          
          if (selectedIndices.length > 0) {
            // Prompt for stake amount(s)
            const stakeAnswer = await new Promise<string>((resolve) => {
              const rl2 = readline.createInterface({
                input: process.stdin,
                output: process.stdout
              });
              rl2.question(chalk.cyan(`Stake amount per bet ($). You can enter one value (e.g., 10) or comma-separated values matching your selection (e.g., 10,25,10): `), (ans) => {
                rl2.close();
                resolve(ans.trim());
              });
            });
            
            let stakes: number | number[] = 10;
            if (stakeAnswer.includes(',')) {
              stakes = stakeAnswer.split(',').map(s => parseFloat(s.trim()) || 0);
            } else {
              stakes = parseFloat(stakeAnswer) || 10;
            }
            const selectedBetIds = selectedIndices.map(i => loggedBetIds[i]);
            await markBetsAsPlaced(selectedBetIds, stakes);
            
            if (Array.isArray(stakes)) {
              console.log(chalk.green(`\n✅ Tracked ${selectedIndices.length} bet(s) with per-bet stakes: ${stakes.map(s => `$${s}`).join(', ')}`));
            } else {
              console.log(chalk.green(`\n✅ Tracked ${selectedIndices.length} bet(s) with $${stakes} stake each`));
            }
            console.log(chalk.dim(`Run ${chalk.white('sportline results')} to check outcomes later\n`));
          }
        } else {
          console.log(chalk.dim('\n📋 All bets logged as recommendations only\n'));
        }
      } else if (loggedBetIds.length > 0) {
        console.log(chalk.dim(`\n💾 Logged ${loggedBetIds.length} recommendation(s) to tracking file`));
        console.log(chalk.dim(`   Run with ${chalk.white('--interactive')} to mark which bets you actually placed\n`));
      }
    }

    // Note: Underdog flagging is now done inline in the main bet list (🐶 emoji)
    // No separate underdog model predictions - just rule-based profile matching

    // Skip parlays unless explicitly requested
    if (!includeParlays) {
      console.log(chalk.dim(`\n💡 Tip: Parlays combine multiple bets but have worse EV (bookmaker edge compounds).`));
      console.log(chalk.dim(`    Run with ${chalk.white('--include-parlays')} to see parlay options.\n`));
      return; // Only showing single bets
    }

    console.log(chalk.bold.blue(`🎰 PARLAY COMBINATIONS`) + chalk.dim(` (${minLegs}-${maxLegs} legs)\n`));
    console.log(chalk.dim(`Parlays = betting multiple outcomes together. All must win to cash out.`));
    console.log(chalk.dim(`Higher payout but lower win probability. Bookmaker edge compounds!\n`));

    // Filter to only 3-SEASON VALIDATED PROFITABLE MARKETS (2023+2024+2025 backtests):
    // ✅ Moneyline: All sports (NBA +0.49%, NFL +5.06%, NCAAM +5.06%, CFB +7.67%)
    // ✅ Totals: NFL +8.19%, NBA +2.57%, NCAAM +13.22%
    // ❌ Spreads: ALL BROKEN (NBA -3.33% 44% ECE, NFL -19.45%, CFB -4.08% 41% ECE)
    const backtestedLegs = allLegs.filter(leg => {
      const isNFLTotal = leg.market === 'total' && leg.description.includes('[NFL]');
      const isNBATotal = leg.market === 'total' && leg.description.includes('[NBA]');
      const isNCAAMTotal = leg.market === 'total' && leg.description.includes('[NCAAM]');
      return leg.market === 'moneyline' || isNFLTotal || isNBATotal || isNCAAMTotal;
    });
    console.log(chalk.dim(`Using ${backtestedLegs.length} backtested legs for parlay generation (moneyline all sports + NFL/NBA/NCAAM totals)\n`));

    const parlaySpecs = generateParlays(backtestedLegs, minLegs, maxLegs, stake);
    const parlayResults = parlaySpecs.map(evaluateParlay);
    const positiveEV = filterPositiveEV(parlayResults);
    const ranked = rankParlaysByEV(parlayResults); // Rank all, not just positive

    if (positiveEV.length > 0) {
      console.log(chalk.green.bold(`✅ Found ${positiveEV.length} parlay(s) with POSITIVE expected value!\n`));

      for (let i = 0; i < Math.min(topN, positiveEV.length); i++) {
        const parlay = positiveEV[i];
        printParlay(i + 1, parlay, true, eventIdToMatchup);
      }
    } else {
      console.log(chalk.yellow(`⚠️  No positive EV parlays found`));
      console.log(chalk.dim(`   Bookmaker's edge on these odds means expected losses on all combos.\n`));
      console.log(chalk.gray(`Showing top ${Math.min(topN, ranked.length)} by EV (least bad):\n`));

      for (let i = 0; i < Math.min(topN, ranked.length); i++) {
        const parlay = ranked[i];
        printParlay(i + 1, parlay, false, eventIdToMatchup);
      }
    }

    console.log(chalk.dim(`\n📚 BETTING 101:`));
    console.log(chalk.dim(`  • Moneyline = bet on winner straight up`));
    console.log(chalk.dim(`  • Spread = bet on margin of victory (e.g., -5.5 means win by 6+)`));
    console.log(chalk.dim(`  • Total = bet on combined score over/under a number`));
    console.log(chalk.dim(`  • Parlay = multiple bets combined (all must win)`));
    console.log(chalk.dim(`  • EV = expected value (average profit/loss per bet)`));
    console.log(chalk.dim(`  • ROI = return on investment (EV as a percentage of stake)\n`));
  } catch (error) {
    console.error(chalk.red("Error generating recommendations:"), error);
    process.exit(1);
  }
}

/**
 * Print a parlay result
 */
function printParlay(rank: number, parlay: ParlayResult, isPositiveEV: boolean, eventIdToMatchup: Map<string, { away: string; home: string; sport: Sport; date: string }>): void {
  const evColor = parlay.ev >= 0 ? chalk.green : chalk.red;
  const evSign = parlay.ev >= 0 ? '+' : '';
  
  console.log(chalk.bold(`${rank}. ${parlay.legs.length}-Leg Parlay`));
  console.log(`   Your bet: ${chalk.cyan('$' + parlay.stake.toFixed(2))}`);
  console.log(`   Win chance: ${chalk.yellow((parlay.probability * 100).toFixed(2) + '%')} ${chalk.dim('(all legs must win)')}`);
  console.log(`   Potential payout: ${chalk.green('$' + parlay.payout.toFixed(2))} ${chalk.dim('(profit: $' + parlay.profit.toFixed(2) + ')')}`);
  console.log(`   Expected value: ${evColor(evSign + '$' + parlay.ev.toFixed(2))} ${evColor('(' + evSign + parlay.roi.toFixed(1) + '%)')}`);
  
  if (isPositiveEV) {
    console.log(chalk.green.bold(`   ✨ POSITIVE EV - mathematically profitable over time!`));
  } else {
    console.log(chalk.dim(`   📉 Bookmaker edge: lose ${Math.abs(parlay.roi).toFixed(1)}% on average`));
  }
  
  console.log(chalk.dim(`   Legs:`));
  for (const leg of parlay.legs) {
    const matchup = eventIdToMatchup.get(leg.eventId);
    let legDisplay = `     • ${leg.description}`;
    if (matchup) {
      const gameDate = new Date(matchup.date);
      const dateStr = gameDate.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short'
      });
      legDisplay += ` - ${matchup.away} @ ${matchup.home} (${dateStr})`;
    }
    console.log(chalk.dim(legDisplay));
  }
  console.log();
}

/**
 * Check results of tracked bets and update outcomes
 */
export async function cmdResults(): Promise<void> {
  const { loadTrackedBets, updateBetResults } = await import("../tracking/bet-logger.js");
  const { getDb } = await import("../db/index.js");
  
  console.log(chalk.bold.cyan('\n🎯 Checking Bet Results...\n'));
  
  const data = await loadTrackedBets();
  const pendingBets = data.bets.filter(b => b.status === 'pending');
  
  if (pendingBets.length === 0) {
    console.log(chalk.yellow('No pending bets to check'));
    return;
  }
  
  const db = getDb();
  let updated = 0;
  
  for (const bet of pendingBets) {
    // Query database for final score (only from completed games)
    const game = db.prepare(`
      SELECT home_score, away_score, status
      FROM games 
      WHERE espn_event_id = ? AND home_score IS NOT NULL AND away_score IS NOT NULL AND status IN ('post', 'final', 'STATUS_FINAL')
    `).get(bet.eventId) as { home_score: number; away_score: number; status: string } | undefined;
    
    if (game && (game.home_score > 0 || game.away_score > 0)) {
      await updateBetResults(bet.id, game.home_score, game.away_score);
      updated++;
      
      // Only display if this was an actual bet placed, not just a recommendation
      if (bet.actuallyBet) {
        const isWin = bet.status === 'won';
        const statusIcon = isWin ? chalk.green('✅ WON') : chalk.red('❌ LOST');
        console.log(`${statusIcon} ${bet.pick} - ${bet.matchup}`);
        console.log(chalk.dim(`   Final: ${game.away_score}-${game.home_score}`));
        if (bet.result) {
          const profitColor = bet.result.actualProfit! >= 0 ? chalk.green : chalk.red;
          console.log(profitColor(`   Profit: $${bet.result.actualProfit!.toFixed(2)}`));
        }
        console.log();
      }
    }
  }
  
  if (updated === 0) {
    console.log(chalk.yellow(`No games have finished yet (${pendingBets.length} pending)`));
  } else {
    console.log(chalk.green(`\n✅ Updated ${updated} bet result(s)`));
    console.log(chalk.dim(`Run ${chalk.white('sportline stats')} to see your overall performance\n`));
  }
}

/**
 * Show statistics for tracked bets
 */
export async function cmdStats(): Promise<void> {
  const { getBetStats, loadTrackedBets } = await import("../tracking/bet-logger.js");
  
  console.log(chalk.bold.cyan('\n📊 Bet Tracking Statistics\n'));
  
  const stats = await getBetStats();
  const data = await loadTrackedBets();
  
  // All recommendations
  console.log(chalk.bold('All Recommendations (from model):'));
  console.log(chalk.dim(`  Total: ${stats.allRecommended.count} bets`));
  console.log(chalk.dim(`  Pending: ${stats.allRecommended.pending}`));
  console.log(chalk.green(`  Won: ${stats.allRecommended.won}`));
  console.log(chalk.red(`  Lost: ${stats.allRecommended.lost}`));
  
  if (stats.allRecommended.won + stats.allRecommended.lost > 0) {
    const winRate = (stats.allRecommended.won / (stats.allRecommended.won + stats.allRecommended.lost)) * 100;
    console.log(chalk.cyan(`  Win Rate: ${winRate.toFixed(1)}%`));
  }
  console.log();
  
  // Actual bets
  console.log(chalk.bold('Your Actual Bets:'));
  if (stats.actuallyBet.count === 0) {
    console.log(chalk.yellow('  No bets tracked yet'));
    console.log(chalk.dim(`  Run ${chalk.white('sportline recommend --interactive')} to track bets\n`));
    return;
  }
  
  console.log(chalk.dim(`  Total: ${stats.actuallyBet.count} bets`));
  console.log(chalk.dim(`  Pending: ${stats.actuallyBet.pending}`));
  console.log(chalk.green(`  Won: ${stats.actuallyBet.won}`));
  console.log(chalk.red(`  Lost: ${stats.actuallyBet.lost}`));
  console.log(chalk.cyan(`  Total Staked: $${stats.actuallyBet.totalStaked.toFixed(2)}`));
  
  const profitColor = stats.actuallyBet.totalProfit >= 0 ? chalk.green : chalk.red;
  console.log(profitColor(`  Total Profit: $${stats.actuallyBet.totalProfit.toFixed(2)}`));
  
  if (stats.actuallyBet.won + stats.actuallyBet.lost > 0) {
    const winRate = (stats.actuallyBet.won / (stats.actuallyBet.won + stats.actuallyBet.lost)) * 100;
    console.log(chalk.cyan(`  Win Rate: ${winRate.toFixed(1)}%`));
    
    const roiColor = stats.actuallyBet.roi >= 0 ? chalk.green.bold : chalk.red.bold;
    const roiSign = stats.actuallyBet.roi >= 0 ? '+' : '';
    console.log(roiColor(`  ROI: ${roiSign}${stats.actuallyBet.roi.toFixed(1)}%`));
  }
  console.log();
  
  // Breakdown by bin
  const betsWithResults = data.bets.filter(b => b.actuallyBet && b.status !== 'pending');
  if (betsWithResults.length > 0) {
    console.log(chalk.bold('Performance by Confidence Bin:'));
    
    const binStats = new Map<string, { won: number; lost: number; profit: number; staked: number }>();
    for (const bet of betsWithResults) {
      if (!binStats.has(bet.bin)) {
        binStats.set(bet.bin, { won: 0, lost: 0, profit: 0, staked: 0 });
      }
      const stat = binStats.get(bet.bin)!;
      if (bet.status === 'won') stat.won++;
      if (bet.status === 'lost') stat.lost++;
      stat.profit += bet.result?.actualProfit || 0;
      stat.staked += bet.stake || 0;
    }
    
    for (const [bin, stat] of Array.from(binStats.entries()).sort()) {
      const total = stat.won + stat.lost;
      const winRate = (stat.won / total) * 100;
      const roi = stat.staked > 0 ? (stat.profit / stat.staked) * 100 : 0;
      const roiColor = roi >= 0 ? chalk.green : chalk.red;
      const roiSign = roi >= 0 ? '+' : '';
      
      console.log(chalk.dim(`  ${bin}: ${stat.won}W-${stat.lost}L (${winRate.toFixed(0)}%) - ${roiColor(roiSign + roi.toFixed(1) + '% ROI')}`));
    }
    console.log();
  }
}

/**
 * Underdog model commands
 */
export async function cmdUnderdogTrain(
  sport: string,
  tiers: UnderdogTier[],
  seasons: number[]
): Promise<void> {
  try {
    await trainUnderdogModel(sport as any, seasons, tiers);
  } catch (error) {
    console.error(chalk.red("Error training underdog model:"), error);
    process.exit(1);
  }
}

export async function cmdUnderdogPredict(
  sport: string,
  date: string,
  minOdds: number,
  maxOdds: number,
  filterOptimal: boolean = false
): Promise<void> {
  try {
    const predictions = await predictUnderdogs(sport as any, date, minOdds, maxOdds, filterOptimal);
    displayUnderdogPredictions(predictions, filterOptimal);
  } catch (error) {
    console.error(chalk.red("Error predicting underdogs:"), error);
    process.exit(1);
  }
}

export async function cmdUnderdogBacktest(
  sport: string,
  seasons: number[],
  tiers?: UnderdogTier[],
  minEdge?: number
): Promise<void> {
  try {
    await backtestUnderdogModel(sport as any, seasons, tiers, minEdge);
  } catch (error) {
    console.error(chalk.red("Error backtesting underdog model:"), error);
    process.exit(1);
  }
}

export async function cmdUnderdogCompare(sport: string, seasons: number[]): Promise<void> {
  try {
    await compareUnderdogVsMainModel(sport as any, seasons);
  } catch (error) {
    console.error(chalk.red("Error comparing models:"), error);
    process.exit(1);
  }
}

export async function cmdUnderdogAnalyze(
  sport: string,
  seasons: number[],
  tiers: string[],
  minOdds?: number,
  maxOdds?: number
): Promise<void> {
  try {
    const underdogTiers = tiers as UnderdogTier[];
    analyzeWinningUnderdogs(sport as any, seasons, underdogTiers, minOdds, maxOdds);
  } catch (error) {
    console.error(chalk.red("Error analyzing winners:"), error);
    process.exit(1);
  }
}

/**
 * NFL Spread commands
 */
export async function cmdNFLSpreadTrain(seasons: number[]): Promise<void> {
  try {
    const { trainNFLSpreadModel } = await import("../spreads/nfl/nfl-spread-train.js");
    await trainNFLSpreadModel(seasons);
  } catch (error) {
    console.error(chalk.red("Error training NFL spread model:"), error);
    process.exit(1);
  }
}

export async function cmdNFLSpreadBacktest(seasons: number[]): Promise<void> {
  try {
    const { backtestNFLSpreadModel } = await import("../spreads/nfl/nfl-spread-backtest.js");
    await backtestNFLSpreadModel(seasons);
  } catch (error) {
    console.error(chalk.red("Error backtesting NFL spread model:"), error);
    process.exit(1);
  }
}

export async function cmdNFLSpreadAnalyze(seasons: number[], buckets?: string[]): Promise<void> {
  try {
    const { analyzeNFLSpreadTraits } = await import("../spreads/nfl/nfl-spread-analyze.js");
    await analyzeNFLSpreadTraits(seasons, buckets as any);
  } catch (error) {
    console.error(chalk.red("Error analyzing NFL spread traits:"), error);
    process.exit(1);
  }
}

/**
 * Refresh opening odds for today's games (run in morning or before games)
 */
export async function cmdOddsRefreshCLI(sports?: string[]): Promise<void> {
  try {
    await cmdOddsRefresh(sports);
  } catch (error) {
    console.error(chalk.red("Error refreshing odds:"), error);
    process.exit(1);
  }
}

/**
 * Train conviction classifier
 */
export async function cmdConvictionTrain(
  sports?: string[],
  markets?: string[]
): Promise<void> {
  try {
    const { trainConvictionClassifier } = await import("../conviction/train.js");
    
    const configs = [
      { sport: 'nba' as const, market: 'moneyline' as const, seasons: [2024, 2025] },
      { sport: 'cfb' as const, market: 'moneyline' as const, seasons: [2024, 2025] },
      { sport: 'ncaam' as const, market: 'moneyline' as const, seasons: [2024, 2025] },
      { sport: 'nfl' as const, market: 'moneyline' as const, seasons: [2024, 2025] }
    ];
    
    const model = await trainConvictionClassifier(configs);
    console.log(chalk.green.bold(`\n✅ Conviction classifier trained successfully`));
    console.log(chalk.dim(`Run 'conviction backtest' to validate on historical data\n`));
  } catch (error) {
    console.error(chalk.red("Error training conviction classifier:"), error);
    process.exit(1);
  }
}

/**
 * Backtest conviction classifier
 */
export async function cmdConvictionBacktest(
  sport?: string,
  seasons?: number[]
): Promise<void> {
  try {
    const { backtestConvictionClassifier, saveConvictionBacktestResults } = await import("../conviction/backtest.js");
    const { loadConvictionModel } = await import("../conviction/train.js");
    
    const model = loadConvictionModel();
    if (!model) {
      console.error(chalk.red("No trained conviction model found. Run 'conviction train' first."));
      process.exit(1);
    }
    
    // Backtest on NBA, CFB, NCAAM, and NFL
    const configs = [
      { sport: 'nba' as const, market: 'moneyline' as const, seasons: [2024, 2025] },
      { sport: 'cfb' as const, market: 'moneyline' as const, seasons: [2024, 2025] },
      { sport: 'ncaam' as const, market: 'moneyline' as const, seasons: [2024, 2025] },
      { sport: 'nfl' as const, market: 'moneyline' as const, seasons: [2024, 2025] }
    ];
    
    for (const config of configs) {
      const results = await backtestConvictionClassifier(
        config.sport,
        config.market,
        config.seasons,
        model
      );
      await saveConvictionBacktestResults(results);
    }
    
    console.log(chalk.green.bold(`\n✅ Backtests complete`));
    console.log(chalk.dim(`Results saved to data/conviction-backtests/\n`));
  } catch (error) {
    console.error(chalk.red("Error backtesting conviction classifier:"), error);
    process.exit(1);
  }
}

/**
 * Get high-conviction recommendations
 */
export async function cmdConvictionRecommend(
  startDate: string,
  days: number = 1,
  minConfidence: 'VERY_HIGH' | 'HIGH' | 'MEDIUM' = 'HIGH',
  showAll: boolean = false
): Promise<void> {
  try {
    const { loadConvictionModel } = await import("../conviction/train.js");
    const { createConvictionFeatures, makeConvictionPrediction, filterHighConvictionPredictions, sortByConviction, groupByProfile } = await import("../conviction/apply.js");
    const { getHomeWinModelProbabilities } = await import("../model/apply.js");
    const { getLatestBacktestForConfig } = await import("../model/backtest-storage.js");
    const { getDb } = await import("../db/index.js");
    
    const model = loadConvictionModel();
    if (!model) {
      console.error(chalk.red("No trained conviction model found. Run 'conviction train' first."));
      process.exit(1);
    }
    
    console.log(chalk.blue.bold(`\n🎯 HIGH-CONVICTION BETTING OPPORTUNITIES`));
    console.log(chalk.blue(`═`.repeat(60)));
    console.log(chalk.dim(`\nModel: Specialized classifier trained on golden profiles`));
    console.log(chalk.dim(`Sports: NBA (30-40% + 70-90%), CFB (30-90%), NCAAM (30-40% + 60-80%), NFL (30-40% + 60-90%)`));
    console.log(chalk.dim(`Confidence Level: ${minConfidence} or better`));
    console.log(chalk.dim(`Date Range: ${days} day${days > 1 ? 's' : ''} starting ${startDate}\n`));
    
    const allPredictions: any[] = [];
    const debugCounts: Record<string, {raw:number, highConviction:number}> = {};
    const sports: Sport[] = ['nba', 'cfb', 'ncaam', 'nfl'];
    const db = getDb();
    
    // Use the date(s) exactly as passed in, no shifting
    const dates = buildDateRange(startDate, days);
    
    // Fetch games for each sport and date
    for (const sport of sports) {
      const { fetchEvents, fetchOdds } = await getFetchers(sport);
      for (const date of dates) {
        let rawCount = 0;
        let highConvictionCount = 0;
        try {
          const probs = await getHomeWinModelProbabilities(sport, date);
          console.log(chalk.cyan(`[DEBUG] ${sport} ${date} model probabilities:`));
          if (probs && probs.size > 0) {
            for (const [eventId, prob] of probs.entries()) {
              console.log(chalk.cyan(`  eventId=${eventId}, prob=${(prob*100).toFixed(1)}%`));
            }
          } else {
            console.log(chalk.cyan(`  No model probabilities returned.`));
          }
          const backtest = await getLatestBacktestForConfig(sport, 'moneyline', [2024, 2025]);
          if (!backtest) continue;
          const competitions = await fetchEvents(date);
          if (!competitions || competitions.length === 0) continue;
          console.log(chalk.cyan(`[DEBUG] ${sport} ${date} competitions:`));
          competitions.forEach(comp => {
            console.log(chalk.cyan(`  eventId=${comp.eventId}, home=${typeof comp.homeTeam === 'string' ? comp.homeTeam : comp.homeTeam.name}, away=${typeof comp.awayTeam === 'string' ? comp.awayTeam : comp.awayTeam.name}`));
          });
          for (const comp of competitions) {
            // Always use comp.eventId (ESPN event ID) for model probability lookup
            let modelProb: number | undefined = undefined;
            if (probs && probs.has(comp.eventId)) {
              modelProb = probs.get(comp.eventId);
            }

            // Fetch odds and normalize as usual
            // ...existing code...

            // Before filtering, log debug info for each event
            if (modelProb !== undefined) {
              // Build features and prediction if possible
              // You may need to fetch odds and build features here
              let odds = null;
              // ...existing code to fetch odds...
              // Build features for classifier
              let features = null;
              let prediction = null;
              try {
                // You may need to fill in actual values for these fields
                features = createConvictionFeatures({
                        gameId: Number(comp.eventId),
                  date: comp.date,
                  sport: comp.sport,
                  market: 'moneyline',
                  homeTeam: comp.homeTeam.name,
                  awayTeam: comp.awayTeam.name,
                  modelProbability: modelProb,
                  marketProbability: 0.5, // TODO: use actual market implied prob from odds
                  odds: odds ?? 0,
                  bucketLabel: '', // TODO: fill with actual bucket label if available
                  bucketHistoricalROI: 0,
                  bucketWinRate: 0,
                  bucketSampleSize: 0
                });
                prediction = makeConvictionPrediction(features, model, `${comp.homeTeam.name} ML ${odds ?? ''}`);
              } catch (e) {
                // If features or prediction can't be built, skip
              }
              if (prediction) {
                console.log(`[DEBUG] ${comp.sport} ${comp.eventId}: prob=${(modelProb*100).toFixed(1)}%, score=${(prediction.convictionScore*100).toFixed(1)}%, confidence=${prediction.confidenceLevel}`);
              } else {
                console.log(`[DEBUG] ${comp.sport} ${comp.eventId}: prob=${(modelProb*100).toFixed(1)}%`);
              }
            }
            if (!modelProb) continue;
            const oddsEntries = await fetchOdds(comp.eventId);
            if (!oddsEntries || oddsEntries.length === 0) continue;
            const homeTeamName = typeof comp.homeTeam === 'string' ? comp.homeTeam : comp.homeTeam.name;
            const awayTeamName = typeof comp.awayTeam === 'string' ? comp.awayTeam : comp.awayTeam.name;
            const { normalizeOdds } = await getFetchers(sport);
            const legs = normalizeOdds(
              comp.eventId,
              oddsEntries,
              homeTeamName,
              awayTeamName
            );
            const pickLeg = legs.find(leg => leg.market === 'moneyline' && (
              (modelProb >= 0.5 && (leg.team === 'home' || leg.team === homeTeamName)) ||
              (modelProb < 0.5 && (leg.team === 'away' || leg.team === awayTeamName))
            ));
            if (!pickLeg) continue;
            const marketProb = pickLeg.impliedProbability;
            const bucket = backtest.calibration.find(b => {
              const [min, max] = b.bin.split('-').map(s => parseFloat(s) / 100);
              return modelProb >= min && modelProb < max;
            });
            if (!bucket) continue;
            const pick = modelProb >= 0.5 ? homeTeamName : awayTeamName;
            const pickOdds = pickLeg.odds;
            const openingPickOdds = pickOdds;
            const metadata = {
              gameTime: comp.date,
              openingOdds: openingPickOdds,
              latestOdds: pickOdds,
              oddsMovement: pickOdds - openingPickOdds
            };
            const gameId = 0;
            const features = createConvictionFeatures({
              gameId,
              date: date,
              sport: sport,
              market: 'moneyline',
              homeTeam: homeTeamName,
              awayTeam: awayTeamName,
              modelProbability: modelProb,
              marketProbability: marketProb,
              odds: pickOdds,
              bucketLabel: bucket.bin,
              bucketHistoricalROI: bucket.roi,
              bucketWinRate: bucket.actual,
              bucketSampleSize: bucket.count
            });
            rawCount++;
            const convictionPred = makeConvictionPrediction(features, model, pick);
            if (convictionPred.isHighConviction) {
              highConvictionCount++;
              allPredictions.push({ ...convictionPred, metadata });
            }
          }
        } catch (error) {
          continue;
        }
        debugCounts[`${sport}:${date}`] = {raw: rawCount, highConviction: highConvictionCount};
      }
    }
    
    // Debug output for prediction counts
    console.log(chalk.magenta.bold("\n[DEBUG] Prediction counts per sport/date:"));
    Object.entries(debugCounts).forEach(([key, val]) => {
      console.log(chalk.magenta(`${key}: raw=${val.raw}, highConviction=${val.highConviction}`));
    });

    // Filter and sort by expected value (best bets first)
    const betAmount = 10;
    let filtered = filterHighConvictionPredictions(allPredictions, minConfidence);
    console.log(chalk.magenta(`[DEBUG] After confidence filter: ${filtered.length} bets remain`));
    if (!showAll) {
      filtered = filtered.filter(bet => {
        let profit = 0;
        if (bet.odds > 0) {
          profit = (bet.odds / 100) * betAmount;
        } else {
          profit = (100 / Math.abs(bet.odds)) * betAmount;
        }
        return profit >= betAmount * 0.4;
      });
      console.log(chalk.magenta(`[DEBUG] After profit filter: ${filtered.length} bets remain`));
    }
    const sorted = filtered.sort((a, b) => {
      if (Math.abs(b.expectedValue - a.expectedValue) > 0.01) {
        return b.expectedValue - a.expectedValue;
      }
      return b.convictionScore - a.convictionScore;
    });
    console.log(chalk.magenta(`[DEBUG] After sorting: ${sorted.length} bets remain`));
    
    if (sorted.length === 0) {
      console.log(chalk.yellow(`\n⚠️  No high-conviction opportunities found for the specified date range.`));
      console.log(chalk.dim(`Try expanding the date range with --days or lowering --min-confidence\n`));
      return;
    }
    
    // Display ranked by EV (no grouping)
    console.log(chalk.green.bold(`\n✅ Found ${sorted.length} high-conviction bet${sorted.length > 1 ? 's' : ''} (ranked by expected value):\n`));
    // Display ranked by EV (no grouping)
    console.log(chalk.green.bold(`\n✅ Found ${sorted.length} high-conviction bet${sorted.length > 1 ? 's' : ''} (ranked by expected value):\n`));
    console.log(chalk.cyan(`${'─'.repeat(80)}`));
    
    for (let i = 0; i < sorted.length; i++) {
      const bet = sorted[i];
      const rank = i + 1;
      const confidenceEmoji = bet.confidenceLevel === 'VERY_HIGH' ? '🔥' : bet.confidenceLevel === 'HIGH' ? '⭐' : '✓';
      const metadata = (bet as any).metadata;

      // Format actual event date and time from the database, if available
      let dateStr = '';
      if (bet.metadata && bet.metadata.gameTime) {
        dateStr = formatGameDate(bet.metadata.gameTime);
      } else {
        dateStr = formatGameDate(bet.date);
      }

      // Calculate profit on $10 bet
      const betAmount = 10;
      let profit = 0;
      if (bet.odds > 0) {
        profit = (bet.odds / 100) * betAmount;
      } else {
        profit = (100 / Math.abs(bet.odds)) * betAmount;
      }
      const totalReturn = betAmount + profit;

      // Odds movement
      let oddsMovement = '';
      if (metadata) {
        const movement = metadata.oddsMovement;
        if (movement !== 0) {
          const movementStr = movement > 0 ? `+${movement}` : `${movement}`;
          const movementColor = movement > 0 ? chalk.green : chalk.red;
          oddsMovement = ` (${metadata.openingOdds > 0 ? '+' : ''}${metadata.openingOdds} → ${movementColor(movementStr)})`;
        }
      }

      // Header line with rank
      const profileTag = bet.matchedProfileName !== 'No Match' ? chalk.dim(`[${bet.matchedProfileName}]`) : '';
      console.log(`\n${chalk.dim(`#${rank}`)} ${confidenceEmoji} ${chalk.bold.white(bet.pick)} ${chalk.dim('ML')} ${chalk.yellow(bet.odds > 0 ? '+' : '')}${chalk.yellow(bet.odds)}${oddsMovement} ${chalk.dim(`[${bet.sport.toUpperCase()}]`)} ${profileTag}`);
      console.log(`   ${bet.awayTeam} @ ${bet.homeTeam} - ${dateStr}`);
      console.log(`   ${chalk.dim('Odds:')} ${bet.odds > 0 ? '+' : ''}${bet.odds} ${chalk.dim('|')} ${chalk.dim('If you win:')} ${chalk.green('$' + totalReturn.toFixed(2))} ${chalk.dim('total')} ${chalk.green('($' + profit.toFixed(2) + ' profit)')}`);
      // Model vs market
      let marketProb = 0.5;
      if (bet.odds > 0) {
        marketProb = 100 / (bet.odds + 100);
      } else {
        marketProb = Math.abs(bet.odds) / (Math.abs(bet.odds) + 100);
      }
      const edge = bet.modelProbability - marketProb;
      const edgeColor = edge > 0 ? chalk.green : chalk.red;
      console.log(`   ${chalk.dim('Model:')} ${(bet.modelProbability * 100).toFixed(1)}% ${chalk.dim('vs Market:')} ${(marketProb * 100).toFixed(1)}% ${chalk.dim('|')} ${chalk.dim('Edge:')} ${edgeColor((edge * 100).toFixed(1) + '%')}`);
      if (bet.matchedProfile) {
        console.log(`   ${chalk.dim('Historical:')} ${(bet.matchedProfile.winRate * 100).toFixed(1)}% win rate, ${chalk.green(bet.matchedProfile.roi.toFixed(1) + '% ROI')} ${chalk.dim(`| ${bet.matchedProfile.sampleSize} games`)}`);
      }
      const ev = bet.expectedValue;
      const evColor = ev > 0 ? chalk.green : chalk.red;
      console.log(`   ${chalk.dim('Expected value:')} ${evColor('$' + ev.toFixed(2))} ${chalk.dim('per $10 bet')} ${chalk.dim('|')} ${chalk.dim('Confidence:')} ${chalk.bold(bet.confidenceLevel)} ${chalk.dim(`(${(bet.convictionScore * 100).toFixed(1)}%)`)}`);
    }

    // Emoji legend at the bottom
    console.log(chalk.bold('─────────────────────────────'));
    console.log(chalk.bold('Emoji Legend'));
    console.log(chalk.bold(''));
    console.log('⭐  — High Confidence (model probability 60% or higher)');
    console.log('🔥  — Very High Confidence (model probability 80% or higher)');
    console.log(chalk.bold('─────────────────────────────'));

    console.log(chalk.blue(`\n${'═'.repeat(80)}`));
    console.log(chalk.dim(`\nTo place bets, use: sportline bets place\n`));
  } catch (error) {
    console.error(chalk.red("Error getting conviction recommendations:"), error);
    process.exit(1);
  }
}

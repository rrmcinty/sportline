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

/**
 * Fetch and display games for a date
 */
function getFetchers(sport: Sport) {
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
  // default to ncaam
  return {
    fetchEvents: fetchEventsNcaam,
    fetchOdds: fetchOddsNcaam,
    normalizeOdds: normalizeOddsNcaam,
  };
}

export async function cmdGamesFetch(sport: Sport, date: string): Promise<void> {
  try {
    const { fetchEvents } = getFetchers(sport);
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
    const { fetchEvents, fetchOdds, normalizeOdds } = getFetchers(sport);
    const competitions = await fetchEvents(date);
    const comp = competitions.find((c) => c.eventId === eventId);

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

    const moneylines = legs.filter((l) => l.market === "moneyline");
    const spreads = legs.filter((l) => l.market === "spread");
    const totals = legs.filter((l) => l.market === "total");

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
    const { fetchEvents, fetchOdds, normalizeOdds } = getFetchers(sport);
    const competitions = await fetchEvents(date);
    const comp = competitions.find(c => c.eventId === eventId);
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
      moneyline: legs.filter(l => l.market === "moneyline"),
      spread: legs.filter(l => l.market === "spread"),
      total: legs.filter(l => l.market === "total")
    };

    for (const [market, mLegs] of Object.entries(markets)) {
      if (!mLegs.length) continue;
      const title = market === "moneyline" ? "Moneylines" : market === "spread" ? "Spreads" : "Totals";
      console.log(chalk.bold(`${title}`));
      for (const leg of mLegs) {
        const result = evaluateParlay({ legs: [leg], stake });
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
        
        // Calculate potential profit (payout - stake)
        const profit = result.payout - stake;
        const profitDisplay = profit > 0 ? ` | Profit: ${chalk.green("$" + profit.toFixed(2))}` : "";
        
        console.log(
          `  ${leg.description} → ${(leg.impliedProbability * 100).toFixed(2)}%${chalk.cyan(modelPrediction)} | EV: ${evColor(evSign + "$" + result.ev.toFixed(2))} (${evColor(evSign + result.roi.toFixed(2) + "%")})${profitDisplay}`
        );
      }
      console.log();
    }

    const best = markets.moneyline
      .concat(markets.spread)
      .concat(markets.total)
      .map(l => evaluateParlay({ legs: [l], stake }))
      .sort((a,b) => b.ev - a.ev)[0];
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
  includeDogsFlag: boolean = false
): Promise<void> {
  try {
    // If no sports specified, check all sports
    const sportsToCheck: Sport[] = sports || ["ncaam", "cfb", "nfl", "nba"];
    
    // Generate date range if days > 1
    const dates: string[] = [];
    const startDate = new Date(
      parseInt(date.slice(0, 4)),
      parseInt(date.slice(4, 6)) - 1,
      parseInt(date.slice(6, 8))
    );
    
    for (let i = 0; i < days; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      dates.push(`${year}${month}${day}`);
    }
    
    const dateRangeDisplay = days === 1 
      ? date 
      : `${date} through ${dates[dates.length - 1]} (${days} days)`;
    
    const sportDisplay = sports ? sports.join(", ").toUpperCase() : "ALL SPORTS";
    console.log(chalk.bold.cyan(`\n🔍 Analyzing ${sportDisplay} games on ${dateRangeDisplay}...\n`));

    // Fetch all games and odds across all sports and dates
    const allCompetitions: Array<Competition & { sport: Sport }> = [];
    
    for (const sport of sportsToCheck) {
      const { fetchEvents } = getFetchers(sport);
      for (const d of dates) {
        try {
          const competitions = await fetchEvents(d);
          allCompetitions.push(...competitions.map(c => ({ ...c, sport })));
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
        const { fetchOdds } = getFetchers(comp.sport);
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
    const eventIdToMatchup = new Map<string, { away: string; home: string; sport: Sport }>();
    
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
        sport: comp.sport
      });
      
      try {
        const { fetchOdds, normalizeOdds } = getFetchers(comp.sport);
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
        
        // Guardrails: suppress severe underdogs unless explicitly included
        const includeDogsEnv = process.env.SPORTLINE_INCLUDE_DOGS === '1' || false;
        const includeDogs = includeDogsEnv || includeDogsFlag;
        if (!includeDogs) {
          const filtered: BetLeg[] = [];
          for (const leg of legs) {
            if (leg.market === 'moneyline') {
              const marketProb = leg.marketImpliedProbability ?? leg.impliedProbability;
              const isUnderdog = marketProb < 0.5 && leg.team ? true : marketProb < 0.5;
              const isSevereUnderdog = marketProb < 0.20; // <20% implied
              const modelProb = leg.impliedProbability;
              const modelFavorsDog = modelProb > marketProb && marketProb < 0.5;
              const excessiveDivergence = Math.abs(modelProb - marketProb) > 0.20; // cap 20%

              // Suppress severe dogs, and suppress dogs where model < market (no edge)
              if (isSevereUnderdog && modelFavorsDog) {
                continue;
              }
              if (isUnderdog && !modelFavorsDog) {
                continue;
              }
              if (excessiveDivergence) {
                // cap divergence by blending toward market
                const w = 0.75; // strong trust in market when divergence is huge
                leg.impliedProbability = w * marketProb + (1 - w) * modelProb;
              }
              filtered.push(leg);
            } else {
              filtered.push(leg);
            }
          }
          legs = filtered;
        }

        // Optional: favorites-only filter
        if (favoritesOnly) {
          legs = legs.filter(leg => {
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

    // Show best single bets first
    if (minLegs === 1 || allLegs.length > 0) {
      console.log(chalk.bold.green(`📊 BEST SINGLE BETS`) + chalk.dim(` (ranked by expected value)\n`));
      console.log(chalk.dim(`What's EV? It's the average $ you'd win/lose per $${stake} bet over many tries.`));
      console.log(chalk.dim(`Positive EV = good bet. Negative EV = bookmaker has the edge.\n`));
      
      const singleBets = allLegs.map(leg => evaluateParlay({ legs: [leg], stake }));
      // Use topN (shared with parlay limit) to control number of single bets displayed
      const rankedSingles = rankParlaysByEV(singleBets).slice(0, topN);
      
      for (let i = 0; i < rankedSingles.length; i++) {
        const bet = rankedSingles[i];
        const leg = bet.legs[0];
        const evColor = bet.ev >= 0 ? chalk.green : chalk.red;
        const evSign = bet.ev >= 0 ? '+' : '';
        
        // Check if this probability came from model
        const isModelProb = leg.description.includes('(model)');
        const cleanDescription = leg.description.replace(' (model)', '');
        
        // Get matchup info
        const matchup = eventIdToMatchup.get(leg.eventId);
        const matchupDisplay = matchup ? chalk.dim(`${matchup.away} @ ${matchup.home}`) : '';
        
        // Calculate potential profit if bet wins
        const potentialProfit = bet.payout - stake;
        
        console.log(chalk.bold(`${i + 1}. ${cleanDescription}`));
        if (matchupDisplay) {
          console.log(`   ${matchupDisplay}`);
        }
        console.log(chalk.dim(`   Market: ${leg.market === 'moneyline' ? 'Moneyline (win outright)' : leg.market === 'spread' ? 'Point Spread' : 'Total Points'}`));
        console.log(`   If you win: ${chalk.green('$' + bet.payout.toFixed(2) + ' total')} ${chalk.dim('($' + potentialProfit.toFixed(2) + ' profit)')}`);
        console.log(`   Win chance: ${chalk.cyan((bet.probability * 100).toFixed(1) + '%')}${isModelProb ? chalk.dim(' (model)') : ''}`);
        console.log(`   Expected value: ${evColor(evSign + '$' + bet.ev.toFixed(2))} ${chalk.dim('average profit per bet')}${isModelProb ? chalk.dim(' (model)') : ''}`);
        if (bet.ev >= 0) {
          console.log(chalk.green.bold(`   ✨ This bet has positive expected value!`));
        }
        console.log();
      }

      // Show interpretation
      const bestEV = rankedSingles.length > 0 ? rankedSingles[0].ev : 0;
      if (bestEV >= 0) {
        console.log(chalk.green.bold(`🎯 RECOMMENDATION: The best bet has +EV! This is a potentially profitable opportunity.`));
      } else if (bestEV > -0.50) {
        console.log(chalk.yellow(`💡 INSIGHT: Moneylines have the lowest bookmaker edge (~${Math.abs(bestEV * 10).toFixed(0)}%). Still negative EV though.`));
      } else {
        console.log(chalk.yellow(`⚠️  INSIGHT: High bookmaker edge today. All bets lose ${Math.abs(rankedSingles[0].roi).toFixed(1)}% on average.`));
      }
      console.log();
    }

    // Generate parlays only if min legs > 1
    if (minLegs === 1) {
      console.log(chalk.dim(`\n💡 Tip: Parlays combine multiple bets but have worse EV (bookmaker edge compounds).`));
      console.log(chalk.dim(`    Run with ${chalk.white('--min-legs 2')} to see parlay options.\n`));
      return; // Only showing single bets
    }

    console.log(chalk.bold.blue(`🎰 PARLAY COMBINATIONS`) + chalk.dim(` (${minLegs}-${maxLegs} legs)\n`));
    console.log(chalk.dim(`Parlays = betting multiple outcomes together. All must win to cash out.`));
    console.log(chalk.dim(`Higher payout but lower win probability. Bookmaker edge compounds!\n`));

    const parlaySpecs = generateParlays(allLegs, minLegs, maxLegs, stake);
    const parlayResults = parlaySpecs.map(evaluateParlay);
    const positiveEV = filterPositiveEV(parlayResults);
    const ranked = rankParlaysByEV(parlayResults); // Rank all, not just positive

    if (positiveEV.length > 0) {
      console.log(chalk.green.bold(`✅ Found ${positiveEV.length} parlay(s) with POSITIVE expected value!\n`));

      for (let i = 0; i < Math.min(topN, positiveEV.length); i++) {
        const parlay = positiveEV[i];
        printParlay(i + 1, parlay, true);
      }
    } else {
      console.log(chalk.yellow(`⚠️  No positive EV parlays found`));
      console.log(chalk.dim(`   Bookmaker's edge on these odds means expected losses on all combos.\n`));
      console.log(chalk.gray(`Showing top ${Math.min(topN, ranked.length)} by EV (least bad):\n`));

      for (let i = 0; i < Math.min(topN, ranked.length); i++) {
        const parlay = ranked[i];
        printParlay(i + 1, parlay, false);
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
function printParlay(rank: number, parlay: ParlayResult, isPositiveEV: boolean): void {
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
    console.log(chalk.dim(`     • ${leg.description}`));
  }
  console.log();
}

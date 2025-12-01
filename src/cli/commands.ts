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
  includeDogsFlag: boolean = false,
  includeParlays: boolean = false
): Promise<void> {
  try {
    // If no sports specified, check all sports
    const sportsToCheck: Sport[] = sports || ["ncaam", "cfb", "nfl", "nba", "nhl"];
    
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
      // Filter to only backtested bets (moneyline for all sports, spreads for NBA only)
      const backtestedSingles = singleBets.filter(bet => {
        const leg = bet.legs[0];
        const isNBASpread = leg.market === 'spread' && leg.description.includes('[NBA]');
        return leg.market === 'moneyline' || isNBASpread;
      });
      // Sort by value score (EV * confidence multiplier) instead of raw EV
      const rankedSingles = backtestedSingles
        .map(bet => ({ bet, valueScore: getValueScore(bet) }))
        .sort((a, b) => b.valueScore - a.valueScore)
        .slice(0, topN)
        .map(x => x.bet);
      
      // Show confidence tier distribution
      const tiers = { ELITE: 0, HIGH: 0, MEDIUM: 0, 'COIN FLIP': 0 };
      singleBets.forEach(bet => {
        const prob = bet.legs[0]?.impliedProbability || 0.5;
        const tier = getConfidenceTier(prob).tier;
        tiers[tier as keyof typeof tiers]++;
      });
      console.log(chalk.dim(`Confidence distribution: 🏆 ${tiers.ELITE} Elite | ⭐ ${tiers.HIGH} High | 📊 ${tiers.MEDIUM} Medium | ⚠️ ${tiers['COIN FLIP']} Coin Flip\n`));
      
      for (let i = 0; i < rankedSingles.length; i++) {
        const bet = rankedSingles[i];
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
        let sportName = 'nba';
        const matchupInfo = eventIdToMatchup.get(leg.eventId);
        if (matchupInfo && matchupInfo.sport) sportName = matchupInfo.sport.toLowerCase();

        // Market-specific backtest stats
        let marketStats = { winRate: 'N/A', roi: 'N/A', label: '' };
        if (marketType === 'moneyline') {
          // Use moneyline bins from BACKTEST_RESULTS.md
          if (sportName === 'nba' && displayProb >= 0.80) marketStats = { winRate: '90.7%', roi: '+25.9%', label: 'NBA 80-90%' };
          else if (sportName === 'nba' && displayProb >= 0.20 && displayProb < 0.30) marketStats = { winRate: '15.8%', roi: '+61.5%', label: 'NBA 20-30%' };
          // ...add more bins for other sports as needed
        } else if (marketType === 'total') {
          // Totals are not calibrated in backtests, so suppress ELITE label
          marketStats = { winRate: 'N/A', roi: 'N/A', label: 'Totals: calibration not validated' };
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
          const gameDate = new Date(matchup.date);
          const dateStr = gameDate.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            timeZoneName: 'short'
          });
          matchupDisplay = chalk.dim(`${matchup.away} @ ${matchup.home} - ${dateStr}`);
        }

        // Calculate potential profit if bet wins
        const potentialProfit = bet.payout - stake;

        // Suppress ELITE/HIGH label for totals
        let confidenceLabel = tier.tier;
        if (marketType === 'total' && (tier.tier === 'ELITE' || tier.tier === 'HIGH')) {
          confidenceLabel = 'UNVERIFIED';
        }

        console.log(chalk.bold(`${i + 1}. ${tier.emoji} ${cleanDescription}`) + chalk.dim(` [${confidenceLabel} CONFIDENCE]`));
        if (matchupDisplay) {
          console.log(`   ${matchupDisplay}`);
        }
        console.log(chalk.dim(`   Market: ${marketType === 'moneyline' ? 'Moneyline (win outright)' : marketType === 'spread' ? 'Point Spread' : 'Total Points'}`));
        console.log(`   If you win: ${chalk.green('$' + bet.payout.toFixed(2) + ' total')} ${chalk.dim('($' + potentialProfit.toFixed(2) + ' profit)')}`);
        console.log(`   Win chance: ${chalk.cyan((displayProb * 100).toFixed(1) + '%')}${isModelProb ? chalk.dim(' (model)') : ''}`);
        if (marketStats.label) {
          console.log(chalk.dim(`   Historical: ${marketStats.winRate} win rate, ${marketStats.roi} ROI (${marketStats.label})`));
        }
        console.log(`   Expected value: ${evColor(evSign + '$' + bet.ev.toFixed(2))} ${chalk.dim('average profit per bet')}${isModelProb ? chalk.dim(' (model)') : ''}`);
        if (confidenceLabel === 'ELITE' || confidenceLabel === 'HIGH') {
          if (marketType === 'moneyline') {
            console.log(chalk.green.bold(`   ${tier.emoji} ${confidenceLabel} confidence bet - backtests show ${marketStats.winRate} success rate!`));
          } else if (marketType === 'spread') {
            const isNBA = leg.description.includes('[NBA]');
            if (isNBA) {
              console.log(chalk.green.bold(`   ${tier.emoji} ${confidenceLabel} confidence bet - NBA spreads backtested at +11% ROI!`));
            } else {
              console.log(chalk.yellow(`   ${tier.emoji} ${confidenceLabel} confidence bet - spread calibration not validated. Proceed with caution.`));
            }
          } else {
            console.log(chalk.yellow(`   ${tier.emoji} ${confidenceLabel} confidence bet - totals calibration not validated. Proceed with caution.`));
          }
        } else if (confidenceLabel === 'COIN FLIP') {
          console.log(chalk.yellow(`   ${tier.emoji} Close game - backtests show negative ROI on these. Proceed with caution.`));
        }
        if (bet.ev >= 0) {
          console.log(chalk.green.bold(`   ✨ This bet has positive expected value!`));
        }
        console.log();
      }

      // Show interpretation
      const bestBet = rankedSingles.length > 0 ? rankedSingles[0] : null;
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
    }

    // Skip parlays unless explicitly requested
    if (!includeParlays) {
      console.log(chalk.dim(`\n💡 Tip: Parlays combine multiple bets but have worse EV (bookmaker edge compounds).`));
      console.log(chalk.dim(`    Run with ${chalk.white('--include-parlays')} to see parlay options.\n`));
      return; // Only showing single bets
    }

    console.log(chalk.bold.blue(`🎰 PARLAY COMBINATIONS`) + chalk.dim(` (${minLegs}-${maxLegs} legs)\n`));
    console.log(chalk.dim(`Parlays = betting multiple outcomes together. All must win to cash out.`));
    console.log(chalk.dim(`Higher payout but lower win probability. Bookmaker edge compounds!\n`));

    // Filter to only backtested markets (moneyline all sports + NBA spreads)
    const backtestedLegs = allLegs.filter(leg => {
      const isNBASpread = leg.market === 'spread' && leg.description.includes('[NBA]');
      return leg.market === 'moneyline' || isNBASpread;
    });
    console.log(chalk.dim(`Using ${backtestedLegs.length} backtested legs for parlay generation (moneyline all sports + NBA spreads only)\n`));

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

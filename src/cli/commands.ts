/**
 * CLI command handlers
 */

import chalk from "chalk";
import { fetchEvents } from "../espn/ncaam/events.js";
import { fetchOdds, normalizeOdds } from "../espn/ncaam/odds.js";
import { evaluateParlay, generateParlays, rankParlaysByEV, filterPositiveEV } from "../parlay/eval.js";
import type { BetLeg, Competition, ParlayResult } from "../models/types.js";

/**
 * Fetch and display games for a date
 */
export async function cmdGamesFetch(date: string): Promise<void> {
  try {
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

    console.log(chalk.dim(`💡 Tip: Use ${chalk.white('odds --event <eventId> --date <date>')} to see betting lines`));
  } catch (error) {
    console.error(chalk.red("Error fetching games:"), error);
    process.exit(1);
  }
}

/**
 * Fetch and display odds for an event
 */
export async function cmdOddsImport(eventId: string, date: string): Promise<void> {
  try {
    // First fetch the event to get team names
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
 * Generate and rank parlay recommendations
 */
export async function cmdRecommend(
  date: string,
  stake: number,
  minLegs: number,
  maxLegs: number,
  topN: number
): Promise<void> {
  try {
    console.log(chalk.bold.cyan(`\n🔍 Analyzing all games on ${date}...\n`));

    // Fetch all games and odds
    const competitions = await fetchEvents(date);

    if (competitions.length === 0) {
      console.log(chalk.yellow("No games found for this date"));
      return;
    }

    const allLegs: BetLeg[] = [];

    for (const comp of competitions) {
      try {
        const oddsEntries = await fetchOdds(comp.eventId);
        const legs = normalizeOdds(
          comp.eventId,
          oddsEntries,
          comp.homeTeam.abbreviation || comp.homeTeam.name,
          comp.awayTeam.abbreviation || comp.awayTeam.name
        );
        allLegs.push(...legs);
      } catch (error) {
        console.warn(chalk.yellow(`⚠️  Failed to fetch odds for ${comp.eventId}`));
      }
    }

    if (allLegs.length === 0) {
      console.log(chalk.yellow("No odds available for any games"));
      return;
    }

    console.log(chalk.gray(`Found ${allLegs.length} betting opportunities across ${competitions.length} games`));
    console.log(chalk.dim(`Calculating expected value (EV) with fair probabilities...\n`));

    // Show best single bets first
    if (minLegs === 1 || allLegs.length > 0) {
      console.log(chalk.bold.green(`📊 BEST SINGLE BETS`) + chalk.dim(` (ranked by expected value)\n`));
      console.log(chalk.dim(`What's EV? It's the average $ you'd win/lose per $${stake} bet over many tries.`));
      console.log(chalk.dim(`Positive EV = good bet. Negative EV = bookmaker has the edge.\n`));
      
      const singleBets = allLegs.map(leg => evaluateParlay({ legs: [leg], stake }));
      const rankedSingles = rankParlaysByEV(singleBets).slice(0, 5);
      
      for (let i = 0; i < rankedSingles.length; i++) {
        const bet = rankedSingles[i];
        const evColor = bet.ev >= 0 ? chalk.green : chalk.red;
        const evSign = bet.ev >= 0 ? '+' : '';
        console.log(chalk.bold(`${i + 1}. ${bet.legs[0].description}`));
        console.log(`   Win chance: ${chalk.cyan((bet.probability * 100).toFixed(1) + '%')}`);
        console.log(`   Expected value: ${evColor(evSign + '$' + bet.ev.toFixed(2))} per $${stake} bet ${evColor('(' + evSign + bet.roi.toFixed(1) + '%)')}`);
        if (bet.ev >= 0) {
          console.log(chalk.green.bold(`   ✨ This bet has positive expected value!`));
        }
        console.log();
      }

      // Show interpretation
      const bestEV = rankedSingles[0].ev;
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

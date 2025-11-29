#!/usr/bin/env node

/**
 * sportline CLI entry point
 */

import { Command } from "commander";
import { cmdGamesFetch, cmdOddsImport, cmdRecommend, cmdBets } from "./cli/commands.js";
import type { Sport } from "./models/types.js";

function todayYYYYMMDD(): string {
  const d = new Date();
  // Use local date components to avoid UTC rollover issues
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

const program = new Command();

program
  .name("sportline")
  .description("NCAAM betting CLI with parlay EV ranking")
  .version("0.1.0");

// games fetch command
program
  .command("games")
  .description("Fetch games for a date (defaults to today)")
  .option("-d, --date <date>", "Date in YYYYMMDD format (default: today)")
  .option("--sport <sport>", "Sport (ncaam|cfb)", "ncaam")
  .action(async (options) => {
    const sport: Sport = options.sport;
    const date = options.date || todayYYYYMMDD();
    await cmdGamesFetch(sport, date);
  });

// odds import command
program
  .command("odds")
  .description("Import odds for a specific event (date defaults to today)")
  .requiredOption("-e, --event <eventId>", "Event ID")
  .option("-d, --date <date>", "Date in YYYYMMDD format (default: today)")
  .option("--sport <sport>", "Sport (ncaam|cfb)", "ncaam")
  .action(async (options) => {
    const sport: Sport = options.sport;
    const date = options.date || todayYYYYMMDD();
    await cmdOddsImport(sport, options.event, date);
  });

program
  .command("bets")
  .description("Show all bet legs for an event with EV/ROI (date defaults to today)")
  .requiredOption("-e, --event <eventId>", "Event ID")
  .option("-d, --date <date>", "Date in YYYYMMDD format (default: today)")
  .option("--sport <sport>", "Sport (ncaam|cfb)", "ncaam")
  .option("-s, --stake <amount>", "Stake amount per bet", "10")
  .action(async (options) => {
    const sport: Sport = options.sport;
    const date = options.date || todayYYYYMMDD();
    await cmdBets(sport, options.event, date, parseFloat(options.stake));
  });

// recommend command
program
  .command("recommend")
  .description("Generate parlay recommendations (date defaults to today)")
  .option("-d, --date <date>", "Date in YYYYMMDD format (default: today)")
  .option("--sport <sport>", "Sport (ncaam|cfb)", "ncaam")
  .option("-s, --stake <amount>", "Stake amount per bet", "10")
  .option("--min-legs <number>", "Minimum legs per parlay (use 1 for single bets only)", "2")
  .option("--max-legs <number>", "Maximum legs per parlay", "4")
  .option("-n, --top <number>", "Number of top parlays to show", "10")
  .action(async (options) => {
    const sport: Sport = options.sport;
    const date = options.date || todayYYYYMMDD();
    await cmdRecommend(
      sport,
      date,
      parseFloat(options.stake),
      parseInt(options.minLegs),
      parseInt(options.maxLegs),
      parseInt(options.top)
    );
  });

program.parse();

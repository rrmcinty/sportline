#!/usr/bin/env node

/**
 * sportline CLI entry point
 */

import { Command } from "commander";
import { cmdGamesFetch, cmdOddsImport, cmdRecommend } from "./cli/commands.js";

const program = new Command();

program
  .name("sportline")
  .description("NCAAM betting CLI with parlay EV ranking")
  .version("0.1.0");

// games fetch command
program
  .command("games")
  .description("Fetch games for a date")
  .requiredOption("-d, --date <date>", "Date in YYYYMMDD format")
  .action(async (options) => {
    await cmdGamesFetch(options.date);
  });

// odds import command
program
  .command("odds")
  .description("Import odds for a specific event")
  .requiredOption("-e, --event <eventId>", "Event ID")
  .requiredOption("-d, --date <date>", "Date in YYYYMMDD format")
  .action(async (options) => {
    await cmdOddsImport(options.event, options.date);
  });

// recommend command
program
  .command("recommend")
  .description("Generate parlay recommendations")
  .requiredOption("-d, --date <date>", "Date in YYYYMMDD format")
  .option("-s, --stake <amount>", "Stake amount per bet", "10")
  .option("--min-legs <number>", "Minimum legs per parlay (use 1 for single bets only)", "2")
  .option("--max-legs <number>", "Maximum legs per parlay", "4")
  .option("-n, --top <number>", "Number of top parlays to show", "10")
  .action(async (options) => {
    await cmdRecommend(
      options.date,
      parseFloat(options.stake),
      parseInt(options.minLegs),
      parseInt(options.maxLegs),
      parseInt(options.top)
    );
  });

program.parse();

#!/usr/bin/env node

/**
 * sportline CLI entry point
 */

import { Command } from "commander";
import { cmdGamesFetch, cmdOddsImport, cmdRecommend, cmdBets } from "./cli/commands.js";
import { cmdSearchTeam } from "./cli/search.js";
import { cmdDataIngest } from "./data/ingest.js";
import { cmdModelTrain } from "./model/train.js";
import { cmdModelPredict } from "./model/predict.js";
import { runDailyIngest } from "./ingest/daily.js";
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

// search for team
program
  .command("find")
  .description("Search for games by team name")
  .requiredOption("-t, --team <name>", "Team name or abbreviation (e.g., 'UNC', 'Duke', 'NC State')")
  .option("--sport <sport>", "Sport (ncaam|cfb)", "ncaam")
  .option("-d, --date <date>", "Start date in YYYYMMDD format (default: today)")
  .option("--days <number>", "Number of days to search ahead (default: 7)", "7")
  .action(async (options) => {
    const sport: Sport = options.sport;
    const date = options.date || todayYYYYMMDD();
    await cmdSearchTeam(sport, options.team, date, parseInt(options.days));
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
  .option("--days <number>", "Number of days to look ahead (default: 1)", "1")
  .action(async (options) => {
    const sport: Sport = options.sport;
    const date = options.date || todayYYYYMMDD();
    await cmdRecommend(
      sport,
      date,
      parseFloat(options.stake),
      parseInt(options.minLegs),
      parseInt(options.maxLegs),
      parseInt(options.top),
      parseInt(options.days)
    );
  });

// data ingest command
const data = program
  .command("data")
  .description("Data ingestion commands");

data
  .command("ingest")
  .description("Ingest historical game data for a sport/season")
  .option("--sport <sport>", "Sport (ncaam|cfb)", "ncaam")
  .requiredOption("--season <year>", "Season year (e.g., 2025)")
  .option("--from <date>", "Start date (YYYY-MM-DD)")
  .option("--to <date>", "End date (YYYY-MM-DD)")
  .action(async (options) => {
    const sport: Sport = options.sport;
    await cmdDataIngest(sport, parseInt(options.season), options.from, options.to);
  });

data
  .command("daily")
  .description("Daily update: fetch new games and update scores from latest DB date to today")
  .option("--sports <sports>", "Sports to update (comma-separated: cfb,ncaam)", "cfb,ncaam")
  .action(async (options) => {
    const sports = options.sports.split(",").filter((s: string) => s === 'cfb' || s === 'ncaam') as Sport[];
    await runDailyIngest(sports.length > 0 ? sports : ['cfb', 'ncaam']);
  });

// model commands (parent + subcommands)
const model = program
  .command("model")
  .description("Model training and prediction commands");

model
  .command("train")
  .description("Train predictive model for a sport/season")
  .option("--sport <sport>", "Sport (ncaam|cfb)", "ncaam")
  .requiredOption("--season <year>", "Season year (e.g., 2025)")
  .option("--markets <markets>", "Markets to train (comma-separated)", "moneyline,spread,total")
  .option("--calibrate <method>", "Calibration method (isotonic|platt)", "isotonic")
  .action(async (options) => {
    const sport: Sport = options.sport;
    const markets = options.markets.split(",");
    await cmdModelTrain(sport, parseInt(options.season), markets, options.calibrate);
  });

model
  .command("predict")
  .description("Generate predictions for upcoming games")
  .option("--sport <sport>", "Sport (ncaam|cfb)", "ncaam")
  .option("-d, --date <date>", "Date in YYYYMMDD format (default: today)")
  .action(async (options) => {
    const sport: Sport = options.sport;
    const date = options.date || todayYYYYMMDD();
    await cmdModelPredict(sport, date);
  });

program.parse();

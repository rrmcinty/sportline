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
import { cmdShowOptimalConfigs } from "./cli/show-configs.js";
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
  .requiredOption("-t, --team <name>", "Team name or abbreviation (e.g., 'Lakers', 'Celtics', 'Duke')")
  .requiredOption("--sport <sport>", "Sport (ncaam|cfb|nfl|nba|nhl)")
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
  .description("Generate single bet + parlay recommendations (date defaults to today, omit --sport for all sports)")
  .option("-d, --date <date>", "Date in YYYYMMDD format (default: today)")
  .option("--sport <sport>", "Sport (ncaam|cfb|nfl|nba) or omit for all sports")
  .option("-s, --stake <amount>", "Stake amount per bet", "10")
  .option("--min-legs <number>", "Minimum legs per parlay (use 1 for single bets only)", "2")
  .option("--max-legs <number>", "Maximum legs per parlay", "4")
  .option("-n, --top <number>", "Number of top single bets and parlays to show", "10")
  .option("--days <number>", "Number of days to look ahead (default: 1)", "1")
  .option("--divergence <threshold>", "Only show bets where |model - market| > threshold % (e.g., 5)", "0")
  .option("--favorites-only", "Filter to favorites on moneylines (keep spreads/totals)", false)
  .option("--include-dogs", "Include underdogs (disables suppression guardrails)", false)
  .option("--include-parlays", "Include parlay recommendations (default: singles only)", false)
  .action(async (options) => {
    const sports: Sport[] | undefined = options.sport ? [options.sport.toLowerCase() as Sport] : undefined;
    const date = options.date || todayYYYYMMDD();
    await cmdRecommend(
      sports,
      date,
      parseFloat(options.stake),
      parseInt(options.minLegs),
      parseInt(options.maxLegs),
      parseInt(options.top),
      parseInt(options.days),
      parseFloat(options.divergence),
      Boolean(options.favoritesOnly),
      Boolean(options.includeDogs),
      Boolean(options.includeParlays)
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
  .command("configs")
  .description("Show optimal training configurations per sport/market")
  .action(() => {
    cmdShowOptimalConfigs();
  });

model
  .command("train")
  .description("Train predictive model for a sport/season")
  .option("--sport <sport>", "Sport (ncaam|cfb|nfl|nba|nhl)", "ncaam")
  .option("--season <years>", "Season year(s) (e.g., 2025 or 2024,2025). Omit to use optimal config per market.")
  .option("--markets <markets>", "Markets to train (comma-separated)", "moneyline,spread,total")
  .option("--calibrate <method>", "Calibration method (isotonic|platt)", "isotonic")
  .action(async (options) => {
    const sport: Sport = options.sport;
    const markets = options.markets.split(",");
    const seasons = options.season ? options.season.split(",").map((s: string) => parseInt(s.trim())) : null;
    await cmdModelTrain(sport, seasons, markets, options.calibrate);
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

model
  .command("backtest")
  .description("Backtest model predictions against actual outcomes")
  .option("--sport <sport>", "Sport (ncaam|cfb|nfl|nba)", "ncaam")
  .requiredOption("--season <years>", "Season year(s) (e.g., 2025 or 2024,2025)")
  .option("--market <market>", "Market to backtest (moneyline|spread|total|all)", "moneyline")
  .action(async (options) => {
    const sport: Sport = options.sport;
    const seasons = options.season.split(",").map((s: string) => parseInt(s.trim()));
    const market = options.market || "moneyline";
    
    if (market === "all" || market === "moneyline") {
      const { backtestMoneyline } = await import("./model/backtest.js");
      await backtestMoneyline(sport, seasons);
    }
    
    if (market === "all" || market === "spread") {
      const { backtestSpreads } = await import("./model/backtest.js");
      await backtestSpreads(sport, seasons);
    }
    
    if (market === "all" || market === "total") {
      const { backtestTotals } = await import("./model/backtest.js");
      await backtestTotals(sport, seasons);
    }
  });

model
  .command("diagnostics-totals")
  .description("Debug totals model predictions with detailed diagnostics")
  .option("--sport <sport>", "Sport (ncaam|cfb|nfl|nba)", "nfl")
  .requiredOption("--season <years>", "Season year(s) (e.g., 2025 or 2024,2025)")
  .option("--limit <number>", "Number of games to analyze", "20")
  .action(async (options) => {
    const sport: Sport = options.sport;
    const seasons = options.season.split(",").map((s: string) => parseInt(s.trim()));
    const limit = parseInt(options.limit);
    const { cmdTotalsDiagnostics } = await import("./model/diagnostics-totals.js");
    await cmdTotalsDiagnostics(sport, seasons, limit);
  });

program.parse();

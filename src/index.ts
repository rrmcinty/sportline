#!/usr/bin/env node

/**
 * sportline CLI entry point
 */

import { Command } from "commander";
import {
  cmdGamesFetch,
  cmdOddsImport,
  cmdRecommend,
  cmdBets,
  cmdResults,
  cmdStats,
  cmdUnderdogTrain,
  cmdUnderdogPredict,
  cmdUnderdogBacktest,
  cmdUnderdogCompare,
  cmdUnderdogAnalyze,
  cmdNFLSpreadTrain,
  cmdNFLSpreadBacktest,
  cmdNFLSpreadAnalyze,
  cmdOddsRefreshCLI,
} from "./cli/commands.js";
import { cmdSearchTeam } from "./cli/search.js";
import { cmdDataIngest } from "./data/ingest.js";
import { cmdModelTrain } from "./model/train.js";
import { cmdModelPredict } from "./model/predict.js";
import { cmdShowOptimalConfigs } from "./cli/show-configs.js";
import { runDailyIngest } from "./ingest/daily.js";
import type { Sport } from "./models/types.js";
import type { UnderdogTier } from "./underdog/types.js";

function todayYYYYMMDD(): string {
  const d = new Date();
  // Use local date components to avoid UTC rollover issues
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
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
  .requiredOption(
    "-t, --team <name>",
    "Team name or abbreviation (e.g., 'Lakers', 'Celtics', 'Duke')",
  )
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
  .description(
    "Show all bet legs for an event with EV/ROI (date defaults to today)",
  )
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
  .description(
    "Generate single bet + parlay recommendations (date defaults to today, omit --sport for all sports)",
  )
  .option("-d, --date <date>", "Date in YYYYMMDD format (default: today)")
  .option("--sport <sport>", "Sport (ncaam|cfb|nfl|nba) or omit for all sports")
  .option("-s, --stake <amount>", "Stake amount per bet", "10")
  .option(
    "--min-legs <number>",
    "Minimum legs per parlay (use 1 for single bets only)",
    "2",
  )
  .option("--max-legs <number>", "Maximum legs per parlay", "4")
  .option(
    "-n, --top <number>",
    "Number of top single bets and parlays to show",
    "10",
  )
  .option("--days <number>", "Number of days to look ahead (default: 1)", "1")
  .option(
    "--divergence <threshold>",
    "Only show bets where |model - market| > threshold % (e.g., 5)",
    "0",
  )
  .option(
    "--favorites-only",
    "Filter to favorites on moneylines (keep spreads/totals)",
    false,
  )
  .option(
    "--include-dogs",
    "Include underdogs (disables suppression guardrails)",
    false,
  )
  .option(
    "--include-parlays",
    "Include parlay recommendations (default: singles only)",
    false,
  )
  .option(
    "--interactive",
    "Prompt to select which bets you actually placed",
    false,
  )
  .option("--all", "Show all bets including poor value (ROI < -10%)", false)
  .option(
    "--confidence-bin <range>",
    "Only show bets in specific confidence bin (e.g., '80-100', '70-80', '40-60')",
    "",
  )
  .action(async (options) => {
    const sports: Sport[] | undefined = options.sport
      ? [options.sport.toLowerCase() as Sport]
      : undefined;
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
      Boolean(options.includeParlays),
      Boolean(options.interactive),
      Boolean(options.all),
      options.confidenceBin || "",
    );
  });

// results command
program
  .command("results")
  .description("Check outcomes of tracked bets and calculate P&L")
  .action(async () => {
    await cmdResults();
  });

// stats command
program
  .command("stats")
  .description("Show performance statistics for tracked bets")
  .action(async () => {
    await cmdStats();
  });

// data ingest command
const data = program.command("data").description("Data ingestion commands");

data
  .command("ingest")
  .description("Ingest historical game data for a sport/season")
  .option("--sport <sport>", "Sport (ncaam|cfb)", "ncaam")
  .requiredOption("--season <year>", "Season year (e.g., 2025)")
  .option("--from <date>", "Start date (YYYY-MM-DD)")
  .option("--to <date>", "End date (YYYY-MM-DD)")
  .action(async (options) => {
    const sport: Sport = options.sport;
    await cmdDataIngest(
      sport,
      parseInt(options.season),
      options.from,
      options.to,
    );
  });

data
  .command("daily")
  .description(
    "Daily update: fetch new games and update scores from latest DB date to today",
  )
  .option(
    "--sports <sports>",
    "Sports to update (comma-separated: cfb,ncaam,nba,nfl,nhl)",
    "cfb,ncaam,nba,nfl,nhl",
  )
  .option(
    "--days <days>",
    "Number of days to look back for updates (default: 3)",
    "3",
  )
  .action(async (options) => {
    const validSports = ["cfb", "ncaam", "nba", "nfl", "nhl"];
    const sports = options.sports
      .split(",")
      .filter((s: string) => validSports.includes(s)) as Sport[];
    const daysBack = parseInt(options.days, 10) || 3;
    await runDailyIngest(
      sports.length > 0 ? sports : ["cfb", "ncaam", "nba", "nfl", "nhl"],
      daysBack,
    );
  });

data
  .command("odds-refresh")
  .description("Refresh opening odds for today's games (for backtest accuracy)")
  .option(
    "--sports <sports>",
    "Sports to update (comma-separated: cfb,ncaam,nba,nfl,nhl)",
    "cfb,ncaam,nba,nfl,nhl",
  )
  .action(async (options) => {
    const validSports = ["cfb", "ncaam", "nba", "nfl", "nhl"];
    const sports = options.sports
      .split(",")
      .filter((s: string) => validSports.includes(s)) as Sport[];
    await cmdOddsRefreshCLI(
      sports.length > 0 ? sports : ["cfb", "ncaam", "nba", "nfl", "nhl"],
    );
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
  .option(
    "--season <years>",
    "Season year(s) (e.g., 2025 or 2024,2025). Omit to use optimal config per market.",
  )
  .option(
    "--markets <markets>",
    "Markets to train (comma-separated)",
    "moneyline,spread,total",
  )
  .option(
    "--calibrate <method>",
    "Calibration method (isotonic|platt)",
    "isotonic",
  )
  .action(async (options) => {
    const sport: Sport = options.sport;
    const markets = options.markets.split(",");
    const seasons = options.season
      ? options.season.split(",").map((s: string) => parseInt(s.trim()))
      : null;
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
  .requiredOption(
    "--season <years>",
    "Season year(s) (e.g., 2025 or 2024,2025)",
  )
  .option(
    "--market <market>",
    "Market to backtest (moneyline|spread|total|all)",
    "moneyline",
  )
  .action(async (options) => {
    const sport: Sport = options.sport;
    const seasons = options.season
      .split(",")
      .map((s: string) => parseInt(s.trim()));
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
  .requiredOption(
    "--season <years>",
    "Season year(s) (e.g., 2025 or 2024,2025)",
  )
  .option("--limit <number>", "Number of games to analyze", "20")
  .action(async (options) => {
    const sport: Sport = options.sport;
    const seasons = options.season
      .split(",")
      .map((s: string) => parseInt(s.trim()));
    const limit = parseInt(options.limit);
    const { cmdTotalsDiagnostics } =
      await import("./model/diagnostics-totals.js");
    await cmdTotalsDiagnostics(sport, seasons, limit);
  });

// underdog commands (experimental module)
const underdog = program
  .command("underdog")
  .description("🐕 Underdog-specific model for all sports");

underdog
  .command("train")
  .description("Train underdog-specific model on historical data")
  .requiredOption("--sport <sport>", "Sport (ncaam|cfb|nfl|nba|nhl)")
  .option(
    "--tiers <tiers>",
    "Underdog tiers to train (moderate|heavy|extreme or comma-separated)",
    "moderate,heavy",
  )
  .option(
    "--seasons <years>",
    "Season years (e.g., 2022,2023,2024,2025)",
    "2024,2025",
  )
  .action(async (options) => {
    const tiers = options.tiers
      .split(",")
      .map((t: string) => t.trim() as UnderdogTier);
    const seasons = options.seasons
      .split(",")
      .map((s: string) => parseInt(s.trim()));
    await cmdUnderdogTrain(options.sport, tiers, seasons);
  });

underdog
  .command("predict")
  .description("Generate underdog-specific predictions for upcoming games")
  .requiredOption("--sport <sport>", "Sport (ncaam|cfb|nfl|nba|nhl)")
  .option("-d, --date <date>", "Date in YYYYMMDD format (default: today)")
  .option(
    "--min-odds <number>",
    "Minimum underdog odds (e.g., 110 for +110)",
    "110",
  )
  .option(
    "--max-odds <number>",
    "Maximum underdog odds (e.g., 300 for +300)",
    "300",
  )
  .option(
    "--optimal",
    "Filter to optimal profile (home dogs, bounce-back spots, narrow gaps)",
  )
  .action(async (options) => {
    const date = options.date || todayYYYYMMDD();
    await cmdUnderdogPredict(
      options.sport,
      date,
      parseInt(options.minOdds),
      parseInt(options.maxOdds),
      options.optimal || false,
    );
  });

underdog
  .command("backtest")
  .description("Backtest underdog model on historical games")
  .requiredOption("--sport <sport>", "Sport (ncaam|cfb|nfl|nba|nhl)")
  .requiredOption(
    "--seasons <years>",
    "Season years (e.g., 2022,2023,2024,2025)",
  )
  .option(
    "--tiers <tiers>",
    "Underdog tiers to test (moderate|heavy|extreme or comma-separated)",
  )
  .option(
    "--min-edge <number>",
    "Minimum edge threshold (default: 0.03)",
    "0.03",
  )
  .action(async (options) => {
    const seasons = options.seasons
      .split(",")
      .map((s: string) => parseInt(s.trim()));
    const tiers = options.tiers
      ? options.tiers.split(",").map((t: string) => t.trim() as UnderdogTier)
      : undefined;
    const minEdge = parseFloat(options.minEdge);
    await cmdUnderdogBacktest(options.sport, seasons, tiers, minEdge);
  });

underdog
  .command("compare")
  .description("Compare underdog model vs main model performance")
  .requiredOption("--sport <sport>", "Sport (ncaam|cfb|nfl|nba|nhl)")
  .requiredOption("--seasons <years>", "Season years (e.g., 2023,2024,2025)")
  .action(async (options) => {
    const seasons = options.seasons
      .split(",")
      .map((s: string) => parseInt(s.trim()));
    await cmdUnderdogCompare(options.sport, seasons);
  });

underdog
  .command("analyze")
  .description("Analyze common traits among winning underdogs")
  .requiredOption("--sport <sport>", "Sport (ncaam|cfb|nfl|nba|nhl)")
  .requiredOption("--seasons <years>", "Season years (e.g., 2022,2023,2024)")
  .option(
    "--tiers <tiers>",
    "Underdog tiers (moderate|heavy|extreme or comma-separated)",
    "moderate",
  )
  .option("--min-odds <number>", "Minimum odds (e.g., 100 for +100)")
  .option("--max-odds <number>", "Maximum odds (e.g., 149 for +149)")
  .action(async (options) => {
    const seasons = options.seasons
      .split(",")
      .map((s: string) => parseInt(s.trim()));
    const tiers = options.tiers.split(",").map((t: string) => t.trim());
    const minOdds = options.minOdds ? parseInt(options.minOdds) : undefined;
    const maxOdds = options.maxOdds ? parseInt(options.maxOdds) : undefined;
    await cmdUnderdogAnalyze(options.sport, seasons, tiers, minOdds, maxOdds);
  });

// NFL spread commands (dedicated profitability-focused module)
const nflSpread = program
  .command("nfl-spread")
  .description("🏈 Dedicated NFL spread model trained on 3 seasons");

nflSpread
  .command("train")
  .description("Train NFL spread model on 2023-2025 data")
  .option(
    "--seasons <years>",
    "Season years (e.g., 2023,2024,2025)",
    "2023,2024,2025",
  )
  .action(async (options) => {
    const seasons = options.seasons
      .split(",")
      .map((s: string) => parseInt(s.trim()));
    await cmdNFLSpreadTrain(seasons);
  });

nflSpread
  .command("backtest")
  .description("Backtest NFL spread model and identify profitable buckets")
  .option(
    "--seasons <years>",
    "Season years (e.g., 2023,2024,2025)",
    "2023,2024,2025",
  )
  .action(async (options) => {
    const seasons = options.seasons
      .split(",")
      .map((s: string) => parseInt(s.trim()));
    await cmdNFLSpreadBacktest(seasons);
  });

nflSpread
  .command("analyze")
  .description("Analyze winning vs losing traits in profitable buckets")
  .option(
    "--seasons <years>",
    "Season years (e.g., 2023,2024,2025)",
    "2023,2024,2025",
  )
  .option(
    "--buckets <buckets>",
    "Specific buckets to analyze (e.g., '40-50%,50-60%')",
  )
  .action(async (options) => {
    const seasons = options.seasons
      .split(",")
      .map((s: string) => parseInt(s.trim()));
    const buckets = options.buckets ? options.buckets.split(",") : undefined;
    await cmdNFLSpreadAnalyze(seasons, buckets);
  });

// Convenience commands
program
  .command("update")
  .description(
    "Full workflow: ingest data, train models, settle bets, show stats",
  )
  .option(
    "--days <days>",
    "Days to look back for game updates (default: 3)",
    "3",
  )
  .option(
    "--sports <sports>",
    "Sports to update (comma-separated)",
    "cfb,ncaam,nba,nfl,nhl",
  )
  .action(async (options) => {
    const { execSync } = await import("child_process");
    const validSports = ["cfb", "ncaam", "nba", "nfl", "nhl"];
    const sports = options.sports
      .split(",")
      .filter((s: string) => validSports.includes(s))
      .join(",");
    const daysBack = parseInt(options.days, 10) || 3;

    try {
      console.log("🔄 Starting full update workflow...\n");

      // Ingest
      console.log("📥 Ingesting data...");
      await runDailyIngest(sports.split(",") as Sport[], daysBack);

      // Train models
      console.log("\n🧠 Training models...");
      execSync("npm run train", { stdio: "inherit" });

      // Settle bets
      console.log("\n✅ Settling bets...");
      await cmdResults();

      // Show stats
      console.log("\n📊 Showing stats...");
      await cmdStats();

      console.log("\n✨ Update workflow complete!");
    } catch (err) {
      console.error("❌ Update failed:", err);
      process.exit(1);
    }
  });

program
  .command("settle")
  .description("Check for finished games and settle pending bets")
  .action(async () => {
    try {
      await cmdResults();
    } catch (err) {
      console.error("Error settling bets:", err);
      process.exit(1);
    }
  });

program.parse();

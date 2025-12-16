import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

// Supported sports configuration
const SUPPORTED_SPORTS = {
  // Basketball
  ncaam: { name: "NCAA Men's Basketball", defaultSeason: 2025 },
  nba: { name: "NBA Basketball", defaultSeason: 2024 },
  // Hockey
  nhl: { name: "NHL Hockey", defaultSeason: 2024 },
  // Football
  nfl: { name: "NFL Football", defaultSeason: 2024 },
  cfb: { name: "College Football", defaultSeason: 2024 }
};

// Sport-specific stat handling configurations
const SPORT_STAT_CONFIGS = {
  basketball: {
    // Basketball-specific combined stats that need to be split
    combinedMetrics: {
      "fieldGoalsMade-fieldGoalsAttempted": ["fieldGoalsMade", "fieldGoalsAttempted"],
      "threePointFieldGoalsMade-threePointFieldGoalsAttempted": ["threePointFieldGoalsMade", "threePointFieldGoalsAttempted"],
      "freeThrowsMade-freeThrowsAttempted": ["freeThrowsMade", "freeThrowsAttempted"]
    }
  },
  hockey: {
    // Hockey stats are typically individual metrics
    combinedMetrics: {}
  },
  football: {
    // Football stats are typically individual metrics
    combinedMetrics: {}
  }
};

// Map sports to their stat config
const SPORT_TO_CONFIG = {
  ncaam: 'basketball',
  nba: 'basketball',
  nhl: 'hockey',
  nfl: 'football',
  cfb: 'football'
};

// Parse sport and season from command line arguments
const sportArg = process.argv[2];
const seasonArg = process.argv[3];

if (!sportArg || !Object.keys(SUPPORTED_SPORTS).includes(sportArg)) {
  console.error(`Invalid or missing sport argument. Supported sports: ${Object.keys(SUPPORTED_SPORTS).join(', ')}`);
  console.error("Usage: node importSportsToDb.ts <sport> [season]");
  console.error("Examples:");
  console.error("  node importSportsToDb.ts ncaam 2025    # NCAA Men's Basketball");
  console.error("  node importSportsToDb.ts nba 2024     # NBA Basketball");
  console.error("  node importSportsToDb.ts nhl 2024     # NHL Hockey");
  console.error("  node importSportsToDb.ts nfl 2024     # NFL Football");
  console.error("  node importSportsToDb.ts cfb 2024     # College Football");
  process.exit(1);
}

const sport = sportArg;
const sportConfig = SUPPORTED_SPORTS[sportArg as keyof typeof SUPPORTED_SPORTS];
const season = seasonArg ? parseInt(seasonArg, 10) : sportConfig.defaultSeason;
if (isNaN(season)) {
  console.error("Invalid season argument. Usage: node importSportsToDb.ts <sport> [season]");
  process.exit(1);
}

// Use process.cwd() for more reliable path resolution
const dbPath = path.join(process.cwd(), "data", "sportline.db");
const dataDir = path.join(process.cwd(), "data", sport, String(season));

const teamsPath = path.join(dataDir, "teams.json");
const gamesPath = path.join(dataDir, "games.json");
const gameStatsPath = path.join(dataDir, "game_stats.json");
const oddsPath = path.join(dataDir, "odds.json");
const seasonStatsPath = path.join(dataDir, "season_stats.json");

// Check if all required files exist
const requiredFiles = [teamsPath, gamesPath, gameStatsPath, oddsPath, seasonStatsPath];
for (const file of requiredFiles) {
  if (!fs.existsSync(file)) {
    console.error(`Required file not found: ${file}`);
    console.error("Make sure to run the data ingestion first:");
    console.error(`  node dist/ingest/ingestSportsToJson.js ${sport} ${season}`);
    process.exit(1);
  }
}

console.log(`Starting import for ${sportConfig.name} (${sport.toUpperCase()}) season ${season}`);
console.log(`Data directory: ${dataDir}`);
console.log(`Database: ${dbPath}`);

const db = new Database(dbPath);

// --- TEAMS ---
function importTeams() {
  console.log(`[teams] Importing ${sport.toUpperCase()} teams...`);
  const teams = JSON.parse(fs.readFileSync(teamsPath, "utf8"));
  let count = 0;
  for (const t of teams) {
    db.prepare(`INSERT OR IGNORE INTO teams (id, sport, name, abbreviation, display_name, short_display_name) VALUES (?, ?, ?, ?, ?, ?);`).run(
      t.teamId,
      sport,
      t.teamName,
      t.abbreviation ?? null,
      t.displayName ?? null,
      t.shortDisplayName ?? null
    );
    count++;
  }
  console.log(`[teams] Imported ${count} teams.`);
}

// --- GAMES ---
function importGames() {
  console.log(`[games] Importing ${sport.toUpperCase()} games...`);
  const games = JSON.parse(fs.readFileSync(gamesPath, "utf8"));
  let count = 0;
  const missingTeamsLog = path.join(dataDir, "missing_teams.log");
  fs.writeFileSync(missingTeamsLog, ""); // clear log at start
  for (const g of games) {
    // Check if both teams exist in the teams table (composite primary key: id, sport)
    const homeExists = db.prepare("SELECT 1 FROM teams WHERE id = ? AND sport = ?").get(g.homeTeamId, sport);
    const awayExists = db.prepare("SELECT 1 FROM teams WHERE id = ? AND sport = ?").get(g.awayTeamId, sport);
    if (!homeExists || !awayExists) {
      const missing = [];
      if (!homeExists) missing.push(g.homeTeamId);
      if (!awayExists) missing.push(g.awayTeamId);
      fs.appendFileSync(missingTeamsLog, `Game ${g.id}: missing team(s): ${missing.join(", ")}\n`);
      continue; // skip this game
    }
    db.prepare(`INSERT OR IGNORE INTO games (id, sport, date, season, home_team_id, away_team_id, home_score, away_score, venue, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`).run(
      g.id,
      sport,
      g.date,
      season,
      g.homeTeamId,
      g.awayTeamId,
      g.homeScore,
      g.awayScore,
      g.venue ?? null,
      g.status ?? "scheduled"
    );
    count++;
  }
  console.log(`[games] Imported ${count} games.`);
}

// --- ODDS ---
function importOdds() {
  console.log(`[odds] Importing ${sport.toUpperCase()} odds...`);
  const odds = JSON.parse(fs.readFileSync(oddsPath, "utf8"));
  let count = 0;
  const missingOddsLog = path.join(dataDir, "missing_odds.log");
  fs.writeFileSync(missingOddsLog, ""); // clear log at start
  const missingOddsGamesLog = path.join(dataDir, "missing_odds_games.log");
  fs.writeFileSync(missingOddsGamesLog, ""); // clear log at start
  for (const o of odds) {
    const market = o.market ?? null;
    if (!market) {
      fs.appendFileSync(missingOddsLog, `Odds for game ${o.eventId} missing market.\n`);
      continue;
    }
    // Check if the game exists in the games table
    const gameExists = db.prepare("SELECT 1 FROM games WHERE id = ?").get(o.eventId);
    if (!gameExists) {
      fs.appendFileSync(missingOddsGamesLog, `Odds for game ${o.eventId} (market: ${market}) missing game in games table.\n`);
      continue;
    }
    // Map JSON fields to DB columns based on market
    let line = null, price_home = null, price_away = null, price_over = null, price_under = null;
    if (market === "moneyline") {
      price_home = o.homeTeamOdds ?? null;
      price_away = o.awayTeamOdds ?? null;
    } else if (market === "spread") {
      line = o.value ?? o.spread ?? o.line ?? null;
      price_home = o.homeTeamOdds ?? null;
      price_away = o.awayTeamOdds ?? null;
    } else if (market === "total") {
      line = o.value ?? o.line ?? null;
      price_over = o.overOdds ?? null;
      price_under = o.underOdds ?? null;
    }
    db.prepare(`INSERT OR REPLACE INTO odds (game_id, provider, market, line, price_home, price_away, price_over, price_under, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`).run(
      o.eventId,
      o.provider,
      market,
      line,
      price_home,
      price_away,
      price_over,
      price_under,
      new Date().toISOString()
    );
    count++;
  }
  console.log(`[odds] Imported ${count} odds.`);
}

// --- GAME STATS (per-game, sport-specific handling) ---
function importGameStats() {
  console.log(`[game_stats] Importing ${sport.toUpperCase()} game stats...`);
  const stats = JSON.parse(fs.readFileSync(gameStatsPath, "utf8"));
  let count = 0;
  const missingStatsLog = path.join(dataDir, "missing_game_stats.log");
  fs.writeFileSync(missingStatsLog, ""); // clear log at start
  
  // Get sport-specific configuration
  const sportType = SPORT_TO_CONFIG[sport as keyof typeof SPORT_TO_CONFIG] || 'generic';
  const statConfig = SPORT_STAT_CONFIGS[sportType as keyof typeof SPORT_STAT_CONFIGS] || { combinedMetrics: {} };
  
  for (const s of stats) {
    if (!s.stats || !Array.isArray(s.stats) || s.stats.length === 0) {
      fs.appendFileSync(missingStatsLog, `game_id: ${s.game_id}, team_id: ${s.team_id} missing or empty stats, skipping.\n`);
      continue;
    }
    // Check if game and team exist
    const gameExists = db.prepare("SELECT 1 FROM games WHERE id = ?").get(s.game_id);
    const teamExists = db.prepare("SELECT 1 FROM teams WHERE id = ? AND sport = ?").get(s.team_id, sport);
    if (!gameExists || !teamExists) {
      fs.appendFileSync(missingStatsLog, `Missing reference: game_id: ${s.game_id} exists: ${!!gameExists}, team_id: ${s.team_id} exists: ${!!teamExists}\n`);
      continue;
    }
    for (const stat of s.stats) {
      const metricName: string = stat.name ?? stat.abbreviation;
      if (!metricName) {
        fs.appendFileSync(missingStatsLog, `game_id: ${s.game_id}, team_id: ${s.team_id} missing metric_name and abbreviation, skipping stat: ${JSON.stringify(stat)}\n`);
        continue;
      }

      // Handle sport-specific combined stats: split into made/attempted
      if (metricName in statConfig.combinedMetrics && typeof stat.value === "string" && stat.value.includes("-")) {
        const [made, attempted] = stat.value.split("-").map(Number);
        const [madeName, attemptedName] = (statConfig.combinedMetrics as Record<string, [string, string]>)[metricName];
        if (!isNaN(made)) {
          db.prepare(`INSERT INTO game_stats (game_id, team_id, sport, season, metric_name, metric_value) VALUES (?, ?, ?, ?, ?, ?);`).run(
            s.game_id,
            s.team_id,
            sport,
            season,
            madeName,
            made
          );
          count++;
        }
        if (!isNaN(attempted)) {
          db.prepare(`INSERT INTO game_stats (game_id, team_id, sport, season, metric_name, metric_value) VALUES (?, ?, ?, ?, ?, ?);`).run(
            s.game_id,
            s.team_id,
            sport,
            season,
            attemptedName,
            attempted
          );
          count++;
        }
        continue; // skip inserting the combined metric
      }

      db.prepare(`INSERT INTO game_stats (game_id, team_id, sport, season, metric_name, metric_value) VALUES (?, ?, ?, ?, ?, ?);`).run(
        s.game_id,
        s.team_id,
        sport,
        season,
        metricName,
        stat.value
      );
      count++;
    }
  }
  console.log(`[game_stats] Imported ${count} game stats.`);
}

// --- SEASON STATS (aggregate, for season_stats table) ---
function importSeasonStats() {
  console.log(`[season_stats] Importing ${sport.toUpperCase()} season stats...`);
  const stats = JSON.parse(fs.readFileSync(seasonStatsPath, "utf8"));
  let count = 0;
  const missingStatsLog = path.join(dataDir, "missing_season_stats.log");
  fs.writeFileSync(missingStatsLog, ""); // clear log at start
  for (const s of stats) {
    if (!s.stats || !s.stats.categories) {
      fs.appendFileSync(missingStatsLog, `teamId: ${s.teamId} missing stats, skipping.\n`);
      continue;
    }
    for (const cat of s.stats.categories) {
      const category = cat.name ?? cat.abbreviation ?? "unknown";
      for (const stat of cat.stats) {
        const metricName = stat.name ?? stat.abbreviation;
        if (!metricName) {
          fs.appendFileSync(missingStatsLog, `teamId: ${s.teamId}, category: ${category} missing metric_name and abbreviation, skipping stat: ${JSON.stringify(stat)}\n`);
          continue;
        }
        db.prepare(`INSERT INTO season_stats (team_id, sport, season, category, metric_name, metric_abbr, metric_value) VALUES (?, ?, ?, ?, ?, ?, ?);`).run(
          s.teamId,
          sport,
          season,
          category,
          metricName,
          stat.abbreviation ?? null,
          stat.value
        );
        count++;
      }
    }
  }
  console.log(`[season_stats] Imported ${count} season stats.`);
}

function main() {
  try {
    importTeams();
    importGames();
    importOdds();
    importGameStats();
    importSeasonStats();
    console.log(`✅ Import from JSON files complete for ${sportConfig.name} (${sport.toUpperCase()}) season ${season}.`);
  } catch (error) {
    console.error("❌ Import failed:", error);
    process.exit(1);
  }
}

main();
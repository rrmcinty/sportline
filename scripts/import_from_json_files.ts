import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

// Paths
const dbPath = path.join("data", "sportline.db");
const season = 2025;
const sport = "ncaam";
const dataDir = path.join("data", sport, String(season));

const teamsPath = path.join(dataDir, "teams.json");
const gamesPath = path.join(dataDir, "games.json");
const oddsPath = path.join(dataDir, "odds.json");
const seasonStatsPath = path.join(dataDir, "season_stats.json");

const db = new Database(dbPath);

// --- TEAMS ---
function importTeams() {
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
  const games = JSON.parse(fs.readFileSync(gamesPath, "utf8"));
  let count = 0;
  const missingTeamsLog = path.join(dataDir, "missing_teams.log");
  fs.writeFileSync(missingTeamsLog, ""); // clear log at start
  for (const g of games) {
    // Check if both teams exist in the teams table
    const homeExists = db.prepare("SELECT 1 FROM teams WHERE id = ?").get(g.homeTeamId);
    const awayExists = db.prepare("SELECT 1 FROM teams WHERE id = ?").get(g.awayTeamId);
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
    db.prepare(`INSERT OR REPLACE INTO odds (game_id, provider, market, line, price_home, price_away, price_over, price_under, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`).run(
      o.eventId,
      o.provider,
      market,
      o.spread ?? o.line ?? null,
      o.homeTeamMoneyLine ?? o.price_home ?? null,
      o.awayTeamMoneyLine ?? o.price_away ?? null,
      o.overOdds ?? o.price_over ?? null,
      o.underOdds ?? o.price_under ?? null,
      new Date().toISOString()
    );
    count++;
  }
  console.log(`[odds] Imported ${count} odds.`);
}

// --- TEAM STATS ---

// --- GAME STATS (per-game, not used for season_stats) ---
function importGameStats() {
  const stats = JSON.parse(fs.readFileSync(seasonStatsPath, "utf8"));
  let count = 0;
  const missingGameDateLog = path.join(dataDir, "missing_game_stats_game_date.log");
  fs.writeFileSync(missingGameDateLog, ""); // clear log at start
  for (const s of stats) {
    if (!s.stats || !s.stats.categories) continue;
    // If game_date is missing, log and skip
    if (!s.game_date) {
      fs.appendFileSync(missingGameDateLog, `teamId: ${s.teamId} missing game_date, skipping all stats for this entry.\n`);
      continue;
    }
    for (const cat of s.stats.categories) {
      for (const stat of cat.stats) {
        db.prepare(`INSERT INTO game_stats (team_id, sport, season, game_date, metric_name, metric_value) VALUES (?, ?, ?, ?, ?, ?);`).run(
          s.teamId,
          sport,
          season,
          s.game_date,
          stat.abbreviation ?? stat.name,
          stat.value
        );
        count++;
      }
    }
  }
  console.log(`[game_stats] Imported ${count} game stats.`);
}


// --- SEASON STATS (aggregate, for season_stats table) ---
function importSeasonStats() {
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
      for (const stat of cat.stats) {
        db.prepare(`INSERT INTO season_stats (team_id, sport, season, metric_name, metric_value) VALUES (?, ?, ?, ?, ?);`).run(
          s.teamId,
          sport,
          season,
          stat.abbreviation ?? stat.name,
          stat.value
        );
        count++;
      }
    }
  }
  console.log(`[season_stats] Imported ${count} season stats.`);
}

function main() {
  importTeams();
  importGames();
  importOdds();
  importGameStats();
  importSeasonStats();
  console.log("Import from JSON files complete.");
}

main();

import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { initDb, getDb } from "../src/db/index.js";

// Type definitions for table objects
interface Team {
  id?: number;
  espn_id: string;
  sport: string;
  name: string;
  abbreviation?: string;
}

interface ApiResults {
  apiResultSummary?: Record<string, number>;
  [date: string]: Game[] | Record<string, number> | undefined;
}

interface Game {
  eventId: string;
  date: string;
  homeTeam: Team;
  awayTeam: Team;
  homeScore?: number;
  awayScore?: number;
  venue?: string;
  status?: string;
  boxScore?: {
    home: Record<string, number | string>;
    away: Record<string, number | string>;
  };
  odds?: Odds[];
  hasBoxScore?: boolean;
  hasAllStats?: boolean;
}

interface Odds {
  provider: string;
  market: string;
  line: number | null;
  price_home: number | null;
  price_away: number | null;
  price_over: number | null;
  price_under: number | null;
  timestamp: string;
}



const dbPath = path.join("data", "sportline.db");
const db = new Database(dbPath);

const season = 2025;
const sport = "ncaam";
const jsonPath = path.join("data", sport, String(season), "data.json");
const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));


function upsertTeam(team: Team) {
  db.prepare(`INSERT OR IGNORE INTO teams (sport, espn_id, name, abbreviation) VALUES (?, ?, ?, ?);`).run(
    team.sport,
    team.espn_id,
    team.name,
    team.abbreviation ?? null
  );
  console.log(`[teams] Upserted: ${team.name} (${team.espn_id})`);
}


function getTeamId(espn_id: string, sport: string): number | null {
  const row = db.prepare(`SELECT id FROM teams WHERE espn_id = ? AND sport = ?`).get(espn_id, sport) as { id: number } | undefined;
  return row ? row.id : null;
}


function getGameId(eventId: string): number | null {
  const row = db.prepare(`SELECT id FROM games WHERE espn_event_id = ?`).get(eventId) as { id: number } | undefined;
  return row ? row.id : null;
}


function insertGame(game: Game) {
  const homeTeamId = getTeamId(String(game.homeTeam.id), sport);
  const awayTeamId = getTeamId(String(game.awayTeam.id), sport);
  if (typeof game.homeScore === "undefined" || typeof game.awayScore === "undefined") {
    throw new Error(`[games] Missing required score for game ${game.eventId}`);
  }
  db.prepare(`INSERT OR IGNORE INTO games (espn_event_id, sport, date, season, home_team_id, away_team_id, home_score, away_score, venue, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`).run(
    game.eventId,
    sport,
    game.date,
    season,
    homeTeamId,
    awayTeamId,
    game.homeScore,
    game.awayScore,
    game.venue ?? null,
    game.status ?? "scheduled"
  );
  console.log(`[games] Inserted: ${game.eventId} (${game.date}) home=${homeTeamId} away=${awayTeamId}`);
}


function insertTeamStats(game: Game) {
  if (!game.boxScore) return;
  const sides: Array<{ side: "home" | "away"; team: Team; stats: Record<string, string | number> | undefined }> = [
    { side: "home", team: game.homeTeam, stats: game.boxScore.home },
    { side: "away", team: game.awayTeam, stats: game.boxScore.away }
  ];
  for (const { side, team, stats } of sides) {
    if (!stats) continue;
    const teamId = getTeamId(String(team.id ?? team.espn_id), sport);
    let statCount = 0;
    for (const [metric_name, metric_value] of Object.entries(stats)) {
      db.prepare(`INSERT INTO team_stats (team_id, sport, season, game_date, metric_name, metric_value) VALUES (?, ?, ?, ?, ?, ?);`).run(
        teamId,
        sport,
        season,
        game.date,
        metric_name,
        Number(metric_value)
      );
      statCount++;
    }
    console.log(`[team_stats] Inserted ${statCount} stats for team ${teamId} (${side}) in game ${game.eventId}`);
  }
}


function insertOdds(game: Game) {
  if (!game.odds) return;
  const gameId = getGameId(game.eventId);
  let oddsCount = 0;
  for (const odds of game.odds) {
    db.prepare(`INSERT OR REPLACE INTO odds (game_id, provider, market, line, price_home, price_away, price_over, price_under, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`).run(
      gameId,
      odds.provider,
      odds.market,
      odds.line,
      odds.price_home,
      odds.price_away,
      odds.price_over,
      odds.price_under,
      odds.timestamp
    );
    oddsCount++;
  }
  console.log(`[odds] Inserted ${oddsCount} odds for game ${game.eventId}`);
}

for (const date in data) {
  if (date === "apiResultSummary") continue;
  console.log(`[import] Processing date: ${date}`);
  for (const game of data[date]) {
    upsertTeam({
      espn_id: String(game.homeTeam.id),
      sport,
      name: game.homeTeam.name,
      abbreviation: game.homeTeam.abbreviation ?? null
    });
    upsertTeam({
      espn_id: String(game.awayTeam.id),
      sport,
      name: game.awayTeam.name,
      abbreviation: game.awayTeam.abbreviation ?? null
    });
    console.log(`[import] Processing game: ${game.eventId}`);
    insertGame(game);
    insertTeamStats(game);
    insertOdds(game);
  }
}

console.log("Import complete.");

/**
 * Import games and team stats from API results JSON into the database
 * Usage: npx ts-node scripts/import_api_results.ts <jsonFilePath>
 */
async function importApiResults(jsonFilePath: string) {
  initDb();
  const db = getDb();
  const data: ApiResults = JSON.parse(fs.readFileSync(jsonFilePath, "utf8"));

  let gamesInserted = 0;
  let statsInserted = 0;

  for (const [date, games] of Object.entries(data)) {
    if (date === "apiResultSummary" || !Array.isArray(games)) continue;
    for (const game of games as Game[]) {
      // Insert game
      db.prepare(`
        INSERT OR IGNORE INTO games (espn_event_id, date, home_team_id, away_team_id)
        VALUES (?, ?, ?, ?)
      `).run(
        game.eventId,
        game.date,
        game.homeTeam.id,
        game.awayTeam.id
      );
      gamesInserted++;
      // Insert team stats if available
      if (game.hasAllStats && game.boxScore) {
        // Home team stats
        for (const [stat, value] of Object.entries(game.boxScore.home)) {
          db.prepare(`
            INSERT INTO team_stats (team_id, game_date, metric_name, metric_value)
            VALUES (?, ?, ?, ?)
          `).run(
            game.homeTeam.id,
            game.date,
            stat,
            value
          );
          statsInserted++;
        }
        // Away team stats
        for (const [stat, value] of Object.entries(game.boxScore.away)) {
          db.prepare(`
            INSERT INTO team_stats (team_id, game_date, metric_name, metric_value)
            VALUES (?, ?, ?, ?)
          `).run(
            game.awayTeam.id,
            game.date,
            stat,
            value
          );
          statsInserted++;
        }
      }
    }
  }
  console.log(`Import complete. Games inserted: ${gamesInserted}, Team stats inserted: ${statsInserted}`);
}

// CLI usage
if (process.argv.length < 3) {
  console.error("Usage: npx ts-node scripts/import_api_results.ts <jsonFilePath>");
  process.exit(1);
}
importApiResults(process.argv[2]);

import fs from "fs";
import { initDb, getDb } from "../src/db/index.js";

interface Team {
  id: number;
  name?: string;
  abbreviation?: string;
}

interface Game {
  eventId: string;
  date: string;
  homeTeam: Team;
  awayTeam: Team;
  hasBoxScore: boolean;
  hasAllStats: boolean;
  boxScore?: {
    home: Record<string, string | number>;
    away: Record<string, string | number>;
  };
}

interface ApiResults {
  apiResultSummary?: Record<string, number>;
  [date: string]: Game[] | Record<string, number> | undefined;
}

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

import chalk from "chalk";
import { cmdDataIngest } from "../src/data/ingest.js";
import { getDb, initDb } from "../src/db/index.js";

/**
 * Test reliability of ESPN NCAAM ingest for the past 7 days
 * Logs: games added, games with team_stats, and missing stats per day
 */
async function testNcaamIngestReliability() {
  initDb();
  const db = getDb();
  const today = new Date();
  const results: Array<{ date: string; games: number; gamesWithStats: number; missingStats: number }> = [];

  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const dateStr = `${yyyy}-${mm}-${dd}`;

    // Ingest games for this day
    await cmdDataIngest("ncaam", yyyy, dateStr, dateStr);

    // Count games added for this day
    const games = db.prepare(
      `SELECT id FROM games WHERE sport = 'ncaam' AND date = ?`
    ).all(dateStr) as Array<{ id: number }>;
    const gameIds = games.map((g) => g.id);
    const gamesCount = gameIds.length;

    // Count games with team_stats
    let gamesWithStats = 0;
    let missingStats = 0;
    for (const gameId of gameIds) {
      const stats = db.prepare(
        `SELECT COUNT(*) as cnt FROM team_stats WHERE sport = 'ncaam' AND game_date = ? AND (team_id IN (SELECT home_team_id FROM games WHERE id = ?) OR team_id IN (SELECT away_team_id FROM games WHERE id = ?))`
      ).get(dateStr, gameId, gameId) as { cnt: number };
      if (stats && typeof stats.cnt === "number" && stats.cnt > 0) {
        gamesWithStats++;
      } else {
        missingStats++;
      }
    }

    results.push({ date: dateStr, games: gamesCount, gamesWithStats, missingStats });
    console.log(
      chalk.cyan(
        `Date: ${dateStr} | Games: ${gamesCount} | With Stats: ${gamesWithStats} | Missing Stats: ${missingStats}`
      )
    );
  }

  // Summary
  console.log(chalk.bold.green("\nSummary for past 7 days:"));
  results.forEach((r) => {
    console.log(
      chalk.gray(
        `${r.date}: Games=${r.games}, WithStats=${r.gamesWithStats}, MissingStats=${r.missingStats}`
      )
    );
  });
}

// Run the test
if (require.main === module) {
  testNcaamIngestReliability().catch((err) => {
    console.error(chalk.red("Error running reliability test:"), err);
    process.exit(1);
  });
}

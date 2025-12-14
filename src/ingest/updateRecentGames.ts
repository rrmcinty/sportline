/**
 * Smart update script for daily use
 * Updates odds for upcoming games and stats for recently completed games
 */

import fetch from "node-fetch";
import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "data", "sportline.db");
const db = new Database(dbPath);

// ESPN API endpoints
const ODDS_API = (eventId: string) =>
  `https://sports.core.api.espn.com/v2/sports/basketball/leagues/mens-college-basketball/events/${eventId}/competitions/${eventId}/odds`;

const GAME_SUMMARY_API = (eventId: string) =>
  `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary?event=${eventId}`;

async function fetchGameOdds(eventId: string) {
  const url = ODDS_API(eventId);
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as any;
  return Array.isArray(data.items) ? data.items : [];
}

async function fetchGameSummary(eventId: string) {
  const url = GAME_SUMMARY_API(eventId);
  const res = await fetch(url);
  if (!res.ok) return null;
  return (await res.json()) as any;
}

async function updateRecentGames(
  daysBack: number = 1,
  daysForward: number = 7
) {
  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(now.getDate() - daysBack);
  const endDate = new Date(now);
  endDate.setDate(now.getDate() + daysForward);

  const startDateStr = startDate.toISOString().split("T")[0];
  const endDateStr = endDate.toISOString().split("T")[0];

  console.log(`\n🔄 Updating games from ${startDateStr} to ${endDateStr}\n`);

  // Find games that need updating
  const gamesToUpdate = db
    .prepare(
      `
    SELECT id, date, status, home_team_id, away_team_id, home_score, away_score
    FROM games
    WHERE sport = 'ncaam'
      AND DATE(date) >= DATE(?)
      AND DATE(date) <= DATE(?)
      AND (status IN ('scheduled', 'in') OR (status = 'post' AND home_score IS NULL))
    ORDER BY date ASC
  `
    )
    .all(startDateStr, endDateStr) as any[];

  console.log(`Found ${gamesToUpdate.length} games to update\n`);

  if (gamesToUpdate.length === 0) {
    console.log("✅ No games need updating!");
    db.close();
    return;
  }

  // Group by status
  const scheduled = gamesToUpdate.filter((g) => g.status === "scheduled");
  const inProgress = gamesToUpdate.filter((g) => g.status === "in");
  const needStats = gamesToUpdate.filter(
    (g) => g.status === "post" && g.home_score === null
  );

  console.log(`📊 Status breakdown:`);
  console.log(`  - Scheduled: ${scheduled.length}`);
  console.log(`  - In Progress: ${inProgress.length}`);
  console.log(`  - Need final stats: ${needStats.length}\n`);

  let oddsUpdated = 0;
  let scoresUpdated = 0;
  let statsUpdated = 0;

  // Process each game
  for (const game of gamesToUpdate) {
    try {
      // Fetch game summary (has both odds and current status/score)
      const [summary, oddsData] = await Promise.all([
        fetchGameSummary(game.id),
        fetchGameOdds(game.id),
      ]);

      // Update game status and scores if available
      if (summary) {
        const competition = summary.header?.competitions?.[0];
        const newStatus = competition?.status?.type?.state;
        const competitors = competition?.competitors || [];
        const home = competitors.find((c: any) => c.homeAway === "home");
        const away = competitors.find((c: any) => c.homeAway === "away");

        const homeScore = home?.score ? Number(home.score) : null;
        const awayScore = away?.score ? Number(away.score) : null;

        if (newStatus && newStatus !== game.status) {
          db.prepare(
            `UPDATE games SET status = ?, home_score = ?, away_score = ? WHERE id = ?`
          ).run(newStatus, homeScore, awayScore, game.id);
          scoresUpdated++;
          console.log(
            `  ✓ Updated ${game.id}: ${game.status} → ${newStatus}${homeScore !== null ? ` (${homeScore}-${awayScore})` : ""}`
          );
        } else if (
          homeScore !== null &&
          (game.home_score === null || game.home_score !== homeScore)
        ) {
          db.prepare(
            `UPDATE games SET home_score = ?, away_score = ? WHERE id = ?`
          ).run(homeScore, awayScore, game.id);
          scoresUpdated++;
          console.log(`  ✓ Updated score for ${game.id}: ${homeScore}-${awayScore}`);
        }

        // If game just completed, fetch detailed stats
        if (newStatus === "post" && summary.boxscore?.teams) {
          const teams = summary.boxscore.teams;
          for (const teamData of teams) {
            const teamId = teamData.team?.id;
            if (!teamId) continue;

            const stats = teamData.statistics || [];
            for (const stat of stats) {
              // Check if stat already exists
              const existing = db
                .prepare(
                  `SELECT id FROM game_stats WHERE game_id = ? AND team_id = ? AND metric_name = ?`
                )
                .get(game.id, teamId, stat.name);

              if (!existing) {
                db.prepare(
                  `INSERT INTO game_stats (game_id, team_id, sport, season, metric_name, metric_value)
                   VALUES (?, ?, 'ncaam', ?, ?, ?)`
                ).run(
                  game.id,
                  teamId,
                  new Date(game.date).getFullYear(),
                  stat.name,
                  stat.displayValue || stat.value
                );
                statsUpdated++;
              }
            }
          }
          console.log(`  ✓ Updated stats for ${game.id}`);
        }
      }

      // Update odds
      if (oddsData && Array.isArray(oddsData)) {
        for (const odds of oddsData) {
          const provider = odds.provider?.name || odds.provider || "Unknown";
          const timestamp = new Date().toISOString();

          // Moneyline
          if (
            odds.homeTeamOdds?.moneyLine !== undefined ||
            odds.awayTeamOdds?.moneyLine !== undefined
          ) {
            // Delete old odds for this provider/game/market
            db.prepare(
              `DELETE FROM odds WHERE game_id = ? AND provider = ? AND market = 'moneyline'`
            ).run(game.id, provider);

            // Insert new odds
            db.prepare(
              `INSERT INTO odds (game_id, provider, market, price_home, price_away, timestamp)
               VALUES (?, ?, 'moneyline', ?, ?, ?)`
            ).run(
              game.id,
              provider,
              "moneyline",
              odds.homeTeamOdds?.moneyLine ?? null,
              odds.awayTeamOdds?.moneyLine ?? null,
              timestamp
            );
            oddsUpdated++;
          }

          // Spread
          if (odds.spread !== undefined) {
            db.prepare(
              `DELETE FROM odds WHERE game_id = ? AND provider = ? AND market = 'spread'`
            ).run(game.id, provider);

            db.prepare(
              `INSERT INTO odds (game_id, provider, market, line, price_home, price_away, timestamp)
               VALUES (?, ?, 'spread', ?, ?, ?, ?)`
            ).run(
              game.id,
              provider,
              "spread",
              odds.spread,
              odds.homeTeamOdds?.spreadOdds ?? null,
              odds.awayTeamOdds?.spreadOdds ?? null,
              timestamp
            );
          }

          // Total
          if (odds.overUnder !== undefined) {
            db.prepare(
              `DELETE FROM odds WHERE game_id = ? AND provider = ? AND market = 'total'`
            ).run(game.id, provider);

            db.prepare(
              `INSERT INTO odds (game_id, provider, market, line, price_over, price_under, timestamp)
               VALUES (?, ?, 'total', ?, ?, ?, ?)`
            ).run(
              game.id,
              provider,
              "total",
              odds.overUnder,
              odds.overOdds ?? null,
              odds.underOdds ?? null,
              timestamp
            );
          }
        }
      }

      // Small delay to be nice to ESPN API
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`  ✗ Error updating game ${game.id}:`, error);
    }
  }

  console.log(`\n✅ Update complete!`);
  console.log(`  - Odds updated: ${oddsUpdated}`);
  console.log(`  - Scores updated: ${scoresUpdated}`);
  console.log(`  - Stats added: ${statsUpdated}\n`);

  db.close();
}

// Parse command line arguments
const daysBack = process.argv[2] ? parseInt(process.argv[2]) : 1;
const daysForward = process.argv[3] ? parseInt(process.argv[3]) : 7;

updateRecentGames(daysBack, daysForward).catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});


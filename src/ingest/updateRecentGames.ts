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
const ODDS_API = (eventId: string, sport: string) => {
  const league = sport === 'ncaam' ? 'mens-college-basketball' : 'nba';
  return `https://sports.core.api.espn.com/v2/sports/basketball/leagues/${league}/events/${eventId}/competitions/${eventId}/odds`;
};

const GAME_SUMMARY_API = (eventId: string, sport: string) => {
  const league = sport === 'ncaam' ? 'mens-college-basketball' : 'nba';
  return `https://site.api.espn.com/apis/site/v2/sports/basketball/${league}/summary?event=${eventId}`;
};

async function fetchGameOdds(eventId: string, sport: string) {
  try {
    const url = ODDS_API(eventId, sport);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    const res = await fetch(url, { 
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });
    clearTimeout(timeoutId);
    
    if (!res.ok) {
      if (res.status === 429) {
        console.log(`  ⚠️  Rate limited for ${eventId}, skipping odds...`);
      }
      return null;
    }
    const data = (await res.json()) as any;
    return Array.isArray(data.items) ? data.items : [];
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      console.log(`  ⚠️  Timeout fetching odds for ${eventId}`);
    }
    return null;
  }
}

async function fetchGameSummary(eventId: string, sport: string) {
  try {
    const url = GAME_SUMMARY_API(eventId, sport);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    const res = await fetch(url, { 
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });
    clearTimeout(timeoutId);
    
    if (!res.ok) {
      if (res.status === 429) {
        console.log(`  ⚠️  Rate limited for ${eventId}, skipping summary...`);
      }
      return null;
    }
    return (await res.json()) as any;
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      console.log(`  ⚠️  Timeout fetching summary for ${eventId}`);
    }
    return null;
  }
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
    SELECT id, date, status, home_team_id, away_team_id, home_score, away_score, sport
    FROM games
    WHERE sport IN ('ncaam', 'nba')
      AND DATE(DATETIME(date, '-5 hours')) >= DATE(?)
      AND DATE(DATETIME(date, '-5 hours')) <= DATE(?)
      AND (status IN ('pre', 'scheduled', 'in') OR (status = 'post' AND home_score IS NULL))
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
  let processed = 0;
  let errors = 0;

  // Process games in smaller batches to avoid overwhelming the API
  const BATCH_SIZE = 10;
  const DELAY_BETWEEN_BATCHES = 2000; // 2 seconds between batches
  const DELAY_BETWEEN_REQUESTS = 200; // 200ms between individual requests

  console.log(`🔄 Processing ${gamesToUpdate.length} games in batches of ${BATCH_SIZE}...\n`);

  for (let i = 0; i < gamesToUpdate.length; i += BATCH_SIZE) {
    const batch = gamesToUpdate.slice(i, i + BATCH_SIZE);
    console.log(`📦 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(gamesToUpdate.length / BATCH_SIZE)} (${batch.length} games)...`);

    // Process each game in the batch
    for (const game of batch) {
    try {
      // Fetch game summary (has both odds and current status/score)
      const [summary, oddsData] = await Promise.all([
        fetchGameSummary(game.id, game.sport),
        fetchGameOdds(game.id, game.sport),
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
                   VALUES (?, ?, ?, ?, ?, ?)`
                ).run(
                  game.id,
                  teamId,
                  game.sport,
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
               VALUES (?, ?, ?, ?, ?, ?)`
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
               VALUES (?, ?, ?, ?, ?, ?, ?)`
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
               VALUES (?, ?, ?, ?, ?, ?, ?)`
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

      processed++;
      
      // Progress indicator
      if (processed % 10 === 0) {
        console.log(`  📊 Progress: ${processed}/${gamesToUpdate.length} games processed`);
      }

      // Delay between requests to be nice to ESPN API
      await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
    } catch (error: any) {
      errors++;
      console.error(`  ✗ Error updating game ${game.id}:`, error?.message || error);
      
      // If we're getting too many errors, slow down
      if (errors > 5) {
        console.log(`  ⚠️  Many errors detected, increasing delay...`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  // Delay between batches to avoid overwhelming the API
  if (i + BATCH_SIZE < gamesToUpdate.length) {
    console.log(`  ⏳ Waiting ${DELAY_BETWEEN_BATCHES / 1000}s before next batch...\n`);
    await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
  }
}

  console.log(`\n✅ Update complete!`);
  console.log(`📊 Final Results:`);
  console.log(`  - Games processed: ${processed}/${gamesToUpdate.length}`);
  console.log(`  - Odds updated: ${oddsUpdated}`);
  console.log(`  - Scores updated: ${scoresUpdated}`);
  console.log(`  - Stats added: ${statsUpdated}`);
  console.log(`  - Errors encountered: ${errors}`);
  
  if (errors > 0) {
    console.log(`\n⚠️  ${errors} errors occurred during update. This is normal due to API rate limits.`);
  }
  
  if (processed < gamesToUpdate.length) {
    console.log(`\n⚠️  Only ${processed}/${gamesToUpdate.length} games were processed. Consider running update again.`);
  }
  
  console.log(``);

  db.close();
}

// Parse command line arguments
const daysBack = process.argv[2] ? parseInt(process.argv[2]) : 1;
const daysForward = process.argv[3] ? parseInt(process.argv[3]) : 7;

updateRecentGames(daysBack, daysForward).catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});


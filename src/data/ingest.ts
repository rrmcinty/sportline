/**
 * Data ingestion command handlers
 */

import chalk from "chalk";
import type { Sport, Competition } from "../models/types.js";
import { initDb, getDb } from "../db/index.js";
import { fetchEvents as fetchEventsNcaam } from "../espn/ncaam/events.js";
import { fetchEvents as fetchEventsCfb } from "../espn/cfb/events.js";
import { fetchOdds as fetchOddsNcaam } from "../espn/ncaam/odds.js";
import { fetchOdds as fetchOddsCfb } from "../espn/cfb/odds.js";

/**
 * Get season date range for a sport
 */
function getSeasonDateRange(sport: Sport, season: number): { start: string; end: string } {
  if (sport === "ncaam") {
    // NCAAM season: Nov 1 to Apr 15
    return {
      start: `${season}-11-01`,
      end: `${season + 1}-04-15`
    };
  } else {
    // CFB season: Aug 20 to Jan 31
    return {
      start: `${season}-08-20`,
      end: `${season + 1}-01-31`
    };
  }
}

/**
 * Convert YYYY-MM-DD to YYYYMMDD
 */
function toYYYYMMDD(date: string): string {
  return date.replace(/-/g, "");
}

/**
 * Generate date range array
 */
function generateDateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const startDate = new Date(start);
  const endDate = new Date(end);
  
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    dates.push(`${yyyy}${mm}${dd}`);
  }
  
  return dates;
}

/**
 * Ingest historical game data for a sport/season
 */
export async function cmdDataIngest(
  sport: Sport,
  season: number,
  fromDate?: string,
  toDate?: string
): Promise<void> {
  try {
    console.log(chalk.bold.cyan(`\n📥 Ingesting ${sport.toUpperCase()} data for season ${season}...\n`));

    // Initialize database
    initDb();
    const db = getDb();

    // Determine date range
    const defaultRange = getSeasonDateRange(sport, season);
    const startDate = fromDate || defaultRange.start;
    const endDate = toDate || defaultRange.end;
    
    console.log(chalk.gray(`Date range: ${startDate} to ${endDate}\n`));

    // Select appropriate fetchers
    const fetchEvents = sport === "ncaam" ? fetchEventsNcaam : fetchEventsCfb;
    const fetchOdds = sport === "ncaam" ? fetchOddsNcaam : fetchOddsCfb;

    // Generate dates to fetch
    const dates = generateDateRange(startDate, endDate);
    console.log(chalk.gray(`Fetching ${dates.length} days of games...\n`));

    let totalGames = 0;
    let totalOdds = 0;

    // Insert or get team
    const upsertTeam = db.prepare(`
      INSERT INTO teams (sport, espn_id, name, abbreviation)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(sport, espn_id) DO UPDATE SET
        name = excluded.name,
        abbreviation = excluded.abbreviation
      RETURNING id
    `);

    // Insert game
    const insertGame = db.prepare(`
      INSERT INTO games (espn_event_id, sport, date, season, home_team_id, away_team_id, home_score, away_score, venue, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(espn_event_id) DO UPDATE SET
        home_score = excluded.home_score,
        away_score = excluded.away_score,
        status = excluded.status
    `);

    // Insert odds
    const insertOdds = db.prepare(`
      INSERT INTO odds (game_id, provider, market, line, price_home, price_away, price_over, price_under, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const getGameByEventId = db.prepare(`SELECT id FROM games WHERE espn_event_id = ?`);

    // Fetch games day by day
    for (const dateStr of dates) {
      try {
        const competitions = await fetchEvents(dateStr);
        
        if (competitions.length === 0) continue;

        console.log(chalk.dim(`${dateStr}: ${competitions.length} game(s)`));

        for (const comp of competitions) {
          // Upsert teams
          const homeTeamResult = upsertTeam.get(
            sport,
            comp.homeTeam.id,
            comp.homeTeam.name,
            comp.homeTeam.abbreviation || null
          ) as { id: number };
          const awayTeamResult = upsertTeam.get(
            sport,
            comp.awayTeam.id,
            comp.awayTeam.name,
            comp.awayTeam.abbreviation || null
          ) as { id: number };

          // Insert game
          insertGame.run(
            comp.eventId,
            sport,
            comp.date,
            season,
            homeTeamResult.id,
            awayTeamResult.id,
            comp.homeScore ?? null,
            comp.awayScore ?? null,
            comp.venue || null,
            comp.status
          );

          totalGames++;

          // Fetch and insert odds
          try {
            const oddsEntries = await fetchOdds(comp.eventId);
            const gameRow = getGameByEventId.get(comp.eventId) as { id: number } | undefined;
            
            if (gameRow && oddsEntries.length > 0) {
              for (const entry of oddsEntries) {
                // Moneyline
                if (entry.homeTeamOdds.moneyLine && entry.awayTeamOdds.moneyLine) {
                  insertOdds.run(
                    gameRow.id,
                    entry.provider.name,
                    "moneyline",
                    null,
                    entry.homeTeamOdds.moneyLine,
                    entry.awayTeamOdds.moneyLine,
                    null,
                    null,
                    new Date().toISOString()
                  );
                  totalOdds++;
                }

                // Spread
                if (entry.spread !== undefined && entry.homeTeamOdds.spreadOdds && entry.awayTeamOdds.spreadOdds) {
                  insertOdds.run(
                    gameRow.id,
                    entry.provider.name,
                    "spread",
                    entry.spread,
                    entry.homeTeamOdds.spreadOdds,
                    entry.awayTeamOdds.spreadOdds,
                    null,
                    null,
                    new Date().toISOString()
                  );
                  totalOdds++;
                }

                // Total
                if (entry.overUnder !== undefined && entry.overOdds && entry.underOdds) {
                  insertOdds.run(
                    gameRow.id,
                    entry.provider.name,
                    "total",
                    entry.overUnder,
                    null,
                    null,
                    entry.overOdds,
                    entry.underOdds,
                    new Date().toISOString()
                  );
                  totalOdds++;
                }
              }
            }
          } catch (oddsErr) {
            console.warn(chalk.yellow(`  ⚠️  Failed to fetch odds for ${comp.eventId}`));
          }
        }
      } catch (dayErr) {
        console.warn(chalk.yellow(`⚠️  Failed to fetch ${dateStr}`));
      }

      // Rate limit: small delay between days
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(chalk.green.bold(`\n✅ Ingest complete!`));
    console.log(chalk.gray(`Games stored: ${totalGames}`));
    console.log(chalk.gray(`Odds entries: ${totalOdds}\n`));
  } catch (error) {
    console.error(chalk.red("Error ingesting data:"), error);
    process.exit(1);
  }
}

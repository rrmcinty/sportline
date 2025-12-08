/**
 * Data ingestion command handlers
 */

import chalk from "chalk";
import type { Sport, Competition } from "../models/types.js";
import { initDb, getDb } from "../db/index.js";
import { fetchEvents as fetchEventsNcaam } from "../espn/ncaam/events.js";
import { fetchEvents as fetchEventsCfb } from "../espn/cfb/events.js";
import { fetchEvents as fetchEventsNfl } from "../espn/nfl/events.js";
import { fetchEvents as fetchEventsNba } from "../espn/nba/events.js";
import { fetchNHLEvents as fetchEventsNhl } from "../espn/nhl/events.js";
import { fetchOdds as fetchOddsNcaam } from "../espn/ncaam/odds.js";
import { fetchOdds as fetchOddsCfb } from "../espn/cfb/odds.js";
import { fetchOdds as fetchOddsNfl } from "../espn/nfl/odds.js";
import { fetchOdds as fetchOddsNba } from "../espn/nba/odds.js";
import { fetchNHLOdds as fetchOddsNhl } from "../espn/nhl/odds.js";

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
  } else if (sport === "cfb") {
    // CFB season: Aug 20 to Jan 31
    return {
      start: `${season}-08-20`,
      end: `${season + 1}-01-31`
    };
  } else if (sport === "nfl") {
    // NFL season: Sep 1 to Feb 15 (includes playoffs/Super Bowl)
    return {
      start: `${season}-09-01`,
      end: `${season + 1}-02-15`
    };
  } else {
    // NBA season: Oct 1 to Jun 30 (includes playoffs)
    return {
      start: `${season}-10-01`,
      end: `${season + 1}-06-30`
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

    // Select appropriate fetchers based on sport
    let fetchEvents: (date: string) => Promise<Competition[]>;
    let fetchOdds: (eventId: string) => Promise<any[]>;
    
    if (sport === "ncaam") {
      fetchEvents = fetchEventsNcaam;
      fetchOdds = fetchOddsNcaam;
    } else if (sport === "cfb") {
      fetchEvents = fetchEventsCfb;
      fetchOdds = fetchOddsCfb;
    } else if (sport === "nfl") {
      fetchEvents = fetchEventsNfl;
      fetchOdds = fetchOddsNfl;
    } else if (sport === "nhl") {
      fetchEvents = fetchEventsNhl;
      fetchOdds = fetchOddsNhl;
    } else {
      fetchEvents = fetchEventsNba;
      fetchOdds = fetchOddsNba;
    }

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

        console.log(chalk.dim(`${dateStr}: ${competitions.length} ${sport.toUpperCase()} game(s)`));

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
            // --- NEW: Ingest box score stats for basketball ---
            if ((sport === "ncaam" || sport === "nba") && comp.boxScore) {
              console.log(`Inserting box score stats for event ${comp.eventId}`);
              const insertStat = db.prepare(`
                INSERT INTO team_stats (team_id, sport, season, game_date, metric_name, metric_value)
                VALUES (?, ?, ?, ?, ?, ?)
              `);
              
              // Home team stats
              const homeStats = comp.boxScore.home as Record<string, string | number>;
              for (const [metric, value] of Object.entries(homeStats)) {
                if (typeof value === "string") {
                  if (value.includes("-")) {
                    const [made, attempted] = value.split("-").map(v => parseFloat(v));
                    if (!isNaN(made)) {
                      console.log(`[team_stats] Adding HOME stat: team_id=${homeTeamResult.id}, sport=${sport}, season=${season}, date=${comp.date}, metric=${metric}_made, value=${made}`);
                      const result = insertStat.run(
                        homeTeamResult.id,
                        sport,
                        season,
                        comp.date,
                        `${metric}_made`,
                        made
                      );
                      console.log(`[team_stats] Inserted HOME: metric=${metric}_made, value=${made}, changes=${result.changes}`);
                    }
                    if (!isNaN(attempted)) {
                      console.log(`[team_stats] Adding HOME stat: team_id=${homeTeamResult.id}, sport=${sport}, season=${season}, date=${comp.date}, metric=${metric}_attempted, value=${attempted}`);
                      const result = insertStat.run(
                        homeTeamResult.id,
                        sport,
                        season,
                        comp.date,
                        `${metric}_attempted`,
                        attempted
                      );
                      console.log(`[team_stats] Inserted HOME: metric=${metric}_attempted, value=${attempted}, changes=${result.changes}`);
                    }
                  } else {
                    const num = parseFloat(value);
                    if (!isNaN(num)) {
                      console.log(`[team_stats] Adding HOME stat: team_id=${homeTeamResult.id}, sport=${sport}, season=${season}, date=${comp.date}, metric=${metric}, value=${num}`);
                      const result = insertStat.run(
                        homeTeamResult.id,
                        sport,
                        season,
                        comp.date,
                        metric,
                        num
                      );
                      console.log(`[team_stats] Inserted HOME: metric=${metric}, value=${num}, changes=${result.changes}`);
                    }
                  }
                } else if (typeof value === "number" && !isNaN(value)) {
                  console.log(`[team_stats] Adding HOME stat: team_id=${homeTeamResult.id}, sport=${sport}, season=${season}, date=${comp.date}, metric=${metric}, value=${value}`);
                  const result = insertStat.run(
                    homeTeamResult.id,
                    sport,
                    season,
                    comp.date,
                    metric,
                    value
                  );
                  console.log(`[team_stats] Inserted HOME: metric=${metric}, value=${value}, changes=${result.changes}`);
                }
              }
              // Away team stats
              const awayStats = comp.boxScore.away as Record<string, string | number>;
              for (const [metric, value] of Object.entries(awayStats)) {
                if (typeof value === "string") {
                  if (value.includes("-")) {
                    const [made, attempted] = value.split("-").map(v => parseFloat(v));
                    if (!isNaN(made)) {
                      console.log(`[team_stats] Adding AWAY stat: team_id=${awayTeamResult.id}, sport=${sport}, season=${season}, date=${comp.date}, metric=${metric}_made, value=${made}`);
                      const result = insertStat.run(
                        awayTeamResult.id,
                        sport,
                        season,
                        comp.date,
                        `${metric}_made`,
                        made
                      );
                      console.log(`[team_stats] Inserted AWAY: metric=${metric}_made, value=${made}, changes=${result.changes}`);
                    }
                    if (!isNaN(attempted)) {
                      console.log(`[team_stats] Adding AWAY stat: team_id=${awayTeamResult.id}, sport=${sport}, season=${season}, date=${comp.date}, metric=${metric}_attempted, value=${attempted}`);
                      const result = insertStat.run(
                        awayTeamResult.id,
                        sport,
                        season,
                        comp.date,
                        `${metric}_attempted`,
                        attempted
                      );
                      console.log(`[team_stats] Inserted AWAY: metric=${metric}_attempted, value=${attempted}, changes=${result.changes}`);
                    }
                  } else {
                    const num = parseFloat(value);
                    if (!isNaN(num)) {
                      console.log(`[team_stats] Adding AWAY stat: team_id=${awayTeamResult.id}, sport=${sport}, season=${season}, date=${comp.date}, metric=${metric}, value=${num}`);
                      const result = insertStat.run(
                        awayTeamResult.id,
                        sport,
                        season,
                        comp.date,
                        metric,
                        num
                      );
                      console.log(`[team_stats] Inserted AWAY: metric=${metric}, value=${num}, changes=${result.changes}`);
                    }
                  }
                } else if (typeof value === "number" && !isNaN(value)) {
                  console.log(`[team_stats] Adding AWAY stat: team_id=${awayTeamResult.id}, sport=${sport}, season=${season}, date=${comp.date}, metric=${metric}, value=${value}`);
                  const result = insertStat.run(
                    awayTeamResult.id,
                    sport,
                    season,
                    comp.date,
                    metric,
                    value
                  );
                  console.log(`[team_stats] Inserted AWAY: metric=${metric}, value=${value}, changes=${result.changes}`);
                }
              }
            }

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

/**
 * Fetch and store opening odds for today's games (for historical backtest accuracy)
 * Run this in the morning or a few hours before games start
 */
export async function cmdOddsRefresh(sports?: string[]): Promise<void> {
  initDb();
  const db = getDb();

  const sportsToProcess = sports && sports.length > 0 
    ? (sports as Sport[]) 
    : ["ncaam", "cfb", "nfl", "nba", "nhl"];

  let totalOdds = 0;

  console.log(chalk.bold.cyan(`\n📊 Refreshing opening odds for today's games...\n`));

  for (const sport of sportsToProcess) {
    let fetchOdds: (eventId: string) => Promise<any[]>;
    
    switch (sport) {
      case "ncaam":
        fetchOdds = fetchOddsNcaam;
        break;
      case "cfb":
        fetchOdds = fetchOddsCfb;
        break;
      case "nfl":
        fetchOdds = fetchOddsNfl;
        break;
      case "nhl":
        fetchOdds = fetchOddsNhl;
        break;
      case "nba":
        fetchOdds = fetchOddsNba;
        break;
      default:
        continue;
    }

    // Get today's games that don't have odds yet (or need updated odds)
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const todayStart = new Date(`${today}T00:00:00Z`).getTime();
    const todayEnd = new Date(`${today}T23:59:59Z`).getTime();

    const games = db.prepare(`
      SELECT id, espn_event_id, date
      FROM games
      WHERE sport = ? 
        AND datetime(date) >= datetime(?)
        AND datetime(date) < datetime(?, '+1 day')
      ORDER BY date ASC
    `).all(sport, today, today) as Array<{ id: number; espn_event_id: string; date: string }>;

    if (games.length === 0) {
      continue;
    }

    console.log(chalk.dim(`${sport.toUpperCase()}: Found ${games.length} games today`));

    const insertOdds = db.prepare(`
      INSERT OR REPLACE INTO odds (game_id, provider, market, line, price_home, price_away, price_over, price_under, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const game of games) {
      try {
        const oddsEntries = await fetchOdds(game.espn_event_id);
        
        if (oddsEntries.length > 0) {
          for (const entry of oddsEntries) {
            // Use current time as timestamp - this is the "opening odds" we fetched today
            const timestamp = new Date().toISOString();

            // Moneyline
            if (entry.homeTeamOdds?.moneyLine && entry.awayTeamOdds?.moneyLine) {
              insertOdds.run(
                game.id,
                entry.provider?.name || 'Unknown',
                'moneyline',
                null,
                entry.homeTeamOdds.moneyLine,
                entry.awayTeamOdds.moneyLine,
                null,
                null,
                timestamp
              );
              totalOdds++;
            }

            // Spread
            if (entry.spread !== undefined && entry.homeTeamOdds?.spreadOdds && entry.awayTeamOdds?.spreadOdds) {
              insertOdds.run(
                game.id,
                entry.provider?.name || 'Unknown',
                'spread',
                entry.spread,
                entry.homeTeamOdds.spreadOdds,
                entry.awayTeamOdds.spreadOdds,
                null,
                null,
                timestamp
              );
              totalOdds++;
            }

            // Total
            if (entry.overUnder !== undefined && entry.overOdds && entry.underOdds) {
              insertOdds.run(
                game.id,
                entry.provider?.name || 'Unknown',
                'total',
                entry.overUnder,
                null,
                null,
                entry.overOdds,
                entry.underOdds,
                timestamp
              );
              totalOdds++;
            }
          }
        }
      } catch (err) {
        console.warn(chalk.yellow(`  ⚠️  Failed to fetch odds for ${game.espn_event_id}`));
      }

      // Rate limit
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  console.log(chalk.green.bold(`\n✅ Odds refresh complete!`));
  console.log(chalk.gray(`Odds entries updated: ${totalOdds}\n`));
}

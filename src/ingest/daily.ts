/**
 * Daily data ingestion script
 * Fetches new games and updates scores from latest DB date to today
 */

import { getDb } from "../db/index.js";
import { fetchEvents as fetchCfbEvents } from "../espn/cfb/events.js";
import { fetchEvents as fetchNcaamEvents } from "../espn/ncaam/events.js";
import { fetchEvents as fetchNbaEvents } from "../espn/nba/events.js";
import { fetchEvents as fetchNflEvents } from "../espn/nfl/events.js";
import { fetchNHLEvents } from "../espn/nhl/events.js";
import { fetchOdds as fetchCfbOdds } from "../espn/cfb/odds.js";
import { fetchOdds as fetchNcaamOdds } from "../espn/ncaam/odds.js";
import { fetchOdds as fetchNbaOdds } from "../espn/nba/odds.js";
import { fetchOdds as fetchNflOdds } from "../espn/nfl/odds.js";
import { fetchNHLOdds } from "../espn/nhl/odds.js";
import type { Sport } from "../models/types.js";
import chalk from "chalk";

interface IngestStats {
  sport: Sport;
  datesChecked: number;
  gamesAdded: number;
  gamesUpdated: number;
  oddsAdded: number;
  errors: number;
}

/**
 * Get the latest game date in the database for a sport
 */
function getLatestDate(db: any, sport: Sport): string | null {
  const row = db.prepare(`
    SELECT MAX(date) as latest_date 
    FROM games 
    WHERE sport = ?
  `).get(sport) as { latest_date: string | null } | undefined;
  
  return row?.latest_date || null;
}

/**
 * Generate date strings in YYYYMMDD format from start to end
 */
function generateDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  // Ensure we're working with UTC dates
  start.setUTCHours(0, 0, 0, 0);
  end.setUTCHours(0, 0, 0, 0);
  
  const current = new Date(start);
  while (current <= end) {
    const year = current.getUTCFullYear();
    const month = String(current.getUTCMonth() + 1).padStart(2, '0');
    const day = String(current.getUTCDate()).padStart(2, '0');
    dates.push(`${year}${month}${day}`);
    current.setUTCDate(current.getUTCDate() + 1);
  }
  
  return dates;
}

/**
 * Ingest games and odds for a single date
 */
async function ingestDate(
  db: any,
  sport: Sport,
  date: string,
  stats: IngestStats
): Promise<void> {
  const fetchEvents = sport === 'cfb' ? fetchCfbEvents 
    : sport === 'ncaam' ? fetchNcaamEvents
    : sport === 'nba' ? fetchNbaEvents
    : sport === 'nfl' ? fetchNflEvents
    : fetchNHLEvents;
  
  const fetchOdds = sport === 'cfb' ? fetchCfbOdds 
    : sport === 'ncaam' ? fetchNcaamOdds
    : sport === 'nba' ? fetchNbaOdds
    : sport === 'nfl' ? fetchNflOdds
    : fetchNHLOdds;
  
  try {
    const competitions = await fetchEvents(date);
    
    if (competitions.length === 0) {
      return;
    }
    
    const upsertTeam = db.prepare(`
      INSERT INTO teams (sport, espn_id, name, abbreviation) 
      VALUES (?, ?, ?, ?) 
      ON CONFLICT(sport, espn_id) 
      DO UPDATE SET name=excluded.name, abbreviation=excluded.abbreviation 
      RETURNING id
    `);
    
    const upsertGame = db.prepare(`
      INSERT INTO games (espn_event_id, sport, date, season, home_team_id, away_team_id, home_score, away_score, venue, status) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) 
      ON CONFLICT(espn_event_id) 
      DO UPDATE SET home_score=excluded.home_score, away_score=excluded.away_score, status=excluded.status
    `);
    
    const getGameId = db.prepare(`SELECT id FROM games WHERE espn_event_id = ?`);
    
    for (const comp of competitions) {
      try {
        const home = upsertTeam.get(sport, comp.homeTeam.id, comp.homeTeam.name, comp.homeTeam.abbreviation || null) as { id: number };
        const away = upsertTeam.get(sport, comp.awayTeam.id, comp.awayTeam.name, comp.awayTeam.abbreviation || null) as { id: number };
        
        // Determine season based on sport calendar
        // NBA/NHL: Oct-Jun (season = year it starts, so Jul-Dec = current year, Jan-Jun = prior year)
        // NFL: Sep-Feb (season = year it starts, so Sep-Dec = current year, Jan-Feb = prior year)
        // NCAAM: Nov-Apr (season = year it ends, so Nov-Dec = next year, Jan-Apr = current year)
        // CFB: Aug-Jan (season = year it starts, current calendar year)
        const gameDate = new Date(comp.date);
        const year = gameDate.getFullYear();
        const month = gameDate.getMonth() + 1; // 1-12
        
        let season: number;
        if (sport === 'ncaam') {
          // NCAAM season starts in November, season number = starting year
          // Nov-Dec 2024 → season 2024, Jan-Apr 2025 → season 2024
          season = month >= 11 ? year : year - 1;
        } else if (sport === 'nba' || sport === 'nhl') {
          // NBA/NHL seasons start in October, games in Jan-Jun belong to prior year's season
          season = month >= 7 ? year : year - 1;
        } else if (sport === 'nfl') {
          // NFL season starts in September, games in Jan-Feb belong to prior year's season
          season = month >= 7 ? year : year - 1;
        } else {
          // CFB: use calendar year
          season = year;
        }
        
        const hadScoresBefore = db.prepare(`SELECT home_score, away_score FROM games WHERE espn_event_id = ?`)
          .get(comp.eventId) as { home_score: number | null; away_score: number | null } | undefined;
        
        upsertGame.run(
          comp.eventId,
          sport,
          comp.date,
          season,
          home.id,
          away.id,
          comp.homeScore,
          comp.awayScore,
          comp.venue || null,
          comp.status
        );
        
        const result = getGameId.get(comp.eventId) as { id: number } | undefined;
        
        if (result) {
          // Track if this was a new game or an update
          if (!hadScoresBefore) {
            stats.gamesAdded++;
          } else if (hadScoresBefore.home_score === null && comp.homeScore !== null) {
            stats.gamesUpdated++;
          }
          
          // Fetch and store odds for this game
          try {
            const oddsEntries = await fetchOdds(comp.eventId);
            
            if (oddsEntries.length > 0) {
              // Delete old odds for this game
              db.prepare(`DELETE FROM odds WHERE game_id = ?`).run(result.id);
              
              const insertOdds = db.prepare(`
                INSERT INTO odds (game_id, provider, market, line, price_home, price_away, price_over, price_under, timestamp) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              `);
              
              const timestamp = new Date().toISOString();
              let oddsCount = 0;
              
              for (const entry of oddsEntries) {
                if (entry.homeTeamOdds.moneyLine && entry.awayTeamOdds.moneyLine) {
                  insertOdds.run(result.id, entry.provider.name, "moneyline", null, entry.homeTeamOdds.moneyLine, entry.awayTeamOdds.moneyLine, null, null, timestamp);
                  oddsCount++;
                }
                if (entry.homeTeamOdds.spreadOdds && entry.awayTeamOdds.spreadOdds && entry.spread !== undefined) {
                  insertOdds.run(result.id, entry.provider.name, "spread", entry.spread, entry.homeTeamOdds.spreadOdds, entry.awayTeamOdds.spreadOdds, null, null, timestamp);
                  oddsCount++;
                }
                if (entry.overOdds && entry.underOdds && entry.overUnder !== undefined) {
                  insertOdds.run(result.id, entry.provider.name, "total", entry.overUnder, null, null, entry.overOdds, entry.underOdds, timestamp);
                  oddsCount++;
                }
              }
              
              stats.oddsAdded += oddsCount;
            }
          } catch (oddsErr) {
            // Silently skip odds fetch failures (game might not have odds yet)
          }
        }
      } catch (err) {
        stats.errors++;
        console.error(chalk.red(`  Error processing ${comp.eventId}: ${err}`));
      }
    }
  } catch (err) {
    stats.errors++;
    console.error(chalk.red(`  Error fetching ${sport} events for ${date}: ${err}`));
  }
}

/**
 * Run daily ingestion for a sport
 */
async function ingestSport(db: any, sport: Sport, endDate: string, daysBack: number = 3): Promise<IngestStats> {
  const stats: IngestStats = {
    sport,
    datesChecked: 0,
    gamesAdded: 0,
    gamesUpdated: 0,
    oddsAdded: 0,
    errors: 0
  };
  
  console.log(chalk.bold.cyan(`\n📥 Ingesting ${sport.toUpperCase()} data...`));
  
  // Get latest date from DB
  const latestDate = getLatestDate(db, sport);
  
  if (!latestDate) {
    console.log(chalk.yellow(`  No existing data for ${sport}, starting from 30 days ago`));
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const startDate = thirtyDaysAgo.toISOString().split('T')[0];
    const dates = generateDateRange(startDate, endDate);
    stats.datesChecked = dates.length;
    
    console.log(chalk.dim(`  Checking ${dates.length} dates (${startDate} to ${endDate})...`));
    
    for (const date of dates) {
      await ingestDate(db, sport, date, stats);
    }
  } else {
    // Start from N days before latest date to catch game updates (scores, final status)
    const latestDateObj = new Date(latestDate);
    const lookbackDate = new Date(latestDateObj);
    lookbackDate.setDate(lookbackDate.getDate() - daysBack);
    const startDate = lookbackDate.toISOString().split('T')[0];
    const dates = generateDateRange(startDate, endDate);
    stats.datesChecked = dates.length;
    
    console.log(chalk.dim(`  Latest DB date: ${latestDate.split('T')[0]}`));
    console.log(chalk.dim(`  Checking ${dates.length} dates (${startDate} to ${endDate}) to catch game updates...`));
    
    for (const date of dates) {
      await ingestDate(db, sport, date, stats);
    }
  }
  
  console.log(chalk.green(`  ✓ ${sport.toUpperCase()}: ${stats.gamesAdded} new, ${stats.gamesUpdated} updated, ${stats.oddsAdded} odds added`));
  if (stats.errors > 0) {
    console.log(chalk.yellow(`  ⚠️  ${stats.errors} errors encountered`));
  }
  
  return stats;
}

/**
 * Main daily ingestion function
 */
export async function runDailyIngest(sports: Sport[] = ['cfb', 'ncaam'], daysBack: number = 3): Promise<void> {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];
  
  console.log(chalk.bold.green(`\n🔄 Daily Data Ingestion - ${today}\n`));
  
  const allStats: IngestStats[] = [];
  
  for (const sport of sports) {
    const stats = await ingestSport(db, sport, today, daysBack);
    allStats.push(stats);
  }
  
  // Summary
  console.log(chalk.bold.cyan(`\n📊 Summary:`));
  const totalNew = allStats.reduce((sum, s) => sum + s.gamesAdded, 0);
  const totalUpdated = allStats.reduce((sum, s) => sum + s.gamesUpdated, 0);
  const totalOdds = allStats.reduce((sum, s) => sum + s.oddsAdded, 0);
  const totalErrors = allStats.reduce((sum, s) => sum + s.errors, 0);
  
  console.log(chalk.white(`  Total new games: ${totalNew}`));
  console.log(chalk.white(`  Total updated games: ${totalUpdated}`));
  console.log(chalk.white(`  Total odds entries: ${totalOdds}`));
  if (totalErrors > 0) {
    console.log(chalk.yellow(`  Total errors: ${totalErrors}`));
  }
  
  console.log(chalk.green.bold(`\n✅ Daily ingestion complete!\n`));
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const validSports = ['cfb', 'ncaam', 'nba', 'nfl', 'nhl'];
  const args = process.argv.slice(2);
  
  // Parse --days flag
  let daysBack = 3;
  const daysIndex = args.indexOf('--days');
  if (daysIndex !== -1 && args[daysIndex + 1]) {
    const parsed = parseInt(args[daysIndex + 1], 10);
    if (!isNaN(parsed) && parsed > 0) {
      daysBack = parsed;
    }
  }
  
  const sports = args.filter(arg => validSports.includes(arg)) as Sport[];
  runDailyIngest(sports.length > 0 ? sports : ['cfb', 'ncaam', 'nba', 'nfl', 'nhl'], daysBack)
    .catch(err => {
      console.error(chalk.red(`Fatal error: ${err}`));
      process.exit(1);
    });
}

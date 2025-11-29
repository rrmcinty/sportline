/**
 * Daily data ingestion script
 * Fetches new games and updates scores from latest DB date to today
 */

import { getDb } from "../db/index.js";
import { fetchEvents as fetchCfbEvents } from "../espn/cfb/events.js";
import { fetchEvents as fetchNcaamEvents } from "../espn/ncaam/events.js";
import { fetchOdds as fetchCfbOdds } from "../espn/cfb/odds.js";
import { fetchOdds as fetchNcaamOdds } from "../espn/ncaam/odds.js";
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
  const fetchEvents = sport === 'cfb' ? fetchCfbEvents : fetchNcaamEvents;
  const fetchOdds = sport === 'cfb' ? fetchCfbOdds : fetchNcaamOdds;
  
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
      RETURNING id, (SELECT COUNT(*) FROM games WHERE espn_event_id = excluded.espn_event_id AND home_score IS NULL) as was_new
    `);
    
    for (const comp of competitions) {
      try {
        const home = upsertTeam.get(sport, comp.homeTeam.id, comp.homeTeam.name, comp.homeTeam.abbreviation || null) as { id: number };
        const away = upsertTeam.get(sport, comp.awayTeam.id, comp.awayTeam.name, comp.awayTeam.abbreviation || null) as { id: number };
        
        // Determine season (for NCAAM, season is the year games end, for CFB it's the year they start)
        const gameDate = new Date(comp.date);
        const year = gameDate.getFullYear();
        const month = gameDate.getMonth() + 1;
        const season = sport === 'ncaam' ? (month >= 11 ? year + 1 : year) : year;
        
        const result = upsertGame.get(
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
        ) as { id: number; was_new: number } | undefined;
        
        if (result) {
          if (result.was_new > 0) {
            stats.gamesAdded++;
          } else if (comp.homeScore !== null && comp.awayScore !== null) {
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
async function ingestSport(db: any, sport: Sport, endDate: string): Promise<IngestStats> {
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
    // Start from latest date in DB
    const startDate = latestDate.split('T')[0];
    const dates = generateDateRange(startDate, endDate);
    stats.datesChecked = dates.length;
    
    console.log(chalk.dim(`  Latest DB date: ${startDate}`));
    console.log(chalk.dim(`  Checking ${dates.length} dates (${startDate} to ${endDate})...`));
    
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
export async function runDailyIngest(sports: Sport[] = ['cfb', 'ncaam']): Promise<void> {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];
  
  console.log(chalk.bold.green(`\n🔄 Daily Data Ingestion - ${today}\n`));
  
  const allStats: IngestStats[] = [];
  
  for (const sport of sports) {
    const stats = await ingestSport(db, sport, today);
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
  const sports = process.argv.slice(2).filter(arg => arg === 'cfb' || arg === 'ncaam') as Sport[];
  runDailyIngest(sports.length > 0 ? sports : ['cfb', 'ncaam'])
    .catch(err => {
      console.error(chalk.red(`Fatal error: ${err}`));
      process.exit(1);
    });
}

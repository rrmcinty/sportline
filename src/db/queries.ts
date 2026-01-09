/**
 * Database query utilities for the betting recommendation system
 */

import Database from 'better-sqlite3';
import path from 'path';
import type { GameRow, OddsRow } from '../models/types.js';

const DB_PATH = path.join(process.cwd(), 'data', 'sportline.db');

/**
 * Get database connection
 */
export function getDatabase(): Database.Database {
  return new Database(DB_PATH);
}

/**
 * Get games for a specific sport with optional filters
 */
export function getGames(
  db: Database.Database,
  sport: string,
  options: {
    season?: number;
    status?: string | string[];
    limit?: number;
    beforeDate?: string;
    afterDate?: string;
  } = {},
): GameRow[] {
  let query = `SELECT id, sport, date, season, home_team_id, away_team_id, home_score, away_score, status
    FROM games
    WHERE sport = ?`;
  const params: unknown[] = [sport];

  if (options.season !== undefined) {
    query += ` AND season = ?`;
    params.push(options.season);
  }

  if (options.status !== undefined) {
    if (Array.isArray(options.status)) {
      query += ` AND status IN (${options.status.map(() => '?').join(',')})`;
      params.push(...options.status);
    } else {
      query += ` AND status = ?`;
      params.push(options.status);
    }
  }

  if (options.beforeDate) {
    query += ` AND date < ?`;
    params.push(options.beforeDate);
  }

  if (options.afterDate) {
    query += ` AND date >= ?`;
    params.push(options.afterDate);
  }

  query += ` ORDER BY date ASC`;

  if (options.limit) {
    query += ` LIMIT ?`;
    params.push(options.limit);
  }

  return db.prepare(query).all(...params) as GameRow[];
}

/**
 * Get completed games for a specific sport (for training)
 */
export function getCompletedGames(
  db: Database.Database,
  sport: string,
  season: number,
  beforeDate?: string,
): GameRow[] {
  return getGames(db, sport, {
    season,
    status: 'post',
    beforeDate,
  }).filter((g) => g.home_score !== null && g.away_score !== null);
}

/**
 * Legacy function - Get completed NBA games (for backward compatibility)
 */
export function getCompletedNbaGames(
  db: Database.Database,
  season: number,
  beforeDate?: string,
): GameRow[] {
  return getCompletedGames(db, 'nba', season, beforeDate);
}

/**
 * Get upcoming games for a specific sport (for recommendations)
 */
export function getUpcomingGames(db: Database.Database, sport: string): GameRow[] {
  return getGames(db, sport, {
    status: ['scheduled', 'pre'],
    afterDate: new Date().toISOString().split('T')[0],
  });
}

/**
 * Get team stats from season_stats table
 * WARNING: This uses full season stats and may cause data leakage
 * Consider using getTeamStatsBeforeDate for training to avoid leakage
 */
export function getTeamSeasonStats(
  db: Database.Database,
  sport: string,
  teamId: string,
  season: number,
): Record<string, string> {
  const rows = db
    .prepare(
      `SELECT metric_name, metric_value
    FROM season_stats
    WHERE team_id = ? AND sport = ? AND season = ?`,
    )
    .all(teamId, sport, season) as Array<{ metric_name: string; metric_value: string }>;

  const stats: Record<string, string> = {};
  for (const row of rows) {
    stats[row.metric_name] = row.metric_value;
  }
  return stats;
}

/**
 * Get team stats computed from games before a specific date
 * This prevents data leakage by only using historical data
 */
export function getTeamStatsBeforeDate(
  db: Database.Database,
  sport: string,
  teamId: string,
  season: number,
  beforeDate: string,
): Record<string, string> {
  // Query game_stats for games before the target date
  const rows = db
    .prepare(
      `SELECT gs.metric_name, AVG(CAST(gs.metric_value AS REAL)) as avg_value
    FROM game_stats gs
    JOIN games g ON gs.game_id = g.id
    WHERE gs.team_id = ?
      AND gs.sport = ?
      AND g.season = ?
      AND g.date < ?
      AND g.status = 'post'
    GROUP BY gs.metric_name`,
    )
    .all(teamId, sport, season, beforeDate) as Array<{
    metric_name: string;
    avg_value: number;
  }>;

  const stats: Record<string, string> = {};
  for (const row of rows) {
    stats[row.metric_name] = row.avg_value.toString();
  }

  return stats;
}

/**
 * Get recent game results for a team (for calculating win percentage)
 */
export function getRecentGames(
  db: Database.Database,
  sport: string,
  teamId: string,
  season: number,
  beforeDate: string,
  limit: number = 10,
): GameRow[] {
  const games = db
    .prepare(
      `SELECT id, sport, date, season, home_team_id, away_team_id, home_score, away_score, status
    FROM games
    WHERE sport = ?
      AND season = ?
      AND date < ?
      AND status = 'post'
      AND home_score IS NOT NULL
      AND (home_team_id = ? OR away_team_id = ?)
    ORDER BY date DESC
    LIMIT ?`,
    )
    .all(sport, season, beforeDate, teamId, teamId, limit) as GameRow[];

  return games;
}

/**
 * Get odds for a specific game
 */
export function getOddsForGame(
  db: Database.Database,
  gameId: string,
  market: string = 'moneyline',
): OddsRow[] {
  return db
    .prepare(
      `SELECT id, game_id, provider, market, line, price_home, price_away, price_over, price_under, timestamp
    FROM odds
    WHERE game_id = ? AND market = ?
    ORDER BY timestamp DESC`,
    )
    .all(gameId, market) as OddsRow[];
}

/**
 * Get the latest odds for a game (per provider)
 */
export function getLatestOddsForGame(
  db: Database.Database,
  gameId: string,
  market: string = 'moneyline',
): OddsRow | null {
  const odds = getOddsForGame(db, gameId, market);
  if (odds.length === 0) {
    return null;
  }
  // Return the most recent odds (they're already sorted DESC)
  return odds[0];
}

/**
 * Get team name
 */
export function getTeamName(db: Database.Database, sport: string, teamId: string): string | null {
  const row = db.prepare(`SELECT name FROM teams WHERE id = ? AND sport = ?`).get(teamId, sport) as
    | { name: string }
    | undefined;
  return row?.name ?? null;
}

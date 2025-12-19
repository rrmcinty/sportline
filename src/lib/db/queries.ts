/**
 * Database query utilities for sports betting system
 */

import Database from 'better-sqlite3';
import type { Game, Team, Odds, GameStats, TodaysGame, OddsData } from './types.js';

export class DatabaseQueries {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
  }

  /**
   * Get all games for today (or specified date)
   * For testing with historical data, this returns all games regardless of status
   */
  getTodaysGames(sport: string, date?: string, market: string = 'moneyline'): TodaysGame[] {
    const targetDate = date || new Date().toISOString().split('T')[0];

    const games = this.db
      .prepare(
        `
      SELECT
        g.*,
        COALESCE(h.display_name, h.name) as home_team_name,
        h.abbreviation as home_team_abbr,
        COALESCE(a.display_name, a.name) as away_team_name,
        a.abbreviation as away_team_abbr
      FROM games g
      JOIN teams h ON g.home_team_id = h.id AND g.sport = h.sport
      JOIN teams a ON g.away_team_id = a.id AND g.sport = a.sport
      WHERE g.sport = ?
        AND DATE(DATETIME(g.date, '-5 hours')) = DATE(?)
      ORDER BY g.date ASC
    `,
      )
      .all(sport, targetDate) as any[];

    // Get odds for each game based on the specified market
    return games.map((game) => {
      const odds = this.getOdds(game.id, market);
      return {
        ...game,
        odds,
      } as TodaysGame;
    });
  }

  /**
   * Get historical games for training
   */
  getHistoricalGames(sport: string, seasons: number[]): Game[] {
    const placeholders = seasons.map(() => '?').join(',');
    return this.db
      .prepare(
        `
      SELECT * FROM games
      WHERE sport = ? AND season IN (${placeholders})
      ORDER BY date ASC
    `,
      )
      .all(sport, ...seasons) as Game[];
  }

  /**
   * Parse metric value, handling special formats like efficiency fractions
   */
  private parseMetricValue(metricName: string, metricValue: string | number): number {
    // If already a number, return it
    if (typeof metricValue === 'number') {
      return metricValue;
    }

    // Handle efficiency fractions (e.g., "3-12" for third down efficiency)
    if (
      (metricName === 'thirdDownEff' || metricName === 'fourthDownEff') &&
      metricValue.includes('-')
    ) {
      const parts = metricValue.split('-');
      if (parts.length === 2) {
        const made = parseFloat(parts[0]);
        const attempted = parseFloat(parts[1]);
        if (attempted > 0) {
          return made / attempted; // Convert to percentage (0-1)
        }
      }
      return 0; // Default for invalid formats
    }

    // Handle regular numeric values
    const numValue = Number(metricValue);
    return isNaN(numValue) ? 0 : numValue;
  }

  /**
   * Get game stats for a specific game and team
   */
  getGameStats(gameId: string, teamId: string): Record<string, number> {
    const rows = this.db
      .prepare(
        `
      SELECT metric_name, metric_value
      FROM game_stats
      WHERE game_id = ? AND team_id = ?
    `,
      )
      .all(gameId, teamId) as GameStats[];

    const stats: Record<string, number> = {};
    for (const row of rows) {
      stats[row.metric_name] = this.parseMetricValue(row.metric_name, row.metric_value);
    }
    return stats;
  }

  /**
   * Get all game stats for multiple games and teams (bulk query for efficiency)
   */
  getGameStatsForSeasons(
    sport: string,
    seasons: number[],
    metricNames: string[],
  ): Map<string, Map<string, Record<string, number>>> {
    const seasonPlaceholders = seasons.map(() => '?').join(',');
    const metricPlaceholders = metricNames.map(() => '?').join(',');

    const rows = this.db
      .prepare(
        `
      SELECT game_id, team_id, metric_name, metric_value
      FROM game_stats
      WHERE sport = ? 
        AND season IN (${seasonPlaceholders})
        AND metric_name IN (${metricPlaceholders})
      ORDER BY team_id, game_id
    `,
      )
      .all(sport, ...seasons, ...metricNames) as GameStats[];

    // Build nested map: teamId -> gameId -> { metric: value }
    const result = new Map<string, Map<string, Record<string, number>>>();

    for (const row of rows) {
      if (!result.has(row.team_id)) {
        result.set(row.team_id, new Map());
      }
      const teamMap = result.get(row.team_id)!;

      if (!teamMap.has(row.game_id)) {
        teamMap.set(row.game_id, {});
      }
      const gameStats = teamMap.get(row.game_id)!;
      gameStats[row.metric_name] = this.parseMetricValue(row.metric_name, row.metric_value);
    }

    return result;
  }

  /**
   * Get odds for a game
   */
  getOdds(gameId: string, market: string, providers?: string[]): Odds[] {
    let query = `
      SELECT * FROM odds
      WHERE game_id = ? AND market = ?
    `;
    const params: any[] = [gameId, market];

    if (providers && providers.length > 0) {
      const placeholders = providers.map(() => '?').join(',');
      query += ` AND provider IN (${placeholders})`;
      params.push(...providers);
    }

    query += ` ORDER BY timestamp DESC`;

    return this.db.prepare(query).all(...params) as Odds[];
  }

  /**
   * Get odds for a game by market type
   */
  getOddsByMarket(gameId: string, market: string, allowedProviders: string[]): OddsData[] {
    let oddsRows: any[] = [];

    if (allowedProviders && allowedProviders.length > 0) {
      oddsRows = this.db
        .prepare(
          `
        SELECT provider, market, line, price_home, price_away, price_over, price_under, timestamp
        FROM odds
        WHERE game_id = ? 
          AND market = ?
          AND provider IN (${allowedProviders.map(() => '?').join(',')})
        ORDER BY timestamp DESC
      `,
        )
        .all(gameId, market, ...allowedProviders) as any[];
    }

    if (!oddsRows.length) {
      // Fallback: try any provider
      oddsRows = this.db
        .prepare(
          `
        SELECT provider, market, line, price_home, price_away, price_over, price_under, timestamp
        FROM odds
        WHERE game_id = ? AND market = ?
        ORDER BY timestamp DESC
      `,
        )
        .all(gameId, market) as any[];
    }

    return oddsRows.map((row) => ({
      provider: row.provider,
      market: row.market,
      line: row.line,
      home: row.price_home,
      away: row.price_away,
      price_home: row.price_home,
      price_away: row.price_away,
      price_over: row.price_over,
      price_under: row.price_under,
      timestamp: row.timestamp,
    }));
  }

  /**
   * Get moneyline odds for a game (returns simplified format)
   */
  getMoneylineOdds(gameId: string, allowedProviders: string[]): OddsData[] {
    let oddsRows: any[] = [];

    if (allowedProviders && allowedProviders.length > 0) {
      oddsRows = this.db
        .prepare(
          `
        SELECT provider, price_home, price_away, timestamp
        FROM odds
        WHERE game_id = ? 
          AND market = 'moneyline' 
          AND provider IN (${allowedProviders.map(() => '?').join(',')})
          AND price_home IS NOT NULL 
          AND price_away IS NOT NULL
        ORDER BY timestamp DESC
      `,
        )
        .all(gameId, ...allowedProviders) as any[];
    }

    if (!oddsRows.length) {
      // Fallback: try any provider
      oddsRows = this.db
        .prepare(
          `
        SELECT provider, price_home, price_away, timestamp
        FROM odds
        WHERE game_id = ? 
          AND market = 'moneyline'
          AND price_home IS NOT NULL 
          AND price_away IS NOT NULL
        ORDER BY timestamp DESC
      `,
        )
        .all(gameId) as any[];
    }

    return oddsRows.map((row) => ({
      provider: row.provider,
      market: 'moneyline',
      line: null,
      home: row.price_home,
      away: row.price_away,
      price_home: row.price_home,
      price_away: row.price_away,
      price_over: null,
      price_under: null,
      timestamp: row.timestamp || new Date().toISOString(),
    }));
  }

  /**
   * Get team information by ID and sport
   */
  getTeam(teamId: string, sport?: string): Team | null {
    if (sport) {
      return (
        (this.db
          .prepare('SELECT * FROM teams WHERE id = ? AND sport = ?')
          .get(teamId, sport) as Team) || null
      );
    } else {
      // Fallback for backward compatibility - but this can cause cross-sport issues
      return (this.db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId) as Team) || null;
    }
  }

  /**
   * Get all unique metric names for game stats for a given sport.
   * This is a diagnostic function to help understand available data.
   */
  getAvailableGameStatsMetrics(sport: string): string[] {
    const rows = this.db
      .prepare(
        `
        SELECT DISTINCT metric_name
        FROM game_stats
        WHERE sport = ?
        ORDER BY metric_name ASC
      `,
      )
      .all(sport) as { metric_name: string }[];
    return rows.map((row) => row.metric_name);
  }

  /**
   * Get team name (display name or regular name)
   */
  getTeamName(teamId: string, sport?: string): string {
    const team = this.getTeam(teamId, sport);
    return team?.display_name || team?.name || teamId;
  }

  /**
   * Get games for a specific team (for rolling stats)
   */
  getTeamGames(teamId: string, sport: string, beforeGameId?: string): Game[] {
    let query = `
      SELECT * FROM games
      WHERE sport = ? AND (home_team_id = ? OR away_team_id = ?)
    `;
    const params: any[] = [sport, teamId, teamId];

    if (beforeGameId) {
      query += ` AND id < ?`;
      params.push(beforeGameId);
    }

    query += ` ORDER BY date ASC`;

    return this.db.prepare(query).all(...params) as Game[];
  }

  /**
   * Save model run metadata to database
   */
  saveModelRun(
    runId: string,
    sport: string,
    season: number,
    configJson: string,
    metricsJson: string | null,
    artifactsPath: string | null,
  ): void {
    const startedAt = new Date().toISOString();
    const finishedAt = new Date().toISOString();

    this.db
      .prepare(
        `
      INSERT INTO model_runs (run_id, sport, season, config_json, started_at, finished_at, metrics_json, artifacts_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(runId, sport, season, configJson, startedAt, finishedAt, metricsJson, artifactsPath);
  }

  /**
   * Get upcoming games within a date range
   */
  getUpcomingGames(endDate: string): Game[] {
    const today = new Date().toISOString().split('T')[0];
    return this.db
      .prepare(
        `
        SELECT * FROM games
        WHERE date >= ? AND date <= ?
          AND (home_score IS NULL OR away_score IS NULL)
        ORDER BY date ASC, sport ASC
        `,
      )
      .all(today, endDate) as Game[];
  }

  /**
   * Get all odds for a specific game (all markets)
   */
  getGameOdds(gameId: string): Odds[] {
    return this.db
      .prepare(
        `
        SELECT * FROM odds
        WHERE game_id = ?
        ORDER BY market ASC, provider ASC, timestamp DESC
        `,
      )
      .all(gameId) as Odds[];
  }

  /**
   * Get a specific game by ID
   */
  getGameById(gameId: string): Game | null {
    return (this.db.prepare('SELECT * FROM games WHERE id = ?').get(gameId) as Game) || null;
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}

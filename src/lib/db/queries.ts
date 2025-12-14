/**
 * Database query utilities for sports betting system
 */

import Database from 'better-sqlite3';
import type {
  Game,
  Team,
  Odds,
  GameStats,
  TodaysGame,
  OddsData,
} from './types.js';

export class DatabaseQueries {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
  }

  /**
   * Get all games for today (or specified date)
   * For testing with historical data, this returns all games regardless of status
   */
  getTodaysGames(sport: string, date?: string): TodaysGame[] {
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    const games = this.db
      .prepare(
        `
      SELECT 
        g.*,
        h.name as home_team_name,
        h.abbreviation as home_team_abbr,
        a.name as away_team_name,
        a.abbreviation as away_team_abbr
      FROM games g
      JOIN teams h ON g.home_team_id = h.id
      JOIN teams a ON g.away_team_id = a.id
      WHERE g.sport = ? 
        AND DATE(g.date) = DATE(?)
      ORDER BY g.date ASC
    `
      )
      .all(sport, targetDate) as any[];

    // Get odds for each game
    return games.map((game) => {
      const odds = this.getOdds(game.id, 'moneyline');
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
    `
      )
      .all(sport, ...seasons) as Game[];
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
    `
      )
      .all(gameId, teamId) as GameStats[];

    const stats: Record<string, number> = {};
    for (const row of rows) {
      stats[row.metric_name] = Number(row.metric_value);
    }
    return stats;
  }

  /**
   * Get all game stats for multiple games and teams (bulk query for efficiency)
   */
  getGameStatsForSeasons(
    sport: string,
    seasons: number[],
    metricNames: string[]
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
    `
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
      gameStats[row.metric_name] = Number(row.metric_value);
    }

    return result;
  }

  /**
   * Get odds for a game
   */
  getOdds(
    gameId: string,
    market: string,
    providers?: string[]
  ): Odds[] {
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
   * Get moneyline odds for a game (returns simplified format)
   */
  getMoneylineOdds(gameId: string, allowedProviders: string[]): OddsData[] {
    let oddsRows: any[] = [];
    
    if (allowedProviders && allowedProviders.length > 0) {
      oddsRows = this.db
        .prepare(
          `
        SELECT provider, price_home, price_away
        FROM odds
        WHERE game_id = ? 
          AND market = 'moneyline' 
          AND provider IN (${allowedProviders.map(() => '?').join(',')})
          AND price_home IS NOT NULL 
          AND price_away IS NOT NULL
        ORDER BY timestamp DESC
      `
        )
        .all(gameId, ...allowedProviders) as any[];
    }

    if (!oddsRows.length) {
      // Fallback: try any provider
      oddsRows = this.db
        .prepare(
          `
        SELECT provider, price_home, price_away
        FROM odds
        WHERE game_id = ? 
          AND market = 'moneyline'
          AND price_home IS NOT NULL 
          AND price_away IS NOT NULL
        ORDER BY timestamp DESC
      `
        )
        .all(gameId) as any[];
    }

    return oddsRows.map((row) => ({
      provider: row.provider,
      home: row.price_home,
      away: row.price_away,
    }));
  }

  /**
   * Get team information by ID
   */
  getTeam(teamId: string): Team | null {
    return (
      (this.db
        .prepare('SELECT * FROM teams WHERE id = ?')
        .get(teamId) as Team) || null
    );
  }

  /**
   * Get team name (display name or regular name)
   */
  getTeamName(teamId: string): string {
    const team = this.getTeam(teamId);
    return team?.display_name || team?.name || teamId;
  }

  /**
   * Get games for a specific team (for rolling stats)
   */
  getTeamGames(
    teamId: string,
    sport: string,
    beforeGameId?: string
  ): Game[] {
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
    artifactsPath: string | null
  ): void {
    const startedAt = new Date().toISOString();
    const finishedAt = new Date().toISOString();

    this.db
      .prepare(
        `
      INSERT INTO model_runs (run_id, sport, season, config_json, started_at, finished_at, metrics_json, artifacts_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        runId,
        sport,
        season,
        configJson,
        startedAt,
        finishedAt,
        metricsJson,
        artifactsPath
      );
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}

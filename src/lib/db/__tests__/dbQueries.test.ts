import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseQueries } from '../queries';

function makeTempDbPath(): { dbPath: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sportline-db-tests-'));
  const dbPath = path.join(dir, 'test.sqlite');
  return {
    dbPath,
    cleanup: () => {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    },
  };
}

describe('DatabaseQueries', () => {
  let db: Database.Database;
  let queries: DatabaseQueries;
  let cleanup: (() => void) | null = null;
  let today: string;

  beforeEach(() => {
    const tmp = makeTempDbPath();
    cleanup = tmp.cleanup;

    today = new Date().toISOString().split('T')[0];

    db = new Database(tmp.dbPath);

    db.exec(`
      CREATE TABLE teams (
        id TEXT NOT NULL,
        sport TEXT NOT NULL,
        name TEXT,
        abbreviation TEXT,
        display_name TEXT,
        short_display_name TEXT,
        PRIMARY KEY (id, sport)
      );

      CREATE TABLE games (
        id TEXT PRIMARY KEY,
        sport TEXT NOT NULL,
        date TEXT NOT NULL,
        season INTEGER NOT NULL,
        home_team_id TEXT NOT NULL,
        away_team_id TEXT NOT NULL,
        home_score INTEGER,
        away_score INTEGER,
        venue TEXT,
        status TEXT
      );

      CREATE TABLE game_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT NOT NULL,
        team_id TEXT NOT NULL,
        sport TEXT NOT NULL,
        season INTEGER NOT NULL,
        metric_name TEXT NOT NULL,
        metric_value TEXT
      );

      CREATE TABLE odds (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        market TEXT NOT NULL,
        line REAL,
        price_home INTEGER,
        price_away INTEGER,
        price_over INTEGER,
        price_under INTEGER,
        timestamp TEXT NOT NULL
      );
    `);

    db.prepare(
      `INSERT INTO teams (id, sport, name, abbreviation, display_name, short_display_name)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('team1', 'nba', 'Team One', 'T1', 'Team One', 'Team 1');

    db.prepare(
      `INSERT INTO teams (id, sport, name, abbreviation, display_name, short_display_name)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('team2', 'nba', 'Team Two', 'T2', 'Team Two', 'Team 2');

    db.prepare(
      `INSERT INTO games (id, sport, date, season, home_team_id, away_team_id, home_score, away_score, venue, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'game1',
      'nba',
      `${today}T05:00:00Z`,
      2024,
      'team1',
      'team2',
      null,
      null,
      'Arena',
      'scheduled',
    );

    db.prepare(
      `INSERT INTO games (id, sport, date, season, home_team_id, away_team_id, home_score, away_score, venue, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'game2',
      'nba',
      '2023-01-01T05:00:00Z',
      2023,
      'team1',
      'team2',
      100,
      90,
      'Arena',
      'final',
    );

    db.prepare(
      `INSERT INTO odds (game_id, provider, market, line, price_home, price_away, price_over, price_under, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('game1', 'espn', 'moneyline', null, 110, -110, null, null, '2024-01-01T00:00:00Z');

    db.prepare(
      `INSERT INTO game_stats (game_id, team_id, sport, season, metric_name, metric_value)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('game1', 'team1', 'nba', 2024, 'thirdDownEff', '3-12');

    db.prepare(
      `INSERT INTO game_stats (game_id, team_id, sport, season, metric_name, metric_value)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('game1', 'team1', 'nba', 2024, 'turnovers', '7');

    // Additional odds fixtures to exercise helper methods
    db.prepare(
      `INSERT INTO odds (game_id, provider, market, line, price_home, price_away, price_over, price_under, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('game1', 'draftkings', 'moneyline', null, 115, -125, null, null, '2024-01-01T01:00:00Z');

    db.prepare(
      `INSERT INTO odds (game_id, provider, market, line, price_home, price_away, price_over, price_under, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('game1', 'espn', 'spread', -3.5, -110, -110, null, null, '2024-01-01T02:00:00Z');

    db.prepare(
      `INSERT INTO odds (game_id, provider, market, line, price_home, price_away, price_over, price_under, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('game1', 'espn', 'total', 220.5, null, null, -105, -115, '2024-01-01T03:00:00Z');

    db.close();

    queries = new DatabaseQueries(tmp.dbPath);
  });

  afterEach(() => {
    queries.close();
    cleanup?.();
    cleanup = null;
  });

  it('getTeam returns team by id and sport', () => {
    const team = queries.getTeam('team1', 'nba');
    expect(team?.id).toBe('team1');
    expect(team?.sport).toBe('nba');
  });

  it('getTeam returns team by id when sport omitted', () => {
    const team = queries.getTeam('team1');
    expect(team?.id).toBe('team1');
  });

  it('getTeamName returns display name when available', () => {
    expect(queries.getTeamName('team1', 'nba')).toBe('Team One');
  });

  it('getGameById returns game', () => {
    const game = queries.getGameById('game1');
    expect(game?.id).toBe('game1');
    expect(game?.sport).toBe('nba');
  });

  it('getTeamGames returns games for team ordered by date', () => {
    const games = queries.getTeamGames('team1', 'nba');
    expect(games).toHaveLength(2);
    expect(games[0]?.id).toBe('game2');
    expect(games[1]?.id).toBe('game1');
  });

  it('getOdds returns odds for game and market', () => {
    const odds = queries.getOdds('game1', 'moneyline');
    expect(odds).toHaveLength(2);
    // newest first
    expect(odds[0]?.provider).toBe('draftkings');
    expect(odds[0]?.market).toBe('moneyline');
  });

  it('getOdds filters by providers when provided', () => {
    const odds = queries.getOdds('game1', 'moneyline', ['espn']);
    expect(odds).toHaveLength(1);
    expect(odds[0]?.provider).toBe('espn');
  });

  it('getHistoricalGames returns games for selected seasons', () => {
    const games2024 = queries.getHistoricalGames('nba', [2024]);
    expect(games2024).toHaveLength(1);
    expect(games2024[0]?.id).toBe('game1');

    const gamesBoth = queries.getHistoricalGames('nba', [2023, 2024]);
    expect(gamesBoth).toHaveLength(2);
  });

  it('getGameStats parses efficiency fractions and numeric strings', () => {
    const stats = queries.getGameStats('game1', 'team1');
    expect(stats.thirdDownEff).toBeCloseTo(3 / 12, 5);
    expect(stats.turnovers).toBe(7);
  });

  it('getAvailableGameStatsMetrics returns distinct metrics for sport', () => {
    const metrics = queries.getAvailableGameStatsMetrics('nba');
    expect(metrics).toContain('thirdDownEff');
    expect(metrics).toContain('turnovers');
  });

  it('getGameOdds returns all odds rows for a game across markets', () => {
    const odds = queries.getGameOdds('game1');
    expect(odds.length).toBeGreaterThanOrEqual(4);
    expect(odds.every((o) => o.game_id === 'game1')).toBe(true);
  });

  it('getMoneylineOdds returns simplified odds data, filtered by allowedProviders when present', () => {
    const odds = queries.getMoneylineOdds('game1', ['draftkings']);
    expect(odds).toHaveLength(1);
    expect(odds[0]?.provider).toBe('draftkings');
    expect(odds[0]?.market).toBe('moneyline');
    expect(odds[0]?.home).toBe(115);
    expect(odds[0]?.away).toBe(-125);
  });

  it('getOddsByMarket returns odds data for market and provider allowlist, with fallback', () => {
    const oddsAllowed = queries.getOddsByMarket('game1', 'spread', ['espn']);
    expect(oddsAllowed).toHaveLength(1);
    expect(oddsAllowed[0]?.provider).toBe('espn');
    expect(oddsAllowed[0]?.market).toBe('spread');
    expect(oddsAllowed[0]?.line).toBe(-3.5);

    const oddsFallback = queries.getOddsByMarket('game1', 'spread', ['not-a-provider']);
    expect(oddsFallback).toHaveLength(1);
    expect(oddsFallback[0]?.provider).toBe('espn');
  });

  it('getTodaysGames returns games with joined team info and odds', () => {
    const games = queries.getTodaysGames('nba', today, 'moneyline');
    expect(games).toHaveLength(1);
    expect(games[0]?.id).toBe('game1');
    expect(games[0]?.home_team_id).toBe('team1');
    expect(games[0]?.away_team_id).toBe('team2');
    expect(games[0]?.odds).toHaveLength(2);
    expect(games[0]?.odds[0]?.provider).toBe('draftkings');
  });

  it('getUpcomingGames returns games within date range with null scores', () => {
    const endDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const games = queries.getUpcomingGames(endDate);
    expect(games).toHaveLength(1);
    expect(games[0]?.id).toBe('game1');
  });
});

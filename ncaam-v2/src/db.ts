/**
 * Database connection and helpers
 * Simple SQLite wrapper with migrations
 */

import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = join(__dirname, '../../data/ncaam.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    
    // Run migrations
    initializeSchema();
  }
  return db;
}

function initializeSchema(): void {
  if (!db) return;
  
  const schemaPath = join(__dirname, '../schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');
  
  db.exec(schema);
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Helper: Insert or update team
 */
export function upsertTeam(
  id: number,
  name: string,
  abbreviation?: string,
  conference?: string
): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO teams (id, name, abbreviation, conference)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      abbreviation = excluded.abbreviation,
      conference = excluded.conference
  `).run(id, name, abbreviation, conference);
}

/**
 * Helper: Insert or update game
 */
export function upsertGame(game: {
  id: number;
  date: string;
  season: number;
  homeTeamId: number;
  awayTeamId: number;
  homeScore?: number;
  awayScore?: number;
  status: string;
  venue?: string;
}): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO games (id, date, season, home_team_id, away_team_id, home_score, away_score, status, venue)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      date = excluded.date,
      home_score = excluded.home_score,
      away_score = excluded.away_score,
      status = excluded.status,
      venue = excluded.venue
  `).run(
    game.id,
    game.date,
    game.season,
    game.homeTeamId,
    game.awayTeamId,
    game.homeScore,
    game.awayScore,
    game.status,
    game.venue
  );
}

/**
 * Helper: Insert or update odds
 */
export function upsertOdds(odds: {
  gameId: number;
  homeML: number;
  awayML: number;
  homeImpliedProb: number;
  awayImpliedProb: number;
  provider: string;
  updatedAt: string;
}): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO odds (game_id, home_ml, away_ml, home_implied_prob, away_implied_prob, provider, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(game_id) DO UPDATE SET
      home_ml = excluded.home_ml,
      away_ml = excluded.away_ml,
      home_implied_prob = excluded.home_implied_prob,
      away_implied_prob = excluded.away_implied_prob,
      provider = excluded.provider,
      updated_at = excluded.updated_at
  `).run(
    odds.gameId,
    odds.homeML,
    odds.awayML,
    odds.homeImpliedProb,
    odds.awayImpliedProb,
    odds.provider,
    odds.updatedAt
  );
}

/**
 * Helper: Save prediction
 */
export function savePrediction(pred: {
  gameId: number;
  modelVersion: string;
  homeWinProb: number;
  confidenceTier: string;
  divergence: number;
  recommended: boolean;
  createdAt: string;
}): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO predictions (game_id, model_version, home_win_prob, confidence_tier, divergence, recommended, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    pred.gameId,
    pred.modelVersion,
    pred.homeWinProb,
    pred.confidenceTier,
    pred.divergence,
    pred.recommended ? 1 : 0,
    pred.createdAt
  );
}

/**
 * Helper: Save model metadata
 */
export function saveModelMetadata(metadata: {
  version: string;
  seasons: number[];
  features: string[];
  trainSamples: number;
  valSamples: number;
  valAccuracy: number;
  valECE: number;
  backtestROI: number;
  backtestGames: number;
  highConfROI: number;
  highConfGames: number;
  trainedAt: string;
  artifactsPath: string;
}): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO model_runs (
      version, seasons, features, train_samples, val_samples,
      val_accuracy, val_ece, backtest_roi, backtest_games,
      high_conf_roi, high_conf_games, trained_at, artifacts_path
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(version) DO UPDATE SET
      seasons = excluded.seasons,
      features = excluded.features,
      train_samples = excluded.train_samples,
      val_samples = excluded.val_samples,
      val_accuracy = excluded.val_accuracy,
      val_ece = excluded.val_ece,
      backtest_roi = excluded.backtest_roi,
      backtest_games = excluded.backtest_games,
      high_conf_roi = excluded.high_conf_roi,
      high_conf_games = excluded.high_conf_games,
      trained_at = excluded.trained_at,
      artifacts_path = excluded.artifacts_path
  `).run(
    metadata.version,
    metadata.seasons.join(','),
    JSON.stringify(metadata.features),
    metadata.trainSamples,
    metadata.valSamples,
    metadata.valAccuracy,
    metadata.valECE,
    metadata.backtestROI,
    metadata.backtestGames,
    metadata.highConfROI,
    metadata.highConfGames,
    metadata.trainedAt,
    metadata.artifactsPath
  );
}

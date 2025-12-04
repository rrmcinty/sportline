/**
 * Feature engineering for NCAAM moneyline predictions
 * Start with 7 proven features from V1 analysis
 */

import type { Database } from 'better-sqlite3';
import type { GameFeatures } from './types.js';

/**
 * Compute features for all games with sufficient data
 * Requirements: Both teams must have ≥10 completed games
 */
export function computeFeatures(db: Database, seasons: number[]): GameFeatures[] {
  const seasonPlaceholders = seasons.map(() => '?').join(',');
  
  // Get all games in specified seasons
  const games = db.prepare(`
    SELECT id, date, home_team_id, away_team_id, season
    FROM games
    WHERE season IN (${seasonPlaceholders})
    ORDER BY date ASC
  `).all(...seasons) as Array<{
    id: number;
    date: string;
    home_team_id: number;
    away_team_id: number;
    season: number;
  }>;
  
  const features: GameFeatures[] = [];
  
  for (const game of games) {
    // Get team histories (10 most recent completed games before this game)
    const homeHistory = getTeamHistory(db, game.home_team_id, game.date, 10);
    const awayHistory = getTeamHistory(db, game.away_team_id, game.date, 10);
    
    // Skip if either team has insufficient data
    if (homeHistory.length < 10 || awayHistory.length < 10) {
      continue;
    }
    
    // Get odds for market probability
    const odds = db.prepare(`
      SELECT home_implied_prob
      FROM odds
      WHERE game_id = ?
    `).get(game.id) as { home_implied_prob: number } | undefined;
    
    // Compute features
    const homeMargin10 = avgMargin(homeHistory);
    const awayMargin10 = avgMargin(awayHistory);
    const homeWinRate10 = winRate(homeHistory);
    const awayWinRate10 = winRate(awayHistory);
    const homeOppStrength = avgOpponentStrength(db, homeHistory, game.date);
    const awayOppStrength = avgOpponentStrength(db, awayHistory, game.date);
    
    features.push({
      gameId: game.id,
      homeMargin10,
      awayMargin10,
      homeWinRate10,
      awayWinRate10,
      homeOppStrength,
      awayOppStrength,
      homeAdvantage: 1, // Always 1 for home team
      marketImpliedProb: odds?.home_implied_prob
    });
  }
  
  return features;
}

/**
 * Get team's N most recent completed games before a specific date
 */
function getTeamHistory(
  db: Database,
  teamId: number,
  beforeDate: string,
  limit: number
): Array<{ isHome: boolean; score: number; oppScore: number; oppTeamId: number }> {
  const games = db.prepare(`
    SELECT 
      home_team_id,
      away_team_id,
      home_score,
      away_score,
      date
    FROM games
    WHERE (home_team_id = ? OR away_team_id = ?)
      AND date < ?
      AND home_score IS NOT NULL
      AND away_score IS NOT NULL
      AND status = 'final'
    ORDER BY date DESC
    LIMIT ?
  `).all(teamId, teamId, beforeDate, limit) as Array<{
    home_team_id: number;
    away_team_id: number;
    home_score: number;
    away_score: number;
    date: string;
  }>;
  
  return games.map(g => ({
    isHome: g.home_team_id === teamId,
    score: g.home_team_id === teamId ? g.home_score : g.away_score,
    oppScore: g.home_team_id === teamId ? g.away_score : g.home_score,
    oppTeamId: g.home_team_id === teamId ? g.away_team_id : g.home_team_id
  }));
}

/**
 * Calculate average margin of victory/defeat
 * Positive = winning, negative = losing
 */
function avgMargin(history: Array<{ score: number; oppScore: number }>): number {
  if (history.length === 0) return 0;
  const sum = history.reduce((acc, game) => acc + (game.score - game.oppScore), 0);
  return sum / history.length;
}

/**
 * Calculate win rate
 */
function winRate(history: Array<{ score: number; oppScore: number }>): number {
  if (history.length === 0) return 0;
  const wins = history.filter(g => g.score > g.oppScore).length;
  return wins / history.length;
}

/**
 * Calculate average opponent strength (opponent win rates)
 * Measures strength of schedule
 */
function avgOpponentStrength(
  db: Database,
  history: Array<{ oppTeamId: number }>,
  beforeDate: string
): number {
  if (history.length === 0) return 0.5; // Default to average
  
  const oppStrengths: number[] = [];
  
  for (const game of history) {
    // Get opponent's win rate at the time of this game
    const oppHistory = getTeamHistory(db, game.oppTeamId, beforeDate, 10);
    if (oppHistory.length >= 5) { // Require at least 5 games for valid strength
      oppStrengths.push(winRate(oppHistory));
    }
  }
  
  if (oppStrengths.length === 0) return 0.5;
  
  const sum = oppStrengths.reduce((acc, s) => acc + s, 0);
  return sum / oppStrengths.length;
}

/**
 * Convert features to vector for model training
 * Order matters - must match model expectations
 */
export function featuresToVector(features: GameFeatures, includeMarket: boolean = false): number[] {
  const base = [
    features.homeMargin10,
    features.awayMargin10,
    features.homeWinRate10,
    features.awayWinRate10,
    features.homeOppStrength,
    features.awayOppStrength,
    features.homeAdvantage
  ];
  
  if (includeMarket && features.marketImpliedProb !== undefined) {
    return [...base, features.marketImpliedProb];
  }
  
  return base;
}

/**
 * Get feature names in order
 */
export function getFeatureNames(includeMarket: boolean = false): string[] {
  const base = [
    'homeMargin10',
    'awayMargin10',
    'homeWinRate10',
    'awayWinRate10',
    'homeOppStrength',
    'awayOppStrength',
    'homeAdvantage'
  ];
  
  if (includeMarket) {
    return [...base, 'marketImpliedProb'];
  }
  
  return base;
}

/**
 * Get outcomes (home team wins) for training
 */
export function getOutcomes(db: Database, gameIds: number[]): number[] {
  const outcomes: number[] = [];
  
  for (const gameId of gameIds) {
    const game = db.prepare(`
      SELECT home_score, away_score
      FROM games
      WHERE id = ? AND home_score IS NOT NULL AND away_score IS NOT NULL
    `).get(gameId) as { home_score: number; away_score: number } | undefined;
    
    if (game) {
      outcomes.push(game.home_score > game.away_score ? 1 : 0);
    }
  }
  
  return outcomes;
}

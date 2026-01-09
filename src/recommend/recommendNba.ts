/**
 * NBA betting recommendation engine
 * Finds value bets by comparing model predictions to sportsbook odds
 */

import Database from 'better-sqlite3';
import type { ValueBet, TrainedModel } from '../models/types.js';
import { loadModel } from '../models/predict.js';
import { predictHomeWinProbability } from '../models/predict.js';
import { getUpcomingGames, getLatestOddsForGame, getTeamName } from '../db/queries.js';
import { americanToImpliedProb, calculateEV } from '../betting/odds.js';
import { getDatabase } from '../db/queries.js';

/**
 * Find value betting opportunities
 */
export function findValueBets(
  db: Database.Database,
  modelData: TrainedModel,
  options: {
    minEdge?: number;
    market?: string;
  } = {},
): ValueBet[] {
  const minEdge = options.minEdge ?? 0.03; // Default 3% edge
  const market = options.market ?? 'moneyline';
  const sport = modelData.sport || 'nba'; // Get sport from model metadata

  // Get upcoming games for this sport
  const upcomingGames = getUpcomingGames(db, sport);

  console.log(`Evaluating ${upcomingGames.length} upcoming games...`);

  const valueBets: ValueBet[] = [];

  for (const game of upcomingGames) {
    try {
      // Get latest odds for this game
      const odds = getLatestOddsForGame(db, game.id, market);

      if (!odds) {
        continue; // No odds available
      }

      // Predict win probability using model
      const homeWinProb = predictHomeWinProbability(
        db,
        modelData,
        game.id,
        game.home_team_id,
        game.away_team_id,
        game.season,
        game.date,
      );

      const awayWinProb = 1 - homeWinProb;

      // Get team names
      const homeTeamName = getTeamName(db, sport, game.home_team_id) ?? 'Unknown';
      const awayTeamName = getTeamName(db, sport, game.away_team_id) ?? 'Unknown';

      // Check home team bet
      if (odds.price_home !== null) {
        const impliedProb = americanToImpliedProb(odds.price_home);
        const edge = homeWinProb - impliedProb;

        if (edge >= minEdge) {
          const ev = calculateEV(homeWinProb, odds.price_home);
          valueBets.push({
            gameId: game.id,
            gameDate: game.date,
            homeTeamId: game.home_team_id,
            awayTeamId: game.away_team_id,
            homeTeamName,
            awayTeamName,
            market: market as 'moneyline' | 'spread' | 'total',
            side: 'home',
            modelProbability: homeWinProb,
            impliedProbability: impliedProb,
            odds: odds.price_home,
            ev,
            edge,
            provider: odds.provider,
          });
        }
      }

      // Check away team bet
      if (odds.price_away !== null) {
        const impliedProb = americanToImpliedProb(odds.price_away);
        const edge = awayWinProb - impliedProb;

        if (edge >= minEdge) {
          const ev = calculateEV(awayWinProb, odds.price_away);
          valueBets.push({
            gameId: game.id,
            gameDate: game.date,
            homeTeamId: game.home_team_id,
            awayTeamId: game.away_team_id,
            homeTeamName,
            awayTeamName,
            market: market as 'moneyline' | 'spread' | 'total',
            side: 'away',
            modelProbability: awayWinProb,
            impliedProbability: impliedProb,
            odds: odds.price_away,
            ev,
            edge,
            provider: odds.provider,
          });
        }
      }
    } catch (error) {
      console.warn(`Error processing game ${game.id}: ${error}`);
    }
  }

  // Sort by edge (highest first)
  valueBets.sort((a, b) => b.edge - a.edge);

  return valueBets;
}

/**
 * Convenience function that handles database connection
 */
export function generateRecommendations(
  modelPath: string,
  options: {
    minEdge?: number;
    market?: string;
  } = {},
): ValueBet[] {
  const modelData = loadModel(modelPath);
  const db = getDatabase();

  try {
    return findValueBets(db, modelData, options);
  } finally {
    db.close();
  }
}

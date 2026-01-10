/**
 * NBA betting recommendation engine
 * Finds value bets by comparing model predictions to sportsbook odds
 */

import Database from 'better-sqlite3';
import type { ValueBet, TrainedModel } from '../models/types.js';
import { loadModel } from '../models/predict.js';
import { predictHomeWinProbability } from '../models/predict.js';
import { getUpcomingGames, getLatestOddsForGame, getTeamName, getTeamAbbr } from '../db/queries.js';
import { americanToImpliedProb, calculateEV, calculateKellyPercentage } from '../betting/odds.js';
import { getDatabase } from '../db/queries.js';

/**
 * Confidence bucket for filtering bets to profitable ranges
 */
export interface ConfidenceBucket {
  min: number; // e.g., 0.60
  max: number; // e.g., 0.70
}

/**
 * Vigorish gate - require higher edge for high-vig lines
 * Ported from backtester for consistency
 */
function passesJuiceGate(betOdds: number, betEdge: number): boolean {
  const MAX_VIG_PRICE = -115;
  const EDGE_REQUIRED_IF_VIGGY = 0.04; // Need 4% edge for high-vig lines
  if (betOdds <= MAX_VIG_PRICE && betEdge < EDGE_REQUIRED_IF_VIGGY) return false;
  return true;
}

/**
 * Check if probability falls within any profitable bucket
 */
function isInProfitableBucket(
  probability: number,
  buckets: ConfidenceBucket[] | undefined,
): boolean {
  if (!buckets || buckets.length === 0) return true; // No filtering if not specified
  return buckets.some((b) => probability >= b.min && probability < b.max);
}

/**
 * Find value betting opportunities
 */
export function findValueBets(
  db: Database.Database,
  modelData: TrainedModel,
  options: {
    minEdge?: number;
    minProb?: number;
    market?: string;
    maxEV?: number; // Filter out suspiciously high EV bets
    profitableBuckets?: ConfidenceBucket[]; // Only bet in these probability ranges
    useKellyFilter?: boolean; // Only bet if Kelly suggests positive allocation
    minKelly?: number; // Minimum Kelly percentage required
  } = {},
): ValueBet[] {
  const minEdge = options.minEdge ?? 0.03; // Default 3% edge
  const minProb = options.minProb ?? 0.5; // Default 50% probability
  const market = options.market ?? 'moneyline';
  const maxEV = options.maxEV; // undefined = no cap
  const profitableBuckets = options.profitableBuckets;
  const useKellyFilter = options.useKellyFilter ?? false;
  const minKelly = options.minKelly ?? 0.01; // Default 1% Kelly
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

      // Get team names and abbreviations
      const homeTeamName = getTeamName(db, sport, game.home_team_id) ?? 'Unknown';
      const awayTeamName = getTeamName(db, sport, game.away_team_id) ?? 'Unknown';
      const homeTeamAbbr = getTeamAbbr(db, sport, game.home_team_id) ?? homeTeamName;
      const awayTeamAbbr = getTeamAbbr(db, sport, game.away_team_id) ?? awayTeamName;

      // Check home team bet
      if (odds.price_home !== null) {
        const impliedProb = americanToImpliedProb(odds.price_home);
        const edge = homeWinProb - impliedProb;
        const ev = calculateEV(homeWinProb, odds.price_home);

        // Apply all filters
        const passesBasicFilters = homeWinProb >= minProb && edge >= minEdge;
        const passesJuice = passesJuiceGate(odds.price_home, edge);
        const passesMaxEV = maxEV === undefined || ev <= maxEV;
        const passesBucket = isInProfitableBucket(homeWinProb, profitableBuckets);
        const passesKelly =
          !useKellyFilter || calculateKellyPercentage(homeWinProb, odds.price_home) >= minKelly;

        if (passesBasicFilters && passesJuice && passesMaxEV && passesBucket && passesKelly) {
          valueBets.push({
            gameId: game.id,
            gameDate: game.date,
            homeTeamId: game.home_team_id,
            awayTeamId: game.away_team_id,
            homeTeamName,
            awayTeamName,
            homeTeamAbbr,
            awayTeamAbbr,
            market: market as 'moneyline' | 'spread' | 'total',
            side: 'home',
            modelProbability: homeWinProb,
            impliedProbability: impliedProb,
            odds: odds.price_home,
            line: odds.line,
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
        const ev = calculateEV(awayWinProb, odds.price_away);

        // Apply all filters
        const passesBasicFilters = awayWinProb >= minProb && edge >= minEdge;
        const passesJuice = passesJuiceGate(odds.price_away, edge);
        const passesMaxEV = maxEV === undefined || ev <= maxEV;
        const passesBucket = isInProfitableBucket(awayWinProb, profitableBuckets);
        const passesKelly =
          !useKellyFilter || calculateKellyPercentage(awayWinProb, odds.price_away) >= minKelly;

        if (passesBasicFilters && passesJuice && passesMaxEV && passesBucket && passesKelly) {
          valueBets.push({
            gameId: game.id,
            gameDate: game.date,
            homeTeamId: game.home_team_id,
            awayTeamId: game.away_team_id,
            homeTeamName,
            awayTeamName,
            homeTeamAbbr,
            awayTeamAbbr,
            market: market as 'moneyline' | 'spread' | 'total',
            side: 'away',
            modelProbability: awayWinProb,
            impliedProbability: impliedProb,
            odds: odds.price_away,
            line: odds.line,
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
    minProb?: number;
    market?: string;
    maxEV?: number;
    profitableBuckets?: ConfidenceBucket[];
    useKellyFilter?: boolean;
    minKelly?: number;
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

/**
 * Parse bucket string (e.g., "60-70,80-90") into ConfidenceBucket array
 */
export function parseBuckets(bucketStr: string | undefined): ConfidenceBucket[] | undefined {
  if (!bucketStr) return undefined;
  return bucketStr.split(',').map((range) => {
    const [minStr, maxStr] = range.trim().split('-');
    return {
      min: parseFloat(minStr) / 100,
      max: parseFloat(maxStr) / 100,
    };
  });
}

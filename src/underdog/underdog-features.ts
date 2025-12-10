/**
 * Feature engineering for underdog-specific modeling
 * Extends standard features with underdog-focused metrics
 */

import type Database from "better-sqlite3";
import { computeFeatures, type GameFeatures } from "../model/features.js";
import type { UnderdogGameFeatures, UnderdogTier } from "./types.js";

// Recency weights for 5-game window (exponential decay, most recent = highest weight)
const RECENCY_WEIGHTS_5 = [0.08, 0.12, 0.2, 0.25, 0.35];

// Recency weights for 10-game window
const RECENCY_WEIGHTS_10 = [
  0.03, 0.04, 0.05, 0.06, 0.07, 0.09, 0.11, 0.14, 0.18, 0.23,
];

/**
 * Convert American odds to implied probability
 */
function americanToImplied(odds: number): number {
  if (odds > 0) {
    return 100 / (odds + 100); // Underdog
  } else {
    return -odds / (-odds + 100); // Favorite
  }
}

/**
 * Classify underdog tier based on market implied probability
 */
function classifyUnderdogTier(marketProb: number): UnderdogTier | null {
  if (marketProb >= 0.5) return null; // Not an underdog
  if (marketProb >= 0.33) return "moderate"; // +100 to +199 (~33-50%)
  if (marketProb >= 0.25) return "heavy"; // +200 to +299 (~25-33%)
  return "extreme"; // +300+ (<25%)
}

/**
 * Compute weighted average with recency weights
 */
function weightedAvg(values: number[], weights: number[]): number {
  if (values.length === 0) return 0;
  const useWeights = weights.slice(0, values.length);
  const sum = values.reduce((acc, val, i) => acc + val * useWeights[i], 0);
  const weightSum = useWeights.reduce((a, b) => a + b, 0);
  return sum / weightSum;
}

/**
 * Compute underdog-specific features for all games
 */
export function computeUnderdogFeatures(
  db: Database.Database,
  sport: "ncaam" | "cfb" | "nfl" | "nba" | "nhl",
  seasons: number[],
): UnderdogGameFeatures[] {
  // Start with standard features
  const standardFeatures = computeFeatures(db, sport, seasons);

  // Build underdog history for each team
  const underdogHistory = buildUnderdogHistory(db, sport, seasons);

  // Extend with underdog-specific features
  const underdogFeatures: UnderdogGameFeatures[] = [];

  for (const features of standardFeatures) {
    const gameId = features.gameId;

    // Get market probabilities
    const homeMarketProb = features.marketImpliedProb;
    const awayMarketProb = 1 - homeMarketProb;

    // Determine underdog status
    const homeIsUnderdog = homeMarketProb < 0.5;
    const awayIsUnderdog = awayMarketProb < 0.5;

    let underdogTeam: "home" | "away" | null = null;
    let underdogTier: UnderdogTier | null = null;

    if (homeIsUnderdog) {
      underdogTeam = "home";
      underdogTier = classifyUnderdogTier(homeMarketProb);
    } else if (awayIsUnderdog) {
      underdogTeam = "away";
      underdogTier = classifyUnderdogTier(awayMarketProb);
    }

    // Get team IDs from database
    const game = db
      .prepare(
        `
      SELECT home_team_id, away_team_id, date
      FROM games
      WHERE id = ?
    `,
      )
      .get(gameId) as
      | { home_team_id: number; away_team_id: number; date: string }
      | undefined;

    if (!game) continue;

    const homeHistory = underdogHistory.get(game.home_team_id) || [];
    const awayHistory = underdogHistory.get(game.away_team_id) || [];

    // Filter history to games before this game
    const homeHistoryBefore = homeHistory.filter((h) => h.date < game.date);
    const awayHistoryBefore = awayHistory.filter((h) => h.date < game.date);

    // Compute underdog-specific features
    const homeUpsetRate5 = computeUpsetRate(homeHistoryBefore, 5);
    const awayUpsetRate5 = computeUpsetRate(awayHistoryBefore, 5);
    const homeUpsetRate10 = computeUpsetRate(homeHistoryBefore, 10);
    const awayUpsetRate10 = computeUpsetRate(awayHistoryBefore, 10);

    // Home dog advantage (home underdogs perform ~5% better than away underdogs)
    const homeDogAdvantage = homeIsUnderdog ? 0.05 : awayIsUnderdog ? -0.05 : 0;

    // Pace differential (fast pace = more variance = better for underdogs)
    const paceDifferential = features.homePace5 - features.awayPace5;

    // Conference strength differential (proxy: SoS difference)
    const confStrengthDiff =
      features.homeOppWinRate5 - features.awayOppWinRate5;

    // Recent underdog trend
    const recentDogTrend5 = computeRecentDogTrend(
      homeHistoryBefore,
      awayHistoryBefore,
      5,
    );
    const recentDogTrend10 = computeRecentDogTrend(
      homeHistoryBefore,
      awayHistoryBefore,
      10,
    );

    // Market overreaction (how much did market move vs actual performance)
    const marketOverreaction = computeMarketOverreaction(
      features,
      homeMarketProb,
      awayMarketProb,
    );

    underdogFeatures.push({
      ...features,
      homeUpsetRate5,
      awayUpsetRate5,
      homeUpsetRate10,
      awayUpsetRate10,
      homeAsUnderdog: homeIsUnderdog ? 1 : 0,
      awayAsUnderdog: awayIsUnderdog ? 1 : 0,
      homeDogAdvantage,
      paceDifferential,
      confStrengthDiff,
      recentDogTrend5,
      recentDogTrend10,
      marketOverreaction,
      underdogTier,
      underdogTeam,
    });
  }

  return underdogFeatures;
}

/**
 * Build underdog game history for all teams
 */
function buildUnderdogHistory(
  db: Database.Database,
  sport: string,
  seasons: number[],
): Map<
  number,
  Array<{
    date: string;
    wasUnderdog: boolean;
    won: boolean;
    margin: number;
    odds: number;
  }>
> {
  const seasonPlaceholders = seasons.map(() => "?").join(",");

  const games = db
    .prepare(
      `
    SELECT 
      g.id, g.date, g.home_team_id, g.away_team_id, 
      g.home_score, g.away_score,
      o.price_home, o.price_away
    FROM games g
    LEFT JOIN odds o ON o.game_id = g.id AND o.market = 'moneyline'
    WHERE g.sport = ? AND g.season IN (${seasonPlaceholders})
      AND g.home_score IS NOT NULL AND g.away_score IS NOT NULL
      AND o.price_home IS NOT NULL AND o.price_away IS NOT NULL
    ORDER BY g.date ASC
  `,
    )
    .all(sport, ...seasons) as Array<{
    id: number;
    date: string;
    home_team_id: number;
    away_team_id: number;
    home_score: number;
    away_score: number;
    price_home: number;
    price_away: number;
  }>;

  const history = new Map<
    number,
    Array<{
      date: string;
      wasUnderdog: boolean;
      won: boolean;
      margin: number;
      odds: number;
    }>
  >();

  for (const game of games) {
    const homeImplied = americanToImplied(game.price_home);
    const awayImplied = americanToImplied(game.price_away);

    const homeWon = game.home_score > game.away_score;
    const awayWon = game.away_score > game.home_score;

    const homeMargin = game.home_score - game.away_score;
    const awayMargin = game.away_score - game.home_score;

    // Add to home team history
    if (!history.has(game.home_team_id)) {
      history.set(game.home_team_id, []);
    }
    history.get(game.home_team_id)!.push({
      date: game.date,
      wasUnderdog: homeImplied < 0.5,
      won: homeWon,
      margin: homeMargin,
      odds: game.price_home,
    });

    // Add to away team history
    if (!history.has(game.away_team_id)) {
      history.set(game.away_team_id, []);
    }
    history.get(game.away_team_id)!.push({
      date: game.date,
      wasUnderdog: awayImplied < 0.5,
      won: awayWon,
      margin: awayMargin,
      odds: game.price_away,
    });
  }

  return history;
}

/**
 * Compute upset rate (win rate when underdog) for last N games
 */
function computeUpsetRate(
  history: Array<{ wasUnderdog: boolean; won: boolean }>,
  window: number,
): number {
  const recentUnderdog = history.filter((h) => h.wasUnderdog).slice(-window);

  if (recentUnderdog.length === 0) return 0;

  const weights = window === 5 ? RECENCY_WEIGHTS_5 : RECENCY_WEIGHTS_10;
  const wins = recentUnderdog.map((h) => (h.won ? 1 : 0));

  return weightedAvg(wins, weights);
}

/**
 * Compute recent underdog trend (momentum)
 */
function computeRecentDogTrend(
  homeHistory: Array<{ wasUnderdog: boolean; won: boolean; margin: number }>,
  awayHistory: Array<{ wasUnderdog: boolean; won: boolean; margin: number }>,
  window: number,
): number {
  const homeRecentDog = homeHistory.filter((h) => h.wasUnderdog).slice(-window);
  const awayRecentDog = awayHistory.filter((h) => h.wasUnderdog).slice(-window);

  const weights = window === 5 ? RECENCY_WEIGHTS_5 : RECENCY_WEIGHTS_10;

  const homeTrend =
    homeRecentDog.length > 0
      ? weightedAvg(
          homeRecentDog.map((h) => h.margin),
          weights,
        )
      : 0;

  const awayTrend =
    awayRecentDog.length > 0
      ? weightedAvg(
          awayRecentDog.map((h) => h.margin),
          weights,
        )
      : 0;

  return homeTrend - awayTrend;
}

/**
 * Compute market overreaction (how far market is from team's actual performance)
 */
function computeMarketOverreaction(
  features: GameFeatures,
  homeMarketProb: number,
  awayMarketProb: number,
): number {
  // Use win rates as proxy for "true" probability
  const homeActual = features.homeWinRate5;
  const awayActual = features.awayWinRate5;

  // Normalize to sum to 1
  const total = homeActual + awayActual;
  const homeExpected = total > 0 ? homeActual / total : 0.5;

  // How much did market move away from actual performance
  const homeOverreaction = Math.abs(homeMarketProb - homeExpected);
  const awayOverreaction = Math.abs(awayMarketProb - (1 - homeExpected));

  return (homeOverreaction + awayOverreaction) / 2;
}

/**
 * Filter features to only underdog games for specific tier(s)
 */
export function filterUnderdogGames(
  features: UnderdogGameFeatures[],
  tiers?: UnderdogTier[],
): UnderdogGameFeatures[] {
  return features.filter((f) => {
    if (f.underdogTier === null) return false;
    if (tiers && !tiers.includes(f.underdogTier)) return false;
    return true;
  });
}

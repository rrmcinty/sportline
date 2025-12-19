/**
 * Strength of Schedule (SOS) calculations
 * Measures the quality of opponents a team has faced
 */

import type { Game } from '../db/types.js';
import { DatabaseQueries } from '../db/queries.js';

export interface StrengthOfScheduleMetrics {
  opponentWinRate: number;
  opponentAvgMargin: number;
  opponentStrengthRating: number;
  recentOpponentWinRate5: number;
  recentOpponentWinRate10: number;
  recentOpponentStrength5: number;
  recentOpponentStrength10: number;
}

/**
 * Calculate team strength rating based on win rate and average margin
 */
function calculateTeamStrength(
  teamId: string,
  games: Game[],
  beforeDate: string,
): { winRate: number; avgMargin: number; strengthRating: number } {
  const teamGames = games.filter(
    (g) =>
      (g.home_team_id === teamId || g.away_team_id === teamId) &&
      g.date < beforeDate &&
      g.home_score !== null &&
      g.away_score !== null,
  );

  if (teamGames.length === 0) {
    return { winRate: 0.5, avgMargin: 0, strengthRating: 0.5 };
  }

  let wins = 0;
  let totalMargin = 0;

  for (const game of teamGames) {
    const isHome = game.home_team_id === teamId;
    const teamScore = isHome ? game.home_score! : game.away_score!;
    const oppScore = isHome ? game.away_score! : game.home_score!;
    const margin = teamScore - oppScore;

    if (margin > 0) wins++;
    totalMargin += margin;
  }

  const winRate = wins / teamGames.length;
  const avgMargin = totalMargin / teamGames.length;

  // Composite strength rating (0-1 scale)
  // Combines win rate (70%) and normalized margin (30%)
  const normalizedMargin = Math.max(0, Math.min(1, (avgMargin + 20) / 40)); // Normalize margin to 0-1
  const strengthRating = winRate * 0.7 + normalizedMargin * 0.3;

  return { winRate, avgMargin, strengthRating };
}

/**
 * Calculate strength of schedule metrics for a team up to a specific game
 */
export function calculateStrengthOfSchedule(
  teamId: string,
  gameId: string,
  games: Game[],
  db: DatabaseQueries,
): StrengthOfScheduleMetrics {
  const currentGame = games.find((g) => g.id === gameId);
  if (!currentGame) {
    return {
      opponentWinRate: 0.5,
      opponentAvgMargin: 0,
      opponentStrengthRating: 0.5,
      recentOpponentWinRate5: 0.5,
      recentOpponentWinRate10: 0.5,
      recentOpponentStrength5: 0.5,
      recentOpponentStrength10: 0.5,
    };
  }

  // Get all games for this team before the current game
  const teamGames = games
    .filter(
      (g) =>
        (g.home_team_id === teamId || g.away_team_id === teamId) &&
        g.id !== gameId &&
        g.date < currentGame.date &&
        g.home_score !== null &&
        g.away_score !== null,
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  if (teamGames.length === 0) {
    return {
      opponentWinRate: 0.5,
      opponentAvgMargin: 0,
      opponentStrengthRating: 0.5,
      recentOpponentWinRate5: 0.5,
      recentOpponentWinRate10: 0.5,
      recentOpponentStrength5: 0.5,
      recentOpponentStrength10: 0.5,
    };
  }

  // Calculate opponent metrics for all games
  const opponentMetrics: Array<{
    winRate: number;
    avgMargin: number;
    strengthRating: number;
  }> = [];

  for (const game of teamGames) {
    const opponentId = game.home_team_id === teamId ? game.away_team_id : game.home_team_id;
    const opponentStrength = calculateTeamStrength(opponentId, games, game.date);
    opponentMetrics.push(opponentStrength);
  }

  // Overall SOS metrics
  const opponentWinRate =
    opponentMetrics.reduce((sum, m) => sum + m.winRate, 0) / opponentMetrics.length;
  const opponentAvgMargin =
    opponentMetrics.reduce((sum, m) => sum + m.avgMargin, 0) / opponentMetrics.length;
  const opponentStrengthRating =
    opponentMetrics.reduce((sum, m) => sum + m.strengthRating, 0) / opponentMetrics.length;

  // Recent SOS metrics (last 5 and 10 games)
  const recent5 = opponentMetrics.slice(-5);
  const recent10 = opponentMetrics.slice(-10);

  const recentOpponentWinRate5 =
    recent5.length > 0
      ? recent5.reduce((sum, m) => sum + m.winRate, 0) / recent5.length
      : opponentWinRate;

  const recentOpponentWinRate10 =
    recent10.length > 0
      ? recent10.reduce((sum, m) => sum + m.winRate, 0) / recent10.length
      : opponentWinRate;

  const recentOpponentStrength5 =
    recent5.length > 0
      ? recent5.reduce((sum, m) => sum + m.strengthRating, 0) / recent5.length
      : opponentStrengthRating;

  const recentOpponentStrength10 =
    recent10.length > 0
      ? recent10.reduce((sum, m) => sum + m.strengthRating, 0) / recent10.length
      : opponentStrengthRating;

  return {
    opponentWinRate,
    opponentAvgMargin,
    opponentStrengthRating,
    recentOpponentWinRate5,
    recentOpponentWinRate10,
    recentOpponentStrength5,
    recentOpponentStrength10,
  };
}

/**
 * Get list of strength of schedule feature names
 */
export function getStrengthOfScheduleFeatures(): string[] {
  return [
    'opponentWinRate',
    'opponentAvgMargin',
    'opponentStrengthRating',
    'recentOpponentWinRate5',
    'recentOpponentWinRate10',
    'recentOpponentStrength5',
    'recentOpponentStrength10',
  ];
}

/**
 * Calculate strength of schedule differential between home and away teams
 */
export function calculateSOSDifferential(
  homeId: string,
  awayId: string,
  gameId: string,
  games: Game[],
  db: DatabaseQueries,
): Record<string, number> {
  const homeSOS = calculateStrengthOfSchedule(homeId, gameId, games, db);
  const awaySOS = calculateStrengthOfSchedule(awayId, gameId, games, db);

  return {
    // Individual team SOS metrics
    homeOpponentWinRate: homeSOS.opponentWinRate,
    awayOpponentWinRate: awaySOS.opponentWinRate,
    homeOpponentStrengthRating: homeSOS.opponentStrengthRating,
    awayOpponentStrengthRating: awaySOS.opponentStrengthRating,
    homeRecentOpponentStrength5: homeSOS.recentOpponentStrength5,
    awayRecentOpponentStrength5: awaySOS.recentOpponentStrength5,
    homeRecentOpponentStrength10: homeSOS.recentOpponentStrength10,
    awayRecentOpponentStrength10: awaySOS.recentOpponentStrength10,

    // Differential metrics (home - away)
    sosWinRateDifferential: homeSOS.opponentWinRate - awaySOS.opponentWinRate,
    sosStrengthDifferential: homeSOS.opponentStrengthRating - awaySOS.opponentStrengthRating,
    sosRecentStrengthDiff5: homeSOS.recentOpponentStrength5 - awaySOS.recentOpponentStrength5,
    sosRecentStrengthDiff10: homeSOS.recentOpponentStrength10 - awaySOS.recentOpponentStrength10,
  };
}

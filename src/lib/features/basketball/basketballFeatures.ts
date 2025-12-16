/**
 * Basketball-specific feature engineering
 * Handles basketball stats, advanced metrics, and possession calculations
 */

import type { Game } from '../../db/types.js';
import { DatabaseQueries } from '../../db/queries.js';

/**
 * Calculate basketball-specific advanced statistical features
 */
export function calculateBasketballAdvancedStats(stats: Record<string, number>): Record<string, number> {
  const advancedStats: Record<string, number> = {};

  // Get raw stats with fallbacks
  const fgm = stats.fieldGoalsMade || 0;
  const fga = stats.fieldGoalsAttempted || 0;
  const fg3m = stats.threePointFieldGoalsMade || 0;
  const ftm = stats.freeThrowsMade || 0;
  const fta = stats.freeThrowsAttempted || 0;
  const ast = stats.assists || 0;
  const tov = stats.totalTurnovers || 0;
  const trb = stats.totalRebounds || 0;
  const orb = stats.offensiveRebounds || 0;
  const drb = stats.defensiveRebounds || 0;

  // Effective Field Goal Percentage: eFG% = (FGM + 0.5*3PM) / FGA
  if (fga > 0) {
    advancedStats.effectiveFgPct = (fgm + 0.5 * fg3m) / fga;
  }

  // True Shooting Percentage: TS% = PTS / (2*(FGA + 0.44*FTA))
  // Approximate PTS since we don't have exact points in game_stats
  const estimatedPoints = fgm * 2 + fg3m + ftm; // Rough approximation: 2pts for FGM, 3pts for 3PM, 1pt for FTM
  const trueShootingAttempts = fga + 0.44 * fta;
  if (trueShootingAttempts > 0) {
    advancedStats.trueShootingPct = estimatedPoints / (2 * trueShootingAttempts);
  }

  // Assist Ratio: AST / (FGA + 0.44*FTA + TOV)
  const assistAttempts = fga + 0.44 * fta + tov;
  if (assistAttempts > 0) {
    advancedStats.assistRatio = ast / assistAttempts;
  }

  // Turnover Ratio: TOV / (FGA + 0.44*FTA + TOV)
  if (assistAttempts > 0) {
    advancedStats.turnoverRatio = tov / assistAttempts;
  }

  // Rebound Percentage (team only - would need opponent data for full calculation)
  // For now, just offensive/defensive rebound split
  if (trb > 0) {
    advancedStats.offensiveReboundPct = orb / trb;
    advancedStats.defensiveReboundPct = drb / trb;
  }

  // Pace calculation (simplified - possessions per game, assuming standard game length)
  // Pace = Team possessions (rough estimate)
  // This is a simplified version - full pace requires opponent possessions
  const teamPossessions = fga + 0.44 * fta + tov;
  advancedStats.pace = teamPossessions;

  return advancedStats;
}

/**
 * Calculate basketball team possessions from stats
 */
export function calculateBasketballPossessions(stats: Record<string, number>): number {
  const fga = stats.fieldGoalsAttempted || 0;
  const fta = stats.freeThrowsAttempted || 0;
  const tov = stats.totalTurnovers || 0;

  // Simplified possession formula: FGA + 0.44*FTA + TOV
  return fga + 0.44 * fta + tov;
}

/**
 * Compute basketball-specific offensive and defensive ratings
 * ORtg = Points per 100 possessions
 * DRtg = Opponent points per 100 possessions
 */
export function computeBasketballOffensiveDefensiveRatings(
  homeId: string,
  awayId: string,
  gameId: string,
  games: Game[],
  db: DatabaseQueries
): { homeORtg: number; homeDRtg: number; awayORtg: number; awayDRtg: number } {
  // Get game scores
  const game = games.find(g => g.id === gameId);
  if (!game || game.home_score === null || game.away_score === null) {
    return { homeORtg: 100, homeDRtg: 100, awayORtg: 100, awayDRtg: 100 }; // Default values
  }

  const homePoints = game.home_score;
  const awayPoints = game.away_score;

  // Get team stats for this game
  const homeStats = db.getGameStats(gameId, homeId);
  const awayStats = db.getGameStats(gameId, awayId);

  // Calculate possessions (simplified)
  const homePossessions = calculateBasketballPossessions(homeStats);
  const awayPossessions = calculateBasketballPossessions(awayStats);

  // Offensive Rating = (Points / Possessions) * 100
  const homeORtg = homePossessions > 0 ? (homePoints / homePossessions) * 100 : 100;
  const awayORtg = awayPossessions > 0 ? (awayPoints / awayPossessions) * 100 : 100;

  // Defensive Rating = (Opponent Points / Opponent Possessions) * 100
  const homeDRtg = awayPossessions > 0 ? (awayPoints / awayPossessions) * 100 : 100;
  const awayDRtg = homePossessions > 0 ? (homePoints / homePossessions) * 100 : 100;

  return {
    homeORtg: Math.max(50, Math.min(150, homeORtg)), // Clamp to reasonable range
    homeDRtg: Math.max(50, Math.min(150, homeDRtg)),
    awayORtg: Math.max(50, Math.min(150, awayORtg)),
    awayDRtg: Math.max(50, Math.min(150, awayDRtg))
  };
}

/**
 * Calculate basketball-specific defensive metrics
 */
export function calculateBasketballDefensiveMetrics(stats: Record<string, number>): Record<string, number> {
  const defensiveStats: Record<string, number> = {};

  // Field goal suppression (opponent FG%)
  const oppFgm = stats.opponentFieldGoalsMade || 0;
  const oppFga = stats.opponentFieldGoalsAttempted || 0;
  if (oppFga > 0) {
    defensiveStats.fgSuppression = 1 - (oppFgm / oppFga); // Higher is better defense
  }

  // Three-point suppression
  const opp3pm = stats.opponentThreePointFieldGoalsMade || 0;
  const opp3pa = stats.opponentThreePointFieldGoalsAttempted || 0;
  if (opp3pa > 0) {
    defensiveStats.threePtSuppression = 1 - (opp3pm / opp3pa);
  }

  // Scoring suppression (points allowed per possession)
  const oppPoints = stats.opponentPoints || 0;
  const oppPossessions = calculateBasketballPossessions(stats);
  if (oppPossessions > 0) {
    defensiveStats.scoringSuppression = 100 - ((oppPoints / oppPossessions) * 100); // Higher is better
  }

  // Turnover induction rate
  const oppTurnovers = stats.opponentTurnovers || 0;
  if (oppPossessions > 0) {
    defensiveStats.turnoverInduction = oppTurnovers / oppPossessions;
  }

  return defensiveStats;
}

/**
 * Get list of basketball-specific advanced features
 */
export function getBasketballAdvancedFeatures(): string[] {
  return [
    'effectiveFgPct',
    'trueShootingPct', 
    'assistRatio',
    'turnoverRatio',
    'offensiveReboundPct',
    'defensiveReboundPct',
    'pace',
    'fgSuppression',
    'threePtSuppression',
    'scoringSuppression',
    'turnoverInduction'
  ];
}
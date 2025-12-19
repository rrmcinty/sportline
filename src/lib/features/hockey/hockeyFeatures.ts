/**
 * Hockey-specific feature engineering
 * Handles hockey stats, advanced metrics, and performance calculations
 */

import type { Game } from '../../db/types.js';
import { DatabaseQueries } from '../../db/queries.js';

/**
 * Calculate hockey-specific advanced statistical features
 */
export function calculateHockeyAdvancedStats(
  stats: Record<string, number>,
): Record<string, number> {
  const advancedStats: Record<string, number> = {};

  // Get raw stats with fallbacks
  const goals = stats.goals || 0;
  const assists = stats.assists || 0;
  const shots = stats.shotsTotal || 0;
  const saves = stats.saves || 0;
  const shotsAgainst = stats.shotsAgainst || 0;
  const powerPlayGoals = stats.powerPlayGoals || 0;
  const powerPlayOpportunities = stats.powerPlayOpportunities || 0;
  const shortHandedGoals = stats.shortHandedGoals || 0;
  const penaltyMinutes = stats.penaltyMinutes || 0;
  const faceoffsWon = stats.faceoffsWon || 0;
  const faceoffsLost = stats.faceoffsLost || 0;
  const hits = stats.hits || 0;
  const blockedShots = stats.blockedShots || 0;
  const takeaways = stats.takeaways || 0;
  const giveaways = stats.giveaways || 0;

  // Points per game
  advancedStats.pointsPerGame = goals + assists;

  // Shooting percentage
  if (shots > 0) {
    advancedStats.shootingEfficiency = goals / shots;
  }

  // Save percentage (for goalies/team defense)
  if (shotsAgainst > 0) {
    advancedStats.saveEfficiency = saves / shotsAgainst;
  }

  // Power play efficiency
  if (powerPlayOpportunities > 0) {
    advancedStats.powerPlayEfficiency = powerPlayGoals / powerPlayOpportunities;
  }

  // Penalty kill efficiency (goals allowed while short-handed)
  // This would need opponent power play data, so simplified for now
  advancedStats.penaltyKillEfficiency = shortHandedGoals; // Short-handed goals scored

  // Faceoff efficiency
  const totalFaceoffs = faceoffsWon + faceoffsLost;
  if (totalFaceoffs > 0) {
    advancedStats.faceoffEfficiency = faceoffsWon / totalFaceoffs;
  }

  // Physical play metrics
  advancedStats.physicalPlay = hits + blockedShots;

  // Puck possession proxy (takeaways vs giveaways)
  advancedStats.puckPossession = takeaways - giveaways;

  // Discipline (penalty minutes per game - lower is better)
  advancedStats.discipline = -penaltyMinutes; // Negative so higher is better

  // Shot suppression (shots allowed - lower is better for defense)
  advancedStats.shotSuppression = -shotsAgainst; // Negative so higher is better

  // Goal suppression (goals allowed - would need opponent data)
  const goalsAgainst = stats.goalsAgainst || 0;
  advancedStats.goalSuppression = -goalsAgainst; // Negative so higher is better

  return advancedStats;
}

/**
 * Compute hockey-specific offensive and defensive ratings
 * Based on goals per game and goals against per game
 */
export function computeHockeyOffensiveDefensiveRatings(
  homeId: string,
  awayId: string,
  gameId: string,
  games: Game[],
  db: DatabaseQueries,
): { homeORtg: number; homeDRtg: number; awayORtg: number; awayDRtg: number } {
  // Get game scores
  const game = games.find((g) => g.id === gameId);
  if (!game || game.home_score === null || game.away_score === null) {
    return { homeORtg: 3.0, homeDRtg: 3.0, awayORtg: 3.0, awayDRtg: 3.0 }; // Default NHL average ~3 goals per game
  }

  const homeGoals = game.home_score;
  const awayGoals = game.away_score;

  // Get team stats for this game
  const homeStats = db.getGameStats(gameId, homeId);
  const awayStats = db.getGameStats(gameId, awayId);

  // For hockey, we use goals per game as the primary offensive rating
  // and goals against per game as defensive rating

  // Offensive Rating = Goals scored (simple version)
  const homeORtg = homeGoals;
  const awayORtg = awayGoals;

  // Defensive Rating = Goals allowed (lower is better, but we'll invert for consistency)
  const homeDRtg = awayGoals; // Goals allowed by home team
  const awayDRtg = homeGoals; // Goals allowed by away team

  return {
    homeORtg: Math.max(0, Math.min(10, homeORtg)), // Clamp to reasonable range (0-10 goals)
    homeDRtg: Math.max(0, Math.min(10, homeDRtg)),
    awayORtg: Math.max(0, Math.min(10, awayORtg)),
    awayDRtg: Math.max(0, Math.min(10, awayDRtg)),
  };
}

/**
 * Calculate hockey-specific special teams metrics
 */
export function calculateHockeySpecialTeamsMetrics(
  stats: Record<string, number>,
): Record<string, number> {
  const specialTeamsStats: Record<string, number> = {};

  const powerPlayGoals = stats.powerPlayGoals || 0;
  const powerPlayOpportunities = stats.powerPlayOpportunities || 0;
  const shortHandedGoals = stats.shortHandedGoals || 0;
  const penaltyKillOpportunities = stats.penaltyKillOpportunities || 0;

  // Power play percentage
  if (powerPlayOpportunities > 0) {
    specialTeamsStats.powerPlayPct = powerPlayGoals / powerPlayOpportunities;
  }

  // Penalty kill percentage (would need goals allowed data)
  // For now, use short-handed goals as a positive indicator
  specialTeamsStats.penaltyKillEffectiveness = shortHandedGoals;

  return specialTeamsStats;
}

/**
 * Calculate hockey-specific goaltending metrics
 */
export function calculateHockeyGoaltendingMetrics(
  stats: Record<string, number>,
): Record<string, number> {
  const goaltendingStats: Record<string, number> = {};

  const saves = stats.saves || 0;
  const shotsAgainst = stats.shotsAgainst || 0;
  const goalsAgainst = stats.goalsAgainst || 0;

  // Save percentage
  if (shotsAgainst > 0) {
    goaltendingStats.savePct = saves / shotsAgainst;
  }

  // Goals against average (simplified - would need time on ice)
  goaltendingStats.goalsAgainstAvg = goalsAgainst;

  return goaltendingStats;
}

/**
 * Get list of hockey-specific advanced features
 */
export function getHockeyAdvancedFeatures(): string[] {
  return [
    'pointsPerGame',
    'shootingEfficiency',
    'saveEfficiency',
    'powerPlayEfficiency',
    'penaltyKillEfficiency',
    'faceoffEfficiency',
    'physicalPlay',
    'puckPossession',
    'discipline',
    'shotSuppression',
    'goalSuppression',
  ];
}

/**
 * Football-specific feature engineering
 * Handles football stats, advanced metrics, and performance calculations
 */

import type { Game } from '../../db/types.js';
import { DatabaseQueries } from '../../db/queries.js';



/**
 * Calculate football-specific advanced statistical features
 */
export function calculateFootballAdvancedStats(stats: Record<string, number>): Record<string, number> {
  const advancedStats: Record<string, number> = {};

  // Get raw stats with fallbacks
  const totalYards = stats.totalYards || 0;
  const rushingYards = stats.rushingYards || 0;
  const netPassingYards = stats.netPassingYards || 0;
  const rushingAttempts = stats.rushingAttempts || 0;
  const completionAttempts = stats.completionAttempts || 0;
  const firstDowns = stats.firstDowns || 0;
  const firstDownsPassing = stats.firstDownsPassing || 0;
  const firstDownsRushing = stats.firstDownsRushing || 0;
  const thirdDownEff = stats.thirdDownEff || 0;
  const fourthDownEff = stats.fourthDownEff || 0;
  const redZoneAttempts = stats.redZoneAttempts || 0;
  const turnovers = stats.turnovers || 0;
  const interceptions = stats.interceptions || 0;
  const fumblesLost = stats.fumblesLost || 0;
  const sacksYardsLost = stats.sacksYardsLost || 0;
  const totalOffensivePlays = stats.totalOffensivePlays || 0;
  const possessionTime = stats.possessionTime || 0;
  const totalDrives = stats.totalDrives || 0;

  // Yards per play
  if (totalOffensivePlays > 0) {
    advancedStats.yardsPerPlay = totalYards / totalOffensivePlays;
  } else {
    advancedStats.yardsPerPlay = 0;
  }

  // Yards per rush attempt
  if (rushingAttempts > 0) {
    advancedStats.yardsPerRush = rushingYards / rushingAttempts;
  } else {
    advancedStats.yardsPerRush = 0;
  }

  // Yards per pass attempt (completion attempts includes incomplete passes)
  if (completionAttempts > 0) {
    advancedStats.yardsPerPass = netPassingYards / completionAttempts;
  } else {
    advancedStats.yardsPerPass = 0;
  }

  // Offensive balance (rushing vs passing yards)
  if (totalYards > 0) {
    advancedStats.rushingBalance = rushingYards / totalYards;
    advancedStats.passingBalance = netPassingYards / totalYards;
  } else {
    advancedStats.rushingBalance = 0.5; // Default balanced
    advancedStats.passingBalance = 0.5;
  }

  // First down efficiency
  if (totalOffensivePlays > 0) {
    advancedStats.firstDownRate = firstDowns / totalOffensivePlays;
  } else {
    advancedStats.firstDownRate = 0;
  }

  // Third down conversion rate (already converted from fraction format)
  advancedStats.thirdDownConversion = thirdDownEff;

  // Fourth down conversion rate (already converted from fraction format)
  advancedStats.fourthDownConversion = fourthDownEff;

  // Red zone efficiency
  if (redZoneAttempts > 0) {
    // This would need red zone scores, but we'll use attempts as a proxy
    advancedStats.redZoneEfficiency = redZoneAttempts; // Simplified
  } else {
    advancedStats.redZoneEfficiency = 0;
  }

  // Turnover rate
  if (totalOffensivePlays > 0) {
    advancedStats.turnoverRate = turnovers / totalOffensivePlays;
  } else {
    advancedStats.turnoverRate = 0;
  }

  // Ball security (lower is better, so we'll invert)
  advancedStats.ballSecurity = -turnovers; // Negative so higher is better

  // Sack rate (sacks allowed per pass attempt)
  if (completionAttempts > 0) {
    advancedStats.sackRate = sacksYardsLost / completionAttempts; // Negative impact
  } else {
    advancedStats.sackRate = 0;
  }

  // Time of possession efficiency
  advancedStats.possessionEfficiency = possessionTime;

  // Drives efficiency (yards per drive)
  if (totalDrives > 0) {
    advancedStats.yardsPerDrive = totalYards / totalDrives;
  } else {
    advancedStats.yardsPerDrive = 0;
  }

  // Explosive play potential (simplified)
  advancedStats.explosivePlayPotential = advancedStats.yardsPerPlay || 0;

  return advancedStats;
}

/**
 * Compute football-specific offensive and defensive ratings
 * Based on points per game and yards per game
 */
export function computeFootballOffensiveDefensiveRatings(
  homeId: string,
  awayId: string,
  gameId: string,
  games: Game[],
  db: DatabaseQueries
): { homeORtg: number; homeDRtg: number; awayORtg: number; awayDRtg: number } {
  // Get game scores
  const game = games.find(g => g.id === gameId);
  if (!game || game.home_score === null || game.away_score === null) {
    return { homeORtg: 21.0, homeDRtg: 21.0, awayORtg: 21.0, awayDRtg: 21.0 }; // Default NFL average ~21 points per game
  }

  const homePoints = game.home_score;
  const awayPoints = game.away_score;

  // Get team stats for this game
  const homeStats = db.getGameStats(gameId, homeId);
  const awayStats = db.getGameStats(gameId, awayId);

  // For football, we use points per game as the primary offensive rating
  // and points allowed per game as defensive rating
  
  // Offensive Rating = Points scored
  const homeORtg = homePoints;
  const awayORtg = awayPoints;

  // Defensive Rating = Points allowed (lower is better, but we'll keep as-is for now)
  const homeDRtg = awayPoints; // Points allowed by home team
  const awayDRtg = homePoints; // Points allowed by away team

  return {
    homeORtg: Math.max(0, Math.min(70, homeORtg)), // Clamp to reasonable range (0-70 points)
    homeDRtg: Math.max(0, Math.min(70, homeDRtg)),
    awayORtg: Math.max(0, Math.min(70, awayORtg)),
    awayDRtg: Math.max(0, Math.min(70, awayDRtg))
  };
}

/**
 * Calculate football-specific defensive metrics
 */
export function calculateFootballDefensiveMetrics(stats: Record<string, number>): Record<string, number> {
  const defensiveStats: Record<string, number> = {};

  const yardsAllowed = stats.yardsPerGameAllowed || 0;
  const passingYardsAllowed = stats.passingYardsPerGameAllowed || 0;
  const rushingYardsAllowed = stats.rushingYardsPerGameAllowed || 0;
  const pointsAllowed = stats.totalPointsPerGameAllowed || 0;
  const defensiveTouchdowns = stats.defensiveTouchdowns || 0;
  const interceptions = stats.interceptions || 0;
  const sacksYardsLost = stats.sacksYardsLost || 0;

  // Yards allowed per game (lower is better, so we'll invert)
  defensiveStats.yardsSuppression = -yardsAllowed; // Negative so higher is better

  // Passing defense
  defensiveStats.passingDefense = -passingYardsAllowed;

  // Rushing defense  
  defensiveStats.rushingDefense = -rushingYardsAllowed;

  // Scoring defense
  defensiveStats.scoringDefense = -pointsAllowed;

  // Defensive playmaking
  defensiveStats.defensivePlaymaking = defensiveTouchdowns + interceptions;

  // Pass rush effectiveness
  defensiveStats.passRush = sacksYardsLost; // Positive impact

  return defensiveStats;
}

/**
 * Calculate football-specific special teams metrics
 */
export function calculateFootballSpecialTeamsMetrics(stats: Record<string, number>): Record<string, number> {
  const specialTeamsStats: Record<string, number> = {};

  // Note: We don't have detailed special teams stats in our current data
  // This is a placeholder for when we add field goal %, punt return yards, etc.
  
  return specialTeamsStats;
}

/**
 * Get list of football-specific advanced features
 */
export function getFootballAdvancedFeatures(): string[] {
  return [
    'yardsPerPlay',
    'yardsPerRush',
    'yardsPerPass',
    'rushingBalance',
    'passingBalance',
    'firstDownRate',
    'thirdDownConversion',
    'fourthDownConversion',
    'redZoneEfficiency',
    'turnoverRate',
    'ballSecurity',
    'sackRate',
    'possessionEfficiency',
    'yardsPerDrive',
    'explosivePlayPotential',
    'yardsSuppression',
    'passingDefense',
    'rushingDefense',
    'scoringDefense',
    'defensivePlaymaking',
    'passRush'
  ];
}
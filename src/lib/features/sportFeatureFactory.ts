/**
 * Sport-specific feature factory
 * Routes feature calculations to the appropriate sport-specific modules
 */

import type { Game } from '../db/types.js';
import { DatabaseQueries } from '../db/queries.js';
import { 
  calculateBasketballAdvancedStats, 
  computeBasketballOffensiveDefensiveRatings,
  getBasketballAdvancedFeatures
} from './basketball/basketballFeatures.js';
import { 
  calculateHockeyAdvancedStats, 
  computeHockeyOffensiveDefensiveRatings,
  getHockeyAdvancedFeatures
} from './hockey/hockeyFeatures.js';

// Sport category mapping
const SPORT_CATEGORIES: Record<string, string> = {
  'ncaam': 'basketball',
  'nba': 'basketball',
  'nhl': 'hockey',
  'nfl': 'football',
  'cfb': 'football'
};

/**
 * Calculate sport-specific advanced stats
 */
export function calculateAdvancedStats(
  sport: string, 
  stats: Record<string, number>
): Record<string, number> {
  const sportCategory = SPORT_CATEGORIES[sport] || 'basketball';
  
  switch (sportCategory) {
    case 'basketball':
      return calculateBasketballAdvancedStats(stats);
    case 'hockey':
      return calculateHockeyAdvancedStats(stats);
    case 'football':
      // TODO: Implement football-specific advanced stats
      return {};
    default:
      return {};
  }
}

/**
 * Compute sport-specific offensive and defensive ratings
 */
export function computeOffensiveDefensiveRatings(
  sport: string,
  homeId: string,
  awayId: string,
  gameId: string,
  games: Game[],
  db: DatabaseQueries
): { homeORtg: number; homeDRtg: number; awayORtg: number; awayDRtg: number } {
  const sportCategory = SPORT_CATEGORIES[sport] || 'basketball';
  
  switch (sportCategory) {
    case 'basketball':
      return computeBasketballOffensiveDefensiveRatings(homeId, awayId, gameId, games, db);
    case 'hockey':
      return computeHockeyOffensiveDefensiveRatings(homeId, awayId, gameId, games, db);
    case 'football':
      // TODO: Implement football-specific ratings
      return { homeORtg: 100, homeDRtg: 100, awayORtg: 100, awayDRtg: 100 };
    default:
      return { homeORtg: 100, homeDRtg: 100, awayORtg: 100, awayDRtg: 100 };
  }
}

/**
 * Get sport-specific advanced features list
 */
export function getAdvancedFeatures(sport: string): string[] {
  const sportCategory = SPORT_CATEGORIES[sport] || 'basketball';
  
  switch (sportCategory) {
    case 'basketball':
      return getBasketballAdvancedFeatures();
    case 'hockey':
      return getHockeyAdvancedFeatures();
    case 'football':
      // TODO: Implement football-specific features
      return [];
    default:
      return [];
  }
}
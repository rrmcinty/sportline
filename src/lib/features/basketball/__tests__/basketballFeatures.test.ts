import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calculateBasketballAdvancedStats,
  calculateBasketballPossessions,
  computeBasketballOffensiveDefensiveRatings,
  calculateBasketballDefensiveMetrics,
  calculateNBAAdvancedSituationalFeatures,
  getBasketballAdvancedFeatures
} from '../basketballFeatures.js';
import type { Game } from '../../../db/types.js';
import type { DatabaseQueries } from '../../../db/queries.js';

// Mock DatabaseQueries
const mockDb = {
  getGameStats: vi.fn()
} as unknown as DatabaseQueries;

describe('Basketball Features', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('calculateBasketballAdvancedStats', () => {
    it('should calculate effective field goal percentage correctly', () => {
      const stats = {
        fieldGoalsMade: 40,
        fieldGoalsAttempted: 80,
        threePointFieldGoalsMade: 10
      };

      const result = calculateBasketballAdvancedStats(stats);
      
      // eFG% = (FGM + 0.5*3PM) / FGA = (40 + 0.5*10) / 80 = 45/80 = 0.5625
      expect(result.effectiveFgPct).toBeCloseTo(0.5625);
    });

    it('should calculate true shooting percentage correctly', () => {
      const stats = {
        fieldGoalsMade: 30,
        fieldGoalsAttempted: 60,
        threePointFieldGoalsMade: 8,
        freeThrowsMade: 12,
        freeThrowsAttempted: 15
      };

      const result = calculateBasketballAdvancedStats(stats);
      
      // Estimated points = 30*2 + 8 + 12 = 80
      // True shooting attempts = 60 + 0.44*15 = 66.6
      // TS% = 80 / (2 * 66.6) = 80/133.2 ≈ 0.6006
      expect(result.trueShootingPct).toBeCloseTo(0.6006, 3);
    });

    it('should handle zero attempts gracefully', () => {
      const stats = {
        fieldGoalsMade: 0,
        fieldGoalsAttempted: 0,
        threePointFieldGoalsMade: 0,
        freeThrowsMade: 0,
        freeThrowsAttempted: 0
      };

      const result = calculateBasketballAdvancedStats(stats);
      
      // Should not have eFG% or TS% when no attempts
      expect(result.effectiveFgPct).toBeUndefined();
      expect(result.trueShootingPct).toBeUndefined();
    });

    it('should calculate assist and turnover ratios', () => {
      const stats = {
        fieldGoalsAttempted: 80,
        freeThrowsAttempted: 20,
        assists: 25,
        totalTurnovers: 15
      };

      const result = calculateBasketballAdvancedStats(stats);
      
      // Assist attempts = FGA + 0.44*FTA + TOV = 80 + 8.8 + 15 = 103.8
      // Assist ratio = 25 / 103.8 ≈ 0.2408
      // Turnover ratio = 15 / 103.8 ≈ 0.1445
      expect(result.assistRatio).toBeCloseTo(0.2408, 3);
      expect(result.turnoverRatio).toBeCloseTo(0.1445, 3);
    });

    it('should calculate rebound percentages', () => {
      const stats = {
        totalRebounds: 50,
        offensiveRebounds: 15,
        defensiveRebounds: 35
      };

      const result = calculateBasketballAdvancedStats(stats);
      
      expect(result.offensiveReboundPct).toBeCloseTo(0.3); // 15/50
      expect(result.defensiveReboundPct).toBeCloseTo(0.7); // 35/50
    });

    it('should calculate pace', () => {
      const stats = {
        fieldGoalsAttempted: 80,
        freeThrowsAttempted: 20,
        totalTurnovers: 15
      };

      const result = calculateBasketballAdvancedStats(stats);
      
      // Pace = FGA + 0.44*FTA + TOV = 80 + 8.8 + 15 = 103.8
      expect(result.pace).toBeCloseTo(103.8);
    });

    it('should handle missing stats with fallbacks', () => {
      const stats = {}; // Empty stats object

      const result = calculateBasketballAdvancedStats(stats);
      
      // Should use 0 as fallback for missing stats
      expect(result.pace).toBe(0);
      expect(result.effectiveFgPct).toBeUndefined(); // No FGA
    });
  });

  describe('calculateBasketballPossessions', () => {
    it('should calculate possessions correctly', () => {
      const stats = {
        fieldGoalsAttempted: 80,
        freeThrowsAttempted: 20,
        totalTurnovers: 15
      };

      const possessions = calculateBasketballPossessions(stats);
      
      // Possessions = FGA + 0.44*FTA + TOV = 80 + 8.8 + 15 = 103.8
      expect(possessions).toBeCloseTo(103.8);
    });

    it('should handle missing stats', () => {
      const stats = {};
      const possessions = calculateBasketballPossessions(stats);
      expect(possessions).toBe(0);
    });
  });

  describe('computeBasketballOffensiveDefensiveRatings', () => {
    const mockGame: Game = {
      id: 'game1',
      date: '2024-01-01',
      home_team_id: 'team1',
      away_team_id: 'team2',
      home_score: 110,
      away_score: 100,
      season: 2024,
      sport: 'nba',
      venue: null,
      status: 'completed'
    };

    beforeEach(() => {
      (mockDb.getGameStats as any).mockImplementation((gameId: string, teamId: string) => {
        if (teamId === 'team1') {
          return {
            fieldGoalsAttempted: 80,
            freeThrowsAttempted: 20,
            totalTurnovers: 15
          };
        } else if (teamId === 'team2') {
          return {
            fieldGoalsAttempted: 75,
            freeThrowsAttempted: 25,
            totalTurnovers: 18
          };
        }
        return {};
      });
    });

    it('should calculate offensive and defensive ratings correctly', () => {
      const ratings = computeBasketballOffensiveDefensiveRatings(
        'team1',
        'team2',
        'game1',
        [mockGame],
        mockDb
      );

      // team1 possessions = 80 + 0.44*20 + 15 = 103.8
      // team2 possessions = 75 + 0.44*25 + 18 = 104
      // team1 ORtg = (110 / 103.8) * 100 ≈ 106.0
      // team1 DRtg = (100 / 104) * 100 ≈ 96.2
      expect(ratings.homeORtg).toBeCloseTo(106.0, 0);
      expect(ratings.homeDRtg).toBeCloseTo(96.2, 0);
      expect(ratings.awayORtg).toBeCloseTo(96.2, 0);
      expect(ratings.awayDRtg).toBeCloseTo(106.0, 0);
    });

    it('should handle missing game', () => {
      const ratings = computeBasketballOffensiveDefensiveRatings(
        'team1',
        'team2',
        'nonexistent',
        [mockGame],
        mockDb
      );

      // Should return default values
      expect(ratings.homeORtg).toBe(100);
      expect(ratings.homeDRtg).toBe(100);
      expect(ratings.awayORtg).toBe(100);
      expect(ratings.awayDRtg).toBe(100);
    });

    it('should handle null scores', () => {
      const gameWithNullScores: Game = {
        ...mockGame,
        home_score: null,
        away_score: null
      };

      const ratings = computeBasketballOffensiveDefensiveRatings(
        'team1',
        'team2',
        'game1',
        [gameWithNullScores],
        mockDb
      );

      expect(ratings.homeORtg).toBe(100);
      expect(ratings.homeDRtg).toBe(100);
    });

    it('should clamp ratings to reasonable range', () => {
      // Mock extreme stats that would produce unrealistic ratings
      (mockDb.getGameStats as any).mockImplementation(() => ({
        fieldGoalsAttempted: 1, // Very low possessions
        freeThrowsAttempted: 0,
        totalTurnovers: 0
      }));

      const extremeGame: Game = {
        ...mockGame,
        home_score: 200, // Very high score
        away_score: 10   // Very low score
      };

      const ratings = computeBasketballOffensiveDefensiveRatings(
        'team1',
        'team2',
        'game1',
        [extremeGame],
        mockDb
      );

      // Ratings should be clamped between 50 and 150
      expect(ratings.homeORtg).toBeGreaterThanOrEqual(50);
      expect(ratings.homeORtg).toBeLessThanOrEqual(150);
      expect(ratings.homeDRtg).toBeGreaterThanOrEqual(50);
      expect(ratings.homeDRtg).toBeLessThanOrEqual(150);
    });
  });

  describe('calculateBasketballDefensiveMetrics', () => {
    it('should calculate field goal suppression', () => {
      const stats = {
        opponentFieldGoalsMade: 30,
        opponentFieldGoalsAttempted: 80
      };

      const result = calculateBasketballDefensiveMetrics(stats);
      
      // FG suppression = 1 - (30/80) = 1 - 0.375 = 0.625
      expect(result.fgSuppression).toBeCloseTo(0.625);
    });

    it('should calculate three-point suppression', () => {
      const stats = {
        opponentThreePointFieldGoalsMade: 8,
        opponentThreePointFieldGoalsAttempted: 25
      };

      const result = calculateBasketballDefensiveMetrics(stats);
      
      // 3PT suppression = 1 - (8/25) = 1 - 0.32 = 0.68
      expect(result.threePtSuppression).toBeCloseTo(0.68);
    });

    it('should handle zero attempts', () => {
      const stats = {
        opponentFieldGoalsMade: 0,
        opponentFieldGoalsAttempted: 0
      };

      const result = calculateBasketballDefensiveMetrics(stats);
      
      // Should not calculate suppression when no attempts
      expect(result.fgSuppression).toBeUndefined();
    });
  });

  describe('calculateNBAAdvancedSituationalFeatures', () => {
    const mockGames: Game[] = [
      {
        id: 'game1',
        date: '2024-01-01',
        home_team_id: 'team1',
        away_team_id: 'team2',
        home_score: 110,
        away_score: 100,
        season: 2024,
        sport: 'nba',
        venue: null,
        status: 'completed'
      },
      {
        id: 'game2',
        date: '2024-01-02', // Back-to-back
        home_team_id: 'team3',
        away_team_id: 'team1',
        home_score: 95,
        away_score: 105,
        season: 2024,
        sport: 'nba',
        venue: null,
        status: 'completed'
      },
      {
        id: 'game3',
        date: '2024-01-05', // 3 days rest
        home_team_id: 'team1',
        away_team_id: 'team4',
        home_score: 120,
        away_score: 110,
        season: 2024,
        sport: 'nba',
        venue: null,
        status: 'completed'
      }
    ];

    beforeEach(() => {
      (mockDb.getGameStats as any).mockReturnValue({
        fieldGoalsAttempted: 80,
        freeThrowsAttempted: 20,
        totalTurnovers: 15
      });
    });

    it('should calculate rest/fatigue features', () => {
      const gameDate = new Date('2024-01-06');
      const features = calculateNBAAdvancedSituationalFeatures(
        'team1',
        gameDate,
        mockGames,
        mockDb
      );

      expect(features.daysSinceLastGame).toBe(1); // 1 day since game3
      expect(features.isBackToBack).toBe(1);
      expect(features.isWellRested).toBe(0);
    });

    it('should calculate recent performance trends', () => {
      const gameDate = new Date('2024-01-10');
      const features = calculateNBAAdvancedSituationalFeatures(
        'team1',
        gameDate,
        mockGames,
        mockDb
      );

      // team1 won game1 (home), game2 (away), game3 (home) = 3/3 = 100%
      expect(features.recentWinPct).toBe(1.0);
      
      // Average margin: +10, +10, +10 = +10
      expect(features.recentAvgMargin).toBeCloseTo(10);
    });

    it('should identify clutch games', () => {
      const clutchGames: Game[] = [
        {
          id: 'game1',
          date: '2024-01-01',
          home_team_id: 'team1',
          away_team_id: 'team2',
          home_score: 103,
          away_score: 100, // 3-point game (clutch)
          season: 2024,
          sport: 'nba',
          venue: null,
          status: 'completed'
        },
        {
          id: 'game2',
          date: '2024-01-02',
          home_team_id: 'team3',
          away_team_id: 'team1',
          home_score: 95,
          away_score: 120, // 25-point game (blowout)
          season: 2024,
          sport: 'nba',
          venue: null,
          status: 'completed'
        }
      ];

      const gameDate = new Date('2024-01-10');
      const features = calculateNBAAdvancedSituationalFeatures(
        'team1',
        gameDate,
        clutchGames,
        mockDb
      );

      expect(features.recentClutchGamePct).toBeCloseTo(0.5); // 1 out of 2 games
      expect(features.recentBlowoutPct).toBeCloseTo(0.5); // 1 out of 2 games
    });

    it('should handle team with no recent games', () => {
      const gameDate = new Date('2024-01-01');
      const features = calculateNBAAdvancedSituationalFeatures(
        'newteam',
        gameDate,
        mockGames,
        mockDb
      );

      // Should return empty object or default values
      expect(Object.keys(features)).toHaveLength(0);
    });

    it('should calculate pace and rating metrics', () => {
      const gameDate = new Date('2024-01-10');
      const features = calculateNBAAdvancedSituationalFeatures(
        'team1',
        gameDate,
        mockGames,
        mockDb
      );

      // Should have pace, offensive rating, and defensive rating
      expect(features.recentPace).toBeDefined();
      expect(features.recentOffRating).toBeDefined();
      expect(features.recentDefRating).toBeDefined();
    });
  });

  describe('getBasketballAdvancedFeatures', () => {
    it('should return comprehensive list of basketball features', () => {
      const features = getBasketballAdvancedFeatures();
      
      expect(features).toContain('effectiveFgPct');
      expect(features).toContain('trueShootingPct');
      expect(features).toContain('assistRatio');
      expect(features).toContain('turnoverRatio');
      expect(features).toContain('pace');
      expect(features).toContain('isBackToBack');
      expect(features).toContain('clutchWinPct');
      
      // Should have a reasonable number of features
      expect(features.length).toBeGreaterThan(10);
      expect(features.length).toBeLessThan(30);
    });

    it('should not have duplicate features', () => {
      const features = getBasketballAdvancedFeatures();
      const uniqueFeatures = [...new Set(features)];
      
      expect(features.length).toBe(uniqueFeatures.length);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle division by zero gracefully', () => {
      const stats = {
        fieldGoalsMade: 10,
        fieldGoalsAttempted: 0, // Division by zero case
        assists: 5,
        totalTurnovers: 0,
        totalRebounds: 0
      };

      expect(() => calculateBasketballAdvancedStats(stats)).not.toThrow();
      
      const result = calculateBasketballAdvancedStats(stats);
      expect(result.effectiveFgPct).toBeUndefined();
      expect(result.offensiveReboundPct).toBeUndefined();
    });

    it('should handle negative values appropriately', () => {
      const stats = {
        fieldGoalsMade: -5, // Negative values shouldn't happen but let's test
        fieldGoalsAttempted: 10,
        assists: -2,
        totalTurnovers: 5
      };

      expect(() => calculateBasketballAdvancedStats(stats)).not.toThrow();
    });

    it('should handle very large numbers', () => {
      const stats = {
        fieldGoalsMade: 1000000,
        fieldGoalsAttempted: 2000000,
        threePointFieldGoalsMade: 500000
      };

      const result = calculateBasketballAdvancedStats(stats);
      expect(result.effectiveFgPct).toBeCloseTo(0.625); // (1000000 + 0.5*500000) / 2000000 = 0.625
    });

    it('should handle undefined/null values in stats', () => {
      const stats = {
        fieldGoalsMade: undefined,
        fieldGoalsAttempted: null,
        assists: 10
      };

      expect(() => calculateBasketballAdvancedStats(stats as any)).not.toThrow();
    });
  });
});
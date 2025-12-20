import { describe, it, expect } from 'vitest';
import {
  getExponentialWeights,
  weightedAverage,
  computeWinStreak,
  computeRestDays,
  computeHeadToHead,
  computeRollingAverages,
  computeWinRate,
  computeAvgMargin,
  computeMarketImpliedProbFromOddsArr,
} from '../featureEngineering.js';
import type { Game, OddsData } from '../../db/types.js';

describe('Feature Engineering', () => {
  describe('computeMarketImpliedProbFromOddsArr', () => {
    it('should be deterministic and prefer DraftKings when present', () => {
      const dk: OddsData = {
        provider: 'draftkings',
        market: 'moneyline',
        line: null,
        home: -120,
        away: 110,
        price_home: -120,
        price_away: 110,
        price_over: null,
        price_under: null,
        timestamp: '2025-01-01T00:00:00Z',
      };

      const fd: OddsData = {
        provider: 'fanduel',
        market: 'moneyline',
        line: null,
        home: -105,
        away: -105,
        price_home: -105,
        price_away: -105,
        price_over: null,
        price_under: null,
        timestamp: '2025-01-01T00:00:00Z',
      };

      const mgm: OddsData = {
        provider: 'betmgm',
        market: 'moneyline',
        line: null,
        home: -130,
        away: 115,
        price_home: -130,
        price_away: 115,
        price_over: null,
        price_under: null,
        timestamp: '2025-01-01T00:00:00Z',
      };

      const a = computeMarketImpliedProbFromOddsArr([fd, mgm, dk]);
      const b = computeMarketImpliedProbFromOddsArr([dk, fd, mgm]);
      const c = computeMarketImpliedProbFromOddsArr([mgm, dk, fd]);

      expect(a).not.toBeNull();
      expect(b).not.toBeNull();
      expect(c).not.toBeNull();

      expect(a!).toBeCloseTo(b!, 12);
      expect(a!).toBeCloseTo(c!, 12);

      // DK: home=-120, away=+110 =>
      // impliedHome=120/(120+100)=0.54545
      // impliedAway=100/(110+100)=0.47619
      // normalized=0.54545/(0.54545+0.47619)=0.53390
      expect(a!).toBeCloseTo(0.5339, 4);
    });
  });

  describe('getExponentialWeights', () => {
    it('should generate correct exponential weights', () => {
      const weights = getExponentialWeights(3, 0.7);
      expect(weights).toHaveLength(3);
      expect(weights[0]).toBeCloseTo(0.49); // 0.7^2
      expect(weights[1]).toBeCloseTo(0.7); // 0.7^1
      expect(weights[2]).toBeCloseTo(1.0); // 0.7^0 (most recent)
    });

    it('should handle edge cases', () => {
      expect(getExponentialWeights(0, 0.7)).toEqual([]);
      expect(getExponentialWeights(1, 0.7)).toEqual([1.0]);
    });

    it('should handle different decay rates', () => {
      const weights1 = getExponentialWeights(3, 0.5);
      const weights2 = getExponentialWeights(3, 0.9);

      // With lower decay (0.5), older games should have much less weight
      expect(weights1[0]).toBeLessThan(weights2[0]);
      // Most recent game should always have weight 1
      expect(weights1[2]).toBe(1.0);
      expect(weights2[2]).toBe(1.0);
    });
  });

  describe('weightedAverage', () => {
    it('should calculate weighted average correctly', () => {
      const values = [10, 20, 30];
      const weights = [0.1, 0.3, 0.6];
      const result = weightedAverage(values, weights);

      // (10*0.1 + 20*0.3 + 30*0.6) / (0.1+0.3+0.6) = (1 + 6 + 18) / 1 = 25
      expect(result).toBeCloseTo(25);
    });

    it('should handle empty arrays', () => {
      expect(weightedAverage([], [])).toBe(0);
    });

    it('should handle single value', () => {
      expect(weightedAverage([42], [1])).toBe(42);
    });

    it('should normalize weights correctly', () => {
      const values = [10, 20];
      const weights = [2, 4]; // Should normalize to [1/3, 2/3]
      const result = weightedAverage(values, weights);

      // (10*2 + 20*4) / (2+4) = 100/6 ≈ 16.67
      expect(result).toBeCloseTo(16.67, 1);
    });
  });

  describe('computeWinStreak', () => {
    const mockGames: Game[] = [
      {
        id: 'game1',
        date: '2024-01-01',
        home_team_id: 'team1',
        away_team_id: 'team2',
        home_score: 100,
        away_score: 90,
        season: 2024,
        sport: 'nba',
        venue: null,
        status: 'completed',
      },
      {
        id: 'game2',
        date: '2024-01-02',
        home_team_id: 'team1',
        away_team_id: 'team3',
        home_score: 110,
        away_score: 95,
        season: 2024,
        sport: 'nba',
        venue: null,
        status: 'completed',
      },
      {
        id: 'game3',
        date: '2024-01-03',
        home_team_id: 'team2',
        away_team_id: 'team1',
        home_score: 85,
        away_score: 105,
        season: 2024,
        sport: 'nba',
        venue: null,
        status: 'completed',
      },
      {
        id: 'game4',
        date: '2024-01-04',
        home_team_id: 'team1',
        away_team_id: 'team4',
        home_score: 80,
        away_score: 90,
        season: 2024,
        sport: 'nba',
        venue: null,
        status: 'completed',
      },
    ];

    it('should calculate win streak correctly for winning team', () => {
      // team1 won games 1, 2, 3 but lost game 4
      // So streak before game4 should be 3
      const streak = computeWinStreak('team1', 'game4', mockGames);
      expect(streak).toBe(3);
    });

    it('should return 0 for team with no recent wins', () => {
      // Add a game where team1 loses, then check streak
      const gamesWithLoss = [
        ...mockGames,
        {
          id: 'game5',
          date: '2024-01-05',
          home_team_id: 'team1',
          away_team_id: 'team5',
          home_score: 70,
          away_score: 80,
          season: 2024,
          sport: 'nba',
          venue: null,
          status: 'completed',
        },
      ];

      const streak = computeWinStreak('team1', 'game5', gamesWithLoss);
      expect(streak).toBe(0);
    });

    it('should handle team with no previous games', () => {
      const streak = computeWinStreak('newteam', 'game1', mockGames);
      expect(streak).toBe(0);
    });

    it('should cap streak at reasonable maximum', () => {
      // Create 15 consecutive wins
      const manyWins: Game[] = [];
      for (let i = 1; i <= 15; i++) {
        manyWins.push({
          id: `game${i}`,
          date: `2024-01-${i.toString().padStart(2, '0')}`,
          home_team_id: 'team1',
          away_team_id: 'opponent',
          home_score: 100,
          away_score: 90,
          season: 2024,
          sport: 'nba',
          venue: null,
          status: 'completed',
        });
      }

      const streak = computeWinStreak('team1', 'nextgame', manyWins);
      expect(streak).toBe(10); // Should cap at 10
    });
  });

  describe('computeRestDays', () => {
    const mockGames: Game[] = [
      {
        id: 'game1',
        date: '2024-01-01',
        home_team_id: 'team1',
        away_team_id: 'team2',
        home_score: 100,
        away_score: 90,
        season: 2024,
        sport: 'nba',
        venue: null,
        status: 'completed',
      },
      {
        id: 'game2',
        date: '2024-01-05', // 4 days later
        home_team_id: 'team1',
        away_team_id: 'team3',
        home_score: 110,
        away_score: 95,
        season: 2024,
        sport: 'nba',
        venue: null,
        status: 'completed',
      },
    ];

    it('should calculate rest days correctly', () => {
      const restDays = computeRestDays('team1', 'game2', mockGames);
      expect(restDays).toBe(4);
    });

    it('should return default for team with no previous games', () => {
      const restDays = computeRestDays('newteam', 'game1', mockGames);
      expect(restDays).toBe(7);
    });

    it('should handle back-to-back games', () => {
      const backToBackGames: Game[] = [
        {
          id: 'game1',
          date: '2024-01-01',
          home_team_id: 'team1',
          away_team_id: 'team2',
          home_score: 100,
          away_score: 90,
          season: 2024,
          sport: 'nba',
          venue: null,
          status: 'completed',
        },
        {
          id: 'game2',
          date: '2024-01-02', // Next day
          home_team_id: 'team1',
          away_team_id: 'team3',
          home_score: 110,
          away_score: 95,
          season: 2024,
          sport: 'nba',
          venue: null,
          status: 'completed',
        },
      ];

      const restDays = computeRestDays('team1', 'game2', backToBackGames);
      expect(restDays).toBe(1);
    });
  });

  describe('computeHeadToHead', () => {
    const mockGames: Game[] = [
      {
        id: 'game1',
        date: '2024-01-01',
        home_team_id: 'team1',
        away_team_id: 'team2',
        home_score: 100,
        away_score: 90,
        season: 2024,
        sport: 'nba',
        venue: null,
        status: 'completed',
      },
      {
        id: 'game2',
        date: '2024-01-15',
        home_team_id: 'team2',
        away_team_id: 'team1',
        home_score: 95,
        away_score: 105,
        season: 2024,
        sport: 'nba',
        venue: null,
        status: 'completed',
      },
      {
        id: 'game3',
        date: '2024-02-01',
        home_team_id: 'team1',
        away_team_id: 'team2',
        home_score: 85,
        away_score: 95,
        season: 2024,
        sport: 'nba',
        venue: null,
        status: 'completed',
      },
      {
        id: 'current',
        date: '2024-03-01',
        home_team_id: 'team1',
        away_team_id: 'team2',
        home_score: null,
        away_score: null,
        season: 2024,
        sport: 'nba',
        venue: null,
        status: 'completed',
      },
    ];

    it('should calculate head-to-head record correctly', () => {
      const h2h = computeHeadToHead('team1', 'team2', 'current', mockGames);

      // team1 won game1 (home), game2 (away), lost game3 (home)
      // So team1 has 2 wins out of 3 games
      expect(h2h.wins).toBe(2);
      expect(h2h.games).toBe(3);
    });

    it('should handle teams with no previous meetings', () => {
      const h2h = computeHeadToHead('team1', 'team99', 'current', mockGames);
      expect(h2h.wins).toBe(0);
      expect(h2h.games).toBe(0);
    });

    it('should exclude current game from calculation', () => {
      const h2h = computeHeadToHead('team1', 'team2', 'game3', mockGames);

      // Should only count game1 and game2, not game3
      expect(h2h.games).toBe(2);
    });
  });

  describe('computeRollingAverages', () => {
    const mockStatsByGame = {
      game1: { points: 100, rebounds: 45 },
      game2: { points: 110, rebounds: 50 },
      game3: { points: 90, rebounds: 40 },
      game4: { points: 105, rebounds: 48 },
    };

    const gameOrder = ['game1', 'game2', 'game3', 'game4'];
    const windows = [2, 3];
    const enabledFeatures = ['points', 'rebounds'];

    it('should calculate rolling averages correctly', () => {
      const result = computeRollingAverages(
        mockStatsByGame,
        gameOrder,
        windows,
        enabledFeatures,
        false, // no exponential weighting
        0.7,
      );

      // For game3 (index 2), 2-game window should include game1 and game2
      expect(result['game3']['points_avg_2']).toBeCloseTo(105); // (100+110)/2
      expect(result['game3']['rebounds_avg_2']).toBeCloseTo(47.5); // (45+50)/2

      // For game4 (index 3), 3-game window should include game1, game2, game3
      expect(result['game4']['points_avg_3']).toBeCloseTo(100); // (100+110+90)/3
    });

    it('should handle exponential weighting', () => {
      const result = computeRollingAverages(
        mockStatsByGame,
        gameOrder,
        windows,
        enabledFeatures,
        true, // use exponential weighting
        0.5,
      );

      // Should have different values than simple average
      expect(result['game3']['points_avg_2']).not.toBeCloseTo(105);
      // More recent games should have higher weight
      expect(result['game3']['points_avg_2']).toBeGreaterThan(105);
    });

    it('should handle missing stats gracefully', () => {
      const incompleteStats = {
        game1: { points: 100 }, // missing rebounds
        game2: { points: 110, rebounds: 50 },
        game3: { rebounds: 40 }, // missing points
      };

      const result = computeRollingAverages(
        incompleteStats,
        ['game1', 'game2', 'game3'],
        [2],
        ['points', 'rebounds'],
        false,
        0.7,
      );

      // Should handle missing values without crashing
      expect(result['game3']['points_avg_2']).toBeCloseTo(105); // Only game2 has points (game1 missing)
      expect(result['game3']['rebounds_avg_2']).toBeCloseTo(50); // Only game2 has rebounds (game1 missing)
    });
  });

  describe('computeWinRate', () => {
    const mockGames: Game[] = [
      {
        id: 'game1',
        date: '2024-01-01',
        home_team_id: 'team1',
        away_team_id: 'team2',
        home_score: 100,
        away_score: 90,
        season: 2024,
        sport: 'nba',
        venue: null,
        status: 'completed',
      },
      {
        id: 'game2',
        date: '2024-01-02',
        home_team_id: 'team3',
        away_team_id: 'team1',
        home_score: 85,
        away_score: 95,
        season: 2024,
        sport: 'nba',
        venue: null,
        status: 'completed',
      },
      {
        id: 'game3',
        date: '2024-01-03',
        home_team_id: 'team1',
        away_team_id: 'team4',
        home_score: 80,
        away_score: 90,
        season: 2024,
        sport: 'nba',
        venue: null,
        status: 'completed',
      },
      {
        id: 'game4',
        date: '2024-01-04',
        home_team_id: 'team1',
        away_team_id: 'team5',
        home_score: null,
        away_score: null,
        season: 2024,
        sport: 'nba',
        venue: null,
        status: 'completed',
      },
    ];

    it('should calculate win rate correctly', () => {
      // team1: won game1 (home), won game2 (away), lost game3 (home)
      // Win rate for last 3 games before game4 should be 2/3
      const winRate = computeWinRate('team1', 'game4', 3, mockGames);
      expect(winRate).toBeCloseTo(2 / 3);
    });

    it('should handle window larger than available games', () => {
      const winRate = computeWinRate('team1', 'game4', 10, mockGames);
      expect(winRate).toBeCloseTo(2 / 3); // Still 2 wins out of 3 games
    });

    it('should return 0 for team with no games', () => {
      const winRate = computeWinRate('newteam', 'game1', 5, mockGames);
      expect(winRate).toBe(0);
    });

    it('should exclude games with null scores', () => {
      const gamesWithNull = [
        ...mockGames,
        {
          id: 'game5',
          date: '2024-01-05',
          home_team_id: 'team1',
          away_team_id: 'team6',
          home_score: null,
          away_score: null,
          season: 2024,
          sport: 'nba',
          venue: null,
          status: 'completed',
        },
      ];

      const winRate = computeWinRate('team1', 'game5', 5, gamesWithNull);
      expect(winRate).toBeCloseTo(2 / 3); // Should ignore the null score game
    });
  });

  describe('computeAvgMargin', () => {
    const mockGames: Game[] = [
      {
        id: 'game1',
        date: '2024-01-01',
        home_team_id: 'team1',
        away_team_id: 'team2',
        home_score: 100,
        away_score: 90, // +10 margin for team1
        season: 2024,
        sport: 'nba',
        venue: null,
        status: 'completed',
      },
      {
        id: 'game2',
        date: '2024-01-02',
        home_team_id: 'team3',
        away_team_id: 'team1',
        home_score: 85,
        away_score: 95, // +10 margin for team1
        season: 2024,
        sport: 'nba',
        venue: null,
        status: 'completed',
      },
      {
        id: 'game3',
        date: '2024-01-03',
        home_team_id: 'team1',
        away_team_id: 'team4',
        home_score: 80,
        away_score: 90, // -10 margin for team1
        season: 2024,
        sport: 'nba',
        venue: null,
        status: 'completed',
      },
    ];

    it('should calculate average margin correctly', () => {
      // team1 margins: +10, +10, -10 = average of +3.33
      const avgMargin = computeAvgMargin('team1', 'nextgame', 3, mockGames);
      expect(avgMargin).toBeCloseTo(10 / 3);
    });

    it('should handle negative margins', () => {
      const losingGames: Game[] = [
        {
          id: 'game1',
          date: '2024-01-01',
          home_team_id: 'team1',
          away_team_id: 'team2',
          home_score: 80,
          away_score: 90, // -10 margin
          season: 2024,
          sport: 'nba',
          venue: null,
          status: 'completed',
        },
        {
          id: 'game2',
          date: '2024-01-02',
          home_team_id: 'team3',
          away_team_id: 'team1',
          home_score: 95,
          away_score: 85, // -10 margin
          season: 2024,
          sport: 'nba',
          venue: null,
          status: 'completed',
        },
      ];

      const avgMargin = computeAvgMargin('team1', 'nextgame', 2, losingGames);
      expect(avgMargin).toBe(-10);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty game arrays', () => {
      expect(computeWinStreak('team1', 'game1', [])).toBe(0);
      expect(computeRestDays('team1', 'game1', [])).toBe(7);
      expect(computeWinRate('team1', 'game1', 5, [])).toBe(0);
      expect(computeAvgMargin('team1', 'game1', 5, [])).toBe(0);
    });

    it('should handle invalid dates gracefully', () => {
      const invalidDateGames: Game[] = [
        {
          id: 'game1',
          date: 'invalid-date',
          home_team_id: 'team1',
          away_team_id: 'team2',
          home_score: 100,
          away_score: 90,
          season: 2024,
          sport: 'nba',
          venue: null,
          status: 'completed',
        },
      ];

      // Functions should not crash with invalid dates
      expect(() => computeRestDays('team1', 'game2', invalidDateGames)).not.toThrow();
    });

    it('should handle null/undefined scores', () => {
      const nullScoreGames: Game[] = [
        {
          id: 'game1',
          date: '2024-01-01',
          home_team_id: 'team1',
          away_team_id: 'team2',
          home_score: null,
          away_score: null,
          season: 2024,
          sport: 'nba',
          venue: null,
          status: 'completed',
        },
      ];

      expect(computeWinRate('team1', 'game2', 5, nullScoreGames)).toBe(0);
      expect(computeAvgMargin('team1', 'game2', 5, nullScoreGames)).toBe(0);
    });
  });
});

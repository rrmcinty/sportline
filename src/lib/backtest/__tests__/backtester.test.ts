import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateRecommendations } from '../backtester';
import type { GameFeatures, Recommendation } from '../../types';

describe('backtester', () => {
  describe('generateRecommendations', () => {
    it('should generate recommendations from predictions', () => {
      const mockDataset: GameFeatures[] = [
        {
          game_id: 'game1',
          date: '2024-01-01',
          home_team: 'Team A',
          away_team: 'Team B',
          sport: 'nba',
          season: 2024,
          features: { feature1: 1, feature2: 2 },
          odds: [{ home: 110, away: -110 }],
        },
        {
          game_id: 'game2',
          date: '2024-01-02',
          home_team: 'Team C',
          away_team: 'Team D',
          sport: 'nba',
          season: 2024,
          features: { feature1: 3, feature2: 4 },
          odds: [{ home: -110, away: 110 }],
        },
      ];

      const predictions = [0.6, 0.4];
      const splitIdx = 0;

      const recommendations = generateRecommendations(mockDataset, predictions, splitIdx);

      expect(recommendations).toHaveLength(2);
      expect(recommendations[0].game_id).toBe('game1');
      expect(recommendations[0].model_prob_home).toBe(0.6);
      expect(recommendations[0].model_prob_away).toBe(0.4);
      expect(recommendations[1].game_id).toBe('game2');
      expect(recommendations[1].model_prob_home).toBe(0.4);
      expect(recommendations[1].model_prob_away).toBe(0.6);
    });

    it('should handle missing odds', () => {
      const mockDataset: GameFeatures[] = [
        {
          game_id: 'game1',
          date: '2024-01-01',
          home_team: 'Team A',
          away_team: 'Team B',
          sport: 'nba',
          season: 2024,
          features: { feature1: 1, feature2: 2 },
          odds: null,
        },
      ];

      const predictions = [0.6];
      const splitIdx = 0;

      const recommendations = generateRecommendations(mockDataset, predictions, splitIdx);

      expect(recommendations).toHaveLength(1);
      expect(recommendations[0].ev_home).toBeNull();
      expect(recommendations[0].ev_away).toBeNull();
    });

    it('should handle empty predictions', () => {
      const mockDataset: GameFeatures[] = [];
      const predictions: number[] = [];
      const splitIdx = 0;

      const recommendations = generateRecommendations(mockDataset, predictions, splitIdx);

      expect(recommendations).toHaveLength(0);
    });

    it('should handle split index correctly', () => {
      const mockDataset: GameFeatures[] = [
        {
          game_id: 'game1',
          date: '2024-01-01',
          home_team: 'Team A',
          away_team: 'Team B',
          sport: 'nba',
          season: 2024,
          features: { feature1: 1, feature2: 2 },
          odds: [{ home: 110, away: -110 }],
        },
        {
          game_id: 'game2',
          date: '2024-01-02',
          home_team: 'Team C',
          away_team: 'Team D',
          sport: 'nba',
          season: 2024,
          features: { feature1: 3, feature2: 4 },
          odds: [{ home: -110, away: 110 }],
        },
        {
          game_id: 'game3',
          date: '2024-01-03',
          home_team: 'Team E',
          away_team: 'Team F',
          sport: 'nba',
          season: 2024,
          features: { feature1: 5, feature2: 6 },
          odds: [{ home: 105, away: -105 }],
        },
      ];

      const predictions = [0.4, 0.6]; // Only 2 predictions for games 2 and 3
      const splitIdx = 1; // Start from game2

      const recommendations = generateRecommendations(mockDataset, predictions, splitIdx);

      expect(recommendations).toHaveLength(2);
      expect(recommendations[0].game_id).toBe('game2');
      expect(recommendations[1].game_id).toBe('game3');
    });
  });
});

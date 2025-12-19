import { describe, it, expect } from 'vitest';
import { generateRecommendations } from '../backtester';
import type { GameFeatures, OddsData } from '../../db/types.js';

const mlOdds = (home: number, away: number): OddsData => ({
  provider: 'test',
  market: 'moneyline',
  line: null,
  home,
  away,
  price_home: null,
  price_away: null,
  price_over: null,
  price_under: null,
  timestamp: '2024-01-01T00:00:00Z',
});

describe('backtester', () => {
  describe('generateRecommendations', () => {
    it('should generate recommendations from predictions', () => {
      const mockDataset: GameFeatures[] = [
        {
          game_id: 'game1',
          date: '2024-01-01',
          home_team: 'Team A',
          away_team: 'Team B',
          season: 2024,
          features: { feature1: 1, feature2: 2 },
          odds: [mlOdds(110, -110)],
          target: null,
        },
        {
          game_id: 'game2',
          date: '2024-01-02',
          home_team: 'Team C',
          away_team: 'Team D',
          season: 2024,
          features: { feature1: 3, feature2: 4 },
          odds: [mlOdds(-110, 110)],
          target: null,
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
          season: 2024,
          features: { feature1: 1, feature2: 2 },
          odds: [],
          target: null,
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
          season: 2024,
          features: { feature1: 1, feature2: 2 },
          odds: [mlOdds(110, -110)],
          target: null,
        },
        {
          game_id: 'game2',
          date: '2024-01-02',
          home_team: 'Team C',
          away_team: 'Team D',
          season: 2024,
          features: { feature1: 3, feature2: 4 },
          odds: [mlOdds(-110, 110)],
          target: null,
        },
        {
          game_id: 'game3',
          date: '2024-01-03',
          home_team: 'Team E',
          away_team: 'Team F',
          season: 2024,
          features: { feature1: 5, feature2: 6 },
          odds: [mlOdds(105, -105)],
          target: null,
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

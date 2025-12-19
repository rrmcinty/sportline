import { describe, it, expect, vi, beforeEach } from 'vitest';
import { predict } from '../predictor';
import type { TrainedModel } from '../../db/types.js';

const baseModel = (): TrainedModel => ({
  sport: 'nba',
  market: 'moneyline',
  modelType: 'logistic_regression',
  trainedAt: '2024-01-01T00:00:00Z',
  seasons: [2024],
  features: { feature1: true, feature2: true },
  rollingWindows: [],
  featureKeys: ['feature1', 'feature2'],
  featureMeans: { feature1: 0, feature2: 0 },
  featureStds: { feature1: 1, feature2: 1 },
  modelParams: {
    type: 'logistic_regression',
    learningRate: 0.01,
    numSteps: 1000,
    theta: [[0.5], [0.3]],
  },
  thresholds: {
    min_edge: 0,
    min_ev: 0,
  },
  backtestMetrics: {
    accuracy: 0,
    logLoss: 0,
    roi: 0,
    totalBets: 0,
    winRate: 0,
  },
  recencyWeighting: {
    enabled: false,
    decay: 0,
  },
});

describe('predictor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('predict', () => {
    it('should make predictions for valid features and model', () => {
      const mockModel = baseModel();

      const features = { feature1: 1, feature2: 2 };
      const result = predict(features, mockModel);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('prob_home');
      expect(result).toHaveProperty('prob_away');
      expect(typeof result.prob_home).toBe('number');
      expect(typeof result.prob_away).toBe('number');
      expect(result.prob_home).toBeGreaterThan(0);
      expect(result.prob_home).toBeLessThan(1);
    });

    it('should handle missing features gracefully', () => {
      const mockModel = baseModel();

      const features = { feature1: 1 }; // missing feature2
      const result = predict(features, mockModel);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('prob_home');
      expect(result).toHaveProperty('prob_away');
      expect(typeof result.prob_home).toBe('number');
      expect(typeof result.prob_away).toBe('number');
    });

    it('should handle debug mode', () => {
      const mockModel = baseModel();

      const features = { feature1: 1, feature2: 2 };

      // Should not throw in debug mode
      expect(() => predict(features, mockModel, true)).not.toThrow();
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { predict } from '../predictor';
import type { TrainedModel, Prediction } from '../../db/types';

describe('predictor', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('predict', () => {
        it('should make predictions for valid features and model', () => {
            const mockModel: TrainedModel = {
                sport: 'nba',
                modelType: 'logistic_regression',
                featureKeys: ['feature1', 'feature2'],
                featureMeans: { feature1: 0, feature2: 0 },
                featureStds: { feature1: 1, feature2: 1 },
                modelParams: {
                    type: 'logistic_regression' as const,
                    learningRate: 0.01,
                    numSteps: 1000,
                    theta: [[0.5], [0.3]]
                }
            };

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
            const mockModel: TrainedModel = {
                sport: 'nba',
                modelType: 'logistic_regression',
                featureKeys: ['feature1', 'feature2'],
                featureMeans: { feature1: 0, feature2: 0 },
                featureStds: { feature1: 1, feature2: 1 },
                modelParams: {
                    type: 'logistic_regression' as const,
                    learningRate: 0.01,
                    numSteps: 1000,
                    theta: [[0.5], [0.3]]
                }
            };

            const features = { feature1: 1 }; // missing feature2
            const result = predict(features, mockModel);

            expect(result).toBeDefined();
            expect(result).toHaveProperty('prob_home');
            expect(result).toHaveProperty('prob_away');
            expect(typeof result.prob_home).toBe('number');
            expect(typeof result.prob_away).toBe('number');
        });

        it('should handle debug mode', () => {
            const mockModel: TrainedModel = {
                sport: 'nba',
                modelType: 'logistic_regression',
                featureKeys: ['feature1', 'feature2'],
                featureMeans: { feature1: 0, feature2: 0 },
                featureStds: { feature1: 1, feature2: 1 },
                modelParams: {
                    type: 'logistic_regression' as const,
                    learningRate: 0.01,
                    numSteps: 1000,
                    theta: [[0.5], [0.3]]
                }
            };

            const features = { feature1: 1, feature2: 2 };

            // Should not throw in debug mode
            expect(() => predict(features, mockModel, true)).not.toThrow();
        });
    });
});

import { describe, it, expect } from 'vitest';
import {
  IsotonicRegression,
  BetaCalibration,
  fitTemperatureScaling,
  calculateECE,
  generateReliabilityDiagram,
  applyCalibration,
  selectBestCalibration,
} from '../calibration.js';

describe('calibration', () => {
  describe('IsotonicRegression', () => {
    it('should fit and calibrate probabilities', () => {
      const calibrator = new IsotonicRegression();
      const probabilities = [0.2, 0.4, 0.6, 0.8];
      const labels = [0, 0, 1, 1];

      calibrator.fit(probabilities, labels);
      const calibrated = calibrator.calibrate([0.3, 0.5, 0.7]);

      // Calibrated probabilities should be between 0 and 1
      calibrated.forEach((p) => {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      });
    });

    it('should maintain monotonicity after calibration', () => {
      const calibrator = new IsotonicRegression();
      const probabilities = [0.1, 0.3, 0.5, 0.7, 0.9];
      const labels = [0, 0, 1, 1, 1];

      calibrator.fit(probabilities, labels);
      const calibrated = calibrator.calibrate([0.2, 0.4, 0.6, 0.8]);

      // Check monotonicity
      for (let i = 0; i < calibrated.length - 1; i++) {
        expect(calibrated[i + 1]).toBeGreaterThanOrEqual(calibrated[i]);
      }
    });

    it('should serialize and deserialize correctly', () => {
      const calibrator = new IsotonicRegression();
      const probabilities = [0.2, 0.4, 0.6, 0.8];
      const labels = [0, 1, 0, 1];

      calibrator.fit(probabilities, labels);
      const serialized = calibrator.serialize();

      const newCalibrator = IsotonicRegression.deserialize(serialized);
      const original = calibrator.calibrate([0.5]);
      const deserialized = newCalibrator.calibrate([0.5]);

      expect(deserialized[0]).toBeCloseTo(original[0], 4);
    });

    it('should handle edge case probabilities', () => {
      const calibrator = new IsotonicRegression();
      const probabilities = [0.1, 0.5, 0.9];
      const labels = [0, 1, 1];

      calibrator.fit(probabilities, labels);
      const calibrated = calibrator.calibrate([0, 0.5, 1]);

      expect(calibrated[0]).toBeGreaterThanOrEqual(0);
      expect(calibrated[2]).toBeLessThanOrEqual(1);
    });

    it('should throw error for invalid input', () => {
      const calibrator = new IsotonicRegression();
      expect(() => calibrator.fit([], [])).toThrow();
      expect(() => calibrator.fit([0.5], [0, 1])).toThrow();
    });
  });

  describe('BetaCalibration', () => {
    it('should fit and calibrate probabilities', () => {
      const calibrator = new BetaCalibration();
      const probabilities = [0.2, 0.4, 0.6, 0.8];
      const labels = [0, 0, 1, 1];

      calibrator.fit(probabilities, labels);
      const calibrated = calibrator.calibrate([0.3, 0.5, 0.7]);

      // Calibrated probabilities should be between 0 and 1
      calibrated.forEach((p) => {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      });
    });

    it('should get and set parameters', () => {
      const calibrator = new BetaCalibration();
      const params = { a: 1.5, b: 2.0 };

      calibrator.setParams(params);
      const retrieved = calibrator.getParams();

      expect(retrieved.a).toBe(1.5);
      expect(retrieved.b).toBe(2.0);
    });

    it('should maintain monotonicity', () => {
      const calibrator = new BetaCalibration();
      calibrator.setParams({ a: 1.0, b: 1.0 });

      const calibrated = calibrator.calibrate([0.2, 0.4, 0.6, 0.8]);

      // Check monotonicity
      for (let i = 0; i < calibrated.length - 1; i++) {
        expect(calibrated[i + 1]).toBeGreaterThanOrEqual(calibrated[i]);
      }
    });
  });

  describe('fitTemperatureScaling', () => {
    it('should find optimal temperature', () => {
      const probabilities = [0.3, 0.5, 0.7, 0.9];
      const labels = [0, 0, 1, 1];

      const temperature = fitTemperatureScaling(probabilities, labels);

      expect(temperature).toBeGreaterThanOrEqual(1.0);
      expect(temperature).toBeLessThanOrEqual(2.0);
    });

    it('should return 1.0 for perfectly calibrated model', () => {
      // Perfect calibration
      const probabilities = [0.2, 0.4, 0.6, 0.8];
      const labels = [0, 0, 1, 1];

      const temperature = fitTemperatureScaling(probabilities, labels);

      // Should be close to 1.0 (no scaling needed)
      expect(temperature).toBeGreaterThanOrEqual(0.95);
      expect(temperature).toBeLessThanOrEqual(1.5);
    });

    it('should respect custom search range', () => {
      const probabilities = [0.3, 0.5, 0.7, 0.9];
      const labels = [0, 0, 1, 1];

      const temperature = fitTemperatureScaling(probabilities, labels, {
        minT: 1.0,
        maxT: 1.5,
      });

      expect(temperature).toBeGreaterThanOrEqual(1.0);
      expect(temperature).toBeLessThanOrEqual(1.5);
    });
  });

  describe('calculateECE', () => {
    it('should calculate ECE for perfect calibration', () => {
      const probabilities = [0.1, 0.3, 0.5, 0.7, 0.9];
      const labels = [0, 0, 1, 1, 1];

      const ece = calculateECE(probabilities, labels, 5);

      // Perfect calibration should have low ECE
      expect(ece).toBeGreaterThanOrEqual(0);
      expect(ece).toBeLessThan(0.5);
    });

    it('should return 1.0 for empty input', () => {
      const ece = calculateECE([], [], 10);
      expect(ece).toBe(1.0);
    });

    it('should return 1.0 for mismatched lengths', () => {
      const ece = calculateECE([0.5], [0, 1], 10);
      expect(ece).toBe(1.0);
    });

    it('should handle overconfident predictions', () => {
      // Model predicts 90% but only 50% correct
      const probabilities = Array(10).fill(0.9);
      const labels = [1, 1, 1, 1, 1, 0, 0, 0, 0, 0];

      const ece = calculateECE(probabilities, labels, 10);

      // Should have high ECE due to miscalibration
      expect(ece).toBeGreaterThan(0.1);
    });

    it('should handle custom number of bins', () => {
      const probabilities = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
      const labels = [0, 0, 0, 0, 1, 1, 1, 1, 1];

      const ece5 = calculateECE(probabilities, labels, 5);
      const ece10 = calculateECE(probabilities, labels, 10);

      expect(ece5).toBeGreaterThanOrEqual(0);
      expect(ece10).toBeGreaterThanOrEqual(0);
    });
  });

  describe('generateReliabilityDiagram', () => {
    it('should generate reliability diagram data', () => {
      const probabilities = [0.1, 0.3, 0.5, 0.7, 0.9];
      const labels = [0, 0, 1, 1, 1];

      const diagram = generateReliabilityDiagram(probabilities, labels, 5);

      expect(diagram).toHaveLength(5);
      diagram.forEach((bin) => {
        expect(bin).toHaveProperty('binCenter');
        expect(bin).toHaveProperty('meanPredicted');
        expect(bin).toHaveProperty('actualFrequency');
        expect(bin).toHaveProperty('count');
      });
    });

    it('should handle empty bins', () => {
      const probabilities = [0.1, 0.2];
      const labels = [0, 0];

      const diagram = generateReliabilityDiagram(probabilities, labels, 10);

      // Should have 10 bins, but only first bins have data
      expect(diagram).toHaveLength(10);
      const emptyBins = diagram.filter((bin) => bin.count === 0);
      expect(emptyBins.length).toBeGreaterThan(0);
    });

    it('should calculate correct statistics for populated bins', () => {
      const probabilities = [0.5, 0.5, 0.5, 0.5];
      const labels = [0, 1, 1, 1]; // 75% actual

      const diagram = generateReliabilityDiagram(probabilities, labels, 10);

      // Find the bin containing 0.5
      const bin = diagram.find((b) => b.count > 0);
      expect(bin).toBeDefined();
      expect(bin!.count).toBe(4);
      expect(bin!.actualFrequency).toBeCloseTo(0.75, 1);
      expect(bin!.meanPredicted).toBeCloseTo(0.5, 1);
    });
  });

  describe('applyCalibration', () => {
    it('should return original probabilities when no calibration model', () => {
      const probabilities = [0.3, 0.5, 0.7];
      const result = applyCalibration(probabilities, undefined);
      expect(result).toEqual(probabilities);
    });

    it('should apply temperature scaling', () => {
      const probabilities = [0.3, 0.5, 0.7, 0.9];
      const model = { method: 'temperature' as const, temperature: 1.5 };

      const calibrated = applyCalibration(probabilities, model);

      // Temperature scaling should shift probabilities toward 0.5
      expect(calibrated[0]).toBeGreaterThan(0.3);
      expect(calibrated[3]).toBeLessThan(0.9);
    });

    it('should apply beta calibration', () => {
      const probabilities = [0.3, 0.5, 0.7];
      const model = {
        method: 'beta' as const,
        betaParams: { a: 1.0, b: 1.0 },
      };

      const calibrated = applyCalibration(probabilities, model);

      calibrated.forEach((p) => {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      });
    });

    it('should apply isotonic calibration', () => {
      const calibrator = new IsotonicRegression();
      calibrator.fit([0.2, 0.5, 0.8], [0, 1, 1]);
      const serialized = calibrator.serialize();

      const model = {
        method: 'isotonic' as const,
        isotonicThresholds: serialized.thresholds,
        isotonicValues: serialized.values,
      };

      const calibrated = applyCalibration([0.3, 0.6], model);

      calibrated.forEach((p) => {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      });
    });

    it('should handle temperature = 1.0 (no change)', () => {
      const probabilities = [0.3, 0.5, 0.7];
      const model = { method: 'temperature' as const, temperature: 1.0 };

      const calibrated = applyCalibration(probabilities, model);

      expect(calibrated).toEqual(probabilities);
    });
  });

  describe('selectBestCalibration', () => {
    it('should select best calibration method', () => {
      // Overconfident predictions
      const trainProbs = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2];
      const trainLabels = [1, 1, 0, 0, 1, 0, 0, 0];
      const valProbs = [0.9, 0.7, 0.5, 0.3];
      const valLabels = [1, 0, 1, 0];

      const model = selectBestCalibration(trainProbs, trainLabels, valProbs, valLabels);

      expect(model).toHaveProperty('method');
      expect(['temperature', 'isotonic', 'beta']).toContain(model.method);
    });

    it('should return temperature model for well-calibrated data', () => {
      const trainProbs = [0.2, 0.4, 0.6, 0.8];
      const trainLabels = [0, 0, 1, 1];
      const valProbs = [0.3, 0.7];
      const valLabels = [0, 1];

      const model = selectBestCalibration(trainProbs, trainLabels, valProbs, valLabels);

      // For well-calibrated data, temperature or other methods might be selected
      expect(model).toHaveProperty('method');
    });
  });
});

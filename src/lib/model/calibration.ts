/**
 * Probability calibration utilities
 * Implements isotonic regression and beta calibration for fixing probability calibration issues
 */

export interface CalibrationModel {
  method: 'temperature' | 'platt' | 'isotonic' | 'beta';
  temperature?: number;
  betaParams?: { a: number; b: number };
  isotonicThresholds?: number[];
  isotonicValues?: number[];
}

/**
 * Isotonic Regression for probability calibration
 * Fits a non-decreasing piecewise constant function to calibrate probabilities
 */
export class IsotonicRegression {
  private thresholds: number[] = [];
  private values: number[] = [];

  /**
   * Fit isotonic regression on training probabilities and labels
   * Uses a simplified bin-based approach
   */
  fit(probabilities: number[], labels: number[]): void {
    // Create bins and calculate empirical probabilities for each bin
    const nBins = 10;
    this.thresholds = [];
    this.values = [];

    for (let i = 0; i <= nBins; i++) {
      const threshold = i / nBins;
      this.thresholds.push(threshold);

      // Find all samples in this bin (±5% range)
      const binSamples = [];
      for (let j = 0; j < probabilities.length; j++) {
        if (probabilities[j] >= threshold - 0.05 && probabilities[j] < threshold + 0.05) {
          binSamples.push(labels[j]);
        }
      }

      // Calculate empirical probability for this bin
      const binProb = binSamples.length > 0 ? binSamples.reduce((a, b) => a + b, 0) / binSamples.length : threshold;
      this.values.push(Math.max(0, Math.min(1, binProb))); // Clamp to [0,1]
    }

    // Ensure monotonicity by enforcing non-decreasing values
    for (let i = 1; i < this.values.length; i++) {
      if (this.values[i] < this.values[i - 1]) {
        this.values[i] = this.values[i - 1];
      }
    }
  }

  /**
   * Apply calibration to new probabilities
   */
  calibrate(probabilities: number[]): number[] {
    if (this.thresholds.length === 0) {
      return probabilities; // Not fitted, return unchanged
    }

    return probabilities.map(prob => {
      // Clamp probability to [0,1]
      const clampedProb = Math.max(0, Math.min(1, prob));

      // Find the closest bin
      let bestIndex = 0;
      let bestDistance = Math.abs(clampedProb - this.thresholds[0]);

      for (let i = 1; i < this.thresholds.length; i++) {
        const distance = Math.abs(clampedProb - this.thresholds[i]);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = i;
        }
      }

      return this.values[bestIndex];
    });
  }

  /**
   * Serialize the calibration model for storage
   */
  serialize(): { thresholds: number[]; values: number[] } {
    return {
      thresholds: this.thresholds,
      values: this.values
    };
  }

  /**
   * Deserialize a calibration model
   */
  static deserialize(data: { thresholds: number[]; values: number[] }): IsotonicRegression {
    const calibrator = new IsotonicRegression();
    calibrator.thresholds = data.thresholds;
    calibrator.values = data.values;
    return calibrator;
  }
}

/**
 * Beta calibration for probability calibration
 * Fits beta distribution parameters to calibrate probabilities
 */
export class BetaCalibration {
  private a: number = 1;
  private b: number = 1;

  /**
   * Fit beta calibration parameters using maximum likelihood
   */
  fit(probabilities: number[], labels: number[]): void {
    // Simple grid search for beta parameters
    // In practice, you might use more sophisticated optimization
    let bestA = 1;
    let bestB = 1;
    let bestLogLik = -Infinity;

    // Grid search over reasonable parameter ranges
    for (let a = 0.1; a <= 5; a += 0.1) {
      for (let b = 0.1; b <= 5; b += 0.1) {
        let logLik = 0;

        for (let i = 0; i < probabilities.length; i++) {
          const prob = probabilities[i];
          const label = labels[i];

          // Beta PDF: p(x|a,b) = [x^(a-1) * (1-x)^(b-1)] / B(a,b)
          // For calibration, we want to find a,b that maximize likelihood
          const calibratedProb = this.betaCdf(prob, a, b);

          if (calibratedProb > 0 && calibratedProb < 1) {
            logLik += label * Math.log(calibratedProb) + (1 - label) * Math.log(1 - calibratedProb);
          }
        }

        if (logLik > bestLogLik) {
          bestLogLik = logLik;
          bestA = a;
          bestB = b;
        }
      }
    }

    this.a = bestA;
    this.b = bestB;
  }

  /**
   * Beta CDF approximation for calibration
   */
  private betaCdf(x: number, a: number, b: number): number {
    // Simplified approximation - in practice you'd use a proper beta CDF
    // For calibration, we want a monotonic transformation
    return Math.pow(x, a) / (Math.pow(x, a) + Math.pow(1 - x, b));
  }

  /**
   * Apply beta calibration
   */
  calibrate(probabilities: number[]): number[] {
    return probabilities.map(prob => this.betaCdf(prob, this.a, this.b));
  }

  /**
   * Get fitted parameters
   */
  getParams(): { a: number; b: number } {
    return { a: this.a, b: this.b };
  }

  /**
   * Set parameters
   */
  setParams(params: { a: number; b: number }): void {
    this.a = params.a;
    this.b = params.b;
  }
}

/**
 * Factory function to create calibrator based on method
 */
export function createCalibrator(method: 'temperature' | 'beta' | 'isotonic'): IsotonicRegression | BetaCalibration | null {
  switch (method) {
    case 'isotonic':
      return new IsotonicRegression();
    case 'beta':
      return new BetaCalibration();
    case 'temperature':
      return null; // Temperature scaling is handled separately
    default:
      return null;
  }
}

/**
 * Apply calibration to probabilities
 */
export function applyCalibration(
  probabilities: number[],
  calibrationModel: CalibrationModel | undefined
): number[] {
  if (!calibrationModel) {
    return probabilities;
  }

  switch (calibrationModel.method) {
    case 'temperature':
      if (calibrationModel.temperature !== undefined && calibrationModel.temperature !== 1.0) {
        const temp = calibrationModel.temperature;
        // Temperature scaling: p' = 1 / (1 + exp(-logit(p) / T))
        return probabilities.map(p => {
          if (p <= 0 || p >= 1) return p;
          const logit = Math.log(p / (1 - p));
          const scaledLogit = logit / temp;
          return 1 / (1 + Math.exp(-scaledLogit));
        });
      }
      return probabilities;

    case 'beta':
      if (calibrationModel.betaParams) {
        const calibrator = new BetaCalibration();
        calibrator.setParams(calibrationModel.betaParams);
        return calibrator.calibrate(probabilities);
      }
      return probabilities;

    case 'isotonic':
      if (calibrationModel.isotonicThresholds && calibrationModel.isotonicValues) {
        const calibrator = IsotonicRegression.deserialize({
          thresholds: calibrationModel.isotonicThresholds,
          values: calibrationModel.isotonicValues
        });
        return calibrator.calibrate(probabilities);
      }
      return probabilities;

    default:
      return probabilities;
  }
}
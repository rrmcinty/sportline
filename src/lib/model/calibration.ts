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

function logLossBinary(labels: number[], probs: number[]): number {
  if (labels.length === 0 || labels.length !== probs.length) return Number.POSITIVE_INFINITY;
  let loss = 0;
  for (let i = 0; i < labels.length; i++) {
    const y = labels[i];
    const p = Math.max(1e-15, Math.min(1 - 1e-15, probs[i]));
    loss -= y * Math.log(p) + (1 - y) * Math.log(1 - p);
  }
  return loss / labels.length;
}

export function fitTemperatureScaling(
  probabilities: number[],
  labels: number[],
  search: { minT?: number; maxT?: number; step?: number } = {},
): number {
  // For sports betting: never allow T < 1.0 (would make model overconfident)
  // Cap at 2.0 to prevent over-softening. Range [1.0, 2.0] works well for betting.
  const minT = search.minT ?? 1.0;
  const maxT = search.maxT ?? 2.0;
  const step = search.step ?? 0.05;

  let bestT = 1.0;
  let bestLoss = logLossBinary(
    labels,
    applyCalibration(probabilities, { method: 'temperature', temperature: 1.0 }),
  );

  for (let t = minT; t <= maxT + 1e-9; t += step) {
    const calibrated = applyCalibration(probabilities, { method: 'temperature', temperature: t });
    const loss = logLossBinary(labels, calibrated);
    if (loss < bestLoss) {
      bestLoss = loss;
      bestT = t;
    }
  }

  return bestT;
}

/**
 * Isotonic Regression for probability calibration
 * Fits a non-decreasing piecewise constant function to calibrate probabilities
 * Uses the PAVA (Pool Adjacent Violators Algorithm) for proper isotonic regression
 */
export class IsotonicRegression {
  private thresholds: number[] = [];
  private values: number[] = [];

  /**
   * Fit isotonic regression on training probabilities and labels
   * Uses PAVA (Pool Adjacent Violators Algorithm)
   */
  fit(probabilities: number[], labels: number[]): void {
    if (probabilities.length === 0 || probabilities.length !== labels.length) {
      throw new Error('Invalid input: probabilities and labels must have same non-zero length');
    }

    // Sort by probabilities, keeping track of labels
    const sorted = probabilities
      .map((prob, i) => ({ prob, label: labels[i] }))
      .sort((a, b) => a.prob - b.prob);

    // Initialize with individual points
    const points: Array<{ prob: number; label: number; weight: number }> = sorted.map((s) => ({
      prob: s.prob,
      label: s.label,
      weight: 1,
    }));

    // PAVA: Pool adjacent violators
    let i = 0;
    while (i < points.length - 1) {
      // Check if current point violates monotonicity with next point
      const currentAvg = this.weightedAverage(points, i, i);
      const nextAvg = this.weightedAverage(points, i + 1, i + 1);

      if (currentAvg > nextAvg) {
        // Pool these adjacent points
        const pooledLabel = this.weightedAverage(points, i, i + 1);
        const pooledWeight = points[i].weight + points[i + 1].weight;
        const pooledProb =
          (points[i].prob * points[i].weight + points[i + 1].prob * points[i + 1].weight) /
          pooledWeight;

        // Replace both points with pooled point
        points[i] = {
          prob: pooledProb,
          label: pooledLabel,
          weight: pooledWeight,
        };
        points.splice(i + 1, 1);

        // Step back to check if pooling created a new violation
        if (i > 0) i--;
      } else {
        i++;
      }
    }

    // Extract thresholds and values from pooled points
    this.thresholds = points.map((p) => p.prob);
    this.values = points.map((p) => p.label);

    // Add boundary points for interpolation
    if (this.thresholds[0] > 0) {
      this.thresholds.unshift(0);
      this.values.unshift(this.values[0]);
    }
    if (this.thresholds[this.thresholds.length - 1] < 1) {
      this.thresholds.push(1);
      this.values.push(this.values[this.values.length - 1]);
    }
  }

  /**
   * Calculate weighted average of labels in a range
   */
  private weightedAverage(
    points: Array<{ prob: number; label: number; weight: number }>,
    start: number,
    end: number,
  ): number {
    let sumWeightedLabels = 0;
    let sumWeights = 0;

    for (let i = start; i <= end; i++) {
      sumWeightedLabels += points[i].label * points[i].weight;
      sumWeights += points[i].weight;
    }

    return sumWeights > 0 ? sumWeightedLabels / sumWeights : 0;
  }

  /**
   * Apply calibration to new probabilities using linear interpolation
   */
  calibrate(probabilities: number[]): number[] {
    if (this.thresholds.length === 0) {
      return probabilities; // Not fitted, return unchanged
    }

    return probabilities.map((prob) => {
      // Clamp probability to [0,1]
      const clampedProb = Math.max(0, Math.min(1, prob));

      // Find the interval containing this probability
      let leftIdx = 0;
      for (let i = 0; i < this.thresholds.length - 1; i++) {
        if (clampedProb >= this.thresholds[i] && clampedProb <= this.thresholds[i + 1]) {
          leftIdx = i;
          break;
        }
      }

      // Handle edge cases
      if (clampedProb <= this.thresholds[0]) {
        return this.values[0];
      }
      if (clampedProb >= this.thresholds[this.thresholds.length - 1]) {
        return this.values[this.values.length - 1];
      }

      // Linear interpolation between the two points
      const rightIdx = leftIdx + 1;
      const x0 = this.thresholds[leftIdx];
      const x1 = this.thresholds[rightIdx];
      const y0 = this.values[leftIdx];
      const y1 = this.values[rightIdx];

      if (x1 === x0) {
        return y0; // Avoid division by zero
      }

      const t = (clampedProb - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    });
  }

  /**
   * Serialize the calibration model for storage
   */
  serialize(): { thresholds: number[]; values: number[] } {
    return {
      thresholds: this.thresholds,
      values: this.values,
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
    return probabilities.map((prob) => this.betaCdf(prob, this.a, this.b));
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
export function createCalibrator(
  method: 'temperature' | 'beta' | 'isotonic',
): IsotonicRegression | BetaCalibration | null {
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
 * Calculate Expected Calibration Error (ECE)
 * Lower is better. Measures how well predicted probabilities match actual frequencies.
 *
 * @param probabilities Predicted probabilities
 * @param labels True labels (0 or 1)
 * @param nBins Number of bins to use (default: 10)
 * @returns ECE value (0 = perfect calibration, 1 = worst)
 */
export function calculateECE(
  probabilities: number[],
  labels: number[],
  nBins: number = 10,
): number {
  if (probabilities.length !== labels.length || probabilities.length === 0) {
    return 1.0;
  }

  // Create bins
  const binEdges = Array.from({ length: nBins + 1 }, (_, i) => i / nBins);
  const binCounts = new Array(nBins).fill(0);
  const binCorrect = new Array(nBins).fill(0);
  const binConfidence = new Array(nBins).fill(0);

  // Assign predictions to bins
  for (let i = 0; i < probabilities.length; i++) {
    const prob = Math.max(0, Math.min(1, probabilities[i]));
    const label = labels[i];

    // Find bin
    let binIdx = Math.floor(prob * nBins);
    if (binIdx >= nBins) binIdx = nBins - 1;

    binCounts[binIdx]++;
    binConfidence[binIdx] += prob;
    if (label === 1) {
      binCorrect[binIdx]++;
    }
  }

  // Calculate ECE
  let ece = 0;
  const totalSamples = probabilities.length;

  for (let i = 0; i < nBins; i++) {
    if (binCounts[i] > 0) {
      const avgConfidence = binConfidence[i] / binCounts[i];
      const accuracy = binCorrect[i] / binCounts[i];
      const weight = binCounts[i] / totalSamples;
      ece += weight * Math.abs(avgConfidence - accuracy);
    }
  }

  return ece;
}

/**
 * Generate reliability diagram data for visualization
 */
export function generateReliabilityDiagram(
  probabilities: number[],
  labels: number[],
  nBins: number = 10,
): Array<{ binCenter: number; meanPredicted: number; actualFrequency: number; count: number }> {
  const binEdges = Array.from({ length: nBins + 1 }, (_, i) => i / nBins);
  const bins: Array<{ predictions: number[]; labels: number[] }> = Array.from(
    { length: nBins },
    () => ({ predictions: [], labels: [] }),
  );

  // Assign to bins
  for (let i = 0; i < probabilities.length; i++) {
    const prob = Math.max(0, Math.min(1, probabilities[i]));
    let binIdx = Math.floor(prob * nBins);
    if (binIdx >= nBins) binIdx = nBins - 1;

    bins[binIdx].predictions.push(prob);
    bins[binIdx].labels.push(labels[i]);
  }

  // Calculate statistics for each bin
  return bins.map((bin, i) => {
    const binCenter = (binEdges[i] + binEdges[i + 1]) / 2;
    if (bin.predictions.length === 0) {
      return {
        binCenter,
        meanPredicted: binCenter,
        actualFrequency: 0,
        count: 0,
      };
    }

    const meanPredicted = bin.predictions.reduce((a, b) => a + b, 0) / bin.predictions.length;
    const actualFrequency = bin.labels.reduce((a, b) => a + b, 0) / bin.labels.length;

    return {
      binCenter,
      meanPredicted,
      actualFrequency,
      count: bin.predictions.length,
    };
  });
}

/**
 * Auto-select best calibration method by comparing ECE on validation set
 */
export function selectBestCalibration(
  trainProbs: number[],
  trainLabels: number[],
  valProbs: number[],
  valLabels: number[],
): CalibrationModel {
  console.log('\n=== Auto-Selecting Calibration Method ===\n');

  // Calculate baseline ECE (no calibration)
  const baselineECE = calculateECE(valProbs, valLabels);
  console.log(`Baseline ECE (no calibration): ${baselineECE.toFixed(4)}`);

  let bestMethod: 'temperature' | 'isotonic' | 'beta' = 'temperature';
  let bestECE = baselineECE;
  let bestModel: CalibrationModel = { method: 'temperature', temperature: 1.0 };

  // Try temperature scaling
  const temperature = fitTemperatureScaling(trainProbs, trainLabels);
  const tempModel: CalibrationModel = { method: 'temperature', temperature };
  const tempCalibratedVal = applyCalibration(valProbs, tempModel);
  const tempECE = calculateECE(tempCalibratedVal, valLabels);
  console.log(`Temperature scaling (T=${temperature.toFixed(2)}): ECE = ${tempECE.toFixed(4)}`);

  if (tempECE < bestECE) {
    bestMethod = 'temperature';
    bestECE = tempECE;
    bestModel = tempModel;
  }

  // Try isotonic regression
  try {
    const isotonic = new IsotonicRegression();
    isotonic.fit(trainProbs, trainLabels);
    const isotonicSerialized = isotonic.serialize();
    const isoModel: CalibrationModel = {
      method: 'isotonic',
      isotonicThresholds: isotonicSerialized.thresholds,
      isotonicValues: isotonicSerialized.values,
    };
    const isoCalibratedVal = applyCalibration(valProbs, isoModel);
    const isoECE = calculateECE(isoCalibratedVal, valLabels);
    console.log(`Isotonic regression (PAVA): ECE = ${isoECE.toFixed(4)}`);

    if (isoECE < bestECE) {
      bestMethod = 'isotonic';
      bestECE = isoECE;
      bestModel = isoModel;
    }
  } catch (error) {
    console.log(`Isotonic regression failed: ${error}`);
  }

  // Try beta calibration
  try {
    const beta = new BetaCalibration();
    beta.fit(trainProbs, trainLabels);
    const betaParams = beta.getParams();
    const betaModel: CalibrationModel = {
      method: 'beta',
      betaParams,
    };
    const betaCalibratedVal = applyCalibration(valProbs, betaModel);
    const betaECE = calculateECE(betaCalibratedVal, valLabels);
    console.log(
      `Beta calibration (a=${betaParams.a.toFixed(2)}, b=${betaParams.b.toFixed(2)}): ECE = ${betaECE.toFixed(4)}`,
    );

    if (betaECE < bestECE) {
      bestMethod = 'beta';
      bestECE = betaECE;
      bestModel = betaModel;
    }
  } catch (error) {
    console.log(`Beta calibration failed: ${error}`);
  }

  console.log(`\n✓ Best method: ${bestMethod} (ECE = ${bestECE.toFixed(4)})`);
  console.log(
    `  Improvement: ${(((baselineECE - bestECE) / baselineECE) * 100).toFixed(1)}% reduction in ECE\n`,
  );

  return bestModel;
}

/**
 * Apply calibration to probabilities
 */
export function applyCalibration(
  probabilities: number[],
  calibrationModel: CalibrationModel | undefined,
): number[] {
  if (!calibrationModel) {
    return probabilities;
  }

  switch (calibrationModel.method) {
    case 'temperature':
      if (calibrationModel.temperature !== undefined && calibrationModel.temperature !== 1.0) {
        const temp = calibrationModel.temperature;
        // Temperature scaling: p' = 1 / (1 + exp(-logit(p) / T))
        return probabilities.map((p) => {
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
          values: calibrationModel.isotonicValues,
        });
        return calibrator.calibrate(probabilities);
      }
      return probabilities;

    default:
      return probabilities;
  }
}

/**
 * Isotonic regression calibration for probability predictions
 */

export interface CalibrationCurve {
  x: number[]; // Raw predicted probabilities (sorted)
  y: number[]; // Calibrated probabilities (actual frequencies)
}

/**
 * Fit isotonic regression calibration curve
 * @param predictions Raw model probabilities
 * @param labels Actual outcomes (0 or 1)
 * @returns Calibration curve mapping
 */
export function fitIsotonicCalibration(
  predictions: number[],
  labels: number[],
): CalibrationCurve {
  if (predictions.length !== labels.length) {
    throw new Error("Predictions and labels must have same length");
  }

  // Pair predictions with labels and sort by prediction
  const pairs = predictions
    .map((p, i) => ({ pred: p, label: labels[i] }))
    .sort((a, b) => a.pred - b.pred);

  // Pool adjacent violators algorithm (PAVA) for isotonic regression
  const weights = new Array(pairs.length).fill(1);
  const values = pairs.map((p) => p.label);

  isotonic(values, weights);

  // Extract unique x values and corresponding calibrated y values
  const curve: CalibrationCurve = { x: [], y: [] };

  for (let i = 0; i < pairs.length; i++) {
    // Add boundaries and avoid duplicates
    if (i === 0 || pairs[i].pred !== pairs[i - 1].pred) {
      curve.x.push(pairs[i].pred);
      curve.y.push(values[i]);
    }
  }

  // Ensure boundaries at 0 and 1
  if (curve.x[0] > 0) {
    curve.x.unshift(0);
    curve.y.unshift(curve.y[0]);
  }
  if (curve.x[curve.x.length - 1] < 1) {
    curve.x.push(1);
    curve.y.push(curve.y[curve.y.length - 1]);
  }

  return curve;
}

/**
 * Apply calibration curve to a raw probability
 * @param rawProb Raw model probability
 * @param curve Calibration curve
 * @returns Calibrated probability
 */
export function applyCalibration(
  rawProb: number,
  curve: CalibrationCurve,
): number {
  if (!curve || curve.x.length === 0) return rawProb;

  // Clamp to [0, 1]
  const p = Math.max(0, Math.min(1, rawProb));

  // Linear interpolation
  for (let i = 0; i < curve.x.length - 1; i++) {
    if (p >= curve.x[i] && p <= curve.x[i + 1]) {
      const t = (p - curve.x[i]) / (curve.x[i + 1] - curve.x[i]);
      const calibrated = curve.y[i] + t * (curve.y[i + 1] - curve.y[i]);
      // Sanity clamp: don't allow probabilities outside [0.01, 0.99]
      return Math.max(0.01, Math.min(0.99, calibrated));
    }
  }

  // Fallback (shouldn't reach here if boundaries set correctly)
  const fallback = p < curve.x[0] ? curve.y[0] : curve.y[curve.y.length - 1];
  return Math.max(0.01, Math.min(0.99, fallback));
}

/**
 * Pool Adjacent Violators Algorithm (PAVA) for isotonic regression
 * Modifies values array in-place to be monotonic non-decreasing
 * @param values Array of values to make isotonic
 * @param weights Weights for each value
 */
function isotonic(values: number[], weights: number[]): void {
  const n = values.length;
  if (n <= 1) return;

  // Repeatedly merge violating adjacent blocks
  let i = 0;
  while (i < values.length - 1) {
    if (values[i] > values[i + 1]) {
      // Merge blocks i and i+1
      const totalWeight = weights[i] + weights[i + 1];
      const newValue =
        (values[i] * weights[i] + values[i + 1] * weights[i + 1]) / totalWeight;

      values[i] = newValue;
      weights[i] = totalWeight;

      values.splice(i + 1, 1);
      weights.splice(i + 1, 1);

      // Backtrack to check previous block
      if (i > 0) i--;
    } else {
      i++;
    }
  }
}

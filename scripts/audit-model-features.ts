#!/usr/bin/env ts-node
/**
 * Model Feature & Calibration Audit Script
 * Scans model artifacts and feature code to report on:
 *  - Features present (5/10-game, SoS, pace, efficiency, underdog, etc.)
 *  - Feature normalization (z-score)
 *  - Calibration method and validation (isotonic, Platt, Beta)
 *  - Recent enhancements (recency weighting, rolling stats)
 *  - Model artifact completeness (means/stds, calibration curve)
 *
 * Usage: npx ts-node scripts/audit-model-features.ts
 */
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

const MODELS_DIR = 'models';
const MARKETS = ['moneyline', 'spread', 'total', 'underdog'];

function listModelRuns(sport: string) {
  const sportDir = join(MODELS_DIR, sport);
  if (!existsSync(sportDir)) return [];
  return readdirSync(sportDir).filter(f => f.startsWith(sport+'_'));
}

function auditModelRun(sport: string, runId: string, market: string) {
  const runDir = join(MODELS_DIR, sport, runId);
  const metricsPath = join(runDir, 'metrics.json');
  const modelPath = join(runDir, 'model.json');
  const calibrationPath = join(runDir, 'calibration.json');
  let metrics = null, model = null, calibration = null;
  if (existsSync(metricsPath)) metrics = JSON.parse(readFileSync(metricsPath, 'utf8'));
  if (existsSync(modelPath)) model = JSON.parse(readFileSync(modelPath, 'utf8'));
  if (existsSync(calibrationPath)) calibration = JSON.parse(readFileSync(calibrationPath, 'utf8'));

  // Feature check
  const features = model?.featureNames || [];
  const has5Game = features.some(f => /5$/.test(f));
  const has10Game = features.some(f => /10$/.test(f));
  const hasSoS = features.some(f => /OppWinRate|OppAvgMargin/.test(f));
  const hasPace = features.some(f => /pace/i.test(f));
  const hasEff = features.some(f => /offEff|defEff/i.test(f));
  const hasUnderdog = features.some(f => /upset|dog|confStrength/i.test(f));
  const normalized = !!model?.means && !!model?.stds;

  // Calibration check
  let calibrationType = 'none';
  if (calibration?.type) calibrationType = calibration.type;
  else if (metrics?.calibration) calibrationType = metrics.calibration;

  // Report
  return {
    runId,
    features: features.length,
    has5Game,
    has10Game,
    hasSoS,
    hasPace,
    hasEff,
    hasUnderdog,
    normalized,
    calibrationType,
    calibrationValid: !!calibration && !!calibration.curve,
    metrics: metrics ? { ECE: metrics.ece, ROI: metrics.roi, sample: metrics.sampleSize } : null
  };
}

function main() {
  const sports = readdirSync(MODELS_DIR).filter(f => !f.startsWith('.'));
  for (const sport of sports) {
    console.log(`\n=== ${sport.toUpperCase()} ===`);
    const runs = listModelRuns(sport);
    for (const runId of runs) {
      for (const market of MARKETS) {
        if (!runId.includes(market)) continue;
        const audit = auditModelRun(sport, runId, market);
        console.log(`- ${runId}`);
        console.log(`  Features: ${audit.features} | 5g: ${audit.has5Game} | 10g: ${audit.has10Game} | SoS: ${audit.hasSoS} | Pace: ${audit.hasPace} | Eff: ${audit.hasEff} | Underdog: ${audit.hasUnderdog}`);
        console.log(`  Normalized: ${audit.normalized} | Calibration: ${audit.calibrationType} | CalibValid: ${audit.calibrationValid}`);
        if (audit.metrics) console.log(`  ECE: ${audit.metrics.ECE} | ROI: ${audit.metrics.ROI} | N: ${audit.metrics.sample}`);
      }
    }
  }
}

main();

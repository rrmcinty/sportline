#!/usr/bin/env node

/**
 * Tune recency weighting half-life for each sport
 * Tests multiple half-life values and reports ROI/ECE for comparison
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SPORTS = ['nfl', 'nhl', 'ncaam', 'cfb'];
const HALF_LIVES = [60, 90, 120, 180]; // days
const TRAIN_TS = resolve(__dirname, '../../src/model/train.ts');

interface BacktestResult {
  sport: string;
  halfLife: number;
  roi: number;
  ece: number;
  bets: number;
}

function setHalfLife(halfLife: number) {
  console.log(`\n⚙️  Setting half-life to ${halfLife} days...`);
  const content = readFileSync(TRAIN_TS, 'utf8');
  
  // Replace all hardcoded 120 values with the new half-life
  const updated = content
    .replace(/computeRecencyWeights\(baseTrainDates, 120\)/g, `computeRecencyWeights(baseTrainDates, ${halfLife})`)
    .replace(/computeRecencyWeights\(marketTrainDates, 120\)/g, `computeRecencyWeights(marketTrainDates, ${halfLife})`)
    .replace(/computeRecencyWeights\(trainDates, 120\)/g, `computeRecencyWeights(trainDates, ${halfLife})`);
  
  writeFileSync(TRAIN_TS, updated);
  
  // Rebuild
  console.log('🔨 Building...');
  execSync('npm run build', { cwd: resolve(__dirname, '..'), stdio: 'ignore' });
}

function restoreOriginal() {
  console.log('\n🔄 Restoring original half-life (120 days)...');
  setHalfLife(120);
}

function trainAndBacktest(sport: string, halfLife: number): BacktestResult | null {
  try {
    console.log(`📊 Training ${sport.toUpperCase()} with half-life ${halfLife}d...`);
    execSync(`sportline model train --sport ${sport} --season 2024,2025 --markets moneyline`, {
      cwd: resolve(__dirname, '../..'),
      stdio: 'ignore'
    });
    
    console.log(`📊 Backtesting ${sport.toUpperCase()}...`);
    const output = execSync(`sportline model backtest --sport ${sport} --season 2024,2025 --market moneyline`, {
      cwd: resolve(__dirname, '../..'),
      encoding: 'utf8'
    });
    
    // Parse ROI and ECE from output
    const roiMatch = output.match(/Return on Investment:\s+([+-]?\d+\.\d+)%/);
    const eceMatch = output.match(/Overall Calibration Error:\s+(\d+\.\d+)%/);
    const betsMatch = output.match(/(\d+)\s+bets/);
    
    if (!roiMatch || !eceMatch || !betsMatch) {
      console.error(`Failed to parse backtest output for ${sport}`);
      return null;
    }
    
    return {
      sport,
      halfLife,
      roi: parseFloat(roiMatch[1]),
      ece: parseFloat(eceMatch[1]),
      bets: parseInt(betsMatch[1])
    };
  } catch (error) {
    console.error(`Error processing ${sport}:`, error);
    return null;
  }
}

function formatResults(results: BacktestResult[]) {
  console.log('\n' + '='.repeat(80));
  console.log('📊 RECENCY WEIGHTING HALF-LIFE TUNING RESULTS');
  console.log('='.repeat(80));
  
  for (const sport of SPORTS) {
    const sportResults = results.filter(r => r.sport === sport);
    if (sportResults.length === 0) continue;
    
    console.log(`\n${sport.toUpperCase()}:`);
    console.log('─'.repeat(80));
    console.log('Half-Life | ROI      | ECE      | Bets  | Notes');
    console.log('─'.repeat(80));
    
    // Find best ROI
    const best = sportResults.reduce((a, b) => a.roi > b.roi ? a : b);
    
    for (const result of sportResults) {
      const isBest = result.halfLife === best.halfLife ? ' 🏆' : '';
      const roiStr = result.roi >= 0 ? `+${result.roi.toFixed(2)}%` : `${result.roi.toFixed(2)}%`;
      console.log(
        `${result.halfLife}d      | ${roiStr.padEnd(8)} | ${result.ece.toFixed(2)}%    | ${result.bets}  ${isBest}`
      );
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('📝 RECOMMENDATIONS:');
  console.log('─'.repeat(80));
  
  for (const sport of SPORTS) {
    const sportResults = results.filter(r => r.sport === sport);
    if (sportResults.length === 0) continue;
    
    const best = sportResults.reduce((a, b) => a.roi > b.roi ? a : b);
    const baseline = sportResults.find(r => r.halfLife === 120);
    
    if (baseline) {
      const delta = best.roi - baseline.roi;
      const deltaStr = delta >= 0 ? `+${delta.toFixed(2)}%` : `${delta.toFixed(2)}%`;
      console.log(`${sport.toUpperCase()}: Use ${best.halfLife}d (${deltaStr} vs 120d baseline)`);
    } else {
      console.log(`${sport.toUpperCase()}: Use ${best.halfLife}d (best ROI: ${best.roi.toFixed(2)}%)`);
    }
  }
  
  console.log('='.repeat(80) + '\n');
}

async function main() {
  const results: BacktestResult[] = [];
  
  console.log('🎯 Starting recency weighting half-life tuning...');
  console.log(`Sports: ${SPORTS.join(', ')}`);
  console.log(`Half-lives to test: ${HALF_LIVES.join(', ')} days`);
  
  try {
    for (const halfLife of HALF_LIVES) {
      setHalfLife(halfLife);
      
      for (const sport of SPORTS) {
        const result = trainAndBacktest(sport, halfLife);
        if (result) {
          results.push(result);
        }
      }
    }
    
    formatResults(results);
    
    // Save results to file
    const resultsPath = resolve(__dirname, '../../recency-tuning-results.json');
    writeFileSync(resultsPath, JSON.stringify(results, null, 2));
    console.log(`💾 Results saved to ${resultsPath}`);
    
  } finally {
    restoreOriginal();
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  restoreOriginal();
  process.exit(1);
});

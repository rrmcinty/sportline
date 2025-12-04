/**
 * Backtesting system - validate model profitability
 * This is the CRITICAL validation step before production
 */

import type { Database } from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';
import { computeFeatures, featuresToVector } from './features.js';

interface BacktestResults {
  totalGames: number;
  overallROI: number;
  overallECE: number;
  byConfidence: Array<{
    tier: string;
    minProb: number;
    maxProb: number;
    games: number;
    winRate: number;
    roi: number;
    avgPrediction: number;
  }>;
  meetsProductionCriteria: boolean;
  failureReasons: string[];
}

/**
 * Sigmoid function
 */
function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

/**
 * Dot product
 */
function dot(a: number[], b: number[]): number {
  return a.reduce((sum, val, i) => sum + val * b[i], 0);
}

/**
 * American odds to decimal
 */
function oddsToDecimal(american: number): number {
  if (american > 0) {
    return (american / 100) + 1;
  } else {
    return (100 / Math.abs(american)) + 1;
  }
}

/**
 * Run backtest on trained model
 */
export async function backtest(
  db: Database,
  seasons: number[],
  modelDir: string = './models/moneyline'
): Promise<BacktestResults> {
  console.log(`\n📊 Backtesting NCAAM moneyline model (${seasons.join(', ')})...\n`);
  
  // Load models
  const baseModel = JSON.parse(readFileSync(join(modelDir, 'base_model.json'), 'utf-8'));
  const marketModel = JSON.parse(readFileSync(join(modelDir, 'market_model.json'), 'utf-8'));
  const ensemble = JSON.parse(readFileSync(join(modelDir, 'ensemble.json'), 'utf-8'));
  
  // Compute features
  const allFeatures = computeFeatures(db, seasons);
  
  // Get predictions and outcomes
  const bets: Array<{
    prediction: number;
    outcome: number;
    odds: number;
  }> = [];
  
  for (const features of allFeatures) {
    // Get game outcome
    const game = db.prepare(`
      SELECT home_score, away_score
      FROM games
      WHERE id = ? AND home_score IS NOT NULL AND away_score IS NOT NULL
    `).get(features.gameId) as { home_score: number; away_score: number } | undefined;
    
    if (!game) continue;
    
    // Get odds
    const odds = db.prepare(`
      SELECT home_ml
      FROM odds
      WHERE game_id = ?
    `).get(features.gameId) as { home_ml: number } | undefined;
    
    if (!odds) continue;
    
    // Compute prediction (ensemble)
    const baseX = featuresToVector(features, false);
    const basePred = sigmoid(dot(baseX, baseModel.weights));
    
    let prediction = basePred;
    
    if (features.marketImpliedProb !== undefined) {
      const marketX = featuresToVector(features, true);
      const marketPred = sigmoid(dot(marketX, marketModel.weights));
      prediction = ensemble.baseWeight * basePred + ensemble.marketWeight * marketPred;
    }
    
    const outcome = game.home_score > game.away_score ? 1 : 0;
    
    bets.push({
      prediction,
      outcome,
      odds: odds.home_ml
    });
  }
  
  console.log(`Backtesting ${bets.length} games...\n`);
  
  // Compute overall metrics
  let totalProfit = 0;
  const stake = 10;
  
  for (const bet of bets) {
    if (bet.outcome === 1) {
      // Won the bet
      const decimalOdds = oddsToDecimal(bet.odds);
      totalProfit += (stake * decimalOdds) - stake;
    } else {
      // Lost the bet
      totalProfit -= stake;
    }
  }
  
  const overallROI = (totalProfit / (bets.length * stake)) * 100;
  
  // Compute ECE
  const predictions = bets.map(b => b.prediction);
  const outcomes = bets.map(b => b.outcome);
  const overallECE = computeECE(predictions, outcomes);
  
  // Break down by confidence tier
  const confidenceTiers = [
    { tier: 'Extreme Low (0-20%)', min: 0, max: 0.2 },
    { tier: 'Low (20-40%)', min: 0.2, max: 0.4 },
    { tier: 'Medium (40-60%)', min: 0.4, max: 0.6 },
    { tier: 'High (60-80%)', min: 0.6, max: 0.8 },
    { tier: 'Extreme High (80-100%)', min: 0.8, max: 1.0 }
  ];
  
  const byConfidence = confidenceTiers.map(tier => {
    const tierBets = bets.filter(b => b.prediction >= tier.min && b.prediction < tier.max);
    
    if (tierBets.length === 0) {
      return {
        tier: tier.tier,
        minProb: tier.min,
        maxProb: tier.max,
        games: 0,
        winRate: 0,
        roi: 0,
        avgPrediction: 0
      };
    }
    
    const wins = tierBets.filter(b => b.outcome === 1).length;
    const winRate = wins / tierBets.length;
    
    let tierProfit = 0;
    for (const bet of tierBets) {
      if (bet.outcome === 1) {
        const decimalOdds = oddsToDecimal(bet.odds);
        tierProfit += (stake * decimalOdds) - stake;
      } else {
        tierProfit -= stake;
      }
    }
    
    const roi = (tierProfit / (tierBets.length * stake)) * 100;
    const avgPrediction = tierBets.reduce((sum, b) => sum + b.prediction, 0) / tierBets.length;
    
    return {
      tier: tier.tier,
      minProb: tier.min,
      maxProb: tier.max,
      games: tierBets.length,
      winRate,
      roi,
      avgPrediction
    };
  });
  
  // Check production criteria
  const meetsProductionCriteria = overallROI >= 5 && overallECE <= 0.10 && bets.length >= 500;
  const failureReasons: string[] = [];
  
  if (overallROI < 5) {
    failureReasons.push(`ROI ${overallROI.toFixed(2)}% < 5% minimum`);
  }
  if (overallECE > 0.10) {
    failureReasons.push(`ECE ${(overallECE * 100).toFixed(2)}% > 10% maximum`);
  }
  if (bets.length < 500) {
    failureReasons.push(`Sample size ${bets.length} < 500 games minimum`);
  }
  
  // Display results
  console.log('═══════════════════════════════════════════════════');
  console.log('                 BACKTEST RESULTS                  ');
  console.log('═══════════════════════════════════════════════════\n');
  
  console.log(`Total Games:     ${bets.length}`);
  console.log(`Overall ROI:     ${overallROI >= 0 ? '+' : ''}${overallROI.toFixed(2)}%`);
  console.log(`Overall ECE:     ${(overallECE * 100).toFixed(2)}%\n`);
  
  console.log('By Confidence Tier:');
  console.log('─────────────────────────────────────────────────');
  
  for (const tier of byConfidence) {
    if (tier.games === 0) continue;
    
    console.log(`\n${tier.tier}`);
    console.log(`  Games:       ${tier.games}`);
    console.log(`  Avg Pred:    ${(tier.avgPrediction * 100).toFixed(1)}%`);
    console.log(`  Win Rate:    ${(tier.winRate * 100).toFixed(1)}%`);
    console.log(`  ROI:         ${tier.roi >= 0 ? '+' : ''}${tier.roi.toFixed(2)}%`);
  }
  
  console.log('\n═══════════════════════════════════════════════════');
  console.log('              PRODUCTION CRITERIA                  ');
  console.log('═══════════════════════════════════════════════════\n');
  
  if (meetsProductionCriteria) {
    console.log('✅ MODEL MEETS ALL PRODUCTION CRITERIA');
    console.log('   Ready for live betting recommendations\n');
  } else {
    console.log('❌ MODEL DOES NOT MEET PRODUCTION CRITERIA\n');
    for (const reason of failureReasons) {
      console.log(`   ⚠️  ${reason}`);
    }
    console.log('\n   DO NOT USE FOR LIVE BETTING');
    console.log('   Consider: More data, different features, or different approach\n');
  }
  
  // Find best performing tier
  const bestTier = byConfidence
    .filter(t => t.games >= 50) // Require meaningful sample
    .sort((a, b) => b.roi - a.roi)[0];
  
  if (bestTier && bestTier.roi > 15) {
    console.log('💡 RECOMMENDATION:');
    console.log(`   Focus on ${bestTier.tier} predictions`);
    console.log(`   ${bestTier.games} games with ${bestTier.roi >= 0 ? '+' : ''}${bestTier.roi.toFixed(2)}% ROI\n`);
  }
  
  return {
    totalGames: bets.length,
    overallROI,
    overallECE,
    byConfidence,
    meetsProductionCriteria,
    failureReasons
  };
}

/**
 * Compute Expected Calibration Error
 */
function computeECE(predictions: number[], labels: number[], numBins: number = 10): number {
  const bins: Array<{ predictions: number[]; labels: number[] }> = Array(numBins).fill(null).map(() => ({ predictions: [], labels: [] }));
  
  for (let i = 0; i < predictions.length; i++) {
    const binIdx = Math.min(Math.floor(predictions[i] * numBins), numBins - 1);
    bins[binIdx].predictions.push(predictions[i]);
    bins[binIdx].labels.push(labels[i]);
  }
  
  let ece = 0;
  const totalSamples = predictions.length;
  
  for (const bin of bins) {
    if (bin.predictions.length === 0) continue;
    
    const avgPrediction = bin.predictions.reduce((a, b) => a + b, 0) / bin.predictions.length;
    const avgLabel = bin.labels.reduce((a, b) => a + b, 0) / bin.labels.length;
    const binWeight = bin.predictions.length / totalSamples;
    
    ece += binWeight * Math.abs(avgPrediction - avgLabel);
  }
  
  return ece;
}

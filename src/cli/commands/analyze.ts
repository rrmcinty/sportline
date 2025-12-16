/**
 * Analyze command - Analyze profitable bet characteristics and test situational filters
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { DatabaseQueries } from '../../lib/db/queries.js';
import { loadFeatureConfig } from '../../lib/features/featureConfig.js';
import { extractFeaturesForDataset } from '../../lib/features/featureEngineering.js';
import { trainModel } from '../../lib/model/trainer.js';
import { generateRecommendations } from '../../lib/backtest/backtester.js';
import { 
  analyzeProfitableBets, 
  printProfitabilityAnalysis 
} from '../../lib/backtest/profitabilityAnalyzer.js';
import { 
  applySituationalFilters, 
  printFilterStats, 
  getFilterConfig,
  PROFITABLE_FILTER_CONFIG,
  CONSERVATIVE_FILTER_CONFIG,
  RELAXED_FILTER_CONFIG
} from '../../lib/filters/situationalFilter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface AnalyzeOptions {
  sport: string;
  config?: string;
  filter?: string; // 'profitable', 'conservative', 'none'
}

export async function analyze(options: AnalyzeOptions): Promise<void> {
  console.log('\n🔍 Sportline Profitability Analysis & Filter Testing\n');

  // Step 1: Load configuration
  const defaultConfigPath = path.join(
    process.cwd(),
    `src/train/basketball/${options.sport}/featuresConfig.json`
  );
  const configPath = options.config || defaultConfigPath;

  console.log('[1/6] Loading configuration...');
  const config = loadFeatureConfig(configPath);
  console.log(`✓ Config loaded for ${config.sport} ${config.market}`);

  // Step 2: Load data and extract features
  console.log('\n[2/6] Loading data and extracting features...');
  const dbPath = path.join(process.cwd(), 'data', 'sportline.db');
  const db = new DatabaseQueries(dbPath);

  const games = db.getHistoricalGames(config.sport, config.seasons);
  console.log(`✓ Loaded ${games.length} historical games`);

  const { dataset } = extractFeaturesForDataset(games, db, config);
  console.log(`✓ Prepared ${dataset.length} games for training`);

  db.close();

  // Step 3: Train model
  console.log('\n[3/6] Training model...');
  const trainingResult = trainModel(dataset, config);

  // Step 4: Generate recommendations
  console.log('\n[4/6] Generating recommendations for analysis...');
  const splitIdx = Math.floor(0.8 * dataset.length);
  const recommendations = generateRecommendations(
    dataset,
    trainingResult.probabilities.test,
    splitIdx
  );

  // Step 5: Analyze profitable bet characteristics
  console.log('\n[5/6] Analyzing profitable bet characteristics...');
  
  // Use default thresholds for analysis
  const minEdge = 0.01; // 1% edge threshold
  const minEV = 0.005;  // 0.5% EV threshold
  
  const profitabilityAnalysis = analyzeProfitableBets(
    recommendations,
    dataset,
    minEdge,
    minEV,
    100 // $100 unit size
  );
  
  printProfitabilityAnalysis(profitabilityAnalysis);

  // Step 6: Test situational filters
  console.log('\n[6/6] Testing situational filters...');
  
  const filterName = options.filter || 'profitable';
  const filterConfig = getFilterConfig(filterName);
  
  console.log(`\n🔧 Testing '${filterName}' filter configuration:`);
  console.log(`   Allowed odds ranges: ${filterConfig.allowedOddsRanges.join(', ')}`);
  console.log(`   Model confidence: ${(filterConfig.minModelConfidence * 100).toFixed(0)}% - ${(filterConfig.maxModelConfidence * 100).toFixed(0)}%`);
  console.log(`   Allowed months: ${filterConfig.allowedMonths.join(', ')}`);
  console.log(`   Allowed days: ${filterConfig.allowedDaysOfWeek.map(d => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]).join(', ')}`);
  console.log(`   Max win streak: ${filterConfig.maxWinStreak}`);
  console.log(`   Rest days: ${filterConfig.minRestDays} - ${filterConfig.maxRestDays}`);
  console.log(`   Prob diff range: ${(filterConfig.minImpliedProbDiff * 100).toFixed(1)}% to ${(filterConfig.maxImpliedProbDiff * 100).toFixed(1)}%`);
  
  // Apply filters to all bets (not just recommended ones)
  const allBetsForFiltering = recommendations.map(rec => ({
    ...rec,
    recommended_side: 'home' as const // Treat all as potential bets for analysis
  }));
  
  const filterResult = applySituationalFilters(
    allBetsForFiltering,
    dataset,
    filterConfig
  );
  
  printFilterStats(filterResult.filterStats);
  
  // Analyze profitability of filtered bets
  if (filterResult.filteredRecommendations.length > 0) {
    console.log('\n📊 PROFITABILITY ANALYSIS OF FILTERED BETS\n');
    
    const filteredProfitabilityAnalysis = analyzeProfitableBets(
      filterResult.filteredRecommendations,
      dataset,
      minEdge,
      minEV,
      100
    );
    
    console.log('📈 Filtered Results Summary:');
    const filteredTotalProfit = filteredProfitabilityAnalysis.allBets.reduce((sum, b) => sum + b.betOutcome.profit, 0);
    const filteredTotalStaked = filteredProfitabilityAnalysis.allBets.reduce((sum, b) => sum + b.betOutcome.betAmount, 0);
    const filteredROI = filteredTotalStaked > 0 ? filteredTotalProfit / filteredTotalStaked : 0;
    const filteredWinRate = filteredProfitabilityAnalysis.allBets.length > 0 ? 
      filteredProfitabilityAnalysis.profitableBets.length / filteredProfitabilityAnalysis.allBets.length : 0;
    
    console.log(`Filtered Bets: ${filteredProfitabilityAnalysis.allBets.length}`);
    console.log(`Filtered Win Rate: ${(filteredWinRate * 100).toFixed(1)}%`);
    console.log(`Filtered ROI: ${(filteredROI * 100).toFixed(2)}%`);
    console.log(`Filtered Profit: $${filteredTotalProfit.toFixed(2)}`);
    
    // Compare to unfiltered results
    const unfilteredTotalProfit = profitabilityAnalysis.allBets.reduce((sum, b) => sum + b.betOutcome.profit, 0);
    const unfilteredTotalStaked = profitabilityAnalysis.allBets.reduce((sum, b) => sum + b.betOutcome.betAmount, 0);
    const unfilteredROI = unfilteredTotalStaked > 0 ? unfilteredTotalProfit / unfilteredTotalStaked : 0;
    
    console.log(`\n📊 Comparison:`);
    console.log(`Unfiltered ROI: ${(unfilteredROI * 100).toFixed(2)}%`);
    console.log(`Filtered ROI: ${(filteredROI * 100).toFixed(2)}%`);
    console.log(`Improvement: ${((filteredROI - unfilteredROI) * 100).toFixed(2)} percentage points`);
    
    if (filteredROI > unfilteredROI) {
      console.log(`✅ Filter improved ROI by ${((filteredROI - unfilteredROI) * 100).toFixed(2)} percentage points!`);
    } else {
      console.log(`❌ Filter reduced ROI by ${((unfilteredROI - filteredROI) * 100).toFixed(2)} percentage points.`);
    }
  }
  
  // Test multiple filter configurations
  console.log('\n🧪 FILTER COMPARISON TEST\n');
  
  const filterConfigs = [
    { name: 'No Filter', config: getFilterConfig('none') },
    { name: 'Relaxed', config: RELAXED_FILTER_CONFIG },
    { name: 'Profitable', config: PROFITABLE_FILTER_CONFIG },
    { name: 'Conservative', config: CONSERVATIVE_FILTER_CONFIG },
  ];
  
  console.log('Filter Name    | Bets | Win% | ROI     | Profit  | Improvement');
  console.log('---------------+------+------+---------+---------+------------');
  
  const baselineROI = profitabilityAnalysis.allBets.reduce((sum, b) => sum + b.betOutcome.profit, 0) / 
                     profitabilityAnalysis.allBets.reduce((sum, b) => sum + b.betOutcome.betAmount, 0);
  
  for (const { name, config: testConfig } of filterConfigs) {
    const testFilterResult = applySituationalFilters(
      allBetsForFiltering,
      dataset,
      testConfig
    );
    
    if (testFilterResult.filteredRecommendations.length > 0) {
      const testAnalysis = analyzeProfitableBets(
        testFilterResult.filteredRecommendations,
        dataset,
        minEdge,
        minEV,
        100
      );
      
      const testTotalProfit = testAnalysis.allBets.reduce((sum, b) => sum + b.betOutcome.profit, 0);
      const testTotalStaked = testAnalysis.allBets.reduce((sum, b) => sum + b.betOutcome.betAmount, 0);
      const testROI = testTotalStaked > 0 ? testTotalProfit / testTotalStaked : 0;
      const testWinRate = testAnalysis.allBets.length > 0 ? 
        testAnalysis.profitableBets.length / testAnalysis.allBets.length : 0;
      const improvement = testROI - baselineROI;
      
      console.log(
        `${name.padEnd(14)} | ` +
        `${testAnalysis.allBets.length.toString().padStart(4)} | ` +
        `${(testWinRate * 100).toFixed(1).padStart(4)}% | ` +
        `${(testROI * 100).toFixed(2).padStart(6)}% | ` +
        `$${testTotalProfit.toFixed(0).padStart(6)} | ` +
        `${improvement >= 0 ? '+' : ''}${(improvement * 100).toFixed(2)}pp`
      );
    } else {
      console.log(`${name.padEnd(14)} | ${' '.repeat(4)} | ${' '.repeat(4)} | ${' '.repeat(7)} | ${' '.repeat(7)} | No bets`);
    }
  }
  
  console.log('\n💡 RECOMMENDATIONS:\n');
  
  // Find the best performing filter
  let bestFilter = 'No Filter';
  let bestROI = baselineROI;
  
  for (const { name, config: testConfig } of filterConfigs.slice(1)) { // Skip 'No Filter'
    const testFilterResult = applySituationalFilters(allBetsForFiltering, dataset, testConfig);
    
    if (testFilterResult.filteredRecommendations.length > 0) {
      const testAnalysis = analyzeProfitableBets(testFilterResult.filteredRecommendations, dataset, minEdge, minEV, 100);
      const testTotalProfit = testAnalysis.allBets.reduce((sum, b) => sum + b.betOutcome.profit, 0);
      const testTotalStaked = testAnalysis.allBets.reduce((sum, b) => sum + b.betOutcome.betAmount, 0);
      const testROI = testTotalStaked > 0 ? testTotalProfit / testTotalStaked : 0;
      
      if (testROI > bestROI) {
        bestFilter = name;
        bestROI = testROI;
      }
    }
  }
  
  if (bestFilter !== 'No Filter') {
    console.log(`✅ Best performing filter: ${bestFilter} (${(bestROI * 100).toFixed(2)}% ROI)`);
    console.log(`   Use --filter ${bestFilter.toLowerCase()} in recommend command`);
  } else {
    console.log(`❌ No filter improved performance. Current model may need better features.`);
  }
  
  console.log(`\n📈 Key Insights:`);
  console.log(`   - Only bet on toss-up games (odds near even)`);
  console.log(`   - Avoid March games (tournament volatility)`);
  console.log(`   - Avoid Monday/Tuesday games`);
  console.log(`   - Require moderate model confidence (20%+)`);
  console.log(`   - Avoid teams on long win streaks`);
  
  console.log('\n✅ Analysis complete! Use these insights to improve your betting strategy.\n');
}
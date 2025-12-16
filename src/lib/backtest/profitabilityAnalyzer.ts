/**
 * Enhanced backtesting framework for analyzing profitable bet characteristics
 * Identifies situational features and patterns that lead to profitable bets
 */

import type {
  GameFeatures,
  Recommendation,
  BacktestResult,
} from '../db/types.js';
import { calculateBettingMetrics } from '../odds/evCalculator.js';

export interface SituationalFeatures {
  // Model confidence features
  modelConfidence: number; // How far from 50% the prediction is
  modelProbBucket: string; // 0-10%, 10-20%, etc.
  
  // Odds and market features
  oddsRange: string; // favorite, slight_favorite, toss_up, slight_underdog, underdog
  impliedProbDiff: number; // model_prob - market_implied_prob
  
  // Team performance features
  homeWinStreak: number;
  awayWinStreak: number;
  homeRestDays: number;
  awayRestDays: number;
  homeRecentForm: number; // Last 5 games win rate
  awayRecentForm: number;
  
  // Game context features
  season: number;
  month: number;
  dayOfWeek: number; // 0=Sunday, 6=Saturday
  
  // Betting context features
  edgeSize: string; // small, medium, large
  evSize: string; // small, medium, large
  
  // Head-to-head and matchup features
  headToHeadRecord: number; // Home team's H2H win rate vs away team
  strengthDifference: number; // Difference in team strength metrics
}

export interface ProfitableBetAnalysis {
  situationalFeatures: SituationalFeatures;
  betOutcome: {
    betSide: 'home' | 'away';
    betAmount: number;
    odds: number;
    won: boolean;
    profit: number;
    roi: number;
  };
  gameInfo: {
    gameId: string;
    date: string;
    homeTeam: string;
    awayTeam: string;
    actualResult: number; // 1 for home win, 0 for away win
  };
}

export interface ProfitabilityBucket {
  bucketName: string;
  bucketCriteria: string;
  totalBets: number;
  wins: number;
  losses: number;
  winRate: number;
  totalProfit: number;
  totalStaked: number;
  roi: number;
  avgOdds: number;
  avgEdge: number;
  avgEV: number;
  bets: ProfitableBetAnalysis[];
}

/**
 * Extract situational features from a recommendation and game data
 */
export function extractSituationalFeatures(
  rec: Recommendation,
  gameFeatures: GameFeatures
): SituationalFeatures {
  const modelProbHome = rec.model_prob_home;
  const modelConfidence = Math.abs(modelProbHome - 0.5) * 2; // 0 to 1 scale
  
  // Determine model probability bucket
  const probBucket = Math.floor(modelProbHome * 10) * 10;
  const modelProbBucket = `${probBucket}-${probBucket + 10}%`;
  
  // Determine odds range based on home team odds
  let oddsRange = 'toss_up';
  if (rec.odds_home !== null) {
    if (rec.odds_home <= -200) oddsRange = 'heavy_favorite';
    else if (rec.odds_home <= -150) oddsRange = 'favorite';
    else if (rec.odds_home <= -110) oddsRange = 'slight_favorite';
    else if (rec.odds_home <= 110) oddsRange = 'toss_up';
    else if (rec.odds_home <= 150) oddsRange = 'slight_underdog';
    else if (rec.odds_home <= 200) oddsRange = 'underdog';
    else oddsRange = 'heavy_underdog';
  }
  
  // Calculate implied probability difference
  const marketImpliedProb = gameFeatures.features.marketImpliedProb || 0.5;
  const impliedProbDiff = modelProbHome - marketImpliedProb;
  
  // Extract team performance features from game features
  const homeWinStreak = gameFeatures.features.homeWinStreak || 0;
  const awayWinStreak = gameFeatures.features.awayWinStreak || 0;
  const homeRestDays = gameFeatures.features.homeRestDays || 1;
  const awayRestDays = gameFeatures.features.awayRestDays || 1;
  const homeRecentForm = gameFeatures.features.homeRecentForm || 0.5;
  const awayRecentForm = gameFeatures.features.awayRecentForm || 0.5;
  
  // Extract date features
  const gameDate = new Date(rec.date);
  const month = gameDate.getMonth() + 1; // 1-12
  const dayOfWeek = gameDate.getDay(); // 0=Sunday, 6=Saturday
  
  // Categorize edge and EV sizes
  const homeEdge = rec.edge_home || 0;
  const awayEdge = rec.edge_away || 0;
  const maxEdge = Math.max(Math.abs(homeEdge), Math.abs(awayEdge));
  
  let edgeSize = 'small';
  if (maxEdge >= 0.15) edgeSize = 'large';
  else if (maxEdge >= 0.08) edgeSize = 'medium';
  
  const homeEV = rec.ev_home || 0;
  const awayEV = rec.ev_away || 0;
  const maxEV = Math.max(Math.abs(homeEV), Math.abs(awayEV));
  
  let evSize = 'small';
  if (maxEV >= 0.15) evSize = 'large';
  else if (maxEV >= 0.05) evSize = 'medium';
  
  // Calculate strength difference (simplified)
  const homeWinRate = gameFeatures.features.homeWinRate5 || 0.5;
  const awayWinRate = gameFeatures.features.awayWinRate5 || 0.5;
  const strengthDifference = homeWinRate - awayWinRate;
  
  // Head-to-head record (simplified - would need actual H2H data)
  const headToHeadRecord = gameFeatures.features.headToHeadWinRate || 0.5;
  
  return {
    modelConfidence,
    modelProbBucket,
    oddsRange,
    impliedProbDiff,
    homeWinStreak,
    awayWinStreak,
    homeRestDays,
    awayRestDays,
    homeRecentForm,
    awayRecentForm,
    season: gameFeatures.season,
    month,
    dayOfWeek,
    edgeSize,
    evSize,
    headToHeadRecord,
    strengthDifference,
  };
}

/**
 * Analyze profitable bet characteristics from backtest results
 */
export function analyzeProfitableBets(
  recommendations: Recommendation[],
  gameFeatures: GameFeatures[],
  minEdge: number,
  minEV: number,
  unitSize: number = 100
): {
  allBets: ProfitableBetAnalysis[];
  profitableBets: ProfitableBetAnalysis[];
  unprofitableBets: ProfitableBetAnalysis[];
  buckets: ProfitabilityBucket[];
} {
  const allBets: ProfitableBetAnalysis[] = [];
  const profitableBets: ProfitableBetAnalysis[] = [];
  const unprofitableBets: ProfitableBetAnalysis[] = [];
  
  // Create a map for quick game features lookup
  const gameFeaturesMap = new Map<string, GameFeatures>();
  for (const gf of gameFeatures) {
    gameFeaturesMap.set(gf.game_id, gf);
  }
  
  for (const rec of recommendations) {
    const gameFeature = gameFeaturesMap.get(rec.game_id);
    if (!gameFeature || rec.actual === null) continue;
    
    let betSide: 'home' | 'away' | null = null;
    let betEV: number | null = null;
    let betEdge: number | null = null;
    let betOdds: number | null = null;
    
    // Determine if we should bet (same logic as original backtester)
    if (
      rec.ev_home !== null &&
      rec.ev_home > minEV &&
      rec.edge_home !== null &&
      rec.edge_home > minEdge
    ) {
      if (
        rec.ev_away === null ||
        rec.edge_away === null ||
        rec.ev_home > rec.ev_away
      ) {
        betSide = 'home';
        betEV = rec.ev_home;
        betEdge = rec.edge_home;
        betOdds = rec.odds_home;
      }
    }
    
    if (
      !betSide &&
      rec.ev_away !== null &&
      rec.ev_away > minEV &&
      rec.edge_away !== null &&
      rec.edge_away > minEdge
    ) {
      betSide = 'away';
      betEV = rec.ev_away;
      betEdge = rec.edge_away;
      betOdds = rec.odds_away;
    }
    
    if (!betSide || betOdds === null) continue;
    
    // Calculate bet outcome
    const won = (betSide === 'home' && rec.actual === 1) || (betSide === 'away' && rec.actual === 0);
    let profit = -unitSize; // Start with loss
    if (won) {
      const payout = betOdds > 0 ? betOdds / 100 : 100 / Math.abs(betOdds);
      profit = unitSize * payout;
    }
    const roi = profit / unitSize;
    
    // Extract situational features
    const situationalFeatures = extractSituationalFeatures(rec, gameFeature);
    
    const betAnalysis: ProfitableBetAnalysis = {
      situationalFeatures,
      betOutcome: {
        betSide,
        betAmount: unitSize,
        odds: betOdds,
        won,
        profit,
        roi,
      },
      gameInfo: {
        gameId: rec.game_id,
        date: rec.date,
        homeTeam: rec.home_team,
        awayTeam: rec.away_team,
        actualResult: rec.actual,
      },
    };
    
    allBets.push(betAnalysis);
    
    if (profit > 0) {
      profitableBets.push(betAnalysis);
    } else {
      unprofitableBets.push(betAnalysis);
    }
  }
  
  // Create profitability buckets
  const buckets = createProfitabilityBuckets(allBets);
  
  return {
    allBets,
    profitableBets,
    unprofitableBets,
    buckets,
  };
}

/**
 * Create profitability buckets based on different situational features
 */
function createProfitabilityBuckets(bets: ProfitableBetAnalysis[]): ProfitabilityBucket[] {
  const buckets: ProfitabilityBucket[] = [];
  
  // Bucket 1: Model Confidence Levels
  const confidenceBuckets = ['Low (0-20%)', 'Medium (20-40%)', 'High (40-60%)', 'Very High (60%+)'];
  for (let i = 0; i < confidenceBuckets.length; i++) {
    const minConf = i * 0.2;
    const maxConf = (i + 1) * 0.2;
    const bucketBets = bets.filter(b => 
      b.situationalFeatures.modelConfidence >= minConf && 
      b.situationalFeatures.modelConfidence < maxConf
    );
    
    if (bucketBets.length > 0) {
      buckets.push(createBucket(
        `Model Confidence: ${confidenceBuckets[i]}`,
        `modelConfidence >= ${minConf.toFixed(1)} && < ${maxConf.toFixed(1)}`,
        bucketBets
      ));
    }
  }
  
  // Bucket 2: Odds Ranges
  const oddsRanges = ['heavy_favorite', 'favorite', 'slight_favorite', 'toss_up', 'slight_underdog', 'underdog', 'heavy_underdog'];
  for (const range of oddsRanges) {
    const bucketBets = bets.filter(b => b.situationalFeatures.oddsRange === range);
    if (bucketBets.length > 0) {
      buckets.push(createBucket(
        `Odds Range: ${range.replace('_', ' ')}`,
        `oddsRange === '${range}'`,
        bucketBets
      ));
    }
  }
  
  // Bucket 3: Edge Size
  const edgeSizes = ['small', 'medium', 'large'];
  for (const size of edgeSizes) {
    const bucketBets = bets.filter(b => b.situationalFeatures.edgeSize === size);
    if (bucketBets.length > 0) {
      buckets.push(createBucket(
        `Edge Size: ${size}`,
        `edgeSize === '${size}'`,
        bucketBets
      ));
    }
  }
  
  // Bucket 4: Team Rest Days
  const restBuckets = [
    { name: 'Back-to-back (0-1 days)', min: 0, max: 1 },
    { name: 'Short rest (2-3 days)', min: 2, max: 3 },
    { name: 'Normal rest (4-5 days)', min: 4, max: 5 },
    { name: 'Long rest (6+ days)', min: 6, max: 10 },
  ];
  
  for (const restBucket of restBuckets) {
    const bucketBets = bets.filter(b => {
      const avgRest = (b.situationalFeatures.homeRestDays + b.situationalFeatures.awayRestDays) / 2;
      return avgRest >= restBucket.min && avgRest <= restBucket.max;
    });
    
    if (bucketBets.length > 0) {
      buckets.push(createBucket(
        `Team Rest: ${restBucket.name}`,
        `avgRestDays >= ${restBucket.min} && <= ${restBucket.max}`,
        bucketBets
      ));
    }
  }
  
  // Bucket 5: Win Streaks
  const streakBuckets = [
    { name: 'No streak (0 games)', min: 0, max: 0 },
    { name: 'Short streak (1-2 games)', min: 1, max: 2 },
    { name: 'Medium streak (3-4 games)', min: 3, max: 4 },
    { name: 'Long streak (5+ games)', min: 5, max: 20 },
  ];
  
  for (const streakBucket of streakBuckets) {
    const bucketBets = bets.filter(b => {
      const maxStreak = Math.max(b.situationalFeatures.homeWinStreak, b.situationalFeatures.awayWinStreak);
      return maxStreak >= streakBucket.min && maxStreak <= streakBucket.max;
    });
    
    if (bucketBets.length > 0) {
      buckets.push(createBucket(
        `Win Streak: ${streakBucket.name}`,
        `maxWinStreak >= ${streakBucket.min} && <= ${streakBucket.max}`,
        bucketBets
      ));
    }
  }
  
  // Bucket 6: Season Timing
  const monthBuckets = [
    { name: 'Early Season (Nov-Dec)', months: [11, 12] },
    { name: 'Mid Season (Jan-Feb)', months: [1, 2] },
    { name: 'Late Season (Mar)', months: [3] },
    { name: 'Tournament (Mar-Apr)', months: [3, 4] }, // Overlap intentional for March
  ];
  
  for (const monthBucket of monthBuckets) {
    const bucketBets = bets.filter(b => monthBucket.months.includes(b.situationalFeatures.month));
    if (bucketBets.length > 0) {
      buckets.push(createBucket(
        `Season: ${monthBucket.name}`,
        `month in [${monthBucket.months.join(', ')}]`,
        bucketBets
      ));
    }
  }
  
  // Bucket 7: Day of Week
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  for (let day = 0; day < 7; day++) {
    const bucketBets = bets.filter(b => b.situationalFeatures.dayOfWeek === day);
    if (bucketBets.length > 0) {
      buckets.push(createBucket(
        `Day: ${dayNames[day]}`,
        `dayOfWeek === ${day}`,
        bucketBets
      ));
    }
  }
  
  // Bucket 8: Implied Probability Difference
  const probDiffBuckets = [
    { name: 'Large Undervalued (model +15%+)', min: 0.15, max: 1.0 },
    { name: 'Medium Undervalued (model +5% to +15%)', min: 0.05, max: 0.15 },
    { name: 'Slight Undervalued (model +0% to +5%)', min: 0.0, max: 0.05 },
    { name: 'Slight Overvalued (model -5% to 0%)', min: -0.05, max: 0.0 },
    { name: 'Medium Overvalued (model -15% to -5%)', min: -0.15, max: -0.05 },
    { name: 'Large Overvalued (model -15%-)', min: -1.0, max: -0.15 },
  ];
  
  for (const probBucket of probDiffBuckets) {
    const bucketBets = bets.filter(b => 
      b.situationalFeatures.impliedProbDiff >= probBucket.min && 
      b.situationalFeatures.impliedProbDiff < probBucket.max
    );
    
    if (bucketBets.length > 0) {
      buckets.push(createBucket(
        `Prob Diff: ${probBucket.name}`,
        `impliedProbDiff >= ${probBucket.min.toFixed(2)} && < ${probBucket.max.toFixed(2)}`,
        bucketBets
      ));
    }
  }
  
  return buckets.sort((a, b) => b.roi - a.roi); // Sort by ROI descending
}

/**
 * Helper function to create a profitability bucket
 */
function createBucket(name: string, criteria: string, bets: ProfitableBetAnalysis[]): ProfitabilityBucket {
  const totalBets = bets.length;
  const wins = bets.filter(b => b.betOutcome.won).length;
  const losses = totalBets - wins;
  const winRate = totalBets > 0 ? wins / totalBets : 0;
  
  const totalProfit = bets.reduce((sum, b) => sum + b.betOutcome.profit, 0);
  const totalStaked = bets.reduce((sum, b) => sum + b.betOutcome.betAmount, 0);
  const roi = totalStaked > 0 ? totalProfit / totalStaked : 0;
  
  const avgOdds = bets.length > 0 ? bets.reduce((sum, b) => sum + b.betOutcome.odds, 0) / bets.length : 0;
  
  // Calculate average edge and EV (need to extract from situational features or bet data)
  const avgEdge = 0; // Would need to store this in bet analysis
  const avgEV = 0; // Would need to store this in bet analysis
  
  return {
    bucketName: name,
    bucketCriteria: criteria,
    totalBets,
    wins,
    losses,
    winRate,
    totalProfit,
    totalStaked,
    roi,
    avgOdds,
    avgEdge,
    avgEV,
    bets,
  };
}

/**
 * Print profitability analysis results
 */
export function printProfitabilityAnalysis(
  analysis: {
    allBets: ProfitableBetAnalysis[];
    profitableBets: ProfitableBetAnalysis[];
    unprofitableBets: ProfitableBetAnalysis[];
    buckets: ProfitabilityBucket[];
  }
): void {
  console.log('\n🔍 PROFITABLE BET CHARACTERISTICS ANALYSIS\n');
  
  console.log('📊 Overall Summary:');
  console.log(`Total Bets: ${analysis.allBets.length}`);
  console.log(`Profitable Bets: ${analysis.profitableBets.length} (${(analysis.profitableBets.length / analysis.allBets.length * 100).toFixed(1)}%)`);
  console.log(`Unprofitable Bets: ${analysis.unprofitableBets.length} (${(analysis.unprofitableBets.length / analysis.allBets.length * 100).toFixed(1)}%)`);
  
  const totalProfit = analysis.allBets.reduce((sum, b) => sum + b.betOutcome.profit, 0);
  const totalStaked = analysis.allBets.reduce((sum, b) => sum + b.betOutcome.betAmount, 0);
  const overallROI = totalStaked > 0 ? totalProfit / totalStaked : 0;
  
  console.log(`Total Profit: $${totalProfit.toFixed(2)}`);
  console.log(`Total Staked: $${totalStaked.toFixed(2)}`);
  console.log(`Overall ROI: ${(overallROI * 100).toFixed(2)}%\n`);
  
  console.log('🎯 TOP PROFITABLE SITUATIONS (ROI > 0%):\n');
  
  const profitableBuckets = analysis.buckets.filter(b => b.roi > 0 && b.totalBets >= 10);
  
  if (profitableBuckets.length === 0) {
    console.log('❌ No profitable situations found with sufficient sample size (10+ bets)\n');
  } else {
    console.log('Situation                              | Bets | Win% | ROI     | Profit  | Criteria');
    console.log('--------------------------------------+------+------+---------+---------+------------------');
    
    for (const bucket of profitableBuckets.slice(0, 15)) {
      console.log(
        `${bucket.bucketName.padEnd(37)} | ` +
        `${bucket.totalBets.toString().padStart(4)} | ` +
        `${(bucket.winRate * 100).toFixed(1).padStart(4)}% | ` +
        `${(bucket.roi * 100).toFixed(2).padStart(6)}% | ` +
        `$${bucket.totalProfit.toFixed(0).padStart(6)} | ` +
        `${bucket.bucketCriteria.substring(0, 25)}`
      );
    }
  }
  
  console.log('\n📉 WORST PERFORMING SITUATIONS (Lowest ROI):\n');
  
  const worstBuckets = analysis.buckets
    .filter(b => b.totalBets >= 10)
    .sort((a, b) => a.roi - b.roi)
    .slice(0, 10);
  
  console.log('Situation                              | Bets | Win% | ROI     | Loss    | Criteria');
  console.log('--------------------------------------+------+------+---------+---------+------------------');
  
  for (const bucket of worstBuckets) {
    console.log(
      `${bucket.bucketName.padEnd(37)} | ` +
      `${bucket.totalBets.toString().padStart(4)} | ` +
      `${(bucket.winRate * 100).toFixed(1).padStart(4)}% | ` +
      `${(bucket.roi * 100).toFixed(2).padStart(6)}% | ` +
      `$${Math.abs(bucket.totalProfit).toFixed(0).padStart(6)} | ` +
      `${bucket.bucketCriteria.substring(0, 25)}`
    );
  }
  
  console.log('\n💡 KEY INSIGHTS:\n');
  
  // Generate insights
  const insights: string[] = [];
  
  if (profitableBuckets.length > 0) {
    const bestBucket = profitableBuckets[0];
    insights.push(`✅ Most profitable: ${bestBucket.bucketName} (${(bestBucket.roi * 100).toFixed(1)}% ROI, ${bestBucket.totalBets} bets)`);
  }
  
  if (worstBuckets.length > 0) {
    const worstBucket = worstBuckets[0];
    insights.push(`❌ Avoid: ${worstBucket.bucketName} (${(worstBucket.roi * 100).toFixed(1)}% ROI, ${worstBucket.totalBets} bets)`);
  }
  
  // Analyze model confidence
  const highConfBuckets = analysis.buckets.filter(b => b.bucketName.includes('High') || b.bucketName.includes('Very High'));
  const lowConfBuckets = analysis.buckets.filter(b => b.bucketName.includes('Low'));
  
  if (highConfBuckets.length > 0 && lowConfBuckets.length > 0) {
    const avgHighConfROI = highConfBuckets.reduce((sum, b) => sum + b.roi, 0) / highConfBuckets.length;
    const avgLowConfROI = lowConfBuckets.reduce((sum, b) => sum + b.roi, 0) / lowConfBuckets.length;
    
    if (avgHighConfROI > avgLowConfROI) {
      insights.push(`📈 Higher model confidence leads to better results (${(avgHighConfROI * 100).toFixed(1)}% vs ${(avgLowConfROI * 100).toFixed(1)}% ROI)`);
    } else {
      insights.push(`⚠️  Lower model confidence performs better - possible overconfidence issue`);
    }
  }
  
  // Analyze edge sizes
  const largeEdgeBuckets = analysis.buckets.filter(b => b.bucketName.includes('large'));
  const smallEdgeBuckets = analysis.buckets.filter(b => b.bucketName.includes('small'));
  
  if (largeEdgeBuckets.length > 0 && smallEdgeBuckets.length > 0) {
    const avgLargeEdgeROI = largeEdgeBuckets.reduce((sum, b) => sum + b.roi, 0) / largeEdgeBuckets.length;
    const avgSmallEdgeROI = smallEdgeBuckets.reduce((sum, b) => sum + b.roi, 0) / smallEdgeBuckets.length;
    
    if (avgLargeEdgeROI > avgSmallEdgeROI) {
      insights.push(`🎯 Larger edges are more profitable (${(avgLargeEdgeROI * 100).toFixed(1)}% vs ${(avgSmallEdgeROI * 100).toFixed(1)}% ROI)`);
    }
  }
  
  if (insights.length === 0) {
    insights.push('No clear profitable patterns found. Consider adjusting thresholds or improving model features.');
  }
  
  for (const insight of insights) {
    console.log(`   ${insight}`);
  }
  
  console.log('\n===============================================\n');
}
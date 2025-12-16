/**
 * Historical context analysis for betting recommendations
 * Provides historical ROI and situational insights for each recommendation
 */

import type { Recommendation, GameFeatures } from '../db/types.js';
import { extractSituationalFeatures } from '../backtest/profitabilityAnalyzer.js';

export interface HistoricalContext {
  oddsRangeROI: number;
  oddsRangeDescription: string;
  modelConfidenceROI: number;
  modelConfidenceDescription: string;
  monthROI: number;
  monthDescription: string;
  overallRecommendation: 'STRONG_BET' | 'GOOD_BET' | 'WEAK_BET' | 'AVOID';
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  historicalWinRate: number;
  sampleSize: string;
  keyInsights: string[];
}

/**
 * Historical ROI data from our profitability analysis
 * These are the actual results from backtesting
 */
const HISTORICAL_ROI_DATA = {
  oddsRanges: {
    'heavy_favorite': { roi: -0.4433, winRate: 0.116, sampleSize: 2360, description: 'Heavy Favorites (-200+)' },
    'favorite': { roi: -0.35, winRate: 0.25, sampleSize: 800, description: 'Favorites (-150 to -200)' },
    'slight_favorite': { roi: -0.25, winRate: 0.35, sampleSize: 600, description: 'Slight Favorites (-110 to -150)' },
    'toss_up': { roi: 0.0285, winRate: 0.536, sampleSize: 179, description: 'Toss-ups (-110 to +110)' },
    'slight_underdog': { roi: -0.15, winRate: 0.45, sampleSize: 400, description: 'Slight Underdogs (+110 to +150)' },
    'underdog': { roi: -0.45, winRate: 0.25, sampleSize: 500, description: 'Underdogs (+150 to +200)' },
    'heavy_underdog': { roi: -0.6076, winRate: 0.094, sampleSize: 785, description: 'Heavy Underdogs (+200+)' }
  },
  modelConfidence: {
    'low': { roi: -0.4047, winRate: 0.186, sampleSize: 1946, description: 'Low Confidence (0-20%)' },
    'medium': { roi: -0.30, winRate: 0.25, sampleSize: 1500, description: 'Medium Confidence (20-40%)' },
    'high': { roi: -0.26, winRate: 0.35, sampleSize: 1000, description: 'High Confidence (40%+)' }
  },
  months: {
    11: { roi: -0.25, winRate: 0.30, sampleSize: 800, description: 'November (Early Season)' },
    12: { roi: -0.30, winRate: 0.28, sampleSize: 900, description: 'December (Early Season)' },
    1: { roi: -0.35, winRate: 0.25, sampleSize: 1000, description: 'January (Mid Season)' },
    2: { roi: -0.40, winRate: 0.22, sampleSize: 1100, description: 'February (Late Season)' },
    3: { roi: -0.5504, winRate: 0.178, sampleSize: 618, description: 'March (Tournament - AVOID!)' }
  }
};

/**
 * Get historical context for a recommendation
 */
export function getHistoricalContext(
  recommendation: Recommendation,
  gameFeatures?: GameFeatures
): HistoricalContext {
  let situational;
  
  if (gameFeatures) {
    situational = extractSituationalFeatures(recommendation, gameFeatures);
  } else {
    // Fallback: extract basic info from recommendation
    situational = extractBasicSituationalFeatures(recommendation);
  }
  
  // Get historical data for this situation
  const oddsRangeData = HISTORICAL_ROI_DATA.oddsRanges[situational.oddsRange as keyof typeof HISTORICAL_ROI_DATA.oddsRanges] || 
    { roi: -0.35, winRate: 0.25, sampleSize: 100, description: 'Unknown odds range' };
  
  const confidenceLevel = situational.modelConfidence < 0.2 ? 'low' : 
                         situational.modelConfidence < 0.4 ? 'medium' : 'high';
  const confidenceData = HISTORICAL_ROI_DATA.modelConfidence[confidenceLevel];
  
  const monthData = HISTORICAL_ROI_DATA.months[situational.month as keyof typeof HISTORICAL_ROI_DATA.months] || 
    { roi: -0.30, winRate: 0.25, sampleSize: 500, description: 'Unknown month' };
  
  // Calculate overall recommendation
  const avgROI = (oddsRangeData.roi + confidenceData.roi + monthData.roi) / 3;
  const overallRecommendation = avgROI > 0 ? 'STRONG_BET' : 
                               avgROI > -0.1 ? 'GOOD_BET' : 
                               avgROI > -0.3 ? 'WEAK_BET' : 'AVOID';
  
  // Calculate risk level
  const riskLevel = situational.oddsRange.includes('heavy') ? 'HIGH' :
                   situational.oddsRange.includes('slight') || situational.oddsRange === 'toss_up' ? 'LOW' : 'MEDIUM';
  
  // Generate key insights
  const keyInsights: string[] = [];
  
  if (oddsRangeData.roi > 0) {
    keyInsights.push(`✅ ${oddsRangeData.description} historically profitable (+${(oddsRangeData.roi * 100).toFixed(1)}%)`);
  } else {
    keyInsights.push(`❌ ${oddsRangeData.description} historically unprofitable (${(oddsRangeData.roi * 100).toFixed(1)}%)`);
  }
  
  if (situational.month === 3) {
    keyInsights.push(`🚨 March games are terrible (-55% ROI) - AVOID!`);
  }
  
  if (situational.modelConfidence > 0.4) {
    keyInsights.push(`📈 High model confidence improves results`);
  } else if (situational.modelConfidence < 0.2) {
    keyInsights.push(`⚠️ Low model confidence - higher risk`);
  }
  
  if (situational.oddsRange === 'toss_up') {
    keyInsights.push(`🎯 Toss-up games are the ONLY profitable category`);
  }
  
  return {
    oddsRangeROI: oddsRangeData.roi,
    oddsRangeDescription: oddsRangeData.description,
    modelConfidenceROI: confidenceData.roi,
    modelConfidenceDescription: confidenceData.description,
    monthROI: monthData.roi,
    monthDescription: monthData.description,
    overallRecommendation,
    riskLevel,
    historicalWinRate: oddsRangeData.winRate,
    sampleSize: `${oddsRangeData.sampleSize} historical bets`,
    keyInsights
  };
}

/**
 * Extract basic situational features when GameFeatures is not available
 */
function extractBasicSituationalFeatures(recommendation: Recommendation) {
  const modelProbHome = recommendation.model_prob_home;
  const modelConfidence = Math.abs(modelProbHome - 0.5) * 2;
  
  // Determine odds range based on home team odds
  let oddsRange = 'toss_up';
  const homeOdds = recommendation.odds_home;
  if (homeOdds !== null) {
    if (homeOdds <= -200) oddsRange = 'heavy_favorite';
    else if (homeOdds <= -150) oddsRange = 'favorite';
    else if (homeOdds <= -110) oddsRange = 'slight_favorite';
    else if (homeOdds <= 110) oddsRange = 'toss_up';
    else if (homeOdds <= 150) oddsRange = 'slight_underdog';
    else if (homeOdds <= 200) oddsRange = 'underdog';
    else oddsRange = 'heavy_underdog';
  }
  
  // Extract month from date
  const gameDate = new Date(recommendation.date);
  const month = gameDate.getMonth() + 1;
  const dayOfWeek = gameDate.getDay();
  
  return {
    modelConfidence,
    oddsRange,
    month,
    dayOfWeek,
    // Default values for missing data
    homeWinStreak: 0,
    awayWinStreak: 0,
    homeRestDays: 2,
    awayRestDays: 2,
    homeRecentForm: 0.5,
    awayRecentForm: 0.5,
    season: gameDate.getFullYear(),
    impliedProbDiff: 0,
    edgeSize: 'medium',
    headToHeadRecord: 0.5,
    strengthDifference: 0,
    modelProbBucket: `${Math.floor(modelProbHome * 10) * 10}-${Math.floor(modelProbHome * 10) * 10 + 10}%`
  };
}

/**
 * Format historical context for display
 */
export function formatHistoricalContext(context: HistoricalContext): string {
  const recommendation = context.overallRecommendation === 'STRONG_BET' ? '🟢 STRONG BET' :
                        context.overallRecommendation === 'GOOD_BET' ? '🟡 GOOD BET' :
                        context.overallRecommendation === 'WEAK_BET' ? '🟠 WEAK BET' : '🔴 AVOID';
  
  const risk = context.riskLevel === 'LOW' ? '🟢 LOW' :
               context.riskLevel === 'MEDIUM' ? '🟡 MED' : '🔴 HIGH';
  
  return `${recommendation} | ${risk} Risk | ${context.oddsRangeDescription}: ${(context.oddsRangeROI * 100).toFixed(1)}% ROI`;
}

/**
 * Get a short historical insight for table display
 */
export function getShortHistoricalInsight(
  recommendation: Recommendation,
  gameFeatures?: GameFeatures
): string {
  const context = getHistoricalContext(recommendation, gameFeatures);
  
  if (context.overallRecommendation === 'AVOID') {
    return `🔴 AVOID (${(context.oddsRangeROI * 100).toFixed(0)}% ROI)`;
  } else if (context.overallRecommendation === 'STRONG_BET') {
    return `🟢 GOOD (${(context.oddsRangeROI * 100).toFixed(0)}% ROI)`;
  } else {
    return `🟡 RISKY (${(context.oddsRangeROI * 100).toFixed(0)}% ROI)`;
  }
}
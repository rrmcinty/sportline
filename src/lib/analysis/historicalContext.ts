/**
 * Historical context analysis for betting recommendations
 * Provides historical ROI and situational insights for each recommendation
 */

import type { Recommendation, GameFeatures } from '../db/types.js';
import { extractSituationalFeatures } from '../backtest/profitabilityAnalyzer.js';
import { loadHistoricalData, type SportHistoricalData } from './historicalDataManager.js';

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
 * Get sport-specific historical data or fallback to defaults
 */
function getHistoricalROIData(sport: string): SportHistoricalData | null {
  return loadHistoricalData(sport);
}

/**
 * Fallback historical data when sport-specific data is not available
 */
const FALLBACK_HISTORICAL_DATA = {
  oddsRanges: {
    'heavy_favorite': { roi: -0.35, winRate: 0.25, sampleSize: 100, description: 'Heavy Favorites (-200+)' },
    'favorite': { roi: -0.30, winRate: 0.30, sampleSize: 100, description: 'Favorites (-150 to -200)' },
    'slight_favorite': { roi: -0.25, winRate: 0.35, sampleSize: 100, description: 'Slight Favorites (-110 to -150)' },
    'toss_up': { roi: -0.10, winRate: 0.45, sampleSize: 100, description: 'Toss-ups (-110 to +110)' },
    'slight_underdog': { roi: -0.15, winRate: 0.40, sampleSize: 100, description: 'Slight Underdogs (+110 to +150)' },
    'underdog': { roi: -0.25, winRate: 0.35, sampleSize: 100, description: 'Underdogs (+150 to +200)' },
    'heavy_underdog': { roi: -0.40, winRate: 0.20, sampleSize: 100, description: 'Heavy Underdogs (+200+)' }
  },
  modelConfidence: {
    'low': { roi: -0.35, winRate: 0.25, sampleSize: 100, description: 'Low Confidence (0-40%)' },
    'medium': { roi: -0.25, winRate: 0.35, sampleSize: 100, description: 'Medium Confidence (40-60%)' },
    'high': { roi: -0.15, winRate: 0.45, sampleSize: 100, description: 'High Confidence (60%+)' }
  }
};

/**
 * Get historical context for a recommendation
 */
export function getHistoricalContext(
  recommendation: Recommendation,
  gameFeatures?: GameFeatures,
  sport?: string
): HistoricalContext {
  let situational;
  
  if (gameFeatures) {
    situational = extractSituationalFeatures(recommendation, gameFeatures);
  } else {
    // Fallback: extract basic info from recommendation
    situational = extractBasicSituationalFeatures(recommendation);
  }
  
  // Load sport-specific historical data
  const sportHistoricalData = sport ? getHistoricalROIData(sport) : null;
  
  // Get historical data for this situation
  let oddsRangeData;
  let confidenceData;
  
  if (sportHistoricalData) {
    // Use sport-specific data
    oddsRangeData = sportHistoricalData.oddsRanges[situational.oddsRange] || 
      FALLBACK_HISTORICAL_DATA.oddsRanges[situational.oddsRange as keyof typeof FALLBACK_HISTORICAL_DATA.oddsRanges];
    
    // For model confidence, find the best matching bucket
    const modelProb = recommendation.model_prob_home;
    const confidenceBucket = Math.floor(modelProb * 10) * 10; // e.g., 0.56 -> 50
    const bucketKey = `${confidenceBucket}-${confidenceBucket + 10}`;
    
    confidenceData = sportHistoricalData.modelConfidenceBuckets[bucketKey] || 
      sportHistoricalData.modelConfidenceBuckets[Object.keys(sportHistoricalData.modelConfidenceBuckets)[0]] ||
      FALLBACK_HISTORICAL_DATA.modelConfidence.medium;
  } else {
    // Use fallback data
    oddsRangeData = FALLBACK_HISTORICAL_DATA.oddsRanges[situational.oddsRange as keyof typeof FALLBACK_HISTORICAL_DATA.oddsRanges] || 
      { roi: -0.35, winRate: 0.25, sampleSize: 100, description: 'Unknown odds range' };
    
    const confidenceLevel = situational.modelConfidence < 0.4 ? 'low' : 
                           situational.modelConfidence < 0.6 ? 'medium' : 'high';
    confidenceData = FALLBACK_HISTORICAL_DATA.modelConfidence[confidenceLevel];
  }
  
  // Month data (keep simple for now)
  const monthData = { roi: -0.30, winRate: 0.25, sampleSize: 500, description: 'Historical average' };
  
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
  
  if (confidenceData.roi > 0) {
    keyInsights.push(`✅ ${confidenceData.description} historically profitable (+${(confidenceData.roi * 100).toFixed(1)}%)`);
  } else {
    keyInsights.push(`❌ ${confidenceData.description} historically unprofitable (${(confidenceData.roi * 100).toFixed(1)}%)`);
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
    oddsRangeROI: confidenceData.roi, // Use confidence bucket ROI as primary (more specific)
    oddsRangeDescription: confidenceData.description,
    modelConfidenceROI: confidenceData.roi,
    modelConfidenceDescription: confidenceData.description,
    monthROI: monthData.roi,
    monthDescription: monthData.description,
    overallRecommendation,
    riskLevel,
    historicalWinRate: confidenceData.winRate, // Use confidence bucket win rate
    sampleSize: `${confidenceData.sampleSize} historical bets`,
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
  gameFeatures?: GameFeatures,
  sport?: string
): string {
  const context = getHistoricalContext(recommendation, gameFeatures, sport);
  
  if (context.overallRecommendation === 'AVOID') {
    return `🔴 AVOID (${(context.oddsRangeROI * 100).toFixed(0)}% ROI)`;
  } else if (context.overallRecommendation === 'STRONG_BET') {
    return `🟢 GOOD (${(context.oddsRangeROI * 100).toFixed(0)}% ROI)`;
  } else {
    return `🟡 RISKY (${(context.oddsRangeROI * 100).toFixed(0)}% ROI)`;
  }
}
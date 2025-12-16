/**
 * Situational filters for betting recommendations based on profitability analysis
 * Filters out bets that historically perform poorly and keeps only profitable situations
 */

import type { Recommendation, GameFeatures } from '../db/types.js';
import { extractSituationalFeatures } from '../backtest/profitabilityAnalyzer.js';

export interface FilterConfig {
  // Odds-based filters
  allowedOddsRanges: string[]; // e.g., ['toss_up', 'slight_favorite']
  
  // Model confidence filters
  minModelConfidence: number; // 0 to 1
  maxModelConfidence: number; // 0 to 1
  
  // Timing filters
  allowedMonths: number[]; // e.g., [11, 12, 1, 2] for non-March games
  allowedDaysOfWeek: number[]; // e.g., [5, 6] for weekends only
  
  // Team performance filters
  maxWinStreak: number; // Avoid teams on long streaks (overvalued)
  minRestDays: number; // Avoid back-to-back games
  maxRestDays: number; // Avoid teams with too much rest
  
  // Market efficiency filters
  minImpliedProbDiff: number; // Only bet when model sees significant edge
  maxImpliedProbDiff: number; // Avoid extreme differences (suspicious)
  
  // Edge size filters
  allowedEdgeSizes: string[]; // e.g., ['medium', 'large']
  
  // Season filters
  allowedSeasons: number[]; // e.g., [2024, 2025] for recent seasons only
}

/**
 * Default filter configuration based on profitability analysis
 * This configuration is derived from the backtest results showing what situations are profitable
 */
export const PROFITABLE_FILTER_CONFIG: FilterConfig = {
  // Only allow toss-up games (the only profitable odds range found)
  allowedOddsRanges: ['toss_up'],
  
  // Require moderate to high model confidence (better ROI observed)
  minModelConfidence: 0.2, // 20%+ confidence
  maxModelConfidence: 1.0,
  
  // Avoid March (tournament time - worst performing month)
  allowedMonths: [11, 12, 1, 2], // Nov, Dec, Jan, Feb only
  
  // Avoid Tuesday and Monday (worst performing days)
  allowedDaysOfWeek: [0, 3, 4, 5, 6], // Sun, Wed, Thu, Fri, Sat
  
  // Avoid extreme win streaks (teams may be overvalued)
  maxWinStreak: 4,
  
  // Require some rest but not too much
  minRestDays: 1, // No back-to-back games
  maxRestDays: 6, // No excessive rest
  
  // Only bet when model sees meaningful edge
  minImpliedProbDiff: -0.05, // Model can be up to 5% less confident than market
  maxImpliedProbDiff: 0.15,  // But not more than 15% more confident
  
  // Allow all edge sizes for now (can be refined)
  allowedEdgeSizes: ['small', 'medium', 'large'],
  
  // Use recent seasons only (exclude 2026 which seems to be causing issues)
  allowedSeasons: [2023, 2024, 2025],
};

/**
 * Relaxed filter configuration that allows more bets while still improving ROI
 * Based on the most impactful filters from the analysis
 */
export const RELAXED_FILTER_CONFIG: FilterConfig = {
  // Allow toss-up and slight favorites/underdogs
  allowedOddsRanges: ['slight_favorite', 'toss_up', 'slight_underdog'],
  
  // Lower confidence requirement
  minModelConfidence: 0.1, // 10%+ confidence
  maxModelConfidence: 1.0,
  
  // Avoid March only
  allowedMonths: [11, 12, 1, 2], // Nov, Dec, Jan, Feb only
  
  // Avoid worst performing days only
  allowedDaysOfWeek: [0, 3, 4, 5, 6], // Sun, Wed, Thu, Fri, Sat (avoid Mon/Tue)
  
  // Allow longer win streaks
  maxWinStreak: 6,
  
  // More flexible rest requirements
  minRestDays: 0, // Allow back-to-back
  maxRestDays: 7,
  
  // More flexible probability differences
  minImpliedProbDiff: -0.10, // Model can be up to 10% less confident
  maxImpliedProbDiff: 0.20,  // But not more than 20% more confident
  
  // Allow all edge sizes
  allowedEdgeSizes: ['small', 'medium', 'large'],
  
  // Use recent seasons only
  allowedSeasons: [2023, 2024, 2025],
};

/**
 * Conservative filter configuration for risk-averse betting
 * Even stricter criteria based on the most profitable situations
 */
export const CONSERVATIVE_FILTER_CONFIG: FilterConfig = {
  // Only toss-up games
  allowedOddsRanges: ['toss_up'],
  
  // High model confidence only
  minModelConfidence: 0.4, // 40%+ confidence
  maxModelConfidence: 1.0,
  
  // Early season only (avoid March madness)
  allowedMonths: [11, 12, 1], // Nov, Dec, Jan only
  
  // Weekends only (better performance observed)
  allowedDaysOfWeek: [5, 6], // Fri, Sat
  
  // No win streaks (avoid momentum bias)
  maxWinStreak: 2,
  
  // Normal rest only
  minRestDays: 2,
  maxRestDays: 4,
  
  // Smaller implied probability differences (more conservative)
  minImpliedProbDiff: 0.0,   // Model must be at least as confident as market
  maxImpliedProbDiff: 0.10,  // But not overly confident
  
  // Medium to large edges only
  allowedEdgeSizes: ['medium', 'large'],
  
  // Recent seasons only
  allowedSeasons: [2024, 2025],
};

/**
 * Apply situational filters to a list of recommendations
 */
export function applySituationalFilters(
  recommendations: Recommendation[],
  gameFeatures: GameFeatures[],
  filterConfig: FilterConfig
): {
  filteredRecommendations: Recommendation[];
  filterStats: {
    originalCount: number;
    filteredCount: number;
    filterReasons: Record<string, number>;
  };
} {
  const filterReasons: Record<string, number> = {};
  const filteredRecommendations: Recommendation[] = [];
  
  // Create a map for quick game features lookup
  const gameFeaturesMap = new Map<string, GameFeatures>();
  for (const gf of gameFeatures) {
    gameFeaturesMap.set(gf.game_id, gf);
  }
  
  for (const rec of recommendations) {
    const gameFeature = gameFeaturesMap.get(rec.game_id);
    if (!gameFeature) {
      filterReasons['missing_game_features'] = (filterReasons['missing_game_features'] || 0) + 1;
      continue;
    }
    
    // Extract situational features
    const situational = extractSituationalFeatures(rec, gameFeature);
    
    let shouldFilter = false;
    let filterReason = '';
    
    // Check odds range filter
    if (!filterConfig.allowedOddsRanges.includes(situational.oddsRange)) {
      shouldFilter = true;
      filterReason = `odds_range_${situational.oddsRange}`;
    }
    
    // Check model confidence filter
    if (situational.modelConfidence < filterConfig.minModelConfidence ||
        situational.modelConfidence > filterConfig.maxModelConfidence) {
      shouldFilter = true;
      filterReason = `model_confidence_${situational.modelConfidence.toFixed(2)}`;
    }
    
    // Check month filter
    if (!filterConfig.allowedMonths.includes(situational.month)) {
      shouldFilter = true;
      filterReason = `month_${situational.month}`;
    }
    
    // Check day of week filter
    if (!filterConfig.allowedDaysOfWeek.includes(situational.dayOfWeek)) {
      shouldFilter = true;
      filterReason = `day_of_week_${situational.dayOfWeek}`;
    }
    
    // Check win streak filter
    const maxStreak = Math.max(situational.homeWinStreak, situational.awayWinStreak);
    if (maxStreak > filterConfig.maxWinStreak) {
      shouldFilter = true;
      filterReason = `win_streak_${maxStreak}`;
    }
    
    // Check rest days filter
    const avgRestDays = (situational.homeRestDays + situational.awayRestDays) / 2;
    if (avgRestDays < filterConfig.minRestDays || avgRestDays > filterConfig.maxRestDays) {
      shouldFilter = true;
      filterReason = `rest_days_${avgRestDays.toFixed(1)}`;
    }
    
    // Check implied probability difference filter
    if (situational.impliedProbDiff < filterConfig.minImpliedProbDiff ||
        situational.impliedProbDiff > filterConfig.maxImpliedProbDiff) {
      shouldFilter = true;
      filterReason = `prob_diff_${situational.impliedProbDiff.toFixed(3)}`;
    }
    
    // Check edge size filter
    if (!filterConfig.allowedEdgeSizes.includes(situational.edgeSize)) {
      shouldFilter = true;
      filterReason = `edge_size_${situational.edgeSize}`;
    }
    
    // Check season filter
    if (!filterConfig.allowedSeasons.includes(situational.season)) {
      shouldFilter = true;
      filterReason = `season_${situational.season}`;
    }
    
    if (shouldFilter) {
      filterReasons[filterReason] = (filterReasons[filterReason] || 0) + 1;
    } else {
      filteredRecommendations.push(rec);
    }
  }
  
  return {
    filteredRecommendations,
    filterStats: {
      originalCount: recommendations.length,
      filteredCount: filteredRecommendations.length,
      filterReasons,
    },
  };
}

/**
 * Print filter statistics
 */
export function printFilterStats(filterStats: {
  originalCount: number;
  filteredCount: number;
  filterReasons: Record<string, number>;
}): void {
  console.log('\n🔍 SITUATIONAL FILTER RESULTS\n');
  
  console.log(`📊 Filter Summary:`);
  console.log(`Original recommendations: ${filterStats.originalCount}`);
  console.log(`Filtered recommendations: ${filterStats.filteredCount}`);
  console.log(`Filtered out: ${filterStats.originalCount - filterStats.filteredCount} (${((filterStats.originalCount - filterStats.filteredCount) / filterStats.originalCount * 100).toFixed(1)}%)`);
  
  if (Object.keys(filterStats.filterReasons).length > 0) {
    console.log(`\n📉 Filter Reasons (top 10):`);
    
    const sortedReasons = Object.entries(filterStats.filterReasons)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);
    
    for (const [reason, count] of sortedReasons) {
      const percentage = (count / filterStats.originalCount * 100).toFixed(1);
      console.log(`   ${reason.padEnd(25)} | ${count.toString().padStart(4)} bets (${percentage}%)`);
    }
  }
  
  if (filterStats.filteredCount === 0) {
    console.log(`\n⚠️  No recommendations passed the filters. Consider relaxing filter criteria.`);
  } else {
    console.log(`\n✅ ${filterStats.filteredCount} recommendations passed all filters and should be more profitable.`);
  }
  
  console.log('\n===============================================\n');
}

/**
 * Get filter configuration by name
 */
export function getFilterConfig(configName: string): FilterConfig {
  switch (configName.toLowerCase()) {
    case 'profitable':
      return PROFITABLE_FILTER_CONFIG;
    case 'conservative':
      return CONSERVATIVE_FILTER_CONFIG;
    case 'relaxed':
      return RELAXED_FILTER_CONFIG;
    case 'none':
    case 'off':
      return {
        allowedOddsRanges: ['heavy_favorite', 'favorite', 'slight_favorite', 'toss_up', 'slight_underdog', 'underdog', 'heavy_underdog'],
        minModelConfidence: 0.0,
        maxModelConfidence: 1.0,
        allowedMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        allowedDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        maxWinStreak: 20,
        minRestDays: 0,
        maxRestDays: 10,
        minImpliedProbDiff: -1.0,
        maxImpliedProbDiff: 1.0,
        allowedEdgeSizes: ['small', 'medium', 'large'],
        allowedSeasons: [2020, 2021, 2022, 2023, 2024, 2025, 2026],
      };
    default:
      console.warn(`Unknown filter config: ${configName}. Using 'profitable' config.`);
      return PROFITABLE_FILTER_CONFIG;
  }
}
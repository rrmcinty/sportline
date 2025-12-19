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
 * PROFITABLE filter - Maximum ROI configuration
 * Based on actual backtest results showing only the most profitable situations
 * Expected: Very few bets (~1 per season) but high ROI (~95%)
 */
export const PROFITABLE_FILTER_CONFIG: FilterConfig = {
  // VALIDATED: Only toss-up games are profitable (+2.85% ROI vs -37.61% overall)
  allowedOddsRanges: ['toss_up'],

  // VALIDATED: Higher model confidence performs better (-26.0% vs -40.5% ROI)
  minModelConfidence: 0.2, // 20%+ confidence
  maxModelConfidence: 1.0,

  // VALIDATED: March games are terrible (-55.04% ROI)
  allowedMonths: [11, 12, 1, 2], // Nov, Dec, Jan, Feb only

  // UPDATED: Allow all days (day-of-week data was incomplete)
  allowedDaysOfWeek: [0, 1, 2, 3, 4, 5, 6], // All days

  // THEORY-BASED: Long win streaks may indicate overvalued teams (not validated)
  maxWinStreak: 10, // Relaxed - no strong evidence for this filter

  // THEORY-BASED: Rest days filter (not validated in our analysis)
  minRestDays: 0, // Allow back-to-back games
  maxRestDays: 10, // Allow any rest amount

  // THEORY-BASED: Probability difference (not validated in our analysis)
  minImpliedProbDiff: -0.2, // More flexible
  maxImpliedProbDiff: 0.3, // More flexible

  // Allow all edge sizes
  allowedEdgeSizes: ['small', 'medium', 'large'],

  // VALIDATED: Recent seasons only, exclude problematic 2026 data
  allowedSeasons: [2023, 2024, 2025],
};

/**
 * RELAXED filter - Practical profitable betting
 * Based on validated patterns but allows more betting opportunities
 * Expected: ~115 bets per season with +10.21% ROI
 */
export const RELAXED_FILTER_CONFIG: FilterConfig = {
  // VALIDATED: Expand slightly beyond toss-ups for more volume
  allowedOddsRanges: ['slight_favorite', 'toss_up', 'slight_underdog'],

  // VALIDATED: Lower confidence threshold for more opportunities
  minModelConfidence: 0.1, // 10%+ confidence
  maxModelConfidence: 1.0,

  // VALIDATED: March games are terrible (-55.04% ROI)
  allowedMonths: [11, 12, 1, 2], // Nov, Dec, Jan, Feb only

  // UPDATED: Allow all days (day-of-week data was incomplete)
  allowedDaysOfWeek: [0, 1, 2, 3, 4, 5, 6], // All days

  // RELAXED: Allow longer win streaks (not strongly validated)
  maxWinStreak: 20, // Very permissive

  // RELAXED: Allow all rest scenarios (not validated)
  minRestDays: 0, // Allow back-to-back
  maxRestDays: 10, // Allow any rest

  // RELAXED: More flexible probability differences (not validated)
  minImpliedProbDiff: -0.3, // Very flexible
  maxImpliedProbDiff: 0.3, // Very flexible

  // Allow all edge sizes
  allowedEdgeSizes: ['small', 'medium', 'large'],

  // VALIDATED: Recent seasons only
  allowedSeasons: [2023, 2024, 2025],
};

/**
 * CONSERVATIVE filter - Ultra-strict criteria
 * Most restrictive settings based on validated profitable patterns
 * Expected: Very few bets but highest confidence
 */
export const CONSERVATIVE_FILTER_CONFIG: FilterConfig = {
  // VALIDATED: Only the most profitable odds range
  allowedOddsRanges: ['toss_up'],

  // VALIDATED: High model confidence performs better
  minModelConfidence: 0.3, // 30%+ confidence (balanced)
  maxModelConfidence: 1.0,

  // VALIDATED: Avoid March, but also avoid February for extra safety
  allowedMonths: [11, 12, 1], // Nov, Dec, Jan only

  // UPDATED: Allow all days (day-of-week data was incomplete)
  allowedDaysOfWeek: [0, 1, 2, 3, 4, 5, 6], // All days

  // CONSERVATIVE: Avoid any win streaks (theory-based)
  maxWinStreak: 3, // Very conservative

  // CONSERVATIVE: Require normal rest (theory-based)
  minRestDays: 1, // No back-to-back
  maxRestDays: 5, // No excessive rest

  // CONSERVATIVE: Tight probability differences (theory-based)
  minImpliedProbDiff: -0.05, // Model can be slightly less confident
  maxImpliedProbDiff: 0.15, // But not overly confident

  // CONSERVATIVE: Only larger edges
  allowedEdgeSizes: ['medium', 'large'],

  // VALIDATED: Most recent seasons only
  allowedSeasons: [2024, 2025],
};

/**
 * NBA_60_70_BUCKET filter - Specifically optimized for NBA 60-70% confidence bucket
 * Targets the nearly break-even bucket with situational improvements
 * Expected: Turn -0.3% ROI into positive ROI with ~15-20 bets per year
 */
export const NBA_60_70_BUCKET_FILTER_CONFIG: FilterConfig = {
  // OPTIMIZED: Focus on slight favorites and toss-ups (where 60-70% confidence typically falls)
  allowedOddsRanges: ['slight_favorite', 'toss_up'],

  // TARGETED: Specifically target the 60-70% confidence range
  minModelConfidence: 0.6, // 60% confidence minimum
  maxModelConfidence: 0.7, // 70% confidence maximum

  // VALIDATED: March games are terrible (-55.04% ROI)
  allowedMonths: [11, 12, 1, 2], // Nov, Dec, Jan, Feb only

  // UPDATED: Allow all days (day-of-week data was incomplete)
  allowedDaysOfWeek: [0, 1, 2, 3, 4, 5, 6], // All days

  // NBA-SPECIFIC: Avoid teams on long win streaks (often overvalued in NBA)
  maxWinStreak: 5, // Conservative for NBA

  // NBA-SPECIFIC: Back-to-back games are important in NBA (fatigue factor)
  minRestDays: 1, // Avoid back-to-back games
  maxRestDays: 10, // Allow any rest amount

  // TARGETED: Tighter probability differences for this confidence range
  minImpliedProbDiff: -0.1, // Model can be slightly less confident
  maxImpliedProbDiff: 0.2, // But not overly confident

  // OPTIMIZED: Focus on medium edges (small edges might not overcome -0.3% ROI)
  allowedEdgeSizes: ['medium', 'large'],

  // VALIDATED: Recent seasons with good data quality
  allowedSeasons: [2023, 2024, 2025],
};

/**
 * Apply situational filters to a list of recommendations
 */
export function applySituationalFilters(
  recommendations: Recommendation[],
  gameFeatures: GameFeatures[],
  filterConfig: FilterConfig,
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
    if (
      situational.modelConfidence < filterConfig.minModelConfidence ||
      situational.modelConfidence > filterConfig.maxModelConfidence
    ) {
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
    if (
      situational.impliedProbDiff < filterConfig.minImpliedProbDiff ||
      situational.impliedProbDiff > filterConfig.maxImpliedProbDiff
    ) {
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
  console.log(
    `Filtered out: ${filterStats.originalCount - filterStats.filteredCount} (${(((filterStats.originalCount - filterStats.filteredCount) / filterStats.originalCount) * 100).toFixed(1)}%)`,
  );

  if (Object.keys(filterStats.filterReasons).length > 0) {
    console.log(`\n📉 Filter Reasons (top 10):`);

    const sortedReasons = Object.entries(filterStats.filterReasons)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);

    for (const [reason, count] of sortedReasons) {
      const percentage = ((count / filterStats.originalCount) * 100).toFixed(1);
      console.log(
        `   ${reason.padEnd(25)} | ${count.toString().padStart(4)} bets (${percentage}%)`,
      );
    }
  }

  if (filterStats.filteredCount === 0) {
    console.log(`\n⚠️  No recommendations passed the filters. Consider relaxing filter criteria.`);
  } else {
    console.log(
      `\n✅ ${filterStats.filteredCount} recommendations passed all filters and should be more profitable.`,
    );
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
    case 'nba_60_70_bucket':
    case 'nba-60-70-bucket':
      return NBA_60_70_BUCKET_FILTER_CONFIG;
    case 'none':
    case 'off':
      return {
        allowedOddsRanges: [
          'heavy_favorite',
          'favorite',
          'slight_favorite',
          'toss_up',
          'slight_underdog',
          'underdog',
          'heavy_underdog',
        ],
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

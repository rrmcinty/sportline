/**
 * Optimal training configurations per sport/market
 * Based on empirical backtest results analysis
 */

import type { Sport } from "../models/types.js";

export interface OptimalConfig {
  seasons: number[];
  reason: string;
  expectedROI: number;
  expectedECE: number;
  sampleSize: number;
}

export const OPTIMAL_CONFIGS: Record<Sport, Record<string, OptimalConfig>> = {
  nba: {
    moneyline: {
      seasons: [2024, 2025],
      reason: 'Recent meta dominates; 3-season degrades ROI by -7.07%',
      expectedROI: 7.56,
      expectedECE: 4.90,
      sampleSize: 349
    },
    spread: {
      seasons: [2024, 2025],
      reason: 'ONLY profitable spread model across all sports; 3-season breaks calibration',
      expectedROI: 11.02,
      expectedECE: 6.67,
      sampleSize: 268
    },
    total: {
      seasons: [2023, 2024, 2025],
      reason: 'Exceptional 0.91% ECE calibration with 3 seasons',
      expectedROI: 2.57,
      expectedECE: 0.91,
      sampleSize: 1657
    }
  },
  nfl: {
    moneyline: {
      seasons: [2024, 2025],
      reason: 'Prioritize ROI (+5.69% vs +5.06% with 3-season)',
      expectedROI: 5.69,
      expectedECE: 6.13,
      sampleSize: 441
    },
    spread: {
      seasons: [2024, 2025],
      reason: 'All configs unprofitable; avoid NFL spreads',
      expectedROI: -11.04,
      expectedECE: 7.37,
      sampleSize: 363
    },
    total: {
      seasons: [2023, 2024, 2025],
      reason: 'CRITICAL: 3-season required for profitability (+8.19% vs -3.76% with 2-season)',
      expectedROI: 8.19,
      expectedECE: 2.41,
      sampleSize: 669
    }
  },
  cfb: {
    moneyline: {
      seasons: [2024, 2025],
      reason: 'College meta changes rapidly; +4.37% boost vs 3-season',
      expectedROI: 12.04,
      expectedECE: 6.52,
      sampleSize: 1584
    },
    spread: {
      seasons: [2024, 2025],
      reason: 'All configs unprofitable; avoid CFB spreads',
      expectedROI: -7.03,
      expectedECE: 18.41,
      sampleSize: 1202
    },
    total: {
      seasons: [2023, 2024, 2025],
      reason: 'All configs unprofitable; avoid CFB totals',
      expectedROI: -5.77,
      expectedECE: 5.36,
      sampleSize: 1999
    }
  },
  ncaam: {
    moneyline: {
      seasons: [2024, 2025],
      reason: 'Recent meta performs better; +3.00% ROI with better calibration',
      expectedROI: 3.00,
      expectedECE: 11.80,
      sampleSize: 930
    },
    spread: {
      seasons: [2024, 2025],
      reason: 'All configs unprofitable; avoid NCAAM spreads',
      expectedROI: -8.22,
      expectedECE: 8.48,
      sampleSize: 364
    },
    total: {
      seasons: [2024, 2025],
      reason: 'Recent seasons for consistency with moneyline',
      expectedROI: 0,
      expectedECE: 0,
      sampleSize: 0
    }
  },
  nhl: {
    moneyline: {
      seasons: [2024, 2025],
      reason: 'Exceptional +37.83% ROI; no 3-season comparison yet',
      expectedROI: 37.83,
      expectedECE: 8.44,
      sampleSize: 2335
    },
    spread: {
      seasons: [2024, 2025],
      reason: 'Not trained for NHL',
      expectedROI: 0,
      expectedECE: 0,
      sampleSize: 0
    },
    total: {
      seasons: [2024, 2025],
      reason: 'Not trained for NHL',
      expectedROI: 0,
      expectedECE: 0,
      sampleSize: 0
    }
  }
};

/**
 * Get optimal seasons for a sport/market combination
 * Returns the empirically-determined best configuration
 */
export function getOptimalSeasons(sport: Sport, market: string): number[] {
  const config = OPTIMAL_CONFIGS[sport]?.[market];
  if (!config) {
    // Fallback to 2 most recent seasons
    const currentYear = new Date().getFullYear();
    return [currentYear - 1, currentYear];
  }
  return config.seasons;
}

/**
 * Get full optimal configuration for a sport/market
 */
export function getOptimalConfig(sport: Sport, market: string): OptimalConfig | undefined {
  return OPTIMAL_CONFIGS[sport]?.[market];
}

/**
 * Check if a market is recommended to avoid based on negative ROI
 */
export function shouldAvoidMarket(sport: Sport, market: string): boolean {
  const config = OPTIMAL_CONFIGS[sport]?.[market];
  return config ? config.expectedROI < 0 : false;
}

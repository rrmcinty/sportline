/**
 * Persistence layer for backtest results
 * Stores and retrieves historical backtest performance data
 */

import { promises as fs } from "fs";
import * as path from "path";
import type { Sport } from "../models/types.js";

export interface CalibrationBin {
  bin: string;
  predicted: number;
  actual: number;
  count: number;
  bets: number;
  profit: number;
  roi: number;
}

export interface BacktestResults {
  sport: Sport;
  market: "moneyline" | "spread" | "total";
  seasons: number[];
  timestamp: string;
  totalGames: number;
  gamesWithPredictions: number;
  gamesWithOdds: number;
  overallROI: number;
  overallECE: number;
  totalProfit: number;
  totalBets: number;
  calibration: CalibrationBin[];
  divergenceAnalysis?: {
    highDivergence?: { count: number; winRate: number; roi: number };
    moderateDivergence?: { count: number; winRate: number; roi: number };
    lowDivergence?: { count: number; winRate: number; roi: number };
  };
}

const BACKTEST_DIR = path.join(process.cwd(), "data", "backtest-results");

/**
 * Get filename for a specific backtest configuration
 */
function getBacktestFilename(
  sport: Sport,
  market: string,
  seasons: number[],
): string {
  const seasonsStr = seasons.sort((a, b) => a - b).join("-");
  return path.join(BACKTEST_DIR, `${sport}_${market}_${seasonsStr}.json`);
}

/**
 * Save backtest results to disk
 */
export async function saveBacktestResults(
  results: BacktestResults,
): Promise<void> {
  try {
    await fs.mkdir(BACKTEST_DIR, { recursive: true });
    const filename = getBacktestFilename(
      results.sport,
      results.market,
      results.seasons,
    );
    await fs.writeFile(filename, JSON.stringify(results, null, 2), "utf-8");
    console.log(`💾 Saved backtest results to ${path.basename(filename)}`);
  } catch (err) {
    console.error("Failed to save backtest results:", err);
  }
}

/**
 * Load backtest results from disk
 */
export async function loadBacktestResults(
  sport: Sport,
  market: string,
  seasons: number[],
): Promise<BacktestResults | null> {
  try {
    const filename = getBacktestFilename(sport, market, seasons);
    const data = await fs.readFile(filename, "utf-8");
    return JSON.parse(data) as BacktestResults;
  } catch (err) {
    // File doesn't exist or can't be read
    return null;
  }
}

/**
 * Get all backtest results for a sport
 */
export async function getAllBacktestResults(
  sport: Sport,
): Promise<BacktestResults[]> {
  try {
    const files = await fs.readdir(BACKTEST_DIR);
    const sportFiles = files.filter(
      (f) => f.startsWith(`${sport}_`) && f.endsWith(".json"),
    );

    const results: BacktestResults[] = [];
    for (const file of sportFiles) {
      try {
        const data = await fs.readFile(path.join(BACKTEST_DIR, file), "utf-8");
        results.push(JSON.parse(data));
      } catch (err) {
        // Skip invalid files
      }
    }

    return results;
  } catch (err) {
    return [];
  }
}

/**
 * Find the best performing configuration for a sport/market combination
 */
export async function findBestConfig(
  sport: Sport,
  market: string,
): Promise<{ seasons: number[]; roi: number; ece: number } | null> {
  try {
    const allResults = await getAllBacktestResults(sport);
    const marketResults = allResults.filter((r) => r.market === market);

    if (marketResults.length === 0) return null;

    // Sort by ROI (primary) and ECE (secondary - lower is better)
    const sorted = marketResults.sort((a, b) => {
      if (Math.abs(a.overallROI - b.overallROI) > 0.5) {
        return b.overallROI - a.overallROI;
      }
      return a.overallECE - b.overallECE;
    });

    const best = sorted[0];
    return {
      seasons: best.seasons,
      roi: best.overallROI,
      ece: best.overallECE,
    };
  } catch (err) {
    return null;
  }
}

/**
 * Get the latest backtest results for a specific configuration
 * Useful for recommend command to show historical performance
 */
export async function getLatestBacktestForConfig(
  sport: Sport,
  market: string,
  seasons: number[],
): Promise<BacktestResults | null> {
  return loadBacktestResults(sport, market, seasons);
}

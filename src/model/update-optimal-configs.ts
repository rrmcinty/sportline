/**
 * Automatically update optimal configurations based on latest backtest results
 * This script analyzes all backtest results and updates optimal-config.ts if better configurations are found
 */

import { promises as fs } from "fs";
import * as path from "path";
import { getAllBacktestResults, findBestConfig } from "./backtest-storage.js";
import type { Sport } from "../models/types.js";

const SPORTS: Sport[] = ["nba", "nfl", "cfb", "ncaam", "nhl"];
const MARKETS = ["moneyline", "spread", "total"];

interface OptimalConfig {
  expectedROI: number;
  expectedECE: number;
  seasons: number[];
  reason: string;
}

/**
 * Analyze all backtest results and recommend updated optimal configs
 */
export async function analyzeOptimalConfigs(): Promise<void> {
  console.log(
    "\n🔍 Analyzing backtest results to find optimal configurations...\n",
  );

  const updates: Array<{
    sport: Sport;
    market: string;
    currentConfig?: OptimalConfig;
    bestConfig: { seasons: number[]; roi: number; ece: number };
    shouldUpdate: boolean;
    reason: string;
  }> = [];

  for (const sport of SPORTS) {
    for (const market of MARKETS) {
      const bestConfig = await findBestConfig(sport, market);

      if (!bestConfig) {
        continue; // No backtest results for this combo
      }

      // Determine if this is a significant improvement
      const threshold = 1.0; // 1% ROI improvement threshold
      const shouldUpdate = bestConfig.roi >= 5; // Only recommend if ROI >= 5%

      const reason =
        bestConfig.roi >= 5
          ? `Strong performance: ${bestConfig.roi.toFixed(1)}% ROI`
          : `Unprofitable: ${bestConfig.roi.toFixed(1)}% ROI (avoid)`;

      updates.push({
        sport,
        market,
        bestConfig,
        shouldUpdate,
        reason,
      });
    }
  }

  // Print recommendations
  console.log(
    "═══════════════════════════════════════════════════════════════════════",
  );
  console.log("OPTIMAL CONFIGURATION RECOMMENDATIONS");
  console.log(
    "═══════════════════════════════════════════════════════════════════════\n",
  );

  const recommended = updates.filter((u) => u.shouldUpdate);
  const notRecommended = updates.filter((u) => !u.shouldUpdate);

  if (recommended.length > 0) {
    console.log("✅ RECOMMENDED CONFIGURATIONS (ROI >= 5%):\n");
    for (const update of recommended) {
      console.log(`${update.sport.toUpperCase()} ${update.market}:`);
      console.log(`  Seasons: ${update.bestConfig.seasons.join(", ")}`);
      console.log(
        `  ROI: ${update.bestConfig.roi >= 0 ? "+" : ""}${update.bestConfig.roi.toFixed(1)}%`,
      );
      console.log(`  ECE: ${(update.bestConfig.ece * 100).toFixed(2)}%`);
      console.log(`  ${update.reason}\n`);
    }
  }

  if (notRecommended.length > 0) {
    console.log("⚠️  NOT RECOMMENDED (ROI < 5%):\n");
    for (const update of notRecommended) {
      console.log(`${update.sport.toUpperCase()} ${update.market}:`);
      console.log(`  Seasons: ${update.bestConfig.seasons.join(", ")}`);
      console.log(
        `  ROI: ${update.bestConfig.roi >= 0 ? "+" : ""}${update.bestConfig.roi.toFixed(1)}%`,
      );
      console.log(`  ECE: ${(update.bestConfig.ece * 100).toFixed(2)}%`);
      console.log(`  ${update.reason}\n`);
    }
  }

  console.log(
    "═══════════════════════════════════════════════════════════════════════",
  );
  console.log(
    "\n💡 To update optimal-config.ts with these values, review the results above",
  );
  console.log(
    "   and manually edit src/model/optimal-config.ts if changes are warranted.\n",
  );
}

/**
 * Generate TypeScript code for optimal-config.ts based on backtest results
 */
export async function generateOptimalConfigCode(): Promise<string> {
  const configs: Record<Sport, Record<string, OptimalConfig>> = {} as any;

  for (const sport of SPORTS) {
    configs[sport] = {};

    for (const market of MARKETS) {
      const bestConfig = await findBestConfig(sport, market);

      if (bestConfig && bestConfig.roi >= 0) {
        configs[sport][market] = {
          expectedROI: parseFloat(bestConfig.roi.toFixed(1)),
          expectedECE: parseFloat(bestConfig.ece.toFixed(4)),
          seasons: bestConfig.seasons,
          reason:
            bestConfig.roi >= 5
              ? `Backtests show +${bestConfig.roi.toFixed(1)}% ROI with ${(bestConfig.ece * 100).toFixed(2)}% calibration error`
              : `Low ROI (+${bestConfig.roi.toFixed(1)}%) - use with caution`,
        };
      }
    }
  }

  // Generate TypeScript code
  let code = "/**\n";
  code +=
    " * Auto-generated optimal configurations based on backtest results\n";
  code += ` * Last updated: ${new Date().toISOString()}\n`;
  code += " */\n\n";
  code +=
    "export const OPTIMAL_CONFIGS = " +
    JSON.stringify(configs, null, 2) +
    ";\n";

  return code;
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  analyzeOptimalConfigs().catch(console.error);
}

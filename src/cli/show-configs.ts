/**
 * Display optimal training configurations
 */

import chalk from "chalk";
import type { Sport } from "../models/types.js";
import { OPTIMAL_CONFIGS } from "../model/optimal-config.js";

export function cmdShowOptimalConfigs(): void {
  console.log(chalk.bold.cyan("\n📊 OPTIMAL TRAINING CONFIGURATIONS\n"));
  console.log(chalk.dim("Based on empirical backtest results analysis\n"));

  const sports: Sport[] = ["nba", "nfl", "cfb", "ncaam", "nhl"];
  const markets = ["moneyline", "spread", "total"];

  for (const sport of sports) {
    console.log(chalk.bold(`${sport.toUpperCase()}:`));
    console.log("─".repeat(80));

    for (const market of markets) {
      const config = OPTIMAL_CONFIGS[sport]?.[market];
      if (!config || config.sampleSize === 0) continue;

      const roiColor =
        config.expectedROI >= 5
          ? chalk.green
          : config.expectedROI >= 0
            ? chalk.yellow
            : chalk.red;

      const status =
        config.expectedROI >= 5
          ? "✅ RECOMMENDED"
          : config.expectedROI >= 0
            ? "⚠️  MARGINAL"
            : "❌ AVOID";

      console.log(`  ${market.toUpperCase()}:`);
      console.log(`    Seasons: ${config.seasons.join(", ")}`);
      console.log(
        `    Expected ROI: ${roiColor(config.expectedROI >= 0 ? "+" : "")}${roiColor(config.expectedROI.toFixed(2) + "%")} | ECE: ${config.expectedECE.toFixed(2)}%`,
      );
      console.log(`    Sample: ${config.sampleSize} games | ${status}`);
      console.log(chalk.dim(`    Reason: ${config.reason}`));
      console.log();
    }
  }

  console.log("─".repeat(80));
  console.log(chalk.bold("\n💡 Key Insights:\n"));
  console.log(
    "  • NBA moneyline/spreads: Use 2 seasons (recent meta critical)",
  );
  console.log("  • NFL totals: Use 3 seasons (goes from -3.76% to +8.19%)");
  console.log("  • CFB moneyline: Use 2 seasons (+4.37% boost over 3-season)");
  console.log("  • NCAAM totals: Use 3 seasons (elite +13.22% ROI)");
  console.log(
    "  • College sports generally prefer recent data (roster turnover)",
  );
  console.log(
    "  • Totals models generally benefit from more historical data\n",
  );

  console.log(
    chalk.dim(
      "To train with optimal config: sportline model train --sport <sport> --markets <market>",
    ),
  );
  console.log(
    chalk.dim(
      "To override:                   sportline model train --sport <sport> --season 2024,2025 --markets <market>\n",
    ),
  );
}

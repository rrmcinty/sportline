/**
 * Persistence layer for backtest results
 * Stores and retrieves historical backtest performance data
 */
import { promises as fs } from "fs";
import * as path from "path";
const BACKTEST_DIR = path.join(process.cwd(), "data", "backtest-results");
/**
 * Get filename for a specific backtest configuration
 */
function getBacktestFilename(sport, market, seasons) {
    const seasonsStr = seasons.sort((a, b) => a - b).join("-");
    return path.join(BACKTEST_DIR, `${sport}_${market}_${seasonsStr}.json`);
}
/**
 * Save backtest results to disk
 */
export async function saveBacktestResults(results) {
    try {
        await fs.mkdir(BACKTEST_DIR, { recursive: true });
        const filename = getBacktestFilename(results.sport, results.market, results.seasons);
        await fs.writeFile(filename, JSON.stringify(results, null, 2), "utf-8");
        console.log(`💾 Saved backtest results to ${path.basename(filename)}`);
    }
    catch (err) {
        console.error("Failed to save backtest results:", err);
    }
}
/**
 * Load backtest results from disk
 */
export async function loadBacktestResults(sport, market, seasons) {
    try {
        const filename = getBacktestFilename(sport, market, seasons);
        const data = await fs.readFile(filename, "utf-8");
        return JSON.parse(data);
    }
    catch (err) {
        // File doesn't exist or can't be read
        return null;
    }
}
/**
 * Get all backtest results for a sport
 */
export async function getAllBacktestResults(sport) {
    try {
        const files = await fs.readdir(BACKTEST_DIR);
        const sportFiles = files.filter((f) => f.startsWith(`${sport}_`) && f.endsWith(".json"));
        const results = [];
        for (const file of sportFiles) {
            try {
                const data = await fs.readFile(path.join(BACKTEST_DIR, file), "utf-8");
                results.push(JSON.parse(data));
            }
            catch (err) {
                // Skip invalid files
            }
        }
        return results;
    }
    catch (err) {
        return [];
    }
}
/**
 * Find the best performing configuration for a sport/market combination
 */
export async function findBestConfig(sport, market) {
    try {
        const allResults = await getAllBacktestResults(sport);
        const marketResults = allResults.filter((r) => r.market === market);
        if (marketResults.length === 0)
            return null;
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
    }
    catch (err) {
        return null;
    }
}
/**
 * Get the latest backtest results for a specific configuration
 * Useful for recommend command to show historical performance
 */
export async function getLatestBacktestForConfig(sport, market, seasons) {
    return loadBacktestResults(sport, market, seasons);
}
//# sourceMappingURL=backtest-storage.js.map
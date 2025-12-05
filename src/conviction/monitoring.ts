/**
 * Monitoring and early-warning system for conviction classifier
 * Tracks rolling performance and halts if ROI drops below threshold
 */

import { promises as fs } from "fs";
import * as path from "path";
import type { Sport, MarketType } from "../models/types.js";
import type {
  ConvictionMonitor,
  ConvictionPrediction,
  ConvictionBacktestResults,
} from "./types.js";

const MONITOR_DIR = path.join(process.cwd(), "data", "conviction-monitoring");

/**
 * Get monitor state for a sport/market pair
 */
export async function getMonitorState(
  sport: Sport,
  market: MarketType
): Promise<ConvictionMonitor> {
  const filename = path.join(MONITOR_DIR, `${sport}_${market}_monitor.json`);

  try {
    const data = await fs.readFile(filename, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    // Create new monitor
    return {
      sport,
      market,
      recentBets: [],
      recentWinRate: 0,
      recentROI: 0,
      consecutiveLosses: 0,
      isHalted: false,
    };
  }
}

/**
 * Log a bet result
 */
export async function logBetResult(
  sport: Sport,
  market: MarketType,
  prediction: ConvictionPrediction,
  result: "WIN" | "LOSS" | "PUSH" | "PENDING",
  actualProfit: number = 0
): Promise<ConvictionMonitor> {
  const monitor = await getMonitorState(sport, market);

  monitor.recentBets.push({
    gameId: prediction.gameId,
    date: prediction.date,
    prediction,
    result,
    actualProfit,
  });

  // Keep only last 20 bets for rolling window
  if (monitor.recentBets.length > 20) {
    monitor.recentBets = monitor.recentBets.slice(-20);
  }

  // Recalculate metrics
  updateMonitorMetrics(monitor);

  // Check halt conditions
  checkHaltConditions(monitor);

  // Save monitor state
  await saveMonitorState(monitor);

  return monitor;
}

/**
 * Update rolling performance metrics
 */
function updateMonitorMetrics(monitor: ConvictionMonitor): void {
  if (monitor.recentBets.length === 0) {
    monitor.recentWinRate = 0;
    monitor.recentROI = 0;
    monitor.consecutiveLosses = 0;
    return;
  }

  // Calculate win rate from last 20 bets
  const wins = monitor.recentBets.filter((b) => b.result === "WIN").length;
  const pushes = monitor.recentBets.filter((b) => b.result === "PUSH").length;
  const total = monitor.recentBets.length;

  monitor.recentWinRate = wins / total;

  // Calculate ROI from last 20 bets
  const totalProfit = monitor.recentBets.reduce((sum, b) => sum + b.actualProfit, 0);
  const totalStake = monitor.recentBets.length * 10; // Assume $10 per bet
  monitor.recentROI = (totalProfit / totalStake) * 100;

  // Calculate consecutive losses from end
  let consecutiveLosses = 0;
  for (let i = monitor.recentBets.length - 1; i >= 0; i--) {
    if (monitor.recentBets[i].result === "LOSS") {
      consecutiveLosses++;
    } else if (monitor.recentBets[i].result === "WIN" || monitor.recentBets[i].result === "PUSH") {
      break;
    }
  }
  monitor.consecutiveLosses = consecutiveLosses;
}

/**
 * Check if classifier should be halted
 */
function checkHaltConditions(monitor: ConvictionMonitor): void {
  // Halt if:
  // 1. Last 20 bets have ROI < -10%
  // 2. 5 consecutive losses
  // 3. Win rate < 40% (expected ~50%+ for profitable bets)

  const shouldHalt =
    (monitor.recentBets.length >= 20 && monitor.recentROI < -10) ||
    monitor.consecutiveLosses >= 5 ||
    (monitor.recentBets.length >= 10 && monitor.recentWinRate < 0.4);

  if (shouldHalt && !monitor.isHalted) {
    monitor.isHalted = true;
    monitor.haltedAt = new Date().toISOString();

    let reason = "Halt triggered: ";
    if (monitor.recentBets.length >= 20 && monitor.recentROI < -10) {
      reason += `ROI ${monitor.recentROI.toFixed(2)}% < -10% threshold`;
    } else if (monitor.consecutiveLosses >= 5) {
      reason += `5 consecutive losses`;
    } else if (monitor.recentBets.length >= 10 && monitor.recentWinRate < 0.4) {
      reason += `Win rate ${(monitor.recentWinRate * 100).toFixed(1)}% < 40% threshold`;
    }

    monitor.haltReason = reason;
  }
}

/**
 * Resume monitoring (called after retraining)
 */
export async function resumeMonitoring(
  sport: Sport,
  market: MarketType
): Promise<ConvictionMonitor> {
  const monitor = await getMonitorState(sport, market);

  // Clear recent bets and reset metrics
  monitor.recentBets = [];
  monitor.recentWinRate = 0;
  monitor.recentROI = 0;
  monitor.consecutiveLosses = 0;
  monitor.isHalted = false;
  monitor.haltReason = undefined;
  monitor.lastRetrain = new Date().toISOString();

  await saveMonitorState(monitor);

  return monitor;
}

/**
 * Save monitor state to disk
 */
async function saveMonitorState(monitor: ConvictionMonitor): Promise<void> {
  try {
    await fs.mkdir(MONITOR_DIR, { recursive: true });
    const filename = path.join(MONITOR_DIR, `${monitor.sport}_${monitor.market}_monitor.json`);
    await fs.writeFile(filename, JSON.stringify(monitor, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save monitor state:", err);
  }
}

/**
 * Check if classifier is halted
 */
export async function isClassifierHalted(
  sport: Sport,
  market: MarketType
): Promise<boolean> {
  const monitor = await getMonitorState(sport, market);
  return monitor.isHalted;
}

/**
 * Get halt details
 */
export async function getHaltDetails(
  sport: Sport,
  market: MarketType
): Promise<{ isHalted: boolean; reason?: string; haltedAt?: string } | null> {
  const monitor = await getMonitorState(sport, market);

  if (!monitor.isHalted) {
    return null;
  }

  return {
    isHalted: true,
    reason: monitor.haltReason,
    haltedAt: monitor.haltedAt,
  };
}

/**
 * Get rolling performance summary
 */
export async function getRollingPerformance(
  sport: Sport,
  market: MarketType
): Promise<{
  totalBets: number;
  wins: number;
  losses: number;
  pushes: number;
  winRate: number;
  roi: number;
  totalProfit: number;
}> {
  const monitor = await getMonitorState(sport, market);

  const wins = monitor.recentBets.filter((b) => b.result === "WIN").length;
  const losses = monitor.recentBets.filter((b) => b.result === "LOSS").length;
  const pushes = monitor.recentBets.filter((b) => b.result === "PUSH").length;
  const totalProfit = monitor.recentBets.reduce((sum, b) => sum + b.actualProfit, 0);

  return {
    totalBets: monitor.recentBets.length,
    wins,
    losses,
    pushes,
    winRate: monitor.recentWinRate,
    roi: monitor.recentROI,
    totalProfit,
  };
}

/**
 * Extract rolling performance for backtest results
 */
export function extractRollingPerformance(
  backtest: ConvictionBacktestResults
): Array<{ bets: number; roi: number }> {
  const rolling: Array<{ bets: number; roi: number }> = [];

  for (const profile of backtest.byProfile) {
    const cumBets = (rolling[rolling.length - 1]?.bets || 0) + profile.bets;
    const cumProfit =
      (rolling[rolling.length - 1]?.roi || 0) * (rolling[rolling.length - 1]?.bets || 0) / 100 +
      profile.roi * profile.bets / 100;
    const cumROI = (cumProfit / cumBets) * 100;

    rolling.push({
      bets: cumBets,
      roi: cumROI,
    });
  }

  return rolling;
}

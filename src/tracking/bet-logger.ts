/**
 * Bet tracking and logging system
 * Tracks both recommended bets and actual bets placed
 */

import { promises as fs } from "fs";
import * as path from "path";
import type { Sport } from "../models/types.js";

export interface TrackedBet {
  id: string; // Unique identifier: {date}-{sport}-{eventId}-{market}-{side}
  timestamp: string;
  sport: Sport;
  eventId: string;
  matchup: string;
  date: string; // Game date (formatted for display)
  pick: string; // e.g., "SYR ML +190"
  side: string; // Team/side being bet on
  market: "moneyline" | "spread" | "total";
  line?: number; // For spreads/totals
  odds: number; // American odds
  modelProbability: number;
  bin: string; // e.g., "30-40%"
  historicalROI: number;
  historicalWinRate: number;
  historicalSampleSize: number;
  expectedValue: number;

  // Tracking status
  recommended: boolean; // Was this shown in recommend output?
  actuallyBet: boolean; // Deprecated: use placements
  stake?: number; // Deprecated: use placements
  placements?: Array<{ stake: number; placedAt: string }>; // Multiple bet placements

  // Results (filled in later)
  status: "pending" | "won" | "lost" | "push" | "cancelled";
  result?: {
    homeScore?: number;
    awayScore?: number;
    actualProfit?: number; // Real profit/loss
    settledAt?: string;
  };
}

export interface BetTrackingData {
  bets: TrackedBet[];
  lastUpdated: string;
}

const TRACKING_FILE = path.join(process.cwd(), "data", "bet-tracking.json");

/**
 * Load all tracked bets from disk
 */
export async function loadTrackedBets(): Promise<BetTrackingData> {
  try {
    await fs.mkdir(path.dirname(TRACKING_FILE), { recursive: true });
    const data = await fs.readFile(TRACKING_FILE, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    // File doesn't exist yet
    return { bets: [], lastUpdated: new Date().toISOString() };
  }
}

/**
 * Save tracked bets to disk
 */
export async function saveTrackedBets(data: BetTrackingData): Promise<void> {
  try {
    await fs.mkdir(path.dirname(TRACKING_FILE), { recursive: true });
    data.lastUpdated = new Date().toISOString();
    await fs.writeFile(TRACKING_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save tracked bets:", err);
  }
}

/**
 * Log a recommended bet (auto-called from recommend command)
 */
export async function logRecommendedBet(
  bet: Omit<TrackedBet, "recommended" | "actuallyBet" | "status">,
): Promise<void> {
  const data = await loadTrackedBets();

  // Check if this bet already exists
  const existingIndex = data.bets.findIndex((b) => b.id === bet.id);

  const trackedBet: TrackedBet = {
    ...bet,
    recommended: true,
    actuallyBet: false,
    status: "pending",
  };

  if (existingIndex >= 0) {
    // Update existing bet
    data.bets[existingIndex] = {
      ...data.bets[existingIndex],
      ...trackedBet,
      // Preserve actuallyBet and stake if already set
      actuallyBet: data.bets[existingIndex].actuallyBet,
      stake: data.bets[existingIndex].stake,
      placements: data.bets[existingIndex].placements || [],
    };
  } else {
    // Add new bet
    trackedBet.placements = [];
    data.bets.push(trackedBet);
  }

  await saveTrackedBets(data);
}

/**
 * Mark specific bets as actually bet with stake amounts
 */
export async function markBetsAsPlaced(
  betIds: string[],
  stakes: number | number[],
): Promise<void> {
  const data = await loadTrackedBets();

  for (let i = 0; i < betIds.length; i++) {
    const betId = betIds[i];
    const bet = data.bets.find((b) => b.id === betId);
    if (bet) {
      bet.actuallyBet = true;
      const stake = Array.isArray(stakes)
        ? (stakes[i] ?? stakes[0] ?? 0)
        : stakes;
      bet.placements = bet.placements || [];
      bet.placements.push({ stake, placedAt: new Date().toISOString() });
    }
  }

  await saveTrackedBets(data);
}

/**
 * Update bet results from game outcomes
 */
export async function updateBetResults(
  betId: string,
  homeScore: number,
  awayScore: number,
): Promise<void> {
  const data = await loadTrackedBets();
  const bet = data.bets.find((b) => b.id === betId);

  if (!bet || bet.status !== "pending") return;

  // Determine bet outcome
  let status: "won" | "lost" | "push" = "lost";
  let won = false;
  if (bet.market === "moneyline") {
    const isHomeBet = bet.matchup.endsWith(`@ ${bet.side}`);
    won = isHomeBet ? homeScore > awayScore : awayScore > homeScore;
    status = won ? "won" : "lost";
  } else if (bet.market === "spread" && bet.line !== undefined) {
    const isHomeBet = bet.matchup.endsWith(`@ ${bet.side}`);
    const margin = homeScore - awayScore;
    const resultValue = isHomeBet ? margin + bet.line : -margin + bet.line;
    if (resultValue === 0) {
      status = "push";
    } else {
      won = resultValue > 0;
      status = won ? "won" : "lost";
    }
  } else if (bet.market === "total" && bet.line !== undefined) {
    const total = homeScore + awayScore;
    if (total === bet.line) {
      status = "push";
    } else {
      const isOver = bet.side.toLowerCase().includes("over");
      won = isOver ? total > bet.line : total < bet.line;
      status = won ? "won" : "lost";
    }
  }

  // Calculate profit
  let actualProfit = 0;
  const totalStake =
    (bet.placements || []).reduce((sum, p) => sum + p.stake, 0) ||
    bet.stake ||
    0;
  if (bet.actuallyBet && totalStake > 0) {
    if (status === "won") {
      // Calculate payout from American odds
      if (bet.odds > 0) {
        actualProfit = (bet.odds / 100) * totalStake;
      } else {
        actualProfit = (100 / Math.abs(bet.odds)) * totalStake;
      }
    } else if (status === "lost") {
      actualProfit = -totalStake;
    } else if (status === "push") {
      actualProfit = 0;
    }
  }

  bet.status = status;
  bet.result = {
    homeScore,
    awayScore,
    actualProfit,
    settledAt: new Date().toISOString(),
  };

  await saveTrackedBets(data);
}

/**
 * Get statistics for tracked bets
 */
export async function getBetStats(): Promise<{
  allRecommended: { count: number; pending: number; won: number; lost: number };
  actuallyBet: {
    count: number;
    pending: number;
    won: number;
    lost: number;
    totalStaked: number;
    totalProfit: number;
    roi: number;
  };
}> {
  const data = await loadTrackedBets();

  const allRec = data.bets.filter((b) => b.recommended);
  const actualBets = data.bets.filter((b) => b.actuallyBet);

  const allRecStats = {
    count: allRec.length,
    pending: allRec.filter((b) => b.status === "pending").length,
    won: allRec.filter((b) => b.status === "won").length,
    lost: allRec.filter((b) => b.status === "lost").length,
  };

  const totalStaked = actualBets.reduce(
    (sum, b) =>
      sum +
      ((b.placements || []).reduce((s, p) => s + p.stake, 0) || b.stake || 0),
    0,
  );
  const totalProfit = actualBets.reduce(
    (sum, b) => sum + (b.result?.actualProfit || 0),
    0,
  );

  const actualBetStats = {
    count: actualBets.length,
    pending: actualBets.filter((b) => b.status === "pending").length,
    won: actualBets.filter((b) => b.status === "won").length,
    lost: actualBets.filter((b) => b.status === "lost").length,
    totalStaked,
    totalProfit,
    roi: totalStaked > 0 ? (totalProfit / totalStaked) * 100 : 0,
  };

  return { allRecommended: allRecStats, actuallyBet: actualBetStats };
}

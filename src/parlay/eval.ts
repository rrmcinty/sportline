/**
 * Parlay evaluation engine
 */

import type { BetLeg, ParlaySpec, ParlayResult } from "../models/types.js";
import { calculateParlayPayout, calculateParlayProbability, calculateEV } from "../models/probability.js";

/**
 * Evaluate a parlay bet
 * @param spec Parlay specification with legs and stake
 * @returns Parlay result with probability, payout, and EV
 */
export function evaluateParlay(spec: ParlaySpec): ParlayResult {
  const { legs, stake } = spec;

  if (legs.length === 0) {
    throw new Error("Parlay must have at least one leg");
  }

  // Calculate combined probability (assumes independence)
  const probability = calculateParlayProbability(legs.map((leg) => leg.impliedProbability));

  // Calculate payout
  const payout = calculateParlayPayout(
    legs.map((leg) => leg.decimalOdds),
    stake
  );

  const profit = payout - stake;
  const ev = calculateEV(probability, payout, stake);
  const roi = (ev / stake) * 100;

  return {
    legs,
    stake,
    probability,
    payout,
    profit,
    ev,
    roi,
  };
}

/**
 * Rank parlays by EV (descending)
 * @param parlays Array of parlay results
 * @returns Sorted array (highest EV first)
 */
export function rankParlaysByEV(parlays: ParlayResult[]): ParlayResult[] {
  return parlays.sort((a, b) => b.ev - a.ev);
}

/**
 * Filter parlays with positive EV
 * @param parlays Array of parlay results
 * @returns Parlays with EV > 0
 */
export function filterPositiveEV(parlays: ParlayResult[]): ParlayResult[] {
  return parlays.filter((p) => p.ev > 0);
}

/**
 * Generate all possible parlays from a list of legs
 * @param legs Available bet legs
 * @param minLegs Minimum legs per parlay
 * @param maxLegs Maximum legs per parlay
 * @param stake Stake amount
 * @returns Array of all possible parlay specs
 */
export function generateParlays(
  legs: BetLeg[],
  minLegs: number = 2,
  maxLegs: number = 4,
  stake: number = 10
): ParlaySpec[] {
  const parlays: ParlaySpec[] = [];

  // Generate combinations for each size
  for (let size = minLegs; size <= Math.min(maxLegs, legs.length); size++) {
    const combinations = getCombinations(legs, size);
    for (const combo of combinations) {
      // Filter out conflicting legs (same event, different sides)
      if (hasConflict(combo)) {
        continue;
      }
      parlays.push({ legs: combo, stake });
    }
  }

  return parlays;
}

/**
 * Check if parlay legs have conflicts (same event, different outcomes)
 */
function hasConflict(legs: BetLeg[]): boolean {
  const eventMarkets = new Map<string, string>();

  for (const leg of legs) {
    // Create unique key for this market in this event
    const marketKey = `${leg.eventId}-${leg.market}`;
    
    // For totals, we need to distinguish over vs under
    // For spreads and moneylines, team already distinguishes
    let legIdentifier: string;
    if (leg.market === "total") {
      // Extract over/under from description
      const isOver = leg.description.toLowerCase().includes("over");
      legIdentifier = `${leg.line}-${isOver ? "over" : "under"}`;
    } else {
      legIdentifier = `${leg.team}-${leg.line || ""}`;
    }

    const fullKey = `${marketKey}-${legIdentifier}`;

    // Check if we already have a different outcome for this market
    const existing = eventMarkets.get(marketKey);
    if (existing && existing !== fullKey) {
      return true; // Conflict found
    }

    eventMarkets.set(marketKey, fullKey);
  }

  return false;
}

/**
 * Generate all combinations of size k from array
 */
function getCombinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length === 0) return [];

  const [first, ...rest] = arr;
  const withFirst = getCombinations(rest, k - 1).map((combo) => [first, ...combo]);
  const withoutFirst = getCombinations(rest, k);

  return [...withFirst, ...withoutFirst];
}

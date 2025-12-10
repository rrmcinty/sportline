import type { OddsEntry, BetLeg, TeamSide } from "../../models/types.js";

/**
 * Normalize NHL odds into BetLegs (moneyline only)
 */
export function normalizeOdds(
  eventId: string,
  oddsEntries: OddsEntry[],
  home: string,
  away: string,
): BetLeg[] {
  const legs: BetLeg[] = [];
  for (const entry of oddsEntries) {
    // Home moneyline
    if (entry.homeTeamOdds?.moneyLine !== undefined) {
      const odds = entry.homeTeamOdds.moneyLine;
      const decimalOdds = odds >= 0 ? odds / 100 + 1 : 100 / Math.abs(odds) + 1;
      const impliedProbability =
        odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
      legs.push({
        eventId,
        market: "moneyline",
        team: "home",
        odds,
        decimalOdds,
        impliedProbability,
        provider: entry.provider?.name,
        description: `${home} ML ${odds > 0 ? "+" : ""}${odds}`,
      });
    }
    // Away moneyline
    if (entry.awayTeamOdds?.moneyLine !== undefined) {
      const odds = entry.awayTeamOdds.moneyLine;
      const decimalOdds = odds >= 0 ? odds / 100 + 1 : 100 / Math.abs(odds) + 1;
      const impliedProbability =
        odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
      legs.push({
        eventId,
        market: "moneyline",
        team: "away",
        odds,
        decimalOdds,
        impliedProbability,
        provider: entry.provider?.name,
        description: `${away} ML ${odds > 0 ? "+" : ""}${odds}`,
      });
    }
  }
  return legs;
}

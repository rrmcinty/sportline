/**
 * ESPN NHL odds fetcher
 */

import fetch from "node-fetch";
import type { BetLeg, OddsEntry, TeamSide } from "../../models/types.js";
import { americanToDecimal, impliedProbability, formatAmericanOdds, removeVig as removeVigUtil } from "../../models/probability.js";

// TODO: Implement odds fetching for NHL events
export async function fetchNHLOdds(eventId: string): Promise<OddsEntry[]> {
  // ESPN API odds endpoint for NHL
  const url = `https://sports.core.api.espn.com/v2/sports/hockey/leagues/nhl/events/${eventId}/competitions/${eventId}/odds`;
    const resp = await fetch(url);
    const data = await resp.json() as { items?: any[] };
    if (!data.items) return [];
    const odds: OddsEntry[] = [];
    for (const item of data.items) {
      // Each item is a provider odds object
      let provider = { id: "", name: "", priority: 0 };
      if (item.provider) {
        provider.id = item.provider.id || "";
        provider.name = item.provider.name || "";
        provider.priority = item.provider.priority || 0;
      }
      odds.push({
        provider,
        homeTeamOdds: {
          moneyLine: item.homeTeamOdds?.moneyLine,
          spreadOdds: item.homeTeamOdds?.spreadOdds,
        },
        awayTeamOdds: {
          moneyLine: item.awayTeamOdds?.moneyLine,
          spreadOdds: item.awayTeamOdds?.spreadOdds,
        },
        overOdds: item.overOdds,
        underOdds: item.underOdds,
        spread: item.spread,
        overUnder: item.overUnder,
      });
    }
    return odds;
}

export function normalizeOdds(
  eventId: string,
  oddsEntries: OddsEntry[],
  homeTeamName: string,
  awayTeamName: string,
  preferredProvider: string = "ESPN BET",
  removeVig: boolean = true
): BetLeg[] {
  const entry = oddsEntries.find(e => e.provider.name === preferredProvider) || oddsEntries.sort((a,b) => b.provider.priority - a.provider.priority)[0];
  if (!entry) return [];

  const legs: BetLeg[] = [];

  // Moneylines
  if (entry.homeTeamOdds.moneyLine !== undefined && entry.awayTeamOdds.moneyLine !== undefined) {
    const homeProb = impliedProbability(entry.homeTeamOdds.moneyLine);
    const awayProb = impliedProbability(entry.awayTeamOdds.moneyLine);
    const [homeFair, awayFair] = removeVig ? removeVigUtil(homeProb, awayProb) : [homeProb, awayProb];

    legs.push(createBetLeg(eventId, "moneyline", "home", undefined, entry.homeTeamOdds.moneyLine, entry.provider.name, `${homeTeamName} ML ${formatAmericanOdds(entry.homeTeamOdds.moneyLine)}`, homeFair));
    legs.push(createBetLeg(eventId, "moneyline", "away", undefined, entry.awayTeamOdds.moneyLine, entry.provider.name, `${awayTeamName} ML ${formatAmericanOdds(entry.awayTeamOdds.moneyLine)}`, awayFair));
  }

  // Spreads
  if (entry.spread !== undefined && entry.homeTeamOdds.spreadOdds !== undefined && entry.awayTeamOdds.spreadOdds !== undefined) {
    const homeProb = impliedProbability(entry.homeTeamOdds.spreadOdds);
    const awayProb = impliedProbability(entry.awayTeamOdds.spreadOdds);
    const [homeFair, awayFair] = removeVig ? removeVigUtil(homeProb, awayProb) : [homeProb, awayProb];

    legs.push(createBetLeg(eventId, "spread", "home", -entry.spread, entry.homeTeamOdds.spreadOdds, entry.provider.name, `${homeTeamName} ${-entry.spread > 0 ? "+" : ""}${-entry.spread} (${formatAmericanOdds(entry.homeTeamOdds.spreadOdds)})`, homeFair));
    legs.push(createBetLeg(eventId, "spread", "away", entry.spread, entry.awayTeamOdds.spreadOdds, entry.provider.name, `${awayTeamName} ${entry.spread > 0 ? "+" : ""}${entry.spread} (${formatAmericanOdds(entry.awayTeamOdds.spreadOdds)})`, awayFair));
  }

  // Totals
  if (entry.overUnder !== undefined && entry.overOdds !== undefined && entry.underOdds !== undefined) {
    const overProb = impliedProbability(entry.overOdds);
    const underProb = impliedProbability(entry.underOdds);
    const [overFair, underFair] = removeVig ? removeVigUtil(overProb, underProb) : [overProb, underProb];

    legs.push(createBetLeg(eventId, "total", undefined, entry.overUnder, entry.overOdds, entry.provider.name, `Over ${entry.overUnder} (${formatAmericanOdds(entry.overOdds)})`, overFair));
    legs.push(createBetLeg(eventId, "total", undefined, entry.overUnder, entry.underOdds, entry.provider.name, `Under ${entry.overUnder} (${formatAmericanOdds(entry.underOdds)})`, underFair));
  }

  return legs;
}

function createBetLeg(
  eventId: string,
  market: "moneyline" | "spread" | "total",
  team: TeamSide | undefined,
  line: number | undefined,
  odds: number,
  provider: string,
  description: string,
  fairProbability?: number
): BetLeg {
  return {
    eventId,
    market,
    team,
    line,
    odds,
    decimalOdds: americanToDecimal(odds),
    impliedProbability: fairProbability !== undefined ? fairProbability : impliedProbability(odds),
    provider,
    description
  };
}

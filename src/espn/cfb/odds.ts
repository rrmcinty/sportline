/**
 * ESPN College Football (CFB) odds fetcher + normalizer
 */

import fetch from "node-fetch";
import { getCache, setCache } from "../../cache/index.js";
import type { BetLeg, OddsEntry, TeamSide } from "../../models/types.js";
import { americanToDecimal, impliedProbability, formatAmericanOdds, removeVig as removeVigUtil } from "../../models/probability.js";

const BASE_URL = "https://sports.core.api.espn.com/v2/sports/football/leagues/college-football";

interface ESPNOddsResponse { count: number; items: ESPNOddsItem[]; }
interface ESPNOddsItem {
  provider: { id: string; name: string; priority: number };
  details?: string;
  spread?: number;
  overUnder?: number;
  homeTeamOdds?: { favorite?: boolean; underdog?: boolean; moneyLine?: number; spreadOdds?: number };
  awayTeamOdds?: { favorite?: boolean; underdog?: boolean; moneyLine?: number; spreadOdds?: number };
  overOdds?: number;
  underOdds?: number;
}

export async function fetchOdds(eventId: string): Promise<OddsEntry[]> {
  const url = `${BASE_URL}/events/${eventId}/competitions/${eventId}/odds`;
  const cached = getCache<OddsEntry[]>(url);
  if (cached) {
    console.log(`✓ Cache hit for CFB odds on event ${eventId}`);
    return cached;
  }

  console.log(`Fetching CFB odds for event ${eventId}...`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`ESPN API error: ${response.status} ${response.statusText}`);
  const data = (await response.json()) as ESPNOddsResponse;

  const oddsEntries: OddsEntry[] = data.items.map(item => ({
    provider: { id: item.provider.id, name: item.provider.name, priority: item.provider.priority },
    spread: item.spread,
    overUnder: item.overUnder,
    homeTeamOdds: { moneyLine: item.homeTeamOdds?.moneyLine, spreadOdds: item.homeTeamOdds?.spreadOdds },
    awayTeamOdds: { moneyLine: item.awayTeamOdds?.moneyLine, spreadOdds: item.awayTeamOdds?.spreadOdds },
    overOdds: item.overOdds,
    underOdds: item.underOdds
  }));

  setCache(url, oddsEntries, 5 * 60 * 1000);
  return oddsEntries;
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

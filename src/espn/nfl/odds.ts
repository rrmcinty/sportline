/**
 * ESPN NFL odds fetcher + normalizer
 */

import fetch from "node-fetch";
import { getCache, setCache } from "../../cache/index.js";
import type { BetLeg, OddsEntry, TeamSide } from "../../models/types.js";
import { americanToDecimal, impliedProbability, formatAmericanOdds, removeVig as removeVigUtil } from "../../models/probability.js";

const BASE_URL = "https://sports.core.api.espn.com/v2/sports/football/leagues/nfl";

interface ESPNOddsResponse { count: number; items: ESPNOddsItem[]; }
interface ESPNOddsItem {
  provider: { id: string; name: string; priority: number };
  details?: string;
  spread?: number;
  overUnder?: number;
  homeTeamOdds?: { 
    favorite?: boolean; 
    underdog?: boolean; 
    moneyLine?: number; 
    spreadOdds?: number;
    open?: { moneyLine?: { american?: string }; spread?: { american?: string } };
  };
  awayTeamOdds?: { 
    favorite?: boolean; 
    underdog?: boolean; 
    moneyLine?: number; 
    spreadOdds?: number;
    open?: { moneyLine?: { american?: string }; spread?: { american?: string } };
  };
  overOdds?: number;
  underOdds?: number;
  open?: { over?: { american?: string }; under?: { american?: string }; total?: { american?: string } };
}

/**
 * Parse American odds string (e.g., "-110") to number
 */
function parseAmericanOdds(oddsStr?: string): number | undefined {
  if (!oddsStr) return undefined;
  return parseInt(oddsStr, 10);
}

export async function fetchOdds(eventId: string): Promise<OddsEntry[]> {
  const url = `${BASE_URL}/events/${eventId}/competitions/${eventId}/odds`;
  const cached = getCache<OddsEntry[]>(url);
  if (cached) {
    console.log(`✓ Cache hit for NFL odds on event ${eventId}`);
    return cached;
  }

  console.log(`Fetching NFL odds for event ${eventId}...`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`ESPN API error: ${response.status} ${response.statusText}`);
  const data = (await response.json()) as ESPNOddsResponse;

  const oddsEntries: OddsEntry[] = data.items.map(item => {
    // Prefer opening odds, fall back to current/close
    const homeOpenML = parseAmericanOdds(item.homeTeamOdds?.open?.moneyLine?.american) || item.homeTeamOdds?.moneyLine;
    const awayOpenML = parseAmericanOdds(item.awayTeamOdds?.open?.moneyLine?.american) || item.awayTeamOdds?.moneyLine;
    const homeOpenSpread = parseAmericanOdds(item.homeTeamOdds?.open?.spread?.american) || item.homeTeamOdds?.spreadOdds;
    const awayOpenSpread = parseAmericanOdds(item.awayTeamOdds?.open?.spread?.american) || item.awayTeamOdds?.spreadOdds;
    const openOverTotal = parseAmericanOdds(item.open?.total?.american);
    const openOverOdds = parseAmericanOdds(item.open?.over?.american) || item.overOdds;
    const openUnderOdds = parseAmericanOdds(item.open?.under?.american) || item.underOdds;

    // Also capture current odds (if different from opening)
    const homeCurrentML = item.homeTeamOdds?.moneyLine;
    const awayCurrentML = item.awayTeamOdds?.moneyLine;
    const homeCurrentSpread = item.homeTeamOdds?.spreadOdds;
    const awayCurrentSpread = item.awayTeamOdds?.spreadOdds;
    const currentOverTotal = item.overUnder;
    const currentOverOdds = item.overOdds;
    const currentUnderOdds = item.underOdds;

    return {
      provider: { id: item.provider.id, name: item.provider.name, priority: item.provider.priority },
      spread: item.spread,
      overUnder: openOverTotal || item.overUnder,
      homeTeamOdds: { 
        moneyLine: homeOpenML, 
        currentMoneyLine: homeCurrentML !== homeOpenML ? homeCurrentML : undefined,
        spreadOdds: homeOpenSpread,
        currentSpreadOdds: homeCurrentSpread !== homeOpenSpread ? homeCurrentSpread : undefined
      },
      awayTeamOdds: { 
        moneyLine: awayOpenML, 
        currentMoneyLine: awayCurrentML !== awayOpenML ? awayCurrentML : undefined,
        spreadOdds: awayOpenSpread,
        currentSpreadOdds: awayCurrentSpread !== awayOpenSpread ? awayCurrentSpread : undefined
      },
      overOdds: openOverOdds,
      currentOverOdds: currentOverOdds !== openOverOdds ? currentOverOdds : undefined,
      underOdds: openUnderOdds,
      currentUnderOdds: currentUnderOdds !== openUnderOdds ? currentUnderOdds : undefined
    };
  });

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

    legs.push(createBetLeg(eventId, "moneyline", "home", undefined, entry.homeTeamOdds.moneyLine, entry.homeTeamOdds.currentMoneyLine, entry.provider.name, `${homeTeamName} ML ${formatAmericanOdds(entry.homeTeamOdds.moneyLine)}`, homeFair));
    legs.push(createBetLeg(eventId, "moneyline", "away", undefined, entry.awayTeamOdds.moneyLine, entry.awayTeamOdds.currentMoneyLine, entry.provider.name, `${awayTeamName} ML ${formatAmericanOdds(entry.awayTeamOdds.moneyLine)}`, awayFair));
  }

  // Spreads
  if (entry.spread !== undefined && entry.homeTeamOdds.spreadOdds !== undefined && entry.awayTeamOdds.spreadOdds !== undefined) {
    const homeProb = impliedProbability(entry.homeTeamOdds.spreadOdds);
    const awayProb = impliedProbability(entry.awayTeamOdds.spreadOdds);
    const [homeFair, awayFair] = removeVig ? removeVigUtil(homeProb, awayProb) : [homeProb, awayProb];

    legs.push(createBetLeg(eventId, "spread", "home", -entry.spread, entry.homeTeamOdds.spreadOdds, entry.homeTeamOdds.currentSpreadOdds, entry.provider.name, `${homeTeamName} ${-entry.spread > 0 ? "+" : ""}${-entry.spread} (${formatAmericanOdds(entry.homeTeamOdds.spreadOdds)})`, homeFair));
    legs.push(createBetLeg(eventId, "spread", "away", entry.spread, entry.awayTeamOdds.spreadOdds, entry.awayTeamOdds.currentSpreadOdds, entry.provider.name, `${awayTeamName} ${entry.spread > 0 ? "+" : ""}${entry.spread} (${formatAmericanOdds(entry.awayTeamOdds.spreadOdds)})`, awayFair));
  }

  // Totals
  if (entry.overUnder !== undefined && entry.overOdds !== undefined && entry.underOdds !== undefined) {
    const overProb = impliedProbability(entry.overOdds);
    const underProb = impliedProbability(entry.underOdds);
    const [overFair, underFair] = removeVig ? removeVigUtil(overProb, underProb) : [overProb, underProb];

    legs.push(createBetLeg(eventId, "total", undefined, entry.overUnder, entry.overOdds, entry.currentOverOdds, entry.provider.name, `Over ${entry.overUnder} (${formatAmericanOdds(entry.overOdds)})`, overFair));
    legs.push(createBetLeg(eventId, "total", undefined, entry.overUnder, entry.underOdds, entry.currentUnderOdds, entry.provider.name, `Under ${entry.overUnder} (${formatAmericanOdds(entry.underOdds)})`, underFair));
  }

  return legs;
}

function createBetLeg(
  eventId: string,
  market: "moneyline" | "spread" | "total",
  team: TeamSide | undefined,
  line: number | undefined,
  odds: number,
  currentOdds: number | undefined,
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
    currentOdds: currentOdds && currentOdds !== odds ? currentOdds : undefined,
    decimalOdds: americanToDecimal(odds),
    impliedProbability: fairProbability !== undefined ? fairProbability : impliedProbability(odds),
    provider,
    description
  };
}

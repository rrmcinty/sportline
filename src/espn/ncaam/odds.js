/**
 * ESPN NCAAM odds fetcher and normalizer
 */
import fetch from "node-fetch";
import { getCache, setCache } from "../../cache/index.js";
import { americanToDecimal, impliedProbability, formatAmericanOdds, removeVig as removeVigUtil, } from "../../models/probability.js";
const BASE_URL = "https://sports.core.api.espn.com/v2/sports/basketball/leagues/mens-college-basketball";
/**
 * Fetch odds for a specific event
 * @param eventId Event ID
 * @returns Array of odds entries from different providers
 */
export async function fetchOdds(eventId) {
    const url = `${BASE_URL}/events/${eventId}/competitions/${eventId}/odds`;
    const cached = getCache(url);
    if (cached) {
        console.log(`✓ Cache hit for odds on event ${eventId}`);
        return cached;
    }
    console.log(`Fetching odds for event ${eventId}...`);
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`ESPN API error: ${response.status} ${response.statusText}`);
    }
    const data = (await response.json());
    const oddsEntries = data.items.map((item) => ({
        provider: {
            id: item.provider.id,
            name: item.provider.name,
            priority: item.provider.priority,
        },
        spread: item.spread,
        overUnder: item.overUnder,
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
    }));
    // Cache for 5 minutes
    setCache(url, oddsEntries, 5 * 60 * 1000);
    return oddsEntries;
}
/**
 * Convert odds entries to bet legs
 * @param eventId Event ID
 * @param oddsEntries Odds entries from providers
 * @param homeTeamName Home team name
 * @param awayTeamName Away team name
 * @param preferredProvider Preferred provider (default: ESPN BET)
 * @param removeVig Whether to remove vig for fair probabilities (default: true)
 * @returns Array of available bet legs
 */
export function normalizeOdds(eventId, oddsEntries, homeTeamName, awayTeamName, preferredProvider = "ESPN BET", removeVig = true) {
    // Find preferred provider or fall back to highest priority
    const entry = oddsEntries.find((e) => e.provider.name === preferredProvider) ||
        oddsEntries.sort((a, b) => b.provider.priority - a.provider.priority)[0];
    if (!entry) {
        return [];
    }
    const legs = [];
    // Moneylines
    if (entry.homeTeamOdds.moneyLine !== undefined &&
        entry.awayTeamOdds.moneyLine !== undefined) {
        const homeProb = impliedProbability(entry.homeTeamOdds.moneyLine);
        const awayProb = impliedProbability(entry.awayTeamOdds.moneyLine);
        const [homeFair, awayFair] = removeVig
            ? removeVigUtil(homeProb, awayProb)
            : [homeProb, awayProb];
        legs.push(createBetLeg(eventId, "moneyline", "home", undefined, entry.homeTeamOdds.moneyLine, entry.provider.name, `${homeTeamName} ML ${formatAmericanOdds(entry.homeTeamOdds.moneyLine)}`, homeFair));
        legs.push(createBetLeg(eventId, "moneyline", "away", undefined, entry.awayTeamOdds.moneyLine, entry.provider.name, `${awayTeamName} ML ${formatAmericanOdds(entry.awayTeamOdds.moneyLine)}`, awayFair));
    }
    // Spreads
    if (entry.spread !== undefined &&
        entry.homeTeamOdds.spreadOdds !== undefined &&
        entry.awayTeamOdds.spreadOdds !== undefined) {
        const homeProb = impliedProbability(entry.homeTeamOdds.spreadOdds);
        const awayProb = impliedProbability(entry.awayTeamOdds.spreadOdds);
        const [homeFair, awayFair] = removeVig
            ? removeVigUtil(homeProb, awayProb)
            : [homeProb, awayProb];
        legs.push(createBetLeg(eventId, "spread", "home", -entry.spread, entry.homeTeamOdds.spreadOdds, entry.provider.name, `${homeTeamName} ${-entry.spread > 0 ? "+" : ""}${-entry.spread} (${formatAmericanOdds(entry.homeTeamOdds.spreadOdds)})`, homeFair));
        legs.push(createBetLeg(eventId, "spread", "away", entry.spread, entry.awayTeamOdds.spreadOdds, entry.provider.name, `${awayTeamName} ${entry.spread > 0 ? "+" : ""}${entry.spread} (${formatAmericanOdds(entry.awayTeamOdds.spreadOdds)})`, awayFair));
    }
    // Totals
    if (entry.overUnder !== undefined &&
        entry.overOdds !== undefined &&
        entry.underOdds !== undefined) {
        const overProb = impliedProbability(entry.overOdds);
        const underProb = impliedProbability(entry.underOdds);
        const [overFair, underFair] = removeVig
            ? removeVigUtil(overProb, underProb)
            : [overProb, underProb];
        legs.push(createBetLeg(eventId, "total", undefined, entry.overUnder, entry.overOdds, entry.provider.name, `Over ${entry.overUnder} (${formatAmericanOdds(entry.overOdds)})`, overFair));
        legs.push(createBetLeg(eventId, "total", undefined, entry.overUnder, entry.underOdds, entry.provider.name, `Under ${entry.overUnder} (${formatAmericanOdds(entry.underOdds)})`, underFair));
    }
    return legs;
}
/**
 * Create a bet leg with calculated probabilities
 */
function createBetLeg(eventId, market, team, line, odds, provider, description, fairProbability) {
    return {
        eventId,
        market,
        team,
        line,
        odds,
        decimalOdds: americanToDecimal(odds),
        impliedProbability: fairProbability !== undefined
            ? fairProbability
            : impliedProbability(odds),
        provider,
        description,
    };
}
//# sourceMappingURL=odds.js.map
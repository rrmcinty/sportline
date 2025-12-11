/**
 * ESPN College Football (CFB) odds fetcher + normalizer
 */
import fetch from "node-fetch";
import { getCache, setCache } from "../../cache/index.js";
import { americanToDecimal, impliedProbability, formatAmericanOdds, removeVig as removeVigUtil, } from "../../models/probability.js";
const BASE_URL = "https://sports.core.api.espn.com/v2/sports/football/leagues/college-football";
/**
 * Parse American odds string (e.g., "-110") to number
 */
function parseAmericanOdds(oddsStr) {
    if (!oddsStr)
        return undefined;
    return parseInt(oddsStr, 10);
}
export async function fetchOdds(eventId) {
    const url = `${BASE_URL}/events/${eventId}/competitions/${eventId}/odds`;
    const cached = getCache(url);
    if (cached) {
        console.log(`✓ Cache hit for CFB odds on event ${eventId}`);
        return cached;
    }
    console.log(`Fetching CFB odds for event ${eventId}...`);
    const response = await fetch(url);
    if (!response.ok)
        throw new Error(`ESPN API error: ${response.status} ${response.statusText}`);
    const data = (await response.json());
    const oddsEntries = data.items.map((item) => {
        // Prefer opening odds, fall back to current/close
        const homeOpenML = parseAmericanOdds(item.homeTeamOdds?.open?.moneyLine?.american) ||
            item.homeTeamOdds?.moneyLine;
        const awayOpenML = parseAmericanOdds(item.awayTeamOdds?.open?.moneyLine?.american) ||
            item.awayTeamOdds?.moneyLine;
        const homeOpenSpread = parseAmericanOdds(item.homeTeamOdds?.open?.spread?.american) ||
            item.homeTeamOdds?.spreadOdds;
        const awayOpenSpread = parseAmericanOdds(item.awayTeamOdds?.open?.spread?.american) ||
            item.awayTeamOdds?.spreadOdds;
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
            provider: {
                id: item.provider.id,
                name: item.provider.name,
                priority: item.provider.priority,
            },
            spread: item.spread,
            overUnder: openOverTotal || item.overUnder,
            homeTeamOdds: {
                moneyLine: homeOpenML,
                currentMoneyLine: homeCurrentML !== homeOpenML ? homeCurrentML : undefined,
                spreadOdds: homeOpenSpread,
                currentSpreadOdds: homeCurrentSpread !== homeOpenSpread ? homeCurrentSpread : undefined,
            },
            awayTeamOdds: {
                moneyLine: awayOpenML,
                currentMoneyLine: awayCurrentML !== awayOpenML ? awayCurrentML : undefined,
                spreadOdds: awayOpenSpread,
                currentSpreadOdds: awayCurrentSpread !== awayOpenSpread ? awayCurrentSpread : undefined,
            },
            overOdds: openOverOdds,
            currentOverOdds: currentOverOdds !== openOverOdds ? currentOverOdds : undefined,
            underOdds: openUnderOdds,
            currentUnderOdds: currentUnderOdds !== openUnderOdds ? currentUnderOdds : undefined,
        };
    });
    setCache(url, oddsEntries, 5 * 60 * 1000);
    return oddsEntries;
}
export function normalizeOdds(eventId, oddsEntries, homeTeamName, awayTeamName, preferredProvider = "ESPN BET", removeVig = true) {
    const entry = oddsEntries.find((e) => e.provider.name === preferredProvider) ||
        oddsEntries.sort((a, b) => b.provider.priority - a.provider.priority)[0];
    if (!entry)
        return [];
    const legs = [];
    // Moneylines
    if (entry.homeTeamOdds.moneyLine !== undefined &&
        entry.awayTeamOdds.moneyLine !== undefined) {
        const homeOdds = entry.homeTeamOdds.moneyLine;
        const awayOdds = entry.awayTeamOdds.moneyLine;
        const homeProb = impliedProbability(homeOdds);
        const awayProb = impliedProbability(awayOdds);
        const [homeFair, awayFair] = removeVig
            ? removeVigUtil(homeProb, awayProb)
            : [homeProb, awayProb];
        // Determine favorite/underdog
        let homeLabel = "underdog";
        let awayLabel = "underdog";
        if (homeOdds < awayOdds) {
            homeLabel = "favorite";
        }
        else if (awayOdds < homeOdds) {
            awayLabel = "favorite";
        }
        legs.push(createBetLeg(eventId, "moneyline", "home", undefined, homeOdds, entry.homeTeamOdds.currentMoneyLine, entry.provider.name, `${homeTeamName} ML ${formatAmericanOdds(homeOdds)}`, homeFair));
        legs.push(createBetLeg(eventId, "moneyline", "away", undefined, awayOdds, entry.awayTeamOdds.currentMoneyLine, entry.provider.name, `${awayTeamName} ML ${formatAmericanOdds(awayOdds)}`, awayFair));
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
        legs.push(createBetLeg(eventId, "spread", "home", -entry.spread, entry.homeTeamOdds.spreadOdds, entry.homeTeamOdds.currentSpreadOdds, entry.provider.name, `${homeTeamName} ${-entry.spread > 0 ? "+" : ""}${-entry.spread} (${formatAmericanOdds(entry.homeTeamOdds.spreadOdds)})`, homeFair));
        legs.push(createBetLeg(eventId, "spread", "away", entry.spread, entry.awayTeamOdds.spreadOdds, entry.awayTeamOdds.currentSpreadOdds, entry.provider.name, `${awayTeamName} ${entry.spread > 0 ? "+" : ""}${entry.spread} (${formatAmericanOdds(entry.awayTeamOdds.spreadOdds)})`, awayFair));
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
        legs.push(createBetLeg(eventId, "total", undefined, entry.overUnder, entry.overOdds, entry.currentOverOdds, entry.provider.name, `Over ${entry.overUnder} (${formatAmericanOdds(entry.overOdds)})`, overFair));
        legs.push(createBetLeg(eventId, "total", undefined, entry.overUnder, entry.underOdds, entry.currentUnderOdds, entry.provider.name, `Under ${entry.overUnder} (${formatAmericanOdds(entry.underOdds)})`, underFair));
    }
    return legs;
}
function createBetLeg(eventId, market, team, line, odds, currentOdds, provider, description, fairProbability) {
    return {
        eventId,
        market,
        team,
        line,
        odds,
        currentOdds: currentOdds && currentOdds !== odds ? currentOdds : undefined,
        decimalOdds: americanToDecimal(odds),
        impliedProbability: fairProbability !== undefined
            ? fairProbability
            : impliedProbability(odds),
        provider,
        description,
    };
}
//# sourceMappingURL=odds.js.map
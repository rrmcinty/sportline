/**
 * ESPN API client for fetching odds
 */

export interface OddsData {
  gameId: string;
  priceHome: number | null;
  priceAway: number | null;
  line: number | null;
  provider: string;
}

/**
 * Fetch odds for a game from ESPN API
 */
export async function fetchGameOdds(
  sport: string,
  league: string,
  gameId: string,
): Promise<OddsData | null> {
  // Extract competition ID from game ID (ESPN format: gameId = eventId)
  const espnSport = getEspnSport(sport);
  const url = `https://sports.core.api.espn.com/v2/sports/${espnSport}/leagues/${league}/events/${gameId}/competitions/${gameId}/odds`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.log(
        `  Failed to fetch odds for game ${gameId}: ${response.status} ${response.statusText}`,
      );
      return null;
    }

    const data = await response.json();
    if (!data.items || data.items.length === 0) {
      console.log(`  No odds items for game ${gameId}`);
      return null;
    }

    // Use first provider (usually consensus or primary book)
    const odds = data.items[0];
    const homeOdds = odds.homeTeamOdds;
    const awayOdds = odds.awayTeamOdds;

    return {
      gameId,
      priceHome: homeOdds?.moneyLine ?? null,
      priceAway: awayOdds?.moneyLine ?? null,
      line: odds.spread ?? null, // Top-level spread is the line (e.g., -13.5)
      provider: odds.provider?.name || 'consensus',
    };
  } catch (error) {
    console.error(`  Error fetching odds for game ${gameId}:`, error);
    return null;
  }
}

/**
 * Map sport to ESPN API sport name
 */
function getEspnSport(sport: string): string {
  const mapping: Record<string, string> = {
    nba: 'basketball',
    ncaam: 'basketball',
    nhl: 'hockey',
    nfl: 'football',
    cfb: 'football',
  };
  return mapping[sport] || sport;
}

/**
 * Map sport to ESPN league name
 */
function getLeague(sport: string): string {
  const mapping: Record<string, string> = {
    nba: 'nba',
    ncaam: 'mens-college-basketball',
    nhl: 'nhl',
    nfl: 'nfl',
    cfb: 'college-football',
  };
  return mapping[sport] || sport;
}

/**
 * Fetch odds for multiple games
 */
export async function fetchOddsForGames(
  sport: string,
  gameIds: string[],
): Promise<Map<string, OddsData>> {
  const league = getLeague(sport);
  const oddsMap = new Map<string, OddsData>();

  // Fetch odds in parallel with some rate limiting
  const batchSize = 10;
  for (let i = 0; i < gameIds.length; i += batchSize) {
    const batch = gameIds.slice(i, i + batchSize);
    const promises = batch.map((gameId) => fetchGameOdds(sport, league, gameId));
    const results = await Promise.all(promises);

    for (const odds of results) {
      if (odds) {
        oddsMap.set(odds.gameId, odds);
      }
    }
  }

  return oddsMap;
}

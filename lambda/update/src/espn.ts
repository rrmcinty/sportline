/**
 * ESPN API client for fetching odds and schedules
 */

export interface OddsData {
  gameId: string;
  priceHome: number | null;
  priceAway: number | null;
  line: number | null;
  provider: string;
}

export interface UpcomingGame {
  id: string;
  sport: string;
  date: string;
  season: number;
  homeTeamId: string;
  awayTeamId: string;
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

/**
 * Fetch upcoming games from ESPN scoreboard API
 * Returns games that are scheduled but not yet started (next 7 days)
 */
export async function fetchUpcomingGames(sport: string): Promise<UpcomingGame[]> {
  const espnSport = getEspnSport(sport);
  const league = getLeague(sport);

  // Format dates for ESPN API (YYYYMMDD-YYYYMMDD)
  const today = new Date();
  const endDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000); // +7 days
  const formatDate = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

  const dates = `${formatDate(today)}-${formatDate(endDate)}`;
  let url = `https://site.api.espn.com/apis/site/v2/sports/${espnSport}/${league}/scoreboard?dates=${dates}`;

  try {
    let response = await fetch(url);

    // If dates parameter fails (404 or empty), try without dates (college sports limitation)
    if (!response.ok || response.status === 404) {
      console.log(`  Dates parameter not supported for ${sport}, trying without dates`);
      url = `https://site.api.espn.com/apis/site/v2/sports/${espnSport}/${league}/scoreboard`;
      response = await fetch(url);

      if (!response.ok) {
        console.error(`Failed to fetch scoreboard for ${sport}: ${response.status}`);
        return [];
      }
    }

    const data = await response.json();
    const events = data.events || [];

    // If dates query returned empty, try without dates
    if (events.length === 0 && url.includes('dates=')) {
      console.log(`  No events with dates parameter, trying without dates for ${sport}`);
      url = `https://site.api.espn.com/apis/site/v2/sports/${espnSport}/${league}/scoreboard`;
      response = await fetch(url);
      if (response.ok) {
        const fallbackData = await response.json();
        events.push(...(fallbackData.events || []));
      }
    }

    const upcomingGames: UpcomingGame[] = [];

    for (const event of events) {
      // Only include games that are scheduled (not in-progress or completed)
      const status = event.status?.type?.name;
      if (status !== 'STATUS_SCHEDULED') {
        continue;
      }

      const competition = event.competitions?.[0];
      if (!competition) continue;

      const homeTeam = competition.competitors?.find((c: any) => c.homeAway === 'home');
      const awayTeam = competition.competitors?.find((c: any) => c.homeAway === 'away');

      if (!homeTeam || !awayTeam) continue;

      upcomingGames.push({
        id: event.id,
        sport,
        date: event.date,
        season: event.season?.year || new Date().getFullYear(),
        homeTeamId: homeTeam.team.id,
        awayTeamId: awayTeam.team.id,
      });
    }

    console.log(`  Found ${upcomingGames.length} upcoming ${sport.toUpperCase()} games`);
    return upcomingGames;
  } catch (error) {
    console.error(`Error fetching upcoming games for ${sport}:`, error);
    return [];
  }
}

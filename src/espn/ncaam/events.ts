/**
 * ESPN NCAAM events fetcher
 */

import fetch from "node-fetch";
import { getCache, setCache } from "../../cache/index.js";
import type { Competition } from "../../models/types.js";

interface TeamStats {
  teamId: string;
  stats: Record<string, number>;
}

const BASE_URL =
  "https://sports.core.api.espn.com/v2/sports/basketball/leagues/mens-college-basketball";

interface ESPNEventRef {
  $ref: string;
}

interface ESPNEventsResponse {
  count: number;
  items: ESPNEventRef[];
}

interface ESPNEvent {
  id: string;
  uid: string;
  date: string;
  name: string;
  shortName: string;
  competitions: Array<{
    id: string;
    competitors: Array<{
      id: string;
      uid: string;
      type: string;
      order: number;
      homeAway: "home" | "away";
      winner?: boolean;
      team: {
        $ref: string;
      };
      score?: {
        $ref: string;
      };
    }>;
    status: {
      $ref: string;
    };
    venue?: {
      fullName?: string;
    };
  }>;
}

interface ESPNScore {
  value: number;
  displayValue: string;
}

interface ESPNTeam {
  id: string;
  displayName: string;
  abbreviation?: string;
}

/**
 * Fetch NCAAM events for a specific date
 * @param date Date in YYYYMMDD format
 * @returns Array of competitions
 */
export async function fetchEvents(date: string): Promise<Competition[]> {
  const url = `${BASE_URL}/events?dates=${date}&limit=100`;

  // Check cache
  const cached = getCache<Competition[]>(url);
  if (cached) {
    console.log(`✓ Cache hit for events on ${date}`);
    return cached;
  }

  console.log(`Fetching NCAAM events for ${date}...`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `ESPN API error: ${response.status} ${response.statusText}`,
    );
  }
  const data = (await response.json()) as ESPNEventsResponse;
  if (data.count === 0) {
    console.log(`No games found for ${date}`);
    return [];
  }

  // Fetch full event details and box score stats for each event
  const competitions: Competition[] = [];
  for (const eventRef of data.items) {
    try {
      const event = await fetchEventDetail(eventRef.$ref);
      // Fetch box score stats from summary endpoint
      const summary = await fetchSummary(event.id);
      const teamStats = extractTeamStats(summary);
      // console.log(`[boxscore] Event ${event.id}:`, JSON.stringify(teamStats, null, 2));
      const competition = await parseEvent(event, teamStats);
      if (competition) {
        competitions.push(competition);
      }
    } catch (error) {
      console.warn(`Failed to fetch event ${eventRef.$ref}:`, error);
    }
  }
  // Cache for 5 minutes
  setCache(url, competitions, 5 * 60 * 1000);
  return competitions;
}

/**
 * Fetch full event details
 */
async function fetchEventDetail(url: string): Promise<ESPNEvent> {
  const cached = getCache<ESPNEvent>(url);
  if (cached) {
    return cached;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch event: ${response.status}`);
  }

  const data = (await response.json()) as ESPNEvent;
  setCache(url, data, 5 * 60 * 1000);
  return data;
}

/**
 * Fetch box score summary for an event
 */
async function fetchSummary(eventId: string): Promise<any> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary?event=${eventId}`;
  const cached = getCache<any>(url);
  if (cached) {
    return cached;
  }
  const response = await fetch(url);
  // console.log(`site api response: ${JSON.stringify(response)}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch summary: ${response.status}`);
  }
  const data = await response.json();
  setCache(url, data, 5 * 60 * 1000);
  return data;
}

/**
 * Extract team box score stats from summary response
 */
function extractTeamStats(summary: any): TeamStats[] {
  if (!summary.boxscore || !summary.boxscore.teams) return [];
  return summary.boxscore.teams.map((team: any) => {
    const stats: Record<string, string> = {};
    if (Array.isArray(team.statistics)) {
      for (const stat of team.statistics) {
        if (stat.name && typeof stat.displayValue === "string") {
          stats[stat.name] = stat.displayValue;
        }
      }
    }
    // console.log(`[team stats] teamId=${team.team.id}`, stats);
    return {
      teamId: team.team.id,
      stats,
    };
  });
}

/**
 * Fetch team details
 */
async function fetchTeam(url: string): Promise<ESPNTeam> {
  const cached = getCache<ESPNTeam>(url);
  if (cached) {
    return cached;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch team: ${response.status}`);
  }

  const data = (await response.json()) as ESPNTeam;
  setCache(url, data, 60 * 60 * 1000); // Cache teams for 1 hour
  return data;
}

/**
 * Fetch score details
 */
async function fetchScore(url: string): Promise<number | null> {
  const cached = getCache<ESPNScore>(url);
  if (cached) {
    return cached.value;
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as ESPNScore;
    setCache(url, data, 60 * 60 * 1000); // Cache scores for 1 hour
    return data.value;
  } catch (error) {
    // Score not available yet
    return null;
  }
}

/**
 * Parse ESPN event into Competition
 */
async function parseEvent(
  event: ESPNEvent,
  teamStats?: TeamStats[],
): Promise<Competition | null> {
  if (!event.competitions || event.competitions.length === 0) {
    return null;
  }
  const comp = event.competitions[0];
  const homeCompetitor = comp.competitors.find((c) => c.homeAway === "home");
  const awayCompetitor = comp.competitors.find((c) => c.homeAway === "away");
  if (!homeCompetitor || !awayCompetitor) {
    return null;
  }
  // Fetch team details and scores in parallel
  const [homeTeam, awayTeam, homeScore, awayScore] = await Promise.all([
    fetchTeam(homeCompetitor.team.$ref),
    fetchTeam(awayCompetitor.team.$ref),
    homeCompetitor.score?.$ref
      ? fetchScore(homeCompetitor.score.$ref)
      : Promise.resolve(null),
    awayCompetitor.score?.$ref
      ? fetchScore(awayCompetitor.score.$ref)
      : Promise.resolve(null),
  ]);
  // Attach box score stats if available
  let boxScore:
    | { home: Record<string, number>; away: Record<string, number> }
    | undefined;
  if (teamStats && teamStats.length === 2) {
    if (teamStats[0].teamId === homeTeam.id) {
      boxScore = {
        home: teamStats[0].stats,
        away: teamStats[1].stats,
      };
    } else {
      boxScore = {
        home: teamStats[1].stats,
        away: teamStats[0].stats,
      };
    }
  }
  return {
    id: comp.id,
    eventId: event.id,
    sport: "ncaam",
    date: event.date,
    homeTeam: {
      id: homeTeam.id,
      name: homeTeam.displayName,
      abbreviation: homeTeam.abbreviation,
    },
    awayTeam: {
      id: awayTeam.id,
      name: awayTeam.displayName,
      abbreviation: awayTeam.abbreviation,
    },
    status: "scheduled",
    venue: comp.venue?.fullName,
    homeScore,
    awayScore,
    boxScore,
  };
}

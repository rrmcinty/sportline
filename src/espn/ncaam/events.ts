/**
 * ESPN NCAAM events fetcher
 */

import fetch from "node-fetch";
import { getCache, setCache } from "../../cache/index.js";
import type { Competition } from "../../models/types.js";

const BASE_URL = "https://sports.core.api.espn.com/v2/sports/basketball/leagues/mens-college-basketball";

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
      team: {
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
    throw new Error(`ESPN API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as ESPNEventsResponse;

  if (data.count === 0) {
    console.log(`No games found for ${date}`);
    return [];
  }

  // Fetch full event details for each event
  const competitions: Competition[] = [];

  for (const eventRef of data.items) {
    try {
      const event = await fetchEventDetail(eventRef.$ref);
      const competition = await parseEvent(event);
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
 * Parse ESPN event into Competition
 */
async function parseEvent(event: ESPNEvent): Promise<Competition | null> {
  if (!event.competitions || event.competitions.length === 0) {
    return null;
  }

  const comp = event.competitions[0];
  const homeCompetitor = comp.competitors.find((c) => c.homeAway === "home");
  const awayCompetitor = comp.competitors.find((c) => c.homeAway === "away");

  if (!homeCompetitor || !awayCompetitor) {
    return null;
  }

  // Fetch team details
  const [homeTeam, awayTeam] = await Promise.all([
    fetchTeam(homeCompetitor.team.$ref),
    fetchTeam(awayCompetitor.team.$ref),
  ]);

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
  };
}

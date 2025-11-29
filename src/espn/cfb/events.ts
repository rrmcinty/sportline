/**
 * ESPN College Football (CFB) events fetcher
 */

import fetch from "node-fetch";
import { getCache, setCache } from "../../cache/index.js";
import type { Competition } from "../../models/types.js";

// ESPN base URL for college football
const BASE_URL = "https://sports.core.api.espn.com/v2/sports/football/leagues/college-football";

interface ESPNEventRef { $ref: string; }
interface ESPNEventsResponse { count: number; items: ESPNEventRef[]; }

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
      team: { $ref: string };
    }>;
    status: { $ref: string };
    venue?: { fullName?: string };
  }>;
}

interface ESPNTeam { id: string; displayName: string; abbreviation?: string; }

/**
 * Fetch CFB events for a specific date (YYYYMMDD)
 */
export async function fetchEvents(date: string): Promise<Competition[]> {
  const url = `${BASE_URL}/events?dates=${date}&limit=100`;

  const cached = getCache<Competition[]>(url);
  if (cached) {
    console.log(`✓ Cache hit for CFB events on ${date}`);
    return cached;
  }

  console.log(`Fetching CFB events for ${date}...`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`ESPN API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as ESPNEventsResponse;
  if (data.count === 0) {
    console.log(`No CFB games found for ${date}`);
    return [];
  }

  const competitions: Competition[] = [];
  for (const eventRef of data.items) {
    try {
      const event = await fetchEventDetail(eventRef.$ref);
      const competition = await parseEvent(event);
      if (competition) competitions.push(competition);
    } catch (err) {
      console.warn(`Failed to fetch CFB event ${eventRef.$ref}:`, err);
    }
  }

  // Cache events for 5 minutes (live) – can refine based on status later
  setCache(url, competitions, 5 * 60 * 1000);
  return competitions;
}

async function fetchEventDetail(url: string): Promise<ESPNEvent> {
  const cached = getCache<ESPNEvent>(url);
  if (cached) return cached;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch CFB event: ${response.status}`);
  const data = (await response.json()) as ESPNEvent;
  setCache(url, data, 5 * 60 * 1000);
  return data;
}

async function fetchTeam(url: string): Promise<ESPNTeam> {
  const cached = getCache<ESPNTeam>(url);
  if (cached) return cached;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch CFB team: ${response.status}`);
  const data = (await response.json()) as ESPNTeam;
  setCache(url, data, 60 * 60 * 1000);
  return data;
}

async function parseEvent(event: ESPNEvent): Promise<Competition | null> {
  if (!event.competitions?.length) return null;
  const comp = event.competitions[0];
  const homeCompetitor = comp.competitors.find(c => c.homeAway === "home");
  const awayCompetitor = comp.competitors.find(c => c.homeAway === "away");
  if (!homeCompetitor || !awayCompetitor) return null;

  const [homeTeam, awayTeam] = await Promise.all([
    fetchTeam(homeCompetitor.team.$ref),
    fetchTeam(awayCompetitor.team.$ref)
  ]);

  return {
    id: comp.id,
    eventId: event.id,
    sport: "cfb",
    date: event.date,
    homeTeam: { id: homeTeam.id, name: homeTeam.displayName, abbreviation: homeTeam.abbreviation },
    awayTeam: { id: awayTeam.id, name: awayTeam.displayName, abbreviation: awayTeam.abbreviation },
    status: "scheduled", // could derive from status ref later
    venue: comp.venue?.fullName
  };
}

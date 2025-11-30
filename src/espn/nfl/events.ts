/**
 * ESPN NFL events fetcher
 */

import fetch from "node-fetch";
import { getCache, setCache } from "../../cache/index.js";
import type { Competition } from "../../models/types.js";

// ESPN base URL for NFL
const BASE_URL = "https://sports.core.api.espn.com/v2/sports/football/leagues/nfl";

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
      winner?: boolean;
      team: { $ref: string };
      score?: { $ref: string };
    }>;
    status: { $ref: string };
    venue?: { fullName?: string };
  }>;
}

interface ESPNScore {
  value: number;
  displayValue: string;
}

interface ESPNStatus {
  type: {
    id: string;
    name: string;
    state: string;
    completed: boolean;
    description: string;
    detail: string;
    shortDetail: string;
  };
}

interface ESPNTeam { id: string; displayName: string; abbreviation?: string; }

/**
 * Fetch NFL events for a specific date (YYYYMMDD)
 */
export async function fetchEvents(date: string): Promise<Competition[]> {
  const url = `${BASE_URL}/events?dates=${date}&limit=100`;

  const cached = getCache<Competition[]>(url);
  if (cached) {
    console.log(`✓ Cache hit for NFL events on ${date}`);
    return cached;
  }

  console.log(`Fetching NFL events for ${date}...`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`ESPN API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as ESPNEventsResponse;
  if (data.count === 0) {
    console.log(`No NFL games found for ${date}`);
    return [];
  }

  const competitions: Competition[] = [];
  for (const eventRef of data.items) {
    try {
      const event = await fetchEventDetail(eventRef.$ref);
      const competition = await parseEvent(event);
      if (competition) competitions.push(competition);
    } catch (err) {
      console.warn(`Failed to fetch NFL event ${eventRef.$ref}:`, err);
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
  if (!response.ok) throw new Error(`Failed to fetch NFL event: ${response.status}`);
  const data = (await response.json()) as ESPNEvent;
  setCache(url, data, 5 * 60 * 1000);
  return data;
}

async function fetchTeam(url: string): Promise<ESPNTeam> {
  const cached = getCache<ESPNTeam>(url);
  if (cached) return cached;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch NFL team: ${response.status}`);
  const data = (await response.json()) as ESPNTeam;
  setCache(url, data, 60 * 60 * 1000);
  return data;
}

async function fetchScore(url: string): Promise<number | null> {
  const cached = getCache<ESPNScore>(url);
  if (cached) return cached.value;
  
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = (await response.json()) as ESPNScore;
    setCache(url, data, 60 * 60 * 1000);
    return data.value;
  } catch (error) {
    return null;
  }
}

async function fetchStatus(url: string): Promise<string> {
  const cached = getCache<ESPNStatus>(url);
  if (cached) {
    if (cached.type.completed) return "final";
    if (cached.type.state === "in") return "in-progress";
    return "scheduled";
  }
  
  try {
    const response = await fetch(url);
    if (!response.ok) return "scheduled";
    const data = (await response.json()) as ESPNStatus;
    setCache(url, data, 5 * 60 * 1000);
    if (data.type.completed) return "final";
    if (data.type.state === "in") return "in-progress";
    return "scheduled";
  } catch (error) {
    return "scheduled";
  }
}

async function parseEvent(event: ESPNEvent): Promise<Competition | null> {
  if (!event.competitions?.length) return null;
  const comp = event.competitions[0];
  const homeCompetitor = comp.competitors.find(c => c.homeAway === "home");
  const awayCompetitor = comp.competitors.find(c => c.homeAway === "away");
  if (!homeCompetitor || !awayCompetitor) return null;

  const [homeTeam, awayTeam, homeScore, awayScore, status] = await Promise.all([
    fetchTeam(homeCompetitor.team.$ref),
    fetchTeam(awayCompetitor.team.$ref),
    homeCompetitor.score?.$ref ? fetchScore(homeCompetitor.score.$ref) : Promise.resolve(null),
    awayCompetitor.score?.$ref ? fetchScore(awayCompetitor.score.$ref) : Promise.resolve(null),
    fetchStatus(comp.status.$ref),
  ]);

  return {
    id: comp.id,
    eventId: event.id,
    sport: "nfl",
    date: event.date,
    homeTeam: { id: homeTeam.id, name: homeTeam.displayName, abbreviation: homeTeam.abbreviation },
    awayTeam: { id: awayTeam.id, name: awayTeam.displayName, abbreviation: awayTeam.abbreviation },
    status,
    venue: comp.venue?.fullName,
    homeScore,
    awayScore,
  };
}

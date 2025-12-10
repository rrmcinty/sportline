/**
 * ESPN NHL events fetcher
 */

import fetch from "node-fetch";
import { getCache, setCache } from "../../cache/index.js";
import type { Competition, Team } from "../../models/types.js";

// Helper to fetch status from $ref (like NBA/CFB)
async function fetchStatus(url: string): Promise<string> {
  try {
    const response = await fetch(url);
    if (!response.ok) return "scheduled";
    const data = (await response.json()) as { type?: { name?: string } }; // ESPN status type: { type: { name: "final" | "inprogress" | "scheduled" } }
    return data.type?.name || "scheduled";
  } catch {
    return "scheduled";
  }
}

// ESPN base URL for NHL
const BASE_URL =
  "https://sports.core.api.espn.com/v2/sports/hockey/leagues/nhl";

async function fetchScore(url: string): Promise<number | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = (await response.json()) as { value: number };
    return data.value;
  } catch (error) {
    return null;
  }
}

async function fetchTeamDetails(
  url: string,
): Promise<{ id: string; displayName: string; abbreviation?: string }> {
  const response = await fetch(url);
  const data = (await response.json()) as any;
  return {
    id: data.id,
    displayName: data.displayName || data.location || data.name,
    abbreviation: data.abbreviation,
  };
}

export async function fetchNHLEvents(date: string): Promise<Competition[]> {
  // ESPN API expects YYYYMMDD
  const url = `${BASE_URL}/events?dates=${date.replace(/-/g, "")}`;

  const cached = getCache<Competition[]>(url);
  if (cached) {
    console.log(`✓ Cache hit for NHL events on ${date}`);
    return cached;
  }

  console.log(`Fetching NHL events for ${date}...`);
  const resp = await fetch(url);
  const data = (await resp.json()) as { count?: number; items?: any[] };

  if (!data.items || data.count === 0) {
    console.log(`No NHL games found for ${date}`);
    return [];
  }

  // Fetch each event's details
  const events: Competition[] = [];
  for (const item of data.items) {
    try {
      const eventResp = await fetch(item.$ref);
      const eventData = (await eventResp.json()) as any;
      const compData = eventData.competitions && eventData.competitions[0];
      if (!compData) continue;

      const competitors = compData.competitors;
      const home = competitors.find((c: any) => c.homeAway === "home");
      const away = competitors.find((c: any) => c.homeAway === "away");
      if (!home || !away) continue;

      // Fetch team details and scores via $ref links (like NBA does)
      const [homeTeamData, awayTeamData, homeScore, awayScore, status] =
        await Promise.all([
          home.team?.$ref
            ? fetchTeamDetails(home.team.$ref)
            : Promise.resolve({
                id: home.id,
                displayName: "Home",
                abbreviation: undefined as string | undefined,
              }),
          away.team?.$ref
            ? fetchTeamDetails(away.team.$ref)
            : Promise.resolve({
                id: away.id,
                displayName: "Away",
                abbreviation: undefined as string | undefined,
              }),
          home.score?.$ref
            ? fetchScore(home.score.$ref)
            : Promise.resolve(null),
          away.score?.$ref
            ? fetchScore(away.score.$ref)
            : Promise.resolve(null),
          compData.status?.$ref
            ? fetchStatus(compData.status.$ref)
            : Promise.resolve(compData.status?.type?.name || "scheduled"),
        ]);

      const homeTeam: Team = {
        id: homeTeamData.id,
        name: homeTeamData.displayName,
        abbreviation: homeTeamData.abbreviation || undefined,
      };
      const awayTeam: Team = {
        id: awayTeamData.id,
        name: awayTeamData.displayName,
        abbreviation: awayTeamData.abbreviation || undefined,
      };

      events.push({
        id: compData.id,
        eventId: eventData.id,
        sport: "nhl",
        date: eventData.date,
        homeTeam,
        awayTeam,
        status,
        venue: compData.venue?.fullName || undefined,
        homeScore,
        awayScore,
      });
    } catch (err) {
      console.warn(`Failed to fetch NHL event ${item.$ref}:`, err);
    }
  }

  // Cache for 5 minutes
  setCache(url, events, 5 * 60 * 1000);
  return events;
}

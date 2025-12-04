/**
 * ESPN API client for NCAAM data
 * Simple, focused on what we need: games, scores, odds
 */

import fetch from 'node-fetch';
import type { Game, Team, Odds } from './types.js';
import { removeVig } from './types.js';

const BASE_URL = 'https://sports.core.api.espn.com/v2/sports/basketball/leagues/mens-college-basketball';

/**
 * Fetch games for a specific date
 * Date format: YYYYMMDD (e.g., 20231115)
 */
export async function fetchGames(date: string): Promise<Array<{ game: Game; homeTeam: Team; awayTeam: Team; odds?: Odds }>> {
  // Convert YYYY-MM-DD to YYYYMMDD if needed
  const dateStr = date.replace(/-/g, '');
  const url = `${BASE_URL}/events?dates=${dateStr}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`ESPN API error: ${response.status}`);
    
    const data = await response.json() as any;
    const events = data.items || [];
    
    const results: Array<{ game: Game; homeTeam: Team; awayTeam: Team; odds?: Odds }> = [];
    
    for (const eventRef of events) {
      try {
        // Fetch full event details
        const eventResponse = await fetch(eventRef.$ref);
        const event = await eventResponse.json() as any;
        
        // Skip if missing required data
        if (!event.competitions || !event.competitions[0]) {
          continue;
        }
        
        const competition = event.competitions[0];
        const competitors = competition.competitors || [];
        
        // Find home and away teams
        const homeCompetitor = competitors.find((c: any) => c.homeAway === 'home');
        const awayCompetitor = competitors.find((c: any) => c.homeAway === 'away');
        
        if (!homeCompetitor || !awayCompetitor) {
          continue;
        }
        
        // Parse teams
        const homeTeam = await parseTeam(homeCompetitor);
        const awayTeam = await parseTeam(awayCompetitor);
        
        // Fetch status
        let status: 'scheduled' | 'final' | 'in_progress' = 'scheduled';
        if (competition.status?.$ref) {
          const statusResp = await fetch(competition.status.$ref);
          const statusData = await statusResp.json() as any;
          status = parseStatus(statusData.type?.name || 'scheduled');
        }
        
        // Fetch scores if they exist
        let homeScore: number | undefined;
        let awayScore: number | undefined;
        
        if (homeCompetitor.score?.$ref) {
          const scoreResp = await fetch(homeCompetitor.score.$ref);
          const scoreData = await scoreResp.json() as any;
          homeScore = scoreData.value ? parseInt(scoreData.value) : undefined;
        }
        
        if (awayCompetitor.score?.$ref) {
          const scoreResp = await fetch(awayCompetitor.score.$ref);
          const scoreData = await scoreResp.json() as any;
          awayScore = scoreData.value ? parseInt(scoreData.value) : undefined;
        }
        
        // Parse game
        const game: Game = {
          id: parseInt(event.id),
          date: event.date.split('T')[0], // Extract YYYY-MM-DD
          season: determineSeason(event.date),
          homeTeamId: homeTeam.id,
          awayTeamId: awayTeam.id,
          homeScore,
          awayScore,
          status,
          venue: competition.venue?.fullName
        };
        
        // Fetch odds if available
        let odds: Odds | undefined;
        if (competition.odds) {
          const fetchedOdds = await fetchOdds(game.id);
          odds = fetchedOdds || undefined;
        }
        
        results.push({ game, homeTeam, awayTeam, odds });
        
      } catch (eventError) {
        // Silently skip errors
        continue;
      }
      
      // Rate limiting: 1 request per second
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return results;
    
  } catch (error) {
    console.error(`Error fetching games for ${date}:`, error);
    throw error;
  }
}

/**
 * Fetch odds for a specific game
 */
export async function fetchOdds(gameId: number): Promise<Odds | null> {
  try {
    const url = `${BASE_URL}/events/${gameId}/competitions/${gameId}/odds`;
    const response = await fetch(url);
    if (!response.ok) return null;
    
    const data = await response.json() as any;
    const items = data.items || [];
    
    // Find ESPN BET or fallback to first provider
    const oddsEntry = items.find((item: any) => item.provider.name === 'ESPN BET') || items[0];
    if (!oddsEntry) return null;
    
    const homeML = oddsEntry.homeTeamOdds?.moneyLine;
    const awayML = oddsEntry.awayTeamOdds?.moneyLine;
    
    if (!homeML || !awayML) return null;
    
    // Remove vig to get fair probabilities
    const vigFree = removeVig(homeML, awayML);
    
    return {
      gameId,
      homeML,
      awayML,
      homeImpliedProb: vigFree.home,
      awayImpliedProb: vigFree.away,
      provider: oddsEntry.provider.name,
      updatedAt: new Date().toISOString()
    };
    
  } catch (error) {
    console.error(`Error fetching odds for game ${gameId}:`, error);
    return null;
  }
}

/**
 * Helper: Parse team from competitor object
 */
async function parseTeam(competitor: any): Promise<Team> {
  const teamRef = competitor.team.$ref;
  const response = await fetch(teamRef);
  const team = await response.json() as any;
  
  return {
    id: parseInt(team.id),
    name: team.displayName,
    abbreviation: team.abbreviation,
    conference: team.groups?.[0]?.name
  };
}

/**
 * Helper: Determine season from date
 * College basketball season spans Nov-Apr, so games Nov-Dec belong to next year's season
 */
function determineSeason(dateStr: string): number {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1-12
  
  // Season starts in November (month 11) and runs through April (month 4)
  if (month >= 11) {
    return year + 1; // Nov-Dec 2024 games are "2025 season"
  } else {
    return year; // Jan-Apr 2025 games are "2025 season"
  }
}

/**
 * Helper: Parse status from ESPN status name
 */
function parseStatus(statusName: string): 'scheduled' | 'final' | 'in_progress' {
  const lower = statusName.toLowerCase();
  if (lower.includes('final') || lower.includes('complete')) return 'final';
  if (lower.includes('progress') || lower.includes('live')) return 'in_progress';
  return 'scheduled';
}

/**
 * Fetch games for a date range
 */
export async function fetchDateRange(
  startDate: string,
  endDate: string
): Promise<Array<{ game: Game; homeTeam: Team; awayTeam: Team; odds?: Odds }>> {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const results: Array<{ game: Game; homeTeam: Team; awayTeam: Team; odds?: Odds }> = [];
  
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0]; // YYYY-MM-DD
    console.log(`Fetching games for ${dateStr}...`);
    
    const dayGames = await fetchGames(dateStr);
    results.push(...dayGames);
    
    console.log(`  Found ${dayGames.length} games`);
  }
  
  return results;
}

/**
 * Fetch games for entire season(s)
 * NCAAM season typically runs Nov 1 - Apr 10
 */
export async function fetchSeasons(seasons: number[]): Promise<Array<{ game: Game; homeTeam: Team; awayTeam: Team; odds?: Odds }>> {
  const results: Array<{ game: Game; homeTeam: Team; awayTeam: Team; odds?: Odds }> = [];
  
  for (const season of seasons) {
    console.log(`\nFetching ${season} season...`);
    
    // Season runs from Nov of (season-1) through Apr of (season)
    const startDate = `${season - 1}-11-01`;
    const endDate = `${season}-04-10`;
    
    const seasonGames = await fetchDateRange(startDate, endDate);
    results.push(...seasonGames);
    
    console.log(`✅ ${season} season: ${seasonGames.length} games`);
  }
  
  return results;
}

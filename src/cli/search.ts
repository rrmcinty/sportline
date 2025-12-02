/**
 * Search for games by team name
 */

import chalk from "chalk";
import type { Sport, Competition } from "../models/types.js";
import { fetchEvents as fetchEventsNcaam } from "../espn/ncaam/events.js";
import { fetchEvents as fetchEventsCfb } from "../espn/cfb/events.js";
import { fetchEvents as fetchEventsNfl } from "../espn/nfl/events.js";
import { fetchEvents as fetchEventsNba } from "../espn/nba/events.js";
import { fetchNHLEvents as fetchEventsNhl } from "../espn/nhl/events.js";

/**
 * Search for games involving a specific team across multiple days
 */
export async function cmdSearchTeam(
  sport: Sport,
  teamQuery: string,
  startDate: string,
  days: number = 7
): Promise<void> {
  try {
    // Select fetcher based on sport
    let fetchEvents;
    if (sport === 'cfb') fetchEvents = fetchEventsCfb;
    else if (sport === 'nfl') fetchEvents = fetchEventsNfl;
    else if (sport === 'nba') fetchEvents = fetchEventsNba;
    else if (sport === 'nhl') fetchEvents = fetchEventsNhl;
    else fetchEvents = fetchEventsNcaam;
    
    const query = teamQuery.toLowerCase();
    
    // Generate date range
    const dates: string[] = [];
    const start = new Date(
      parseInt(startDate.slice(0, 4)),
      parseInt(startDate.slice(4, 6)) - 1,
      parseInt(startDate.slice(6, 8))
    );
    
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      dates.push(`${year}${month}${day}`);
    }
    
    console.log(chalk.bold.cyan(`\n🔍 Searching for "${teamQuery}" in ${sport.toUpperCase()} games...\n`));
    
    const allMatches: Array<{ date: string; competition: Competition }> = [];
    
    // Search across all dates
    for (const date of dates) {
      try {
        const competitions = await fetchEvents(date);
        
        for (const comp of competitions) {
          const homeMatch = comp.homeTeam.name.toLowerCase().includes(query) || 
                           (comp.homeTeam.abbreviation?.toLowerCase().includes(query) ?? false);
          const awayMatch = comp.awayTeam.name.toLowerCase().includes(query) || 
                           (comp.awayTeam.abbreviation?.toLowerCase().includes(query) ?? false);
          
          if (homeMatch || awayMatch) {
            allMatches.push({ date, competition: comp });
          }
        }
      } catch (err) {
        // Silently skip dates with errors
      }
    }
    
    if (allMatches.length === 0) {
      console.log(chalk.yellow(`No games found for "${teamQuery}" in the next ${days} days`));
      console.log(chalk.dim(`\n💡 Tips:`));
      console.log(chalk.dim(`  • Try a shorter team name (e.g., "UNC" instead of "North Carolina")`));
      console.log(chalk.dim(`  • Try the team abbreviation`));
      console.log(chalk.dim(`  • Use --days to search further ahead`));
      return;
    }
    
    console.log(chalk.green(`Found ${allMatches.length} game(s):\n`));
    
    for (const match of allMatches) {
      const comp = match.competition;
      const dateObj = new Date(comp.date);
      const dateStr = dateObj.toLocaleDateString('en-US', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
      
      console.log(chalk.bold(`${comp.awayTeam.name} @ ${comp.homeTeam.name}`));
      console.log(chalk.dim(`  Event ID: ${comp.eventId}`));
      console.log(chalk.dim(`  Date: ${dateStr} (${match.date})`));
      if (comp.venue) {
        console.log(chalk.dim(`  Venue: ${comp.venue}`));
      }
      console.log(chalk.cyan(`  📊 View bets: `) + chalk.white(`sportline bets --event ${comp.eventId} --sport ${sport} --date ${match.date} --stake 10`));
      console.log();
    }
    
    console.log(chalk.dim(`\n💡 Or get all recommendations for these dates:`));
    console.log(chalk.white(`   sportline recommend --sport ${sport} --min-legs 1 --stake 10 --days ${days}`));
    
  } catch (err) {
    console.error(chalk.red("Error searching for team:"), err);
    process.exit(1);
  }
}

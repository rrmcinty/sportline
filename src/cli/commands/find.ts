/**
 * Find command - Search for teams and view their upcoming games with odds
 */

import path from 'path';
import chalk from 'chalk';
import { DatabaseQueries } from '../../lib/db/queries.js';
import type { Game, Team, Odds } from '../../lib/db/types.js';

interface FindOptions {
  team?: string;
  sport?: string;
  days?: string;
}

interface GameWithDetails {
  game: Game;
  homeTeam: Team;
  awayTeam: Team;
  odds: Odds[];
}

export async function find(options: FindOptions): Promise<void> {
  console.log('\n🔍 Sportline Team Finder\n');

  const dbPath = path.join(process.cwd(), 'data', 'sportline.db');
  const db = new DatabaseQueries(dbPath);

  try {
    const daysAhead = parseInt(options.days || '7');
    const searchTerm = options.team?.toLowerCase();
    const sportFilter = options.sport?.toLowerCase();

    // Get upcoming games
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + daysAhead);
    
    const upcomingGames = db.getUpcomingGames(endDate.toISOString().split('T')[0]);
    
    if (upcomingGames.length === 0) {
      console.log('❌ No upcoming games found');
      return;
    }

    // Filter and enrich games
    let filteredGames: GameWithDetails[] = [];

    for (const game of upcomingGames) {
      // Get team details - IMPORTANT: Pass sport to avoid cross-sport team ID conflicts
      const homeTeam = db.getTeam(game.home_team_id, game.sport);
      const awayTeam = db.getTeam(game.away_team_id, game.sport);
      
      if (!homeTeam || !awayTeam) continue;

      // Apply sport filter
      if (sportFilter && game.sport.toLowerCase() !== sportFilter) {
        continue;
      }

      // Apply team search filter
      if (searchTerm) {
        const homeMatches = 
          homeTeam.name.toLowerCase().includes(searchTerm) ||
          homeTeam.display_name?.toLowerCase().includes(searchTerm) ||
          homeTeam.short_display_name?.toLowerCase().includes(searchTerm) ||
          homeTeam.abbreviation?.toLowerCase().includes(searchTerm);
          
        const awayMatches = 
          awayTeam.name.toLowerCase().includes(searchTerm) ||
          awayTeam.display_name?.toLowerCase().includes(searchTerm) ||
          awayTeam.short_display_name?.toLowerCase().includes(searchTerm) ||
          awayTeam.abbreviation?.toLowerCase().includes(searchTerm);

        if (!homeMatches && !awayMatches) {
          continue;
        }
      }

      // Get odds for this game
      const gameOdds = db.getGameOdds(game.id);

      filteredGames.push({
        game,
        homeTeam,
        awayTeam,
        odds: gameOdds
      });
    }

    if (filteredGames.length === 0) {
      if (searchTerm) {
        console.log(`❌ No upcoming games found for teams matching "${options.team}"`);
      } else {
        console.log('❌ No upcoming games found matching your criteria');
      }
      return;
    }

    // Sort by date
    filteredGames.sort((a, b) => new Date(a.game.date).getTime() - new Date(b.game.date).getTime());

    console.log(`Found ${filteredGames.length} upcoming games:\n`);

    // Display results
    for (const { game, homeTeam, awayTeam, odds } of filteredGames) {
      const gameDate = new Date(game.date);
      const dateStr = gameDate.toLocaleDateString();
      const timeStr = gameDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      // Highlight searched team
      let homeDisplay = homeTeam.display_name || homeTeam.name;
      let awayDisplay = awayTeam.display_name || awayTeam.name;
      
      if (searchTerm) {
        if (homeTeam.name.toLowerCase().includes(searchTerm) || 
            homeTeam.display_name?.toLowerCase().includes(searchTerm)) {
          homeDisplay = chalk.yellow.bold(homeDisplay);
        }
        if (awayTeam.name.toLowerCase().includes(searchTerm) || 
            awayTeam.display_name?.toLowerCase().includes(searchTerm)) {
          awayDisplay = chalk.yellow.bold(awayDisplay);
        }
      }

      console.log(chalk.cyan.bold(`${game.sport.toUpperCase()} | ${dateStr} ${timeStr}`));
      console.log(`${awayDisplay} @ ${homeDisplay}`);
      console.log(chalk.gray(`🆔 Game ID: ${game.id}`));
      
      if (game.venue) {
        console.log(chalk.gray(`📍 ${game.venue}`));
      }

      // Display odds by market
      if (odds.length > 0) {
        const oddsByMarket = groupOddsByMarket(odds);
        
        for (const [market, marketOdds] of Object.entries(oddsByMarket)) {
          console.log(chalk.green(`\n${market.toUpperCase()} ODDS:`));
          
          for (const odd of marketOdds) {
            const timestamp = new Date(odd.timestamp).toLocaleString();
            
            if (market === 'moneyline') {
              console.log(`  ${odd.provider.padEnd(12)} | Home: ${formatOdds(odd.price_home)} | Away: ${formatOdds(odd.price_away)} | ${chalk.gray(timestamp)}`);
            } else if (market === 'spread') {
              console.log(`  ${odd.provider.padEnd(12)} | ${formatSpread(odd.line)} | Home: ${formatOdds(odd.price_home)} | Away: ${formatOdds(odd.price_away)} | ${chalk.gray(timestamp)}`);
            } else if (market === 'total') {
              console.log(`  ${odd.provider.padEnd(12)} | O/U ${odd.line} | Over: ${formatOdds(odd.price_over)} | Under: ${formatOdds(odd.price_under)} | ${chalk.gray(timestamp)}`);
            }
          }
        }
      } else {
        console.log(chalk.gray('No odds available'));
      }
      
      console.log(''); // Empty line between games
    }

    // Summary
    const uniqueTeams = new Set([
      ...filteredGames.map(g => g.homeTeam.name),
      ...filteredGames.map(g => g.awayTeam.name)
    ]);
    
    console.log(chalk.blue(`\n📊 Summary: ${filteredGames.length} games, ${uniqueTeams.size} teams`));
    
    if (searchTerm) {
      console.log(chalk.blue(`🔍 Search: "${options.team}"`));
    }
    if (sportFilter) {
      console.log(chalk.blue(`🏀 Sport: ${sportFilter.toUpperCase()}`));
    }
    console.log(chalk.blue(`📅 Next ${daysAhead} days`));

  } finally {
    db.close();
  }
}

function groupOddsByMarket(odds: Odds[]): Record<string, Odds[]> {
  const grouped: Record<string, Odds[]> = {};
  
  for (const odd of odds) {
    if (!grouped[odd.market]) {
      grouped[odd.market] = [];
    }
    grouped[odd.market].push(odd);
  }
  
  // Sort each market by provider and timestamp (most recent first)
  for (const market in grouped) {
    grouped[market].sort((a, b) => {
      if (a.provider !== b.provider) {
        return a.provider.localeCompare(b.provider);
      }
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });
  }
  
  return grouped;
}

function formatOdds(odds: number | null): string {
  if (odds === null) return 'N/A';
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function formatSpread(line: number | null): string {
  if (line === null) return 'N/A';
  return line > 0 ? `+${line}` : `${line}`;
}
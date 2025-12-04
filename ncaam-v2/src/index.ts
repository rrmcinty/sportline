#!/usr/bin/env node

/**
 * NCAAM V2 CLI Entry Point
 * Simple commands focused on profitability
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { getDb, upsertTeam, upsertGame, upsertOdds } from './db.js';
import { fetchSeasons, fetchDateRange } from './fetch.js';
import { trainModel } from './train.js';
import { backtest } from './backtest.js';

const program = new Command();

program
  .name('ncaam')
  .description('Data-driven NCAAM betting tool - moneylines only')
  .version('2.0.0');

/**
 * Fetch command - ingest historical data
 */
program
  .command('fetch')
  .description('Fetch games, odds, and scores from ESPN API')
  .requiredOption('--season <years>', 'Comma-separated season years (e.g., 2023,2024,2025)')
  .option('--from <date>', 'Start date (YYYY-MM-DD)')
  .option('--to <date>', 'End date (YYYY-MM-DD)')
  .action(async (options) => {
    try {
      const db = getDb();
      const seasons = options.season.split(',').map((s: string) => parseInt(s.trim()));
      
      console.log(chalk.bold.cyan('\n📥 Fetching NCAAM data...\n'));
      
      let results;
      if (options.from && options.to) {
        console.log(`Date range: ${options.from} to ${options.to}`);
        results = await fetchDateRange(options.from, options.to);
      } else {
        console.log(`Seasons: ${seasons.join(', ')}`);
        results = await fetchSeasons(seasons);
      }
      
      console.log(chalk.bold.cyan('\n💾 Saving to database...\n'));
      
      for (const { game, homeTeam, awayTeam, odds } of results) {
        // Save teams
        upsertTeam(homeTeam.id, homeTeam.name, homeTeam.abbreviation, homeTeam.conference);
        upsertTeam(awayTeam.id, awayTeam.name, awayTeam.abbreviation, awayTeam.conference);
        
        // Save game
        upsertGame({
          id: game.id,
          date: game.date,
          season: game.season,
          homeTeamId: game.homeTeamId,
          awayTeamId: game.awayTeamId,
          homeScore: game.homeScore,
          awayScore: game.awayScore,
          status: game.status,
          venue: game.venue
        });
        
        // Save odds if available
        if (odds) {
          upsertOdds({
            gameId: odds.gameId,
            homeML: odds.homeML,
            awayML: odds.awayML,
            homeImpliedProb: odds.homeImpliedProb,
            awayImpliedProb: odds.awayImpliedProb,
            provider: odds.provider,
            updatedAt: odds.updatedAt
          });
        }
      }
      
      console.log(chalk.green.bold(`✅ Saved ${results.length} games to database\n`));
      
    } catch (error) {
      console.error(chalk.red('Error fetching data:'), error);
      process.exit(1);
    }
  });

/**
 * Train command - train moneyline model
 */
program
  .command('train')
  .description('Train moneyline prediction model')
  .requiredOption('--season <years>', 'Comma-separated season years (e.g., 2023,2024,2025)')
  .action(async (options) => {
    try {
      const db = getDb();
      const seasons = options.season.split(',').map((s: string) => parseInt(s.trim()));
      
      await trainModel(db, seasons);
      
    } catch (error) {
      console.error(chalk.red('Error training model:'), error);
      process.exit(1);
    }
  });

/**
 * Backtest command - validate model profitability
 */
program
  .command('backtest')
  .description('Backtest model to validate profitability')
  .requiredOption('--season <years>', 'Comma-separated season years (e.g., 2023,2024,2025)')
  .action(async (options) => {
    try {
      const db = getDb();
      const seasons = options.season.split(',').map((s: string) => parseInt(s.trim()));
      
      const results = await backtest(db, seasons);
      
      // Exit with error code if not production-ready
      if (!results.meetsProductionCriteria) {
        process.exit(1);
      }
      
    } catch (error) {
      console.error(chalk.red('Error running backtest:'), error);
      process.exit(1);
    }
  });

/**
 * Recommend command - show high-confidence bets
 */
program
  .command('recommend')
  .description('Get today\'s high-confidence betting recommendations')
  .option('--date <date>', 'Date (YYYY-MM-DD, default: today)')
  .option('--days <number>', 'Number of days to look ahead', '1')
  .option('--min-confidence <number>', 'Minimum confidence threshold (0-100)', '80')
  .option('--min-divergence <number>', 'Minimum model-market divergence', '0')
  .action(async (options) => {
    try {
      console.log(chalk.yellow('\n⚠️  Recommendation engine not yet implemented'));
      console.log(chalk.dim('   Complete backtest validation first\n'));
      
    } catch (error) {
      console.error(chalk.red('Error generating recommendations:'), error);
      process.exit(1);
    }
  });

program.parse();

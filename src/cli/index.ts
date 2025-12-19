#!/usr/bin/env node

/**
 * Sportline CLI - Sports betting recommendation system
 * Main entry point using Commander.js
 */

import { Command } from 'commander';
import { train } from './commands/train.js';
import { recommend } from './commands/recommend.js';
import { backtest } from './commands/backtest.js';
import { update } from './commands/update.js';
import { find } from './commands/find.js';
import { analyze } from './commands/analyze.js';
import { createSimpleBucketsCommand } from './commands/simple-buckets.js';
import { createOddsImpactCommand } from './commands/odds-impact-analysis.js';
import { createMultiSportBucketsCommand } from './commands/multi-sport-buckets.js';
import { createHistoricalStatusCommand } from './commands/historical-status.js';

const program = new Command();

program
  .name('sportline')
  .description('Sports betting recommendation system with ML-powered predictions')
  .version('0.1.0');

program
  .command('train')
  .description('Train the prediction model on historical data')
  .option('--sport <sport>', 'Sport to train on (ncaam, nba, nfl, etc.)', 'ncaam')
  .option('--market <market>', 'Market to train on (moneyline, spread, total)', 'moneyline')
  .option('--force', 'Force retrain even if recent model exists', false)
  .option('--config <path>', 'Path to feature config file')
  .action(async (options) => {
    try {
      await train(options);
    } catch (error) {
      console.error('Error during training:', error);
      process.exit(1);
    }
  });

program
  .command('recommend')
  .description("Get betting recommendations for today's games")
  .option(
    '--sport <sport>',
    'Sport to recommend (ncaam, nba, nfl, etc.) - if not specified, shows all sports',
  )
  .option('--game <id>', 'Specific game ID to analyze (from sportline find)')
  .option('--date <date>', 'Date to recommend for (YYYY-MM-DD, default: today)')
  .option('--market <market>', 'Market to recommend (moneyline, spread, total, all)', 'all')
  .option('--min-bets <number>', 'Minimum number of recommendations to show', '3')
  .action(async (options) => {
    try {
      await recommend(options);
    } catch (error) {
      console.error('Error during recommendation:', error);
      process.exit(1);
    }
  });

program
  .command('backtest')
  .description('Run backtesting analysis using existing trained models')
  .option('--sport <sport>', 'Sport to backtest (ncaam, nba, nfl, etc.)', 'ncaam')
  .option('--market <market>', 'Market to backtest (moneyline, spread, total)', 'moneyline')
  .option(
    '--config <path>',
    'Path to feature config file (optional - uses model config by default)',
  )
  .action(async (options) => {
    try {
      await backtest(options);
    } catch (error) {
      console.error('Error during backtesting:', error);
      process.exit(1);
    }
  });

program
  .command('update')
  .description('Update odds and game data for upcoming games')
  .option('--days-back <number>', 'Days to look back for completed games', '1')
  .option('--days-forward <number>', 'Days to look forward for upcoming games', '3')
  .action(async (options) => {
    try {
      await update(options);
    } catch (error) {
      console.error('Error during update:', error);
      process.exit(1);
    }
  });

program
  .command('find')
  .description('Search for teams and view their upcoming games with odds')
  .option('--team <name>', 'Team name to search for (partial match)')
  .option('--sport <sport>', 'Filter by sport (nba, nhl, ncaam, etc.)')
  .option('--days <number>', 'Days ahead to search (default: 7)', '7')
  .action(async (options) => {
    try {
      await find(options);
    } catch (error) {
      console.error('Error during find:', error);
      process.exit(1);
    }
  });

program
  .command('analyze')
  .description('Analyze profitable bet characteristics and test situational filters')
  .option('--sport <sport>', 'Sport to analyze (ncaam, nba, nfl, etc.)', 'ncaam')
  .option('--config <path>', 'Path to feature config file')
  .option(
    '--filter <filter>',
    'Filter configuration to test (profitable, conservative, none)',
    'profitable',
  )
  .action(async (options) => {
    try {
      await analyze(options);
    } catch (error) {
      console.error('Error during analysis:', error);
      process.exit(1);
    }
  });

program.addCommand(createSimpleBucketsCommand());
program.addCommand(createOddsImpactCommand());
program.addCommand(createMultiSportBucketsCommand());
program.addCommand(createHistoricalStatusCommand());

program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}

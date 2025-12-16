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
import { analyze } from './commands/analyze.js';

const program = new Command();

program
  .name('sportline')
  .description('Sports betting recommendation system with ML-powered predictions')
  .version('0.1.0');

program
  .command('train')
  .description('Train the prediction model on historical data')
  .option('--sport <sport>', 'Sport to train on (ncaam, nba, nfl, etc.)', 'ncaam')
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
  .option('--sport <sport>', 'Sport to recommend (ncaam, nba, nfl, etc.) - if not specified, shows all sports')
  .option('--date <date>', 'Date to recommend for (YYYY-MM-DD, default: today)')
  .option('--market <market>', 'Market to recommend (moneyline, spread, total)', 'moneyline')
  .option('--min-bets <number>', 'Minimum number of recommendations to show', '3')
  .option('--bankroll <amount>', 'Bankroll amount for Kelly Criterion sizing', '1000')
  .option('--daily-budget <amount>', 'Fixed daily budget to allocate across bets using Kelly ratios')
  .option('--all', 'Show all games, regardless of EV/Edge thresholds', false)
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
  .description('Run backtesting to analyze model performance and find optimal thresholds')
  .option('--sport <sport>', 'Sport to backtest (ncaam, nba, nfl, etc.)', 'ncaam')
  .option('--config <path>', 'Path to feature config file')
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
  .option('--days-forward <number>', 'Days to look forward for upcoming games', '7')
  .action(async (options) => {
    try {
      await update(options);
    } catch (error) {
      console.error('Error during update:', error);
      process.exit(1);
    }
  });

program
  .command('analyze')
  .description('Analyze profitable bet characteristics and test situational filters')
  .option('--sport <sport>', 'Sport to analyze (ncaam, nba, nfl, etc.)', 'ncaam')
  .option('--config <path>', 'Path to feature config file')
  .option('--filter <filter>', 'Filter configuration to test (profitable, conservative, none)', 'profitable')
  .action(async (options) => {
    try {
      await analyze(options);
    } catch (error) {
      console.error('Error during analysis:', error);
      process.exit(1);
    }
  });

program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}

#!/usr/bin/env node

/**
 * Sportline CLI - Sports betting recommendation system
 * Main entry point using Commander.js
 */

import { Command } from 'commander';
import { train } from './commands/train.js';
import { recommend } from './commands/recommend.js';
import { backtest } from './commands/backtest.js';

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
  .option('--sport <sport>', 'Sport to recommend (ncaam, nba, nfl, etc.)', 'ncaam')
  .option('--date <date>', 'Date to recommend for (YYYY-MM-DD, default: today)')
  .option('--market <market>', 'Market to recommend (moneyline, spread, total)', 'moneyline')
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

program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}

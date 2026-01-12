#!/usr/bin/env node

/**
 * Main CLI entry point for sportline
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { trainCommand } from './commands/train.js';
import { recommendCommand } from './commands/recommend.js';
import { backtestCommand } from './commands/backtest.js';
import { updateCommand } from './commands/update.js';
import { syncCommand } from './commands/sync.js';

const program = new Command();

program
  .name('sportline')
  .description(chalk.bold('Sports betting CLI with ML-based recommendations'))
  .version('0.1.0')
  .addHelpText(
    'after',
    `
${chalk.bold('Examples:')}
  Train an NBA model for 2024 season:
    ${chalk.cyan('$ sportline train nba --season 2024')}

  Generate recommendations using a trained model:
    ${chalk.cyan('$ sportline recommend nba --min-edge 0.06')}

  Backtest a strategy on historical data:
    ${chalk.cyan('$ sportline backtest nba --season 2024')}

  Update odds and scores (1 day back, 7 days forward):
    ${chalk.cyan('$ sportline update')}

  Update with custom range:
    ${chalk.cyan('$ sportline update --back 3 --forward 14')}

${chalk.bold('Need help with a command?')}
  ${chalk.cyan('$ sportline <command> --help')}
`,
  );

// Register commands
program.addCommand(trainCommand());
program.addCommand(recommendCommand());
program.addCommand(backtestCommand());
program.addCommand(updateCommand());
program.addCommand(syncCommand());

// Parse arguments
program.parse();

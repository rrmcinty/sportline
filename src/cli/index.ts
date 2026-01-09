#!/usr/bin/env node

/**
 * Main CLI entry point for sportline
 */

import { Command } from 'commander';
import { trainCommand } from './commands/train.js';
import { recommendCommand } from './commands/recommend.js';

const program = new Command();

program
  .name('sportline')
  .description('Sports betting CLI with ML-based recommendations')
  .version('0.1.0');

// Register commands
program.addCommand(trainCommand());
program.addCommand(recommendCommand());

// Parse arguments
program.parse();

/**
 * CLI command for generating betting recommendations
 */

import { Command } from 'commander';
import { generateRecommendations } from '../../recommend/recommendNba.js';
import path from 'path';

export function recommendCommand(): Command {
  const command = new Command('recommend');

  command
    .description('Generate betting recommendations')
    .argument('<sport>', 'Sport to generate recommendations for (supports: nba, ncaam)')
    .option('-m, --model <path>', 'Path to trained model file')
    .option('-e, --min-edge <number>', 'Minimum edge required (default: 0.03 = 3%)', '0.03')
    .option('-p, --min-prob <number>', 'Minimum model probability (default: 0.5 = 50%)', '0.5')
    .option('--market <type>', 'Market type (default: moneyline)', 'moneyline')
    .action(
      (
        sport: string,
        options: { model?: string; minEdge?: string; minProb?: string; market?: string },
      ) => {
        const supportedSports = ['nba', 'ncaam'];
        if (!supportedSports.includes(sport)) {
          console.error(
            `Error: Sport '${sport}' not supported. Choose from: ${supportedSports.join(', ')}`,
          );
          process.exit(1);
        }

        const minEdge = parseFloat(options.minEdge || '0.03');
        if (isNaN(minEdge)) {
          console.error(`Error: Invalid min-edge: ${options.minEdge}`);
          process.exit(1);
        }

        const minProb = parseFloat(options.minProb || '0.5');
        if (isNaN(minProb) || minProb < 0 || minProb > 1) {
          console.error(`Error: Invalid min-prob: ${options.minProb} (must be between 0 and 1)`);
          process.exit(1);
        }

        // Determine model path
        let modelPath = options.model;
        if (!modelPath) {
          // Default to most recent season model
          modelPath = path.join(process.cwd(), 'data', 'models', sport, 'moneyline-2024.json');
        }

        console.log(`Generating recommendations for ${sport.toUpperCase()}...`);
        console.log(`Using model: ${modelPath}`);
        console.log(`Minimum edge: ${(minEdge * 100).toFixed(1)}%`);
        console.log(`Minimum probability: ${(minProb * 100).toFixed(0)}%`);
        console.log(`Market: ${options.market || 'moneyline'}\n`);

        try {
          const recommendations = generateRecommendations(modelPath, {
            minEdge,
            minProb,
            market: options.market || 'moneyline',
          });

          if (recommendations.length === 0) {
            console.log('No value bets found matching criteria.');
            console.log(
              `Try lowering the --min-edge threshold (current: ${(minEdge * 100).toFixed(1)}%)`,
            );
            return;
          }

          // Display recommendations in a table format
          console.log(`Found ${recommendations.length} value bet(s):\n`);
          console.log(formatRecommendations(recommendations));
        } catch (error) {
          console.error(`\n❌ Failed to generate recommendations:`, error);
          process.exit(1);
        }
      },
    );

  return command;
}

/**
 * Format recommendations as a table
 */
function formatRecommendations(
  recommendations: ReturnType<typeof generateRecommendations>,
): string {
  const lines: string[] = [];

  // Header
  lines.push(
    '┌─────────────────────────────────────────────────────────────────────────────────────────┐',
  );
  lines.push(
    '│ Game Date │ Teams                          │ Side │ Model Prob │ Implied Prob │ Edge  │ EV    │ Odds │',
  );
  lines.push(
    '├─────────────────────────────────────────────────────────────────────────────────────────┤',
  );

  for (const rec of recommendations) {
    const date = new Date(rec.gameDate).toISOString().split('T')[0];
    const teams = `${rec.awayTeamName} @ ${rec.homeTeamName}`.padEnd(28);
    const side = rec.side === 'home' ? 'Home' : 'Away';
    const modelProb = (rec.modelProbability * 100).toFixed(1).padStart(5);
    const implProb = (rec.impliedProbability * 100).toFixed(1).padStart(6);
    const edge = `+${(rec.edge * 100).toFixed(1)}%`.padStart(6);
    const ev = `+${(rec.ev * 100).toFixed(1)}%`.padStart(6);
    const odds = rec.odds > 0 ? `+${rec.odds}` : `${rec.odds}`;

    lines.push(
      `│ ${date} │ ${teams} │ ${side.padEnd(4)} │ ${modelProb}%    │ ${implProb}%     │ ${edge} │ ${ev} │ ${odds.padStart(6)} │`,
    );
  }

  lines.push(
    '└─────────────────────────────────────────────────────────────────────────────────────────┘',
  );

  return lines.join('\n');
}

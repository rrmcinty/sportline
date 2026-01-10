/**
 * CLI command for generating betting recommendations
 */

import { Command } from 'commander';
import chalk from 'chalk';
import {
  generateRecommendations,
  parseBuckets,
  type ConfidenceBucket,
} from '../../recommend/recommendNba.js';
import path from 'path';

/**
 * Optimal bucket ranges by sport based on backtesting results
 */
const OPTIMAL_BUCKETS: Record<string, ConfidenceBucket[]> = {
  nba: [
    { min: 0.4, max: 0.5 },
    { min: 0.9, max: 1.0 },
  ],
  ncaam: [
    { min: 0.0, max: 0.3 },
    { min: 0.8, max: 1.0 },
  ],
  nhl: [{ min: 0.6, max: 1.0 }],
};

/**
 * Expected ROI by sport (from backtesting)
 * Moneyline models
 */
const EXPECTED_ROI: Record<string, number> = {
  nba: 0.1084, // 10.84%
  ncaam: 0.0285, // 2.85%
  nhl: 0.1816, // 18.16%
};

/**
 * Optimal bucket ranges for spread markets (from backtesting)
 */
const OPTIMAL_BUCKETS_SPREAD: Record<string, ConfidenceBucket[]> = {
  nba: [
    { min: 0.5, max: 0.6 },
    { min: 0.6, max: 0.7 },
  ],
  ncaam: [
    { min: 0.6, max: 0.7 },
    { min: 0.7, max: 0.8 },
    { min: 0.8, max: 0.9 },
    { min: 0.9, max: 1.0 },
  ],
  nhl: [
    { min: 0.7, max: 0.8 },
    { min: 0.8, max: 0.9 },
  ],
};

/**
 * Expected ROI for spread models (from backtesting)
 */
const EXPECTED_ROI_SPREAD: Record<string, number> = {
  nba: 0.6539, // 65.39%
  ncaam: 0.3679, // 36.79%
  nhl: 0.4864, // 48.64%
};

export function recommendCommand(): Command {
  const command = new Command('recommend');

  command
    .description('Generate betting recommendations for both moneyline and spread markets')
    .argument(
      '[sport]',
      'Sport to generate recommendations for (nba, ncaam, nhl). Omit to show all sports.',
    )
    .option(
      '-m, --model <path>',
      'Path to trained model file (base path, will use moneyline-* and spread-*)',
    )
    .option('-e, --min-edge <number>', 'Minimum edge required (default: 0.03 = 3%)', '0.03')
    .option('-p, --min-prob <number>', 'Minimum model probability (default: 0.5 = 50%)', '0.5')
    .option('--max-ev <number>', 'Maximum EV threshold (filter out suspiciously high EV)')
    .option(
      '--moneyline-buckets <ranges>',
      'Custom bucket ranges for moneyline (overrides defaults)',
    )
    .option('--kelly-filter', 'Only bet if Kelly criterion suggests positive allocation')
    .option(
      '--min-kelly <number>',
      'Minimum Kelly percentage required (default: 0.01 = 1%)',
      '0.01',
    )
    .action(
      (
        sport: string | undefined,
        options: {
          model?: string;
          minEdge?: string;
          minProb?: string;
          maxEv?: string;
          moneylineBuckets?: string;
          kellyFilter?: boolean;
          minKelly?: string;
        },
      ) => {
        const supportedSports = ['nba', 'ncaam', 'nhl'];

        // If no sport specified, show all sports
        if (!sport) {
          console.log(`\n${chalk.bold.cyan('⚽ Generating Recommendations for All Sports')}\n`);
          for (const s of supportedSports) {
            generateRecommendationsForSport(s, options);
          }
          return;
        }

        if (!supportedSports.includes(sport)) {
          console.error(
            `Error: Sport '${sport}' not supported. Choose from: ${supportedSports.join(', ')}`,
          );
          process.exit(1);
        }

        generateRecommendationsForSport(sport, options);
      },
    );

  return command;
}

/**
 * Helper function to generate recommendations for a single sport
 */
function generateRecommendationsForSport(
  sport: string,
  options: {
    model?: string;
    minEdge?: string;
    minProb?: string;
    maxEv?: string;
    moneylineBuckets?: string;
    kellyFilter?: boolean;
    minKelly?: string;
  },
): void {
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

  // Determine model base path
  const modelBasePath = options.model
    ? options.model
    : path.join(process.cwd(), 'data', 'models', sport);

  // Parse filter options
  const maxEV = options.maxEv ? parseFloat(options.maxEv) : undefined;
  const moneylineBuckets = parseBuckets(options.moneylineBuckets);
  const useKellyFilter = options.kellyFilter ?? false;
  const minKelly = options.minKelly ? parseFloat(options.minKelly) : 0.01;

  console.log(`\n${chalk.bold.cyan('⚽ Generating Recommendations')}`);
  console.log(`Sport: ${chalk.yellow(sport.toUpperCase())}`);
  console.log(`Models: ${chalk.dim(`${modelBasePath}/moneyline-*.json and spread-*.json`)}`);
  console.log(
    `Expected ROI (from backtesting): ${chalk.bold.green(`${(EXPECTED_ROI[sport] * 100).toFixed(2)}%`)}`,
  );

  console.log(`\n${chalk.bold('Moneyline - Optimal Probability Ranges:')}`);
  const optimalBuckets = OPTIMAL_BUCKETS[sport] || [];
  if (optimalBuckets.length > 0) {
    const bucketRanges = optimalBuckets
      .map((b) => `${(b.min * 100).toFixed(0)}-${(b.max * 100).toFixed(0)}%`)
      .join(', ');
    console.log(`  ${chalk.green('✓')} ${bucketRanges} (historically profitable)`);
  }

  console.log(`${chalk.bold('Spread - Optimal Probability Ranges:')}`);
  const spreadBuckets = OPTIMAL_BUCKETS_SPREAD[sport] || [];
  if (spreadBuckets.length > 0) {
    const bucketRanges = spreadBuckets
      .map((b) => `${(b.min * 100).toFixed(0)}-${(b.max * 100).toFixed(0)}%`)
      .join(', ');
    console.log(`  ${chalk.cyan('ℹ')} ${bucketRanges} (historically profitable)`);
  }

  console.log(`\n${chalk.bold('Current Filters:')}`);
  console.log(`  Min Edge: ${chalk.green(`${(minEdge * 100).toFixed(1)}%`)}`);
  console.log(`  Min Probability: ${chalk.green(`${(minProb * 100).toFixed(0)}%`)}`);
  console.log(`  Markets: ${chalk.green('moneyline + spread')}`);
  if (maxEV !== undefined) console.log(`  Max EV: ${chalk.green(`${(maxEV * 100).toFixed(0)}%`)}`);
  if (moneylineBuckets)
    console.log(`  Moneyline Buckets: ${chalk.green(options.moneylineBuckets)} (custom override)`);
  if (useKellyFilter)
    console.log(`  Kelly Filter: ${chalk.green(`enabled (min ${(minKelly * 100).toFixed(0)}%)`)}`);
  console.log('');

  try {
    // Generate recommendations for both markets
    const moneylineModelPath = path.join(modelBasePath, 'moneyline-2024.json');
    const spreadModelPath = path.join(modelBasePath, 'spread-2024.json');

    const moneylineRecs = generateRecommendations(moneylineModelPath, {
      minEdge,
      minProb,
      market: 'moneyline',
      maxEV,
      profitableBuckets: moneylineBuckets,
      useKellyFilter,
      minKelly,
    });

    const spreadRecs = generateRecommendations(spreadModelPath, {
      minEdge,
      minProb,
      market: 'spread',
      maxEV,
      profitableBuckets: spreadBuckets,
      useKellyFilter,
      minKelly,
    });

    const totalRecs = moneylineRecs.length + spreadRecs.length;

    if (totalRecs === 0) {
      console.log(chalk.yellow('⚠  No value bets found matching criteria.'));
      console.log(
        chalk.dim(
          `Try lowering the --min-edge threshold (current: ${(minEdge * 100).toFixed(1)}%)`,
        ),
      );
      return;
    }

    // Display moneyline recommendations
    if (moneylineRecs.length > 0) {
      console.log(chalk.bold.green(`✓ Moneyline: Found ${moneylineRecs.length} value bet(s)\n`));
      console.log(
        formatRecommendations(moneylineRecs, sport, OPTIMAL_BUCKETS[sport] || [], 'moneyline'),
      );
      console.log('');
    } else {
      console.log(chalk.dim('ℹ No moneyline bets found matching criteria\n'));
    }

    // Display spread recommendations
    if (spreadRecs.length > 0) {
      console.log(chalk.bold.cyan(`ℹ Spread: Found ${spreadRecs.length} value bet(s)\n`));
      console.log(formatRecommendations(spreadRecs, sport, spreadBuckets, 'spread'));
      console.log('');
    } else {
      console.log(chalk.dim('ℹ No spread bets found matching criteria\n'));
    }

    // Show summary statistics
    printRecommendationsSummary(moneylineRecs, spreadRecs, sport, optimalBuckets);
  } catch (error) {
    console.error(`\n${chalk.red('❌ Failed to generate recommendations:')}`, error);
    process.exit(1);
  }
}

/**
 * Check if probability falls in optimal bucket
 */
function isOptimalBet(prob: number, optimalBuckets: ConfidenceBucket[]): boolean {
  return optimalBuckets.some((b) => prob >= b.min && prob < b.max);
}

/**
 * Strip ANSI color codes to get actual string length
 */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Format recommendations as a detailed table with dynamic column widths
 */
function formatRecommendations(
  recommendations: ReturnType<typeof generateRecommendations>,
  sport: string,
  optimalBuckets: ConfidenceBucket[],
  market: 'moneyline' | 'spread' = 'moneyline',
): string {
  const lines: string[] = [];

  // Calculate matchup column width based on longest matchup
  let maxMatchupLen = 'Matchup'.length;
  for (const rec of recommendations) {
    const matchup = `${rec.awayTeamName} @ ${rec.homeTeamName}`;
    maxMatchupLen = Math.max(maxMatchupLen, matchup.length);
  }
  const matchupWidth = Math.min(maxMatchupLen, 50); // Cap at 50 to avoid excessively wide tables

  // Fixed column widths
  const cols = {
    date: 10,
    matchup: matchupWidth,
    modelPct: 8,
    impliedPct: 8,
    edge: 7,
    ev: 6,
    status: 6,
    odds: 5,
    team: 6,
  };

  // Build border line
  const buildBorder = (left: string, mid: string, right: string): string => {
    const segments = [
      left,
      '─'.repeat(cols.date + 2),
      mid,
      '─'.repeat(cols.matchup + 2),
      mid,
      '─'.repeat(cols.team + 2),
      mid,
      '─'.repeat(cols.modelPct + 2),
      mid,
      '─'.repeat(cols.impliedPct + 2),
      mid,
      '─'.repeat(cols.edge + 2),
      mid,
      '─'.repeat(cols.ev + 2),
      mid,
      '─'.repeat(cols.status + 2),
      mid,
      '─'.repeat(cols.odds + 2),
      right,
    ];
    return segments.join('');
  };

  // Build header line
  const buildHeader = (): string => {
    const lineHeader = market === 'spread' ? 'Line' : 'Odds';
    const cells = [
      'Date'.padEnd(cols.date),
      'Matchup'.padEnd(cols.matchup),
      'Team'.padEnd(cols.team),
      'Model %'.padEnd(cols.modelPct),
      'Implied %'.padEnd(cols.impliedPct),
      'Edge'.padEnd(cols.edge),
      'EV %'.padEnd(cols.ev),
      'Status'.padEnd(cols.status),
      lineHeader.padEnd(cols.odds),
    ];
    return '│ ' + cells.join(' │ ') + ' │';
  };

  // Top border
  lines.push(buildBorder('┌', '┬', '┐'));
  // Header
  lines.push(buildHeader());
  // Header separator
  lines.push(buildBorder('├', '┼', '┤'));

  // Data rows
  for (const rec of recommendations) {
    const date = new Date(rec.gameDate).toISOString().split('T')[0];
    const matchup = `${rec.awayTeamName} @ ${rec.homeTeamName}`;

    // Show the team being bet on (use abbreviation for compact display)
    const betTeamAbbr =
      rec.side === 'home'
        ? rec.homeTeamAbbr || rec.homeTeamName
        : rec.awayTeamAbbr || rec.awayTeamName;

    const modelProb = (rec.modelProbability * 100).toFixed(2);
    const implProb = (rec.impliedProbability * 100).toFixed(2);
    const edge = `+${(rec.edge * 100).toFixed(1)}%`;
    const ev = `+${(rec.ev * 100).toFixed(1)}%`;

    // For spreads, show the line; for moneyline, show the odds
    let lineOrOdds: string;
    if (market === 'spread' && rec.line !== undefined && rec.line !== null) {
      lineOrOdds = `${rec.line > 0 ? '+' : ''}${rec.line}`;
    } else {
      lineOrOdds = `${rec.odds > 0 ? '+' : ''}${rec.odds}`;
    }

    // Color code by edge strength
    const confidence =
      rec.edge > 0.1
        ? chalk.green
        : rec.edge > 0.06
          ? chalk.yellow
          : rec.edge > 0.03
            ? chalk.cyan
            : chalk.white;

    // Show bucket status
    const statusCol = isOptimalBet(rec.modelProbability, optimalBuckets)
      ? chalk.bold.green('✓ BEST')
      : chalk.dim('  meh');

    // Build row with proper padding
    const cells = [
      date.padEnd(cols.date),
      matchup.substring(0, cols.matchup).padEnd(cols.matchup), // Truncate if needed
      betTeamAbbr.padEnd(cols.team),
      modelProb.padStart(cols.modelPct),
      implProb.padStart(cols.impliedPct),
      confidence(edge.padStart(cols.edge)),
      chalk.bold(ev.padStart(cols.ev)),
      statusCol.padEnd(cols.status + 8), // Account for ANSI codes
      lineOrOdds.padStart(cols.odds),
    ];

    lines.push('│ ' + cells.join(' │ ') + ' │');
  }

  // Bottom border
  lines.push(buildBorder('└', '┴', '┘'));

  return lines.join('\n');
}

/**
 * Print summary statistics for recommendations
 */
function printRecommendationsSummary(
  moneylineRecs: ReturnType<typeof generateRecommendations>,
  spreadRecs: ReturnType<typeof generateRecommendations>,
  sport: string,
  optimalBuckets: ConfidenceBucket[],
): void {
  console.log(`\n${chalk.bold('Summary Statistics:')}`);

  // Moneyline summary
  if (moneylineRecs.length > 0) {
    const optimalBets = moneylineRecs.filter((r) =>
      isOptimalBet(r.modelProbability, optimalBuckets),
    );
    const suboptimalBets = moneylineRecs.filter(
      (r) => !isOptimalBet(r.modelProbability, optimalBuckets),
    );

    const totalEdge = moneylineRecs.reduce((sum, r) => sum + r.edge, 0);
    const totalEv = moneylineRecs.reduce((sum, r) => sum + r.ev, 0);
    const optimalEdge = optimalBets.reduce((sum, r) => sum + r.edge, 0);
    const optimalEv = optimalBets.reduce((sum, r) => sum + r.ev, 0);

    const avgProb =
      moneylineRecs.reduce((sum, r) => sum + r.modelProbability, 0) / moneylineRecs.length;
    const avgImpliedProb =
      moneylineRecs.reduce((sum, r) => sum + r.impliedProbability, 0) / moneylineRecs.length;

    const highConfidence = moneylineRecs.filter((r) => r.edge > 0.1).length;
    const mediumConfidence = moneylineRecs.filter((r) => r.edge > 0.06 && r.edge <= 0.1).length;
    const lowConfidence = moneylineRecs.filter((r) => r.edge <= 0.06).length;

    console.log(`${chalk.bold.green('Moneyline:')}`);
    console.log(
      `  Total Bets: ${chalk.cyan(moneylineRecs.length)} | ${chalk.bold.green(`Optimal: ${optimalBets.length}`)} | Suboptimal: ${chalk.dim(suboptimalBets.length)}`,
    );
    console.log(
      `  Edge Strength: High (>10%): ${chalk.green(highConfidence)} | Medium (6-10%): ${chalk.yellow(mediumConfidence)} | Low (≤6%): ${chalk.cyan(lowConfidence)}`,
    );
    console.log(
      `  Avg Model Prob: ${chalk.yellow(`${(avgProb * 100).toFixed(1)}%`)} | Avg Implied Prob: ${chalk.dim(`${(avgImpliedProb * 100).toFixed(1)}%`)}`,
    );
    console.log(
      `  Total Edge: ${chalk.bold.green(`+${(totalEdge * 100).toFixed(1)}%`)} | Total EV: ${chalk.bold.green(`+${(totalEv * 100).toFixed(1)}%`)}`,
    );
    console.log(
      `  Expected ROI (backtest): ${chalk.green(`${(EXPECTED_ROI[sport] * 100).toFixed(2)}%`)} | Win Rate: ${chalk.cyan('~70-85%')}`,
    );

    if (optimalBets.length > 0) {
      console.log(
        `  Optimal: +${(optimalEdge * 100).toFixed(1)}% edge | +${(optimalEv * 100).toFixed(1)}% EV`,
      );
    }
    if (suboptimalBets.length > 0) {
      const bucketRanges = optimalBuckets
        .map((b) => `${(b.min * 100).toFixed(0)}-${(b.max * 100).toFixed(0)}%`)
        .join(', ');
      console.log(chalk.dim(`  Suboptimal fall outside ${bucketRanges}`));
    }
  }

  // Spread summary
  if (spreadRecs.length > 0) {
    const spreadBuckets = OPTIMAL_BUCKETS_SPREAD[sport] || [];
    const optimalBets = spreadRecs.filter((r) => isOptimalBet(r.modelProbability, spreadBuckets));
    const suboptimalBets = spreadRecs.filter(
      (r) => !isOptimalBet(r.modelProbability, spreadBuckets),
    );

    const totalEdge = spreadRecs.reduce((sum, r) => sum + r.edge, 0);
    const totalEv = spreadRecs.reduce((sum, r) => sum + r.ev, 0);
    const optimalEdge = optimalBets.reduce((sum, r) => sum + r.edge, 0);
    const optimalEv = optimalBets.reduce((sum, r) => sum + r.ev, 0);

    const avgProb = spreadRecs.reduce((sum, r) => sum + r.modelProbability, 0) / spreadRecs.length;
    const avgImpliedProb =
      spreadRecs.reduce((sum, r) => sum + r.impliedProbability, 0) / spreadRecs.length;

    const highConfidence = spreadRecs.filter((r) => r.edge > 0.1).length;
    const mediumConfidence = spreadRecs.filter((r) => r.edge > 0.06 && r.edge <= 0.1).length;
    const lowConfidence = spreadRecs.filter((r) => r.edge <= 0.06).length;

    console.log(`\n${chalk.bold.cyan('Spread:')}`);
    console.log(
      `  Total Bets: ${chalk.cyan(spreadRecs.length)} | ${chalk.bold.cyan(`Optimal: ${optimalBets.length}`)} | Suboptimal: ${chalk.dim(suboptimalBets.length)}`,
    );
    console.log(
      `  Edge Strength: High (>10%): ${chalk.green(highConfidence)} | Medium (6-10%): ${chalk.yellow(mediumConfidence)} | Low (≤6%): ${chalk.cyan(lowConfidence)}`,
    );
    console.log(
      `  Avg Model Prob: ${chalk.yellow(`${(avgProb * 100).toFixed(1)}%`)} | Avg Implied Prob: ${chalk.dim(`${(avgImpliedProb * 100).toFixed(1)}%`)}`,
    );
    console.log(
      `  Total Edge: ${chalk.bold.green(`+${(totalEdge * 100).toFixed(1)}%`)} | Total EV: ${chalk.bold.green(`+${(totalEv * 100).toFixed(1)}%`)}`,
    );
    console.log(
      `  Expected ROI (backtest): ${chalk.cyan(`${(EXPECTED_ROI_SPREAD[sport] * 100).toFixed(2)}%`)} | Win Rate: ${chalk.cyan('~75-85%')}`,
    );

    if (optimalBets.length > 0) {
      console.log(
        `  Optimal: +${(optimalEdge * 100).toFixed(1)}% edge | +${(optimalEv * 100).toFixed(1)}% EV`,
      );
    }
    if (suboptimalBets.length > 0) {
      const bucketRanges = spreadBuckets
        .map((b) => `${(b.min * 100).toFixed(0)}-${(b.max * 100).toFixed(0)}%`)
        .join(', ');
      console.log(chalk.dim(`  Suboptimal fall outside ${bucketRanges}`));
    }
  }

  console.log('');
}

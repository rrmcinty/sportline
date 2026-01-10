/**
 * CLI command for generating betting recommendations
 */

import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
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

        // If no sport specified, show all sports and markets in unified sorted list
        if (!sport) {
          generateAllRecommendations(supportedSports, options);
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
 * Extended recommendation with sport and market metadata
 */
type RecommendationWithMetadata = ReturnType<typeof generateRecommendations>[number] & {
  sport: string;
  marketType: 'moneyline' | 'spread';
  isBestBet: boolean;
};

/**
 * Generate recommendations for all sports/markets and display in unified sorted list
 */
function generateAllRecommendations(
  supportedSports: string[],
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
  const minProb = parseFloat(options.minProb || '0.5');
  const maxEV = options.maxEv ? parseFloat(options.maxEv) : undefined;
  const useKellyFilter = options.kellyFilter ?? false;
  const minKelly = options.minKelly ? parseFloat(options.minKelly) : 0.01;

  console.log(`\n${chalk.bold.cyan('⚽ Generating Recommendations - All Sports & Markets')}`);
  console.log(
    `${chalk.bold('Filters:')}\n  Min Edge: ${chalk.green(`${(minEdge * 100).toFixed(1)}%`)} | Min Prob: ${chalk.green(`${(minProb * 100).toFixed(0)}%`)} | Max EV: ${maxEV ? chalk.green(`${(maxEV * 100).toFixed(0)}%`) : chalk.dim('none')}\n`,
  );

  // Collect all recommendations
  const allRecs: RecommendationWithMetadata[] = [];

  for (const sport of supportedSports) {
    const moneylineBuckets = parseBuckets(options.moneylineBuckets);
    const spreadBuckets = OPTIMAL_BUCKETS_SPREAD[sport] || [];
    const optimalBuckets = OPTIMAL_BUCKETS[sport] || [];
    const modelBasePath = options.model
      ? options.model
      : path.join(process.cwd(), 'data', 'models', sport);

    try {
      const moneylineModelPath = path.join(modelBasePath, 'moneyline-2024.json');
      const spreadModelPath = path.join(modelBasePath, 'spread-2024.json');

      // Moneyline recs
      const moneylineRecs = generateRecommendations(moneylineModelPath, {
        minEdge,
        minProb,
        market: 'moneyline',
        maxEV,
        profitableBuckets: moneylineBuckets,
        useKellyFilter,
        minKelly,
      });

      for (const rec of moneylineRecs) {
        allRecs.push({
          ...rec,
          sport,
          marketType: 'moneyline',
          isBestBet: isOptimalBet(rec.modelProbability, optimalBuckets),
        });
      }

      // Spread recs
      const spreadRecs = generateRecommendations(spreadModelPath, {
        minEdge,
        minProb,
        market: 'spread',
        maxEV,
        profitableBuckets: spreadBuckets,
        useKellyFilter,
        minKelly,
      });

      for (const rec of spreadRecs) {
        allRecs.push({
          ...rec,
          sport,
          marketType: 'spread',
          isBestBet: isOptimalBet(rec.modelProbability, spreadBuckets),
        });
      }
    } catch (_error) {
      console.warn(`Warning: Could not generate recommendations for ${sport}`);
    }
  }

  if (allRecs.length === 0) {
    console.log(chalk.yellow('⚠  No value bets found matching criteria.'));
    console.log(
      chalk.dim(`Try lowering the --min-edge threshold (current: ${(minEdge * 100).toFixed(1)}%)`),
    );
    return;
  }

  // Sort by edge (descending) - best bets first
  allRecs.sort((a, b) => b.edge - a.edge);

  // Display unified table
  console.log(`${chalk.bold.green(`✓ Found ${allRecs.length} value bet(s) - sorted by edge`)}`);
  console.log(
    chalk.dim(
      `  (Ordered by mathematical edge. "Best?" marks bets in historically profitable probability ranges.)\n`,
    ),
  );
  console.log(formatUnifiedRecommendations(allRecs));
  console.log('');

  // Show summary
  printUnifiedSummary(allRecs);
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

    // Combine all recommendations with metadata
    const allRecs: RecommendationWithMetadata[] = [];

    for (const rec of moneylineRecs) {
      allRecs.push({
        ...rec,
        sport,
        marketType: 'moneyline',
        isBestBet: isOptimalBet(rec.modelProbability, optimalBuckets),
      });
    }

    for (const rec of spreadRecs) {
      allRecs.push({
        ...rec,
        sport,
        marketType: 'spread',
        isBestBet: isOptimalBet(rec.modelProbability, spreadBuckets),
      });
    }

    if (allRecs.length === 0) {
      console.log(chalk.yellow('⚠  No value bets found matching criteria.'));
      console.log(
        chalk.dim(
          `Try lowering the --min-edge threshold (current: ${(minEdge * 100).toFixed(1)}%)`,
        ),
      );
      return;
    }

    // Sort by edge (descending) - best bets first
    allRecs.sort((a, b) => b.edge - a.edge);

    // Display unified table
    console.log(`${chalk.bold.green(`✓ Found ${allRecs.length} value bet(s) - sorted by edge`)}`);
    console.log(
      chalk.dim(
        `  (Ordered by mathematical edge. "Best?" marks bets in historically profitable probability ranges.)\n`,
      ),
    );
    console.log(formatUnifiedRecommendations(allRecs));
    console.log('');

    // Show summary
    printUnifiedSummary(allRecs);
  } catch (error) {
    console.error(`\n${chalk.red('❌ Failed to generate recommendations:')}`, error);
    process.exit(1);
  }
}

/**
 * Format a UTC date to EST time string like "1/10 7:00p"
 */
function formatGameTimeEST(utcDateStr: string): string {
  const date = new Date(utcDateStr);
  // Format in EST timezone
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'America/New_York',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  };
  const formatted = date.toLocaleString('en-US', options);
  // Convert "1/10, 7:00 PM" to "1/10 7:00p" for compactness
  return formatted.replace(', ', ' ').replace(' PM', 'p').replace(' AM', 'a');
}

/**
 * Format unified recommendations with sport/market columns using cli-table3
 */
function formatUnifiedRecommendations(recommendations: RecommendationWithMetadata[]): string {
  const table = new Table({
    head: [
      chalk.bold('Time (EST)'),
      chalk.bold('Matchup'),
      chalk.bold('Sport'),
      chalk.bold('Market'),
      chalk.bold('Team'),
      chalk.bold('Model %'),
      chalk.bold('Implied %'),
      chalk.bold('Edge'),
      chalk.bold('EV %'),
      chalk.bold('Best?'),
      chalk.bold('L/O'),
    ],
    colWidths: [14, 24, 8, 8, 8, 10, 10, 10, 8, 7, 8],
    wordWrap: true,
    style: {
      head: [],
      border: ['cyan'],
      compact: false,
    },
  });

  // Add data rows
  for (const rec of recommendations) {
    const gameTime = formatGameTimeEST(rec.gameDate);
    const matchup = `${rec.awayTeamAbbr || rec.awayTeamName} @ ${rec.homeTeamAbbr || rec.homeTeamName}`;
    const sport = rec.sport.toUpperCase();
    const market = rec.marketType === 'moneyline' ? 'ML' : 'SPR';

    const betTeamAbbr =
      rec.side === 'home'
        ? rec.homeTeamAbbr || rec.homeTeamName
        : rec.awayTeamAbbr || rec.awayTeamName;

    const modelProb = `${(rec.modelProbability * 100).toFixed(2)}%`;
    const implProb = `${(rec.impliedProbability * 100).toFixed(2)}%`;
    const edge = `+${(rec.edge * 100).toFixed(1)}%`;
    const ev = `+${(rec.ev * 100).toFixed(1)}%`;

    // For spreads, show the line; for moneyline, show the odds
    let lineOrOdds: string;
    if (rec.marketType === 'spread' && rec.line !== undefined && rec.line !== null) {
      lineOrOdds = `${rec.line > 0 ? '+' : ''}${rec.line}`;
    } else {
      lineOrOdds = `${rec.odds > 0 ? '+' : ''}${rec.odds}`;
    }

    // Color by edge strength
    const confidence =
      rec.edge > 0.1
        ? chalk.green
        : rec.edge > 0.06
          ? chalk.yellow
          : rec.edge > 0.03
            ? chalk.cyan
            : chalk.white;

    // Best bet indicator
    const bestBet = rec.isBestBet ? chalk.bold.green('✓') : chalk.dim('·');

    table.push([
      gameTime,
      matchup,
      sport,
      market,
      betTeamAbbr,
      modelProb,
      implProb,
      confidence(edge),
      chalk.bold(ev),
      bestBet,
      lineOrOdds,
    ]);
  }

  return table.toString();
}

/**
 * Print summary statistics for unified recommendations
 */
function printUnifiedSummary(recommendations: RecommendationWithMetadata[]): void {
  console.log(`${chalk.bold('Summary Statistics:')}`);

  const bestBets = recommendations.filter((r) => r.isBestBet);
  const totalEdge = recommendations.reduce((sum, r) => sum + r.edge, 0);
  const totalEv = recommendations.reduce((sum, r) => sum + r.ev, 0);
  const avgProb =
    recommendations.reduce((sum, r) => sum + r.modelProbability, 0) / recommendations.length;

  console.log(`  Total Bets: ${chalk.cyan(recommendations.length)}`);
  console.log(
    `  Best Bets: ${chalk.bold.green(bestBets.length)} (${((bestBets.length / recommendations.length) * 100).toFixed(0)}%)`,
  );
  console.log(`  Avg Confidence: ${chalk.yellow(`${(avgProb * 100).toFixed(1)}%`)}`);
  console.log(
    `  Total Edge: ${chalk.bold.green(`+${(totalEdge * 100).toFixed(1)}%`)} | Total EV: ${chalk.bold.green(`+${(totalEv * 100).toFixed(1)}%`)}`,
  );

  // Breakdown by sport/market
  console.log(`\n${chalk.bold('By Sport & Market:')}`);
  const grouped: Record<string, RecommendationWithMetadata[]> = {};
  for (const rec of recommendations) {
    const key = `${rec.sport.toUpperCase()}-${rec.marketType === 'moneyline' ? 'ML' : 'SPR'}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(rec);
  }

  for (const [key, recs] of Object.entries(grouped).sort()) {
    const keyEdge = recs.reduce((sum, r) => sum + r.edge, 0);
    const bestCount = recs.filter((r) => r.isBestBet).length;
    console.log(
      `  ${key.padEnd(10)}: ${recs.length} bets | Best: ${bestCount} | Edge: +${(keyEdge * 100).toFixed(1)}%`,
    );
  }

  console.log('');
}

/**
 * Check if probability falls in optimal bucket
 */
function isOptimalBet(prob: number, optimalBuckets: ConfidenceBucket[]): boolean {
  return optimalBuckets.some((b) => prob >= b.min && prob < b.max);
}

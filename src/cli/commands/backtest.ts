/**
 * CLI command for backtesting betting strategies
 */

import { Command } from 'commander';
import Database from 'better-sqlite3';
import path from 'path';
import { loadModel, predictHomeWinProbability } from '../../models/predict.js';
import { getCompletedGames, getOddsForGame, getTeamName } from '../../db/queries.js';
import {
  runBacktestGrid,
  findOptimalThresholds,
  generateProbabilityBuckets,
  printBacktestSummary,
} from '../../lib/backtest/backtester.js';
import type { Recommendation } from '../../lib/db/types.js';
import { parseBuckets, type ConfidenceBucket } from '../../recommend/recommendNba.js';

/**
 * Filter recommendations by probability bucket
 */
function filterByBuckets(
  recommendations: Recommendation[],
  buckets: ConfidenceBucket[] | undefined,
): Recommendation[] {
  if (!buckets || buckets.length === 0) return recommendations;

  return recommendations.filter((rec) => {
    // Check if home or away probability falls in a bucket
    const homeInBucket = buckets.some(
      (b) => rec.model_prob_home >= b.min && rec.model_prob_home < b.max,
    );
    const awayInBucket = buckets.some(
      (b) => rec.model_prob_away >= b.min && rec.model_prob_away < b.max,
    );
    return homeInBucket || awayInBucket;
  });
}

interface BacktestOptions {
  season: string;
  modelPath?: string;
  market?: string;
  edgeRange?: string;
  evRange?: string;
  maxEv?: string;
  minBets?: string;
  showBuckets?: boolean;
  buckets?: string;
  betSizing?: string;
  startingBankroll?: string;
}

export function backtestCommand(): Command {
  const command = new Command('backtest');

  command
    .description('Backtest betting strategies on historical data')
    .argument('<sport>', 'Sport to backtest (supports: nba, ncaam, nhl)')
    .option('-s, --season <year>', 'Season to backtest on', '2024')
    .option('-m, --model-path <path>', 'Path to trained model (if not provided, uses default)')
    .option('--market <type>', 'Market type: moneyline or spread (default: moneyline)', 'moneyline')
    .option(
      '--edge-range <values>',
      'Edge threshold range to test (comma-separated)',
      '0.01,0.02,0.03,0.04,0.05,0.06,0.07,0.08',
    )
    .option(
      '--ev-range <values>',
      'EV threshold range to test (comma-separated)',
      '0.005,0.01,0.015,0.02,0.025,0.03',
    )
    .option('--max-ev <value>', 'Maximum EV threshold (filter out suspiciously high EV)')
    .option('--min-bets <n>', 'Minimum bets required for threshold to be considered', '20')
    .option('--show-buckets', 'Show probability bucket analysis', false)
    .option(
      '--buckets <ranges>',
      'Only bet in these probability buckets (e.g., "40-70,80-100" to exclude 70-80%)',
    )
    .option(
      '--bet-sizing <mode>',
      'Bet sizing mode: flat (fixed $100) or kelly (Kelly criterion)',
      'flat',
    )
    .option(
      '--starting-bankroll <amount>',
      'Starting bankroll for Kelly bet sizing (default: $10,000)',
      '10000',
    )
    .action(async (sport: string, options: BacktestOptions) => {
      const supportedSports = ['nba', 'ncaam', 'nhl'];
      if (!supportedSports.includes(sport)) {
        console.error(
          `Error: Sport '${sport}' not supported. Choose from: ${supportedSports.join(', ')}`,
        );
        process.exit(1);
      }

      const season = parseInt(options.season, 10);
      if (isNaN(season)) {
        console.error(`Error: Invalid season: ${options.season}`);
        process.exit(1);
      }

      // Validate market
      const market = options.market || 'moneyline';
      if (!['moneyline', 'spread'].includes(market)) {
        console.error(`Error: Invalid market '${market}'. Choose from: moneyline, spread`);
        process.exit(1);
      }

      // Determine model path
      const modelPath =
        options.modelPath ||
        path.join(process.cwd(), 'data', 'models', sport, `${market}-${season}.json`);

      console.log(`\n=== Backtesting ${sport.toUpperCase()} ${market.toUpperCase()} Model ===`);
      console.log(`Season: ${season}`);
      console.log(`Market: ${market}`);
      console.log(`Model: ${modelPath}`);

      try {
        // Load model
        const model = loadModel(modelPath);
        console.log(`✓ Model loaded (trained on season ${model.season})`);
        console.log(`  Features: ${model.featureNames.length}`);
        console.log(`  Training size: ${model.trainingSize} games`);
        if (model.calibration) {
          console.log(`  Calibration: ${model.calibration.method}`);
        }

        // Warn if testing on same season as training (in-sample testing)
        if (model.season === season) {
          console.warn(
            `\n⚠️  WARNING: Model was trained on season ${model.season}, but you are backtesting on the SAME season.`,
          );
          console.warn(`   This is IN-SAMPLE testing and will produce artificially inflated ROI.`);
          console.warn(
            `   For proper validation, train on one season and backtest on a DIFFERENT season.`,
          );
          console.warn(`   Example: train on 2024, backtest on 2025`);
          console.warn(`   Use --model-path to specify a model trained on a different season.\n`);
        }

        // Load test season games
        const dbPath = path.join(process.cwd(), 'data', 'sportline.db');
        const db = new Database(dbPath);

        try {
          console.log(`\nLoading ${season} season games...`);
          const games = getCompletedGames(db, sport, season);

          if (games.length === 0) {
            console.error(`Error: No completed games found for ${sport} season ${season}`);
            process.exit(1);
          }

          console.log(`Found ${games.length} completed games`);

          // Generate predictions for all games
          console.log('\nGenerating predictions...');
          const recommendations: Recommendation[] = [];

          for (const game of games) {
            try {
              const probability = predictHomeWinProbability(
                db,
                model,
                game.id,
                game.home_team_id,
                game.away_team_id,
                season,
                game.date,
              );

              // Get odds for this game
              const oddsData = getOddsForGame(db, game.id, market);
              const odds = oddsData.length > 0 ? oddsData[0] : null;

              // Get team names
              const homeTeamName = getTeamName(db, sport, game.home_team_id) || game.home_team_id;
              const awayTeamName = getTeamName(db, sport, game.away_team_id) || game.away_team_id;

              // Calculate EV and edge (simplified - using basic formula)
              const homeOdds = odds?.price_home ?? null;
              const awayOdds = odds?.price_away ?? null;

              let evHome: number | null = null;
              let evAway: number | null = null;
              let edgeHome: number | null = null;
              let edgeAway: number | null = null;

              if (homeOdds !== null && awayOdds !== null) {
                // Convert American odds to implied probability
                const impliedHome =
                  homeOdds > 0
                    ? 100 / (homeOdds + 100)
                    : Math.abs(homeOdds) / (Math.abs(homeOdds) + 100);
                const impliedAway =
                  awayOdds > 0
                    ? 100 / (awayOdds + 100)
                    : Math.abs(awayOdds) / (Math.abs(awayOdds) + 100);

                // Remove vig (normalize)
                const total = impliedHome + impliedAway;
                const trueImpliedHome = impliedHome / total;
                const trueImpliedAway = impliedAway / total;

                // Calculate edge and EV
                edgeHome = probability - trueImpliedHome;
                edgeAway = 1 - probability - trueImpliedAway;

                // EV = edge * potential_profit
                const homeProfit = homeOdds > 0 ? homeOdds / 100 : 100 / Math.abs(homeOdds);
                const awayProfit = awayOdds > 0 ? awayOdds / 100 : 100 / Math.abs(awayOdds);

                evHome = edgeHome * homeProfit;
                evAway = edgeAway * awayProfit;
              }

              // Calculate actual result based on market type
              let actual: number;
              if (market === 'spread') {
                const margin = (game.home_score ?? 0) - (game.away_score ?? 0);
                const spread = odds?.line ?? 0;
                const adjustedMargin = margin + spread; // spread is negative for home favorite
                if (adjustedMargin === 0) {
                  // Push - skip this game
                  continue;
                }
                actual = adjustedMargin > 0 ? 1 : 0; // Home covered
              } else {
                actual = (game.home_score ?? 0) > (game.away_score ?? 0) ? 1 : 0;
              }

              recommendations.push({
                game_id: game.id,
                date: game.date,
                home_team: homeTeamName,
                away_team: awayTeamName,
                model_prob_home: probability,
                model_prob_away: 1 - probability,
                odds_home: homeOdds,
                odds_away: awayOdds,
                ev_home: evHome,
                ev_away: evAway,
                edge_home: edgeHome,
                edge_away: edgeAway,
                recommended_side: null,
                actual,
                provider: odds?.provider || '',
                line: odds?.line ?? null,
              });
            } catch (error) {
              // Skip games with errors
              console.warn(`Warning: Skipping game ${game.id}: ${error}`);
            }
          }

          console.log(`✓ Generated ${recommendations.length} recommendations`);

          // Apply bucket filtering if specified
          const buckets = parseBuckets(options.buckets);
          let filteredRecommendations = recommendations;
          if (buckets && buckets.length > 0) {
            filteredRecommendations = filterByBuckets(recommendations, buckets);
            console.log(
              `✓ Filtered to ${filteredRecommendations.length} recommendations (buckets: ${options.buckets})`,
            );
          }

          // Parse backtest parameters
          const edgeRange = (options.edgeRange || '0.01,0.02,0.03,0.04,0.05,0.06,0.07,0.08')
            .split(',')
            .map((s) => parseFloat(s.trim()));
          const evRange = (options.evRange || '0.005,0.01,0.015,0.02,0.025,0.03')
            .split(',')
            .map((s) => parseFloat(s.trim()));
          const maxEv = options.maxEv ? parseFloat(options.maxEv) : undefined;
          const minBets = parseInt(options.minBets || '20', 10);
          const betSizing = (options.betSizing || 'flat') as 'flat' | 'kelly';
          const startingBankroll = parseInt(options.startingBankroll || '10000', 10);

          // Validate bet sizing mode
          if (betSizing !== 'flat' && betSizing !== 'kelly') {
            console.error(
              `Error: Invalid bet sizing mode '${betSizing}'. Choose from: flat, kelly`,
            );
            process.exit(1);
          }

          console.log('\nRunning backtest grid search...');
          console.log(`Edge range: ${edgeRange.map((e) => `${(e * 100).toFixed(1)}%`).join(', ')}`);
          console.log(`EV range: ${evRange.map((e) => `${(e * 100).toFixed(1)}%`).join(', ')}`);
          console.log(`Bet sizing: ${betSizing}`);
          if (betSizing === 'kelly') {
            console.log(`Starting bankroll: $${startingBankroll.toLocaleString()}`);
          }
          if (maxEv !== undefined) {
            console.log(`Max EV: ${(maxEv * 100).toFixed(1)}%`);
          }

          // Run grid search
          const backtestResults = runBacktestGrid(
            filteredRecommendations,
            edgeRange,
            evRange,
            maxEv,
            betSizing,
            startingBankroll,
          );

          // Print summary
          printBacktestSummary(backtestResults, 15);

          // Find optimal thresholds
          console.log(`\nFinding optimal thresholds (min ${minBets} bets)...`);
          const optimal = findOptimalThresholds(backtestResults, minBets);

          console.log(`\n✅ Optimal Strategy:`);
          console.log(`   Min Edge: ${(optimal.min_edge * 100).toFixed(1)}%`);
          console.log(`   Min EV: ${(optimal.min_ev * 100).toFixed(1)}%`);

          // Show Kelly-specific metrics if using Kelly bet sizing
          if (betSizing === 'kelly') {
            const optimalResult = backtestResults.find(
              (r) => r.threshold_edge === optimal.min_edge && r.threshold_ev === optimal.min_ev,
            );
            if (optimalResult && optimalResult.final_bankroll !== undefined) {
              console.log(`\n💰 Kelly Criterion Metrics:`);
              console.log(
                `   Starting Bankroll: $${startingBankroll.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              );
              console.log(
                `   Final Bankroll: $${optimalResult.final_bankroll.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              );
              console.log(
                `   Bankroll Growth: ${((optimalResult.bankroll_roi ?? 0) * 100).toFixed(2)}%`,
              );
              console.log(
                `   Max Bet Size: $${(optimalResult.max_bet_size ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              );
              console.log(
                `   Min Bankroll: $${(optimalResult.min_bankroll ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              );
              console.log(
                `   Max Bankroll: $${(optimalResult.max_bankroll ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              );
            }
          }

          // Show probability buckets if requested
          if (options.showBuckets) {
            console.log('\n=== Probability Bucket Analysis ===\n');
            const bucketAnalysis = generateProbabilityBuckets(filteredRecommendations, 0.1);

            console.log('Bucket  | Games | Accuracy | Avg Edge | Avg EV  | ROI      | Profit  ');
            console.log('--------+-------+----------+----------+---------+----------+---------');

            for (const bucket of bucketAnalysis) {
              console.log(
                `${bucket.bucket.padEnd(7)} | ` +
                  `${bucket.count.toString().padStart(5)} | ` +
                  `${(bucket.accuracy * 100).toFixed(1).padStart(7)}% | ` +
                  `${(bucket.avg_edge * 100).toFixed(1).padStart(7)}% | ` +
                  `${(bucket.avg_ev * 100).toFixed(1).padStart(6)}% | ` +
                  `${(bucket.roi * 100).toFixed(2).padStart(7)}% | ` +
                  `$${bucket.total_profit.toFixed(0).padStart(6)}`,
              );
            }

            console.log('\n');
          }

          console.log('✓ Backtest complete!\n');
        } finally {
          db.close();
        }
      } catch (error) {
        console.error(`\n❌ Backtest failed:`, error);
        process.exit(1);
      }
    });

  return command;
}

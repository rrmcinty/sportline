/**
 * CLI command for optimizing probability buckets
 */

import { Command } from 'commander';
import Database from 'better-sqlite3';
import path from 'path';
import { loadModel, predictHomeWinProbability } from '../../models/predict.js';
import { getCompletedGames, getOddsForGame, getTeamName } from '../../db/queries.js';
import { optimizeBuckets, bucketToString } from '../../lib/optimization/bucketOptimizer.js';
import type { Recommendation } from '../../lib/db/types.js';

interface OptimizeBucketsOptions {
  season: string;
  modelPath?: string;
  market?: string;
  minEdge?: string;
  minEv?: string;
  maxEv?: string;
  minBets?: string;
  betSizing?: string;
  startingBankroll?: string;
}

export function optimizeBucketsCommand(): Command {
  const command = new Command('optimize-buckets');

  command
    .description('Find optimal probability buckets for a sport/market')
    .argument('<sport>', 'Sport to optimize (supports: nba, ncaam, nhl)')
    .option('-s, --season <year>', 'Season to test on', '2024')
    .option('-m, --model-path <path>', 'Path to trained model (if not provided, uses default)')
    .option('--market <type>', 'Market type: moneyline or spread (default: moneyline)', 'moneyline')
    .option('--min-edge <value>', 'Minimum edge threshold', '0.07')
    .option('--min-ev <value>', 'Minimum EV threshold', '0.005')
    .option('--max-ev <value>', 'Maximum EV threshold (filter out suspiciously high EV)')
    .option('--min-bets <n>', 'Minimum bets required for bucket to be considered', '20')
    .option('--bet-sizing <mode>', 'Bet sizing mode: flat or kelly', 'flat')
    .option('--starting-bankroll <amount>', 'Starting bankroll for Kelly sizing', '10000')
    .action(async (sport: string, options: OptimizeBucketsOptions) => {
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

      // Parse parameters
      const minEdge = parseFloat(options.minEdge || '0.07');
      const minEV = parseFloat(options.minEv || '0.005');
      const maxEV = options.maxEv ? parseFloat(options.maxEv) : undefined;
      const minBets = parseInt(options.minBets || '20', 10);
      const betSizing = (options.betSizing || 'flat') as 'flat' | 'kelly';
      const startingBankroll = parseInt(options.startingBankroll || '10000', 10);

      // Validate bet sizing
      if (betSizing !== 'flat' && betSizing !== 'kelly') {
        console.error(`Error: Invalid bet sizing '${betSizing}'. Choose from: flat, kelly`);
        process.exit(1);
      }

      // Determine model path
      const modelPath =
        options.modelPath ||
        path.join(process.cwd(), 'data', 'models', sport, `${market}-${season}.json`);

      console.log(
        `\n=== Optimizing Buckets for ${sport.toUpperCase()} ${market.toUpperCase()} ===`,
      );
      console.log(`Season: ${season}`);
      console.log(`Market: ${market}`);
      console.log(`Model: ${modelPath}`);

      try {
        // Load model
        const model = loadModel(modelPath);
        console.log(`✓ Model loaded (trained on season ${model.season})`);
        console.log(`  Features: ${model.featureNames.length}`);
        console.log(`  Training size: ${model.trainingSize} games`);

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
              // Predict home win probability
              const probability = predictHomeWinProbability(
                db,
                model,
                game.id,
                game.home_team_id,
                game.away_team_id,
                game.season,
                game.date,
              );

              // Get odds for this game
              const oddsArray = getOddsForGame(db, game.id, market);
              const odds = oddsArray.length > 0 ? oddsArray[0] : null;
              const homeOdds = odds?.price_home ?? null;
              const awayOdds = odds?.price_away ?? null;

              // Get team names
              const homeTeamName = getTeamName(db, sport, game.home_team_id);
              const awayTeamName = getTeamName(db, sport, game.away_team_id);

              if (!homeTeamName || !awayTeamName) {
                console.warn(`Warning: Missing team name for game ${game.id}`);
                continue;
              }

              // Calculate EV and edge (simplified)
              let evHome: number | null = null;
              let evAway: number | null = null;
              let edgeHome: number | null = null;
              let edgeAway: number | null = null;

              if (homeOdds !== null && awayOdds !== null) {
                const impliedHome =
                  homeOdds > 0
                    ? 100 / (homeOdds + 100)
                    : Math.abs(homeOdds) / (Math.abs(homeOdds) + 100);
                const impliedAway =
                  awayOdds > 0
                    ? 100 / (awayOdds + 100)
                    : Math.abs(awayOdds) / (Math.abs(awayOdds) + 100);

                const total = impliedHome + impliedAway;
                const trueImpliedHome = impliedHome / total;
                const trueImpliedAway = impliedAway / total;

                edgeHome = probability - trueImpliedHome;
                edgeAway = 1 - probability - trueImpliedAway;

                const homeProfit = homeOdds > 0 ? homeOdds / 100 : 100 / Math.abs(homeOdds);
                const awayProfit = awayOdds > 0 ? awayOdds / 100 : 100 / Math.abs(awayOdds);

                evHome = edgeHome * homeProfit;
                evAway = edgeAway * awayProfit;
              }

              // Calculate actual result
              let actual: number;
              if (market === 'spread') {
                const margin = (game.home_score ?? 0) - (game.away_score ?? 0);
                const spread = odds?.line ?? 0;
                const adjustedMargin = margin + spread;
                if (adjustedMargin === 0) {
                  continue; // Skip pushes
                }
                actual = adjustedMargin > 0 ? 1 : 0;
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
              console.warn(`Warning: Skipping game ${game.id}: ${error}`);
            }
          }

          console.log(`✓ Generated ${recommendations.length} recommendations`);

          // Run bucket optimization
          const bestBucket = optimizeBuckets(
            recommendations,
            minEdge,
            minEV,
            maxEV,
            minBets,
            betSizing,
            startingBankroll,
          );

          console.log(`\n✅ Optimal Bucket Combination Found!`);
          console.log(`   Buckets: ${bestBucket.combination.label}`);
          console.log(`   ROI: ${(bestBucket.roi * 100).toFixed(2)}%`);
          console.log(`   Win Rate: ${(bestBucket.winRate * 100).toFixed(2)}%`);
          console.log(`   Total Bets: ${bestBucket.totalBets}`);
          console.log(`   Total Profit: $${bestBucket.totalProfit.toFixed(0)}`);

          const bucketString = bucketToString(bestBucket.combination);
          if (bucketString) {
            console.log(`\n📋 Use this bucket configuration:`);
            console.log(`   --buckets "${bucketString}"`);
            console.log(`\n💡 Example command:`);
            console.log(
              `   node dist/cli/index.js backtest ${sport} --season ${season} --market ${market} --buckets "${bucketString}"`,
            );
          }

          console.log('\n✓ Bucket optimization complete!\n');
        } finally {
          db.close();
        }
      } catch (error) {
        console.error(`\n❌ Bucket optimization failed:`, error);
        process.exit(1);
      }
    });

  return command;
}

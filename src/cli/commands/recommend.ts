/**
 * Recommend command - Get betting recommendations for today's games
 */

import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import { DatabaseQueries } from '../../lib/db/queries.js';
import { loadModel, findLatestModel } from '../../lib/model/modelStorage.js';
import { predict } from '../../lib/model/predictor.js';
import { extractFeaturesForGame } from '../../lib/features/featureEngineering.js';
import { loadFeatureConfig } from '../../lib/features/featureConfig.js';
import {
  calculateBettingMetrics,
  calculateKellyBetSize,
  formatOdds,
  formatPercentage,
  formatCurrency,
} from '../../lib/odds/evCalculator.js';
import type { FeatureConfig, Recommendation } from '../../lib/db/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface RecommendOptions {
  sport?: string;
  date?: string;
  market: string;
  minBets: string;
  bankroll?: string;
  dailyBudget?: string;
}

// Helper function to get recommendations for a specific sport
async function getRecommendationsForSport(
  sport: string,
  options: RecommendOptions,
  db: DatabaseQueries
): Promise<Recommendation[]> {
  console.log(`\n[${sport.toUpperCase()}] Loading trained model...`);
  const modelsDir = path.join(
    process.cwd(),
    'src/train/basketball/ncaam/models'  // All models are currently stored here
  );

  const modelPath = findLatestModel(sport, options.market, modelsDir);

  if (!modelPath) {
    console.log(`⚠️  No trained model found for ${sport} ${options.market}`);
    console.log(`   Run "sportline train --sport ${sport}" first to train a model.`);
    return [];
  }

  const model = loadModel(modelPath);

  console.log(`[${sport.toUpperCase()}] Loading configuration...`);
  const configPath = path.join(
    process.cwd(),
    `src/train/basketball/${sport}/featuresConfig.json`
  );
  const config = loadFeatureConfig(configPath);

  // Step 3: Query today's games
  console.log(`[${sport.toUpperCase()}] Querying games from database...`);
  const targetDate = options.date || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;
  const todaysGames = db.getTodaysGames(sport, targetDate);

  console.log(`✓ Found ${todaysGames.length} ${sport.toUpperCase()} scheduled games for ${targetDate}`);

  if (todaysGames.length === 0) {
    return [];
  }

  // Step 4: Generate predictions and recommendations
  console.log(`[${sport.toUpperCase()}] Generating predictions...`);

  // Get all historical games for feature extraction
  const allGames = db.getHistoricalGames(sport, model.seasons);

  const recommendations: Recommendation[] = [];

  for (const game of todaysGames) {
    try {
      // Extract features for this game
      const features = extractFeaturesForGame(
        game,
        db,
        config,
        model.featureMeans,
        allGames
      );

      if (!features) {
        continue;
      }

      // Get prediction
      const temperature = config.calibration?.temperature ?? config.regularization?.temperature ?? 1.0;
      const prediction = predict(features, model, false, temperature);

      // Get odds
      const odds = game.odds.length > 0 ? game.odds[0] : null;

      if (!odds || odds.price_home === null || odds.price_away === null) {
        continue;
      }

      // Calculate betting metrics
      const metrics = calculateBettingMetrics(
        prediction.prob_home,
        odds.price_home,
        odds.price_away
      );

      // Create recommendation with proper structure
      const recommendation: Recommendation = {
        game_id: game.id,
        date: game.date,
        home_team: game.home_team_name,
        away_team: game.away_team_name,
        model_prob_home: prediction.prob_home,
        model_prob_away: prediction.prob_away,
        odds_home: odds.price_home,
        odds_away: odds.price_away,
        ev_home: metrics.ev_home,
        ev_away: metrics.ev_away,
        edge_home: metrics.edge_home,
        edge_away: metrics.edge_away,
        recommended_side: null, // Will be set below
        actual: null,
        provider: odds.provider || 'Unknown'
      };

      // Apply thresholds to determine recommended side
      let recommendedSide: 'home' | 'away' | null = null;

      if (
        metrics.ev_home !== null &&
        metrics.ev_home > model.thresholds.min_ev &&
        metrics.ev_home <= (config.max_ev || 1.0) &&
        metrics.edge_home !== null &&
        metrics.edge_home > model.thresholds.min_edge
      ) {
        if (
          metrics.ev_away === null ||
          metrics.edge_away === null ||
          metrics.ev_home > metrics.ev_away
        ) {
          recommendedSide = 'home';
        }
      } else if (
        metrics.ev_away !== null &&
        metrics.ev_away > model.thresholds.min_ev &&
        metrics.ev_away <= (config.max_ev || 1.0) &&
        metrics.edge_away !== null &&
        metrics.edge_away > model.thresholds.min_edge
      ) {
        recommendedSide = 'away';
      }

      recommendation.recommended_side = recommendedSide;

      // Only include recommendations that meet thresholds
      if (recommendedSide) {
        recommendations.push(recommendation);
      }
    } catch (error) {
      console.error(`Error processing game ${game.id}:`, error);
    }
  }

  // Sort by EV (best bets first)
  recommendations.sort((a, b) => {
    const evA = a.recommended_side === 'home' ? a.ev_home! : a.ev_away!;
    const evB = b.recommended_side === 'home' ? b.ev_home! : b.ev_away!;
    return evB - evA;
  });

  console.log(`✓ Generated ${recommendations.length} ${sport.toUpperCase()} recommendations`);

  return recommendations;
}

export async function recommend(options: RecommendOptions): Promise<void> {
  console.log(chalk.cyan.bold('\n🎯 Sportline Betting Recommendations\n'));

  const dbPath = path.join(process.cwd(), 'data', 'sportline.db');
  const db = new DatabaseQueries(dbPath);

  // Determine which sports to process
  const sportsToProcess = options.sport ? [options.sport] : ['ncaam', 'nba'];

  let totalRecommendations = 0;

  for (const sport of sportsToProcess) {
    try {
      const recommendations = await getRecommendationsForSport(sport, options, db);

      if (recommendations.length === 0) {
        console.log(`\n${chalk.yellow('⚠️')} No ${sport.toUpperCase()} recommendations found for today.`);
        continue;
      }

      // Display recommendations for this sport
      displayRecommendations(sport, recommendations, options);

      totalRecommendations += recommendations.length;
    } catch (error) {
      console.error(`❌ Error processing ${sport}:`, error);
    }
  }

  if (totalRecommendations === 0) {
    console.log(`\n${chalk.red('❌')} No recommendations found for any sport.`);
    console.log('Make sure you have trained models and upcoming games in the database.');
  }
}

// Helper function to display recommendations for a sport
function displayRecommendations(sport: string, recommendations: Recommendation[], options: RecommendOptions): void {
  if (recommendations.length === 0) return;

  // Get today's date for header
  const headerDate = options.date ? new Date(options.date + 'T12:00:00Z') : new Date();
  const dateStr = headerDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  console.log(chalk.cyan.bold(`\n🏀 ${sport.toUpperCase()} Betting Recommendations - ${dateStr}\n`));

  // Main recommendations table
  console.log(chalk.cyan.bold('\n🎯 Top Recommendations\n'));

  console.log(chalk.bold('Rank | Time  | Matchup                        | Pick                | Prob | Odds  | EV    | Edge  | Provider'));
  console.log(chalk.gray('-----+-------+--------------------------------+---------------------+------+-------+-------+-------+-----------'));

  for (let i = 0; i < recommendations.length; i++) {
    const rec = recommendations[i];
    const gameTime = new Date(rec.date).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const matchup = `${rec.away_team} @ ${rec.home_team}`;
    const pick = rec.recommended_side === 'home' ? rec.home_team : rec.away_team;
    const prob = rec.recommended_side === 'home'
      ? formatPercentage(rec.model_prob_home, 1)
      : formatPercentage(rec.model_prob_away, 1);
    const odds = rec.recommended_side === 'home'
      ? formatOdds(rec.odds_home!)
      : formatOdds(rec.odds_away!);
    const ev = rec.recommended_side === 'home'
      ? formatPercentage(rec.ev_home!, 1)
      : formatPercentage(rec.ev_away!, 1);
    const edge = rec.recommended_side === 'home'
      ? formatPercentage(rec.edge_home!, 1)
      : formatPercentage(rec.edge_away!, 1);

    const rank = chalk.yellow((i + 1).toString().padStart(4));
    const time = chalk.white(gameTime.padStart(5));
    const matchupDisplay = chalk.gray(matchup.padEnd(30));
    const pickDisplay = rec.recommended_side === 'home'
      ? chalk.green(pick.padEnd(19))
      : chalk.red(pick.padEnd(19));
    const probDisplay = chalk.blue(prob.padStart(4));
    const oddsDisplay = chalk.magenta(odds.padStart(5));
    const evDisplay = chalk.cyan(ev.padStart(5));
    const edgeDisplay = chalk.green(edge.padStart(5));
    const providerDisplay = chalk.gray(rec.provider.padEnd(9));

    console.log(`${rank} | ${time} | ${matchupDisplay} | ${pickDisplay} | ${probDisplay} | ${oddsDisplay} | ${evDisplay} | ${edgeDisplay} | ${providerDisplay}`);
  }

  console.log('');
}

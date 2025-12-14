/**
 * Recommend command - Get betting recommendations for today's games
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { DatabaseQueries } from '../../lib/db/queries.js';
import { loadModel, findLatestModel } from '../../lib/model/modelStorage.js';
import { predict } from '../../lib/model/predictor.js';
import { extractFeaturesForGame } from '../../lib/features/featureEngineering.js';
import {
  calculateBettingMetrics,
  formatOdds,
  formatPercentage,
  formatCurrency,
} from '../../lib/odds/evCalculator.js';
import type { FeatureConfig, Recommendation } from '../../lib/db/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface RecommendOptions {
  sport: string;
  date?: string;
  market: string;
  minBets: string;
}

export async function recommend(options: RecommendOptions): Promise<void> {
  console.log('\n🎯 Sportline Betting Recommendations\n');

  // Step 1: Find and load latest model
  console.log('[1/4] Loading trained model...');
  const modelsDir = path.join(
    process.cwd(),
    'src/train/basketball/ncaam/models'
  );

  const modelPath = findLatestModel(options.sport, options.market, modelsDir);

  if (!modelPath) {
    console.error(
      `❌ No trained model found for ${options.sport} ${options.market}`
    );
    console.error(
      `Run "sportline train --sport ${options.sport}" first to train a model.`
    );
    process.exit(1);
  }

  const model = loadModel(modelPath);

  // Step 2: Query today's games
  console.log('\n[2/4] Querying games from database...');
  const dbPath = path.join(process.cwd(), 'data', 'sportline.db');
  const db = new DatabaseQueries(dbPath);

  const targetDate =
    options.date || new Date().toISOString().split('T')[0];
  const todaysGames = db.getTodaysGames(options.sport, targetDate);

  console.log(`✓ Found ${todaysGames.length} scheduled games for ${targetDate}`);

  if (todaysGames.length === 0) {
    console.log('\n📅 No games scheduled for today.');
    console.log(
      'Try specifying a different date with --date YYYY-MM-DD'
    );
    db.close();
    return;
  }

  // Step 3: Generate predictions and recommendations
  console.log('\n[3/4] Generating predictions...');

  // Reconstruct config from model
  const config: FeatureConfig = {
    sport: model.sport,
    model: model.modelType,
    market: model.market,
    seasons: model.seasons,
    features: model.features,
    rolling_windows: model.rollingWindows,
    allowed_providers: [], // Will use odds from DB
    recency_weighting: model.recencyWeighting,
    min_edge: model.thresholds.min_edge,
    min_ev: model.thresholds.min_ev,
  };

  // Get all historical games for feature extraction
  const allGames = db.getHistoricalGames(options.sport, model.seasons);

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
        console.warn(`⚠️  Insufficient data for game ${game.id}`);
        continue;
      }

      // Get prediction
      const prediction = predict(features, model);

      // Get odds
      const odds = game.odds.length > 0 ? game.odds[0] : null;

      if (!odds || odds.price_home === null || odds.price_away === null) {
        console.warn(`⚠️  No odds available for game ${game.id}`);
        continue;
      }

      // Calculate betting metrics
      const metrics = calculateBettingMetrics(
        prediction.prob_home,
        odds.price_home,
        odds.price_away
      );

      // Determine recommended side
      let recommendedSide: 'home' | 'away' | null = null;

      if (
        metrics.ev_home !== null &&
        metrics.ev_home > model.thresholds.min_ev &&
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
      }

      if (
        !recommendedSide &&
        metrics.ev_away !== null &&
        metrics.ev_away > model.thresholds.min_ev &&
        metrics.edge_away !== null &&
        metrics.edge_away > model.thresholds.min_edge
      ) {
        recommendedSide = 'away';
      }

      recommendations.push({
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
        recommended_side: recommendedSide,
        actual: null,
        provider: odds.provider,
      });
    } catch (error) {
      console.warn(`⚠️  Error processing game ${game.id}:`, error);
    }
  }

  db.close();

  // Step 4: Display recommendations
  console.log('\n[4/4] Ranking recommendations...\n');

  // Filter to only recommended bets
  const recommendedBets = recommendations.filter(
    (r) => r.recommended_side !== null
  );

  // Sort by EV (descending)
  recommendedBets.sort((a, b) => {
    const aEV =
      a.recommended_side === 'home' ? a.ev_home ?? 0 : a.ev_away ?? 0;
    const bEV =
      b.recommended_side === 'home' ? b.ev_home ?? 0 : b.ev_away ?? 0;
    return bEV - aEV;
  });

  // Display header
  const dateObj = new Date(targetDate);
  const dateStr = dateObj.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  console.log(`📊 ${options.sport.toUpperCase()} Betting Recommendations - ${dateStr}\n`);
  console.log(`Model: ${model.modelType} (trained ${new Date(model.trainedAt).toLocaleDateString()})`);
  console.log(`Expected ROI: ${formatPercentage(model.backtestMetrics.roi)}`);
  console.log(`Thresholds: min_edge=${formatPercentage(model.thresholds.min_edge, 1)}, min_ev=${formatPercentage(model.thresholds.min_ev, 1)}\n`);

  if (recommendedBets.length === 0) {
    console.log('❌ No bets meet the threshold criteria for today.\n');
    console.log('💡 This is actually good! It means the model is being selective.');
    console.log('   Check back tomorrow or adjust thresholds with retrain.\n');
    return;
  }

  // Display table
  console.log(
    'Rank | Time  | Matchup                              | Pick | Prob  | Odds  | EV    | Edge  | Provider'
  );
  console.log(
    '-----+-------+--------------------------------------+------+-------+-------+-------+-------+-----------'
  );

  let totalEV = 0;
  const unitSize = 100;

  for (let i = 0; i < recommendedBets.length; i++) {
    const rec = recommendedBets[i];
    const rank = (i + 1).toString().padStart(4);

    // Extract time from date
    const gameTime = new Date(rec.date);
    const timeStr = gameTime.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    // Format matchup
    const homeTeam = rec.home_team.length > 15 
      ? rec.home_team.substring(0, 13) + '..' 
      : rec.home_team.padEnd(15);
    const awayTeam = rec.away_team.length > 15 
      ? rec.away_team.substring(0, 13) + '..'
      : rec.away_team.padEnd(15);
    const matchup = rec.recommended_side === 'home'
      ? `${homeTeam} vs ${awayTeam}`
      : `${awayTeam} @ ${homeTeam}`;

    const side = rec.recommended_side?.toUpperCase().padEnd(4) || '-';
    const prob =
      rec.recommended_side === 'home'
        ? formatPercentage(rec.model_prob_home, 1).padStart(5)
        : formatPercentage(rec.model_prob_away, 1).padStart(5);
    const odds =
      rec.recommended_side === 'home'
        ? formatOdds(rec.odds_home!).padStart(5)
        : formatOdds(rec.odds_away!).padStart(5);
    const ev =
      rec.recommended_side === 'home'
        ? formatPercentage(rec.ev_home!, 1).padStart(5)
        : formatPercentage(rec.ev_away!, 1).padStart(5);
    const edge =
      rec.recommended_side === 'home'
        ? formatPercentage(rec.edge_home!, 1).padStart(5)
        : formatPercentage(rec.edge_away!, 1).padStart(5);
    const provider = rec.provider.substring(0, 10);

    console.log(
      `${rank} | ${timeStr} | ${matchup} | ${side} | ${prob} | ${odds} | ${ev} | ${edge} | ${provider}`
    );

    const evValue =
      rec.recommended_side === 'home' ? rec.ev_home! : rec.ev_away!;
    totalEV += evValue;
  }

  console.log(
    '-----+-------+--------------------------------------+------+-------+-------+-------+-------+-----------'
  );

  const totalStake = recommendedBets.length * unitSize;
  const expectedProfit = totalEV * unitSize;

  console.log(
    `\nTotal bets: ${recommendedBets.length} | Total stake: ${formatCurrency(totalStake)} | Expected profit: ${formatCurrency(expectedProfit)}\n`
  );

  console.log('💡 Tips:');
  console.log('   - These are recommendations, not guarantees');
  console.log('   - Consider bet sizing using Kelly Criterion');
  console.log('   - Always gamble responsibly\n');
}

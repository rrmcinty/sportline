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
  sport: string;
  date?: string;
  market: string;
  minBets: string;
  bankroll?: string;
  dailyBudget?: string;
}

export async function recommend(options: RecommendOptions): Promise<void> {
  console.log(chalk.cyan.bold('\n🎯 Sportline Betting Recommendations\n'));

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

  // Step 2: Load configuration (same as train command)
  console.log('\n[2/4] Loading configuration...');
  const configPath = path.join(
    process.cwd(),
    'src/train/basketball/ncaam/featuresConfig.json'
  );
  const config = loadFeatureConfig(configPath);
  console.log('✓ Loaded config with thresholds:');
  console.log(`  - min_edge: ${formatPercentage(config.min_edge || 0, 1)}`);
  console.log(`  - min_ev: ${formatPercentage(config.min_ev || 0, 1)}`);
  console.log(`  - max_ev: ${formatPercentage(config.max_ev || 1.0, 1)}`);

  // Step 3: Query today's games
  console.log('\n[3/4] Querying games from database...');
  const dbPath = path.join(process.cwd(), 'data', 'sportline.db');
  const db = new DatabaseQueries(dbPath);

  // Get today's date in local timezone (not UTC)
  const today = new Date();
  const targetDate = options.date || `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
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

  // Step 4: Generate predictions and recommendations
  console.log('\n[4/4] Generating predictions...');

  // Get all historical games for feature extraction
  const allGames = db.getHistoricalGames(options.sport, model.seasons);

  const recommendations: Recommendation[] = [];
  let gamesWithoutFeatures = 0;

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
        gamesWithoutFeatures++;
        continue;
      }

      // Get prediction - pass debug flag for second game
      const shouldDebug = recommendations.length === 1; // Debug second game
      const temperature = config.calibration?.temperature ?? config.regularization?.temperature ?? 1.0;
      const prediction = shouldDebug
        ? predict(features, model, true, temperature)
        : predict(features, model, false, temperature);
      
      // Debug: Log predictions that are extreme
      if (recommendations.length < 3) {
        const probPct = (prediction.prob_home * 100).toFixed(1);
        console.log(`[DEBUG] Game ${game.id}: ${probPct}% home win`);
      }

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
        metrics.ev_home <= (config.max_ev || 1.0) && // Add max EV filter
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
        metrics.ev_away <= (config.max_ev || 1.0) && // Add max EV filter
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

  if (gamesWithoutFeatures > 0) {
    console.log(`⚠️  ${gamesWithoutFeatures} games skipped due to insufficient historical data`);
  }

  // Step 5: Display recommendations
  console.log('\n[5/5] Ranking recommendations...\n');

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

  // Display header - ensure consistent date interpretation
  // Force UTC interpretation to avoid timezone shifts
  const dateObj = new Date(targetDate + 'T12:00:00Z');
  const dateStr = dateObj.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  console.log(chalk.cyan.bold(`📊 ${options.sport.toUpperCase()} Betting Recommendations - ${dateStr}\n`));
  console.log(chalk.gray(`Model: ${model.modelType} (trained ${new Date(model.trainedAt).toLocaleDateString()})`));
  
  const roi = model.backtestMetrics.roi;
  const roiColor = roi >= 0 ? chalk.green : chalk.red;
  console.log(chalk.gray('Expected ROI: ') + roiColor(formatPercentage(roi)));
  
  console.log(chalk.gray(`Thresholds: min_edge=${formatPercentage(model.thresholds.min_edge, 1)}, min_ev=${formatPercentage(model.thresholds.min_ev, 1)}, max_ev=${formatPercentage(config.max_ev || 1.0, 1)}\n`));

  if (recommendedBets.length === 0) {
    console.log('❌ No bets meet the threshold criteria for today.\n');
    console.log('💡 This is actually good! It means the model is being selective.');
    console.log('   Check back tomorrow or adjust thresholds with retrain.\n');
    return;
  }

  // Display table
  console.log(
    chalk.bold('Rank | Time  | Matchup                                                | Pick                      | Prob  | Odds  | EV    | Edge  | Provider')
  );
  console.log(
    chalk.gray('-----+-------+--------------------------------------------------------+---------------------------+-------+-------+-------+-------+-----------')
  );

  let totalEV = 0;
  const unitSize = 100;
  const bankroll = parseFloat(options.bankroll || '1000');
  const dailyBudget = options.dailyBudget ? parseFloat(options.dailyBudget) : null;

  // Store Kelly bet sizes for display
  const kellyBets: Array<{matchup: string, betSize: number, betPct: number, scaledBet?: number, scaledPct?: number}> = [];

  for (let i = 0; i < recommendedBets.length; i++) {
    const rec = recommendedBets[i];
    const rank = chalk.yellow((i + 1).toString().padStart(4));

    // Extract time from date
    const gameTime = new Date(rec.date);
    const timeStr = gameTime.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    // Format matchup - simple, no colors
    const maxTeamLength = 25;
    const homeTeam = rec.home_team.length > maxTeamLength 
      ? rec.home_team.substring(0, maxTeamLength - 2) + '..' 
      : rec.home_team.padEnd(maxTeamLength);
    const awayTeam = rec.away_team.length > maxTeamLength 
      ? rec.away_team.substring(0, maxTeamLength - 2) + '..'
      : rec.away_team.padEnd(maxTeamLength);
    
    const matchup = `${awayTeam} @ ${homeTeam}`;

    // Pick column shows actual team name
    const pickTeam = rec.recommended_side === 'home' ? rec.home_team : rec.away_team;
    const pickDisplay = pickTeam.length > 25 
      ? pickTeam.substring(0, 23) + '..'
      : pickTeam.padEnd(25);
    const pick = chalk.green.bold(pickDisplay);
    
    const probValue = rec.recommended_side === 'home' ? rec.model_prob_home : rec.model_prob_away;
    const prob = formatPercentage(probValue, 1).padStart(5);
    
    const oddsValue = rec.recommended_side === 'home' ? rec.odds_home! : rec.odds_away!;
    const odds = chalk.cyan(formatOdds(oddsValue).padStart(5));
    
    const evValue = rec.recommended_side === 'home' ? rec.ev_home! : rec.ev_away!;
    const evColor = evValue > 0.5 ? chalk.green.bold : evValue > 0.2 ? chalk.green : chalk.yellow;
    const ev = evColor(formatPercentage(evValue, 1).padStart(5));

    const edgeValue = rec.recommended_side === 'home' ? rec.edge_home! : rec.edge_away!;
    const edgeColor = edgeValue > 0.15 ? chalk.green : chalk.gray;
    const edge = edgeColor(formatPercentage(edgeValue, 1).padStart(5));

    const provider = chalk.gray(rec.provider.substring(0, 10));

    // Calculate Kelly bet size
    const kellyBetSize = calculateKellyBetSize(probValue, oddsValue, bankroll, 0.25);

    // Store for Kelly display section
    kellyBets.push({
      matchup: `${rec.away_team.substring(0, 15)} @ ${rec.home_team.substring(0, 15)}`,
      betSize: kellyBetSize,
      betPct: (kellyBetSize / bankroll) * 100
    });

    console.log(
      `${rank} | ${timeStr} | ${matchup} | ${pick} | ${prob} | ${odds} | ${ev} | ${edge} | ${provider}`
    );

    totalEV += evValue;
  }

  console.log(
    chalk.gray('-----+-------+--------------------------------------------------------+---------------------------+-------+-------+-------+-------+-----------')
  );

  const totalStake = recommendedBets.length * unitSize;
  const expectedProfit = totalEV * unitSize;
  const profitColor = expectedProfit >= 0 ? chalk.green.bold : chalk.red.bold;

  console.log(
    chalk.bold(`\nTotal bets: ${recommendedBets.length}`) + 
    chalk.gray(' | ') +
    chalk.bold(`Total stake: ${formatCurrency(totalStake)}`) +
    chalk.gray(' | ') +
    chalk.bold('Expected profit: ') + profitColor(formatCurrency(expectedProfit)) + '\n'
  );

  // Display Kelly bet sizing
  if (kellyBets.length > 0) {
    if (dailyBudget) {
      // Scale Kelly bets to fit daily budget
      const totalKelly = kellyBets.reduce((sum, kelly) => sum + kelly.betSize, 0);
      const scaleFactor = dailyBudget / totalKelly;

      kellyBets.forEach(kelly => {
        kelly.scaledBet = kelly.betSize * scaleFactor;
        kelly.scaledPct = (kelly.scaledBet / dailyBudget) * 100;
      });

      console.log(chalk.cyan.bold(`\n💰 Kelly Criterion Bet Sizing (Daily Budget: ${formatCurrency(dailyBudget)})\n`));
      console.log(chalk.gray('Scaled to fit your daily budget while preserving optimal Kelly ratios\n'));

      console.log(chalk.bold('Rank | Matchup                     | Kelly Bet       | Scaled Bet'));
      console.log(chalk.gray('-----+----------------------------+-----------------+-----------------'));

      for (let i = 0; i < kellyBets.length; i++) {
        const kelly = kellyBets[i];
        const rank = chalk.yellow((i + 1).toString().padStart(4));
        const matchup = kelly.matchup.padEnd(28);
        const kellyDisplay = `${formatCurrency(kelly.betSize)} (${kelly.betPct.toFixed(1)}%)`;
        const scaledDisplay = `${formatCurrency(kelly.scaledBet!)} (${kelly.scaledPct!.toFixed(1)}%)`;

        console.log(`${rank} | ${matchup} | ${chalk.blue(kellyDisplay)} | ${chalk.green(scaledDisplay)}`);
      }

      const totalScaled = kellyBets.reduce((sum, kelly) => sum + (kelly.scaledBet || 0), 0);
      console.log(chalk.gray(`\nTotal: ${formatCurrency(totalScaled)} (exactly matches your budget)`));
    } else {
      // Regular bankroll display
      console.log(chalk.cyan.bold(`\n💰 Kelly Criterion Bet Sizing (Bankroll: ${formatCurrency(bankroll)})\n`));

      console.log(chalk.bold('Rank | Matchup                     | Recommended Bet'));
      console.log(chalk.gray('-----+----------------------------+-----------------'));

      for (let i = 0; i < kellyBets.length; i++) {
        const kelly = kellyBets[i];
        const rank = chalk.yellow((i + 1).toString().padStart(4));
        const matchup = kelly.matchup.padEnd(28);
        const betDisplay = `${formatCurrency(kelly.betSize)} (${kelly.betPct.toFixed(1)}%)`;

        console.log(`${rank} | ${matchup} | ${chalk.green(betDisplay)}`);
      }
    }
    console.log('');
  }

  console.log(chalk.blue.bold('💡 Tips:'));
  console.log(chalk.gray('   - These are recommendations, not guarantees'));
  console.log(chalk.gray('   - Kelly sizing optimizes long-term growth'));
  console.log(chalk.gray('   - Always gamble responsibly\n'));
}

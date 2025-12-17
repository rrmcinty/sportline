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
import type { FeatureConfig, Recommendation, GameFeatures, TodaysGame } from '../../lib/db/types.js';

import { 
  getHistoricalContext, 
  formatHistoricalContext,
  getShortHistoricalInsight 
} from '../../lib/analysis/historicalContext.js';

/**
 * Calculate a quality score for bet ranking
 * Prioritizes bets with positive historical ROI, then by EV
 */
function calculateBetQualityScore(ev: number, context: any): number {
  // Base score from EV (0-100 scale)
  const evScore = Math.max(0, Math.min(100, ev * 100));
  
  // Historical ROI bonus/penalty based on actual ROI and recommendation
  let roiMultiplier = 1.0;
  
  // Use the overall recommendation from historical context
  if (context.overallRecommendation === 'STRONG_BET') {
    roiMultiplier = 3.0; // Triple weight for strong bets
  } else if (context.overallRecommendation === 'GOOD_BET') {
    roiMultiplier = 2.0; // Double weight for good bets
  } else if (context.overallRecommendation === 'WEAK_BET') {
    roiMultiplier = 0.5; // Half weight for weak bets
  } else if (context.overallRecommendation === 'AVOID') {
    roiMultiplier = 0.1; // Heavy penalty for avoid bets
  }
  
  // Additional penalty for very negative ROI
  if (context.oddsRangeROI < -0.4) { // Less than -40% ROI
    roiMultiplier *= 0.1;
  } else if (context.oddsRangeROI < -0.2) { // Less than -20% ROI
    roiMultiplier *= 0.3;
  }
  
  // Bonus for positive ROI
  if (context.oddsRangeROI > 0) {
    roiMultiplier *= 2.0;
  }
  
  // Additional penalty for high risk
  if (context.riskLevel === 'HIGH') {
    roiMultiplier *= 0.5;
  }
  
  return evScore * roiMultiplier;
}

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
): Promise<{ recommendations: Recommendation[], gameFeatures: GameFeatures[], games: TodaysGame[] }> {
  console.log(`\n[${sport.toUpperCase()}] Starting recommendation generation...`);
  console.log(`[${sport.toUpperCase()}] Loading trained model...`);
  
  // Map sports to their sport categories
  const sportToCategory: Record<string, string> = {
    'ncaam': 'basketball',
    'nba': 'basketball', 
    'nhl': 'hockey',
    'nfl': 'football',
    'cfb': 'football'
  };
  
  const sportCategory = sportToCategory[sport] || 'basketball';
  const modelsDir = path.join(
    process.cwd(),
    `src/train/${sportCategory}/${sport}/models`
  );

  const modelPath = findLatestModel(sport, options.market, modelsDir);

  if (!modelPath) {
    console.log(`⚠️  No trained model found for ${sport} ${options.market}`);
    console.log(`   Run "sportline train --sport ${sport}" first to train a model.`);
    return { recommendations: [], gameFeatures: [], games: [] };
  }

  const model = loadModel(modelPath);

  console.log(`[${sport.toUpperCase()}] Loading configuration...`);
  const configPath = path.join(
    process.cwd(),
    `src/train/${sportCategory}/${sport}/featuresConfig.json`
  );
  const config = loadFeatureConfig(configPath);

  // Step 3: Query today's games
  console.log(`[${sport.toUpperCase()}] Querying games from database...`);
  const targetDate = options.date || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;
  const todaysGames = db.getTodaysGames(sport, targetDate, options.market);

  console.log(`✓ Found ${todaysGames.length} ${sport.toUpperCase()} scheduled games for ${targetDate}`);

  if (todaysGames.length === 0) {
    return { recommendations: [], gameFeatures: [], games: [] };
  }

  // Step 4: Generate predictions and recommendations
  console.log(`[${sport.toUpperCase()}] Generating predictions...`);

  // Get all historical games for feature extraction
  const allGames = db.getHistoricalGames(sport, model.seasons);

  const recommendations: Recommendation[] = [];
  const gameFeatures: GameFeatures[] = [];

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

      // Debug: Check for problematic games
      const isDebugGame = (game.home_team_name.includes('North Alabama') && game.away_team_name.includes('Alabama A&M')) ||
                         (game.away_team_name.includes('North Alabama') && game.home_team_name.includes('Alabama A&M'));
      const debug = isDebugGame;

      if (debug) {
        console.log(`\n🐛 DEBUG: ${game.home_team_name} vs ${game.away_team_name}`);
        console.log('Raw features:');
        Object.entries(features).forEach(([key, value]) => {
          if (isNaN(value) || !isFinite(value)) {
            console.log(`❌ BAD FEATURE: ${key} = ${value}`);
          } else if (Math.abs(value) > 100) {
            console.log(`⚠️ LARGE FEATURE: ${key} = ${value}`);
          }
        });
      }

      const prediction = predict(features, model, debug);

      if (debug || prediction.prob_home === 0 || prediction.prob_away === 0) {
        console.log(`\n🐛 DEBUG: ${game.home_team_name} vs ${game.away_team_name}`);
        console.log(`Prediction: prob_home=${prediction.prob_home}, prob_away=${prediction.prob_away}`);
        if (!debug) {
          console.log('Raw features (showing first 10):');
          Object.entries(features).slice(0, 10).forEach(([key, value]) => {
            console.log(`  ${key}: ${value}`);
          });
        }
      }

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
        provider: odds.provider || 'Unknown',
        line: odds.line
      };

      // Determine recommended side based on higher EV (no thresholds)
      let recommendedSide: 'home' | 'away' | null = null;

      if (metrics.ev_home !== null && metrics.ev_away !== null) {
        // Pick the side with higher EV
        recommendedSide = metrics.ev_home > metrics.ev_away ? 'home' : 'away';
      } else if (metrics.ev_home !== null) {
        recommendedSide = 'home';
      } else if (metrics.ev_away !== null) {
        recommendedSide = 'away';
      }

      recommendation.recommended_side = recommendedSide;

      // Create GameFeatures for filtering
      const gameFeature: GameFeatures = {
        game_id: game.id,
        season: new Date(game.date).getFullYear(), // Approximate season from date
        date: game.date,
        home_team: game.home_team_id,
        away_team: game.away_team_id,
        features,
        odds: game.odds.map(o => ({
          provider: o.provider || 'Unknown',
          market: 'moneyline',
          line: null,
          home: o.price_home,
          away: o.price_away,
          price_home: o.price_home,
          price_away: o.price_away,
          price_over: null,
          price_under: null,
          timestamp: new Date().toISOString()
        })),
        target: null // Unknown for future games
      };
      
      gameFeatures.push(gameFeature);

      // Include all games with predictions (no threshold filtering)
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

  return { recommendations, gameFeatures, games: todaysGames };
}

export async function recommend(options: RecommendOptions): Promise<void> {
  console.log(chalk.cyan.bold('\n🎯 Sportline Betting Recommendations\n'));

  const dbPath = path.join(process.cwd(), 'data', 'sportline.db');
  const db = new DatabaseQueries(dbPath);

  // Determine which sports to process
  const sportsToProcess = options.sport ? [options.sport] : ['ncaam', 'nba', 'nhl', 'nfl', 'cfb'];
  
  // Determine which markets to process - if market is 'all', process all available markets
  const marketsToProcess = options.market === 'all' 
    ? ['moneyline', 'spread'] // Add 'total' when implemented
    : [options.market];

  // Collect all recommendations from all sports and markets
  const allRecommendations: Array<{sport: string, market: string, recommendation: Recommendation, game?: TodaysGame}> = [];
  const allGameFeatures: GameFeatures[] = [];
  let totalGamesFound = 0;

  for (const sport of sportsToProcess) {
    for (const market of marketsToProcess) {
      try {
        // Create market-specific options
        const marketOptions = { ...options, market };
        const { recommendations, gameFeatures, games } = await getRecommendationsForSport(sport, marketOptions, db);

        // Add sport and market identifiers to each recommendation
        recommendations.forEach(rec => {
          // Find the corresponding game for result checking
          const correspondingGame = games.find(g => g.id === rec.game_id);
          allRecommendations.push({ 
            sport: sport.toUpperCase(), 
            market: market.toUpperCase(),
            recommendation: rec,
            game: correspondingGame
          });
        });

        // Collect all game features for filtering
        allGameFeatures.push(...gameFeatures);

        if (recommendations.length > 0) {
          console.log(`✓ Found ${recommendations.length} ${sport.toUpperCase()} ${market} recommendations`);
        }

        totalGamesFound += recommendations.length;
      } catch (error) {
        console.error(`❌ Error processing ${sport} ${market}:`, error);
      }
    }
  }

  if (allRecommendations.length === 0) {
    console.log(`\n${chalk.red('❌')} No recommendations found for any sport.`);
    console.log('Make sure you have trained models and upcoming games in the database.');
    return;
  }

  // Sort all recommendations by quality score (best bets first)
  allRecommendations.sort((a, b) => {
    const evA = a.recommendation.recommended_side === 'home'
      ? a.recommendation.ev_home!
      : a.recommendation.ev_away!;
    const evB = b.recommendation.recommended_side === 'home'
      ? b.recommendation.ev_home!
      : b.recommendation.ev_away!;
    
    // Get historical context for quality assessment - use the specific market for each recommendation
    const contextA = getHistoricalContext(a.recommendation, undefined, a.sport.toLowerCase(), a.market.toLowerCase());
    const contextB = getHistoricalContext(b.recommendation, undefined, b.sport.toLowerCase(), b.market.toLowerCase());
    
    // Calculate quality score: prioritize positive ROI categories, then EV
    const qualityScoreA = calculateBetQualityScore(evA, contextA);
    const qualityScoreB = calculateBetQualityScore(evB, contextB);
    
    return qualityScoreB - qualityScoreA;
  });

  // Display unified recommendations
  displayUnifiedRecommendations(allRecommendations, options);
}

// Helper function to check if a bet was correct
function checkBetResult(
  recommendation: Recommendation,
  game: TodaysGame,
  market: string
): { result: 'WIN' | 'LOSS' | 'PUSH' | 'PENDING', score?: string } {
  // Check if game is completed
  if (game.home_score === null || game.away_score === null) {
    return { result: 'PENDING' };
  }

  const score = `${game.away_score}-${game.home_score}`;
  const recommendedSide = recommendation.recommended_side;

  if (market.toLowerCase() === 'moneyline') {
    // Moneyline: simple win/loss
    const homeWon = game.home_score > game.away_score;
    const betWon = (recommendedSide === 'home' && homeWon) || (recommendedSide === 'away' && !homeWon);
    return { 
      result: betWon ? 'WIN' : 'LOSS',
      score 
    };
  } else if (market.toLowerCase() === 'spread') {
    // Spread: check if team covered the spread
    if (recommendation.line === null) {
      return { result: 'PENDING', score };
    }

    const spread = recommendation.line;
    const homeMargin = game.home_score - game.away_score;
    
    if (recommendedSide === 'home') {
      // Home team recommended, check if they covered
      const betWon = homeMargin > spread;
      const isPush = homeMargin === spread;
      return { 
        result: isPush ? 'PUSH' : (betWon ? 'WIN' : 'LOSS'),
        score 
      };
    } else {
      // Away team recommended, check if they covered
      const betWon = homeMargin < spread;
      const isPush = homeMargin === spread;
      return { 
        result: isPush ? 'PUSH' : (betWon ? 'WIN' : 'LOSS'),
        score 
      };
    }
  }

  return { result: 'PENDING', score };
}

// Helper function to display unified recommendations across all sports and markets
function displayUnifiedRecommendations(
  allRecommendations: Array<{sport: string, market: string, recommendation: Recommendation, game?: TodaysGame}>,
  options: RecommendOptions
): void {
  // Get today's date for header
  const headerDate = options.date ? new Date(options.date + 'T12:00:00Z') : new Date();
  const dateStr = headerDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const sportsList = [...new Set(allRecommendations.map(r => r.sport))].join(' & ');
  const marketsList = [...new Set(allRecommendations.map(r => r.market))].join(' & ');
  console.log(chalk.cyan.bold(`\n🎯 All Sports Betting Recommendations - ${dateStr}\n`));
  console.log(chalk.gray(`Sports: ${sportsList} | Markets: ${marketsList} | Total Recommendations: ${allRecommendations.length}`));

  // Main recommendations table
  console.log(chalk.cyan.bold('\n🎯 Top Recommendations Across All Sports\n'));

  console.log(`${chalk.yellow.bold('Rank')} | ${chalk.bold('Sport')} | ${chalk.gray.bold('Market')} | ${chalk.gray.bold('Line')} | ${chalk.white.bold('Time')}  | ${chalk.white.bold('Matchup')}                        | ${chalk.white.bold('Pick')}                | ${chalk.blue.bold('Prob')} | ${chalk.magenta.bold('Odds')}  | ${chalk.cyan.bold('EV')}    | ${chalk.green.bold('Edge')}  | ${chalk.red.bold('Result')} | ${chalk.red.bold('Historical Context')}`);
  console.log(chalk.gray('-----+-------+--------+------+-------+--------------------------------+---------------------+------+-------+-------+-------+---------+------------------'));

  for (let i = 0; i < allRecommendations.length; i++) {
    const { sport, market, recommendation: rec, game } = allRecommendations[i];
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

    // Get historical context for this recommendation using the specific market
    const historicalInsight = getShortHistoricalInsight(rec, undefined, sport.toLowerCase(), market.toLowerCase());

    // Check bet result if game is completed
    let resultDisplay = 'PENDING';
    if (game) {
      const betResult = checkBetResult(rec, game, market);
      if (betResult.result === 'WIN') {
        resultDisplay = chalk.green(`✅ WIN (${betResult.score})`);
      } else if (betResult.result === 'LOSS') {
        resultDisplay = chalk.red(`❌ LOSS (${betResult.score})`);
      } else if (betResult.result === 'PUSH') {
        resultDisplay = chalk.yellow(`🟡 PUSH (${betResult.score})`);
      } else {
        resultDisplay = chalk.gray('PENDING');
      }
    } else {
      resultDisplay = chalk.gray('PENDING');
    }

    // Format line display based on market type
    let lineDisplay = '';
    if (rec.line !== null) {
      if (market.toLowerCase() === 'spread') {
        // For spreads, show the line relative to the recommended team
        const homeLine = rec.line;
        const awayLine = -rec.line;
        const displayLine = rec.recommended_side === 'home' ? homeLine : awayLine;
        lineDisplay = displayLine > 0 ? `+${displayLine}` : displayLine.toString();
      } else if (market.toLowerCase() === 'total') {
        // For totals, show O/U with the total
        lineDisplay = `O/U ${rec.line}`;
      } else {
        // For other markets, just show the line
        lineDisplay = rec.line.toString();
      }
    } else {
      lineDisplay = 'N/A';
    }

    const rank = chalk.yellow((i + 1).toString().padStart(4));
    const sportDisplay = chalk.bold(sport.padEnd(5));
    const marketDisplay = chalk.gray(market.padEnd(6));
    const lineDisplayFormatted = chalk.gray(lineDisplay.padEnd(4));
    const time = chalk.white(gameTime.padStart(5));
    const matchupDisplay = chalk.white(matchup.padEnd(30));
    const pickDisplay = rec.recommended_side === 'home'
      ? chalk.green(pick.padEnd(19))
      : chalk.red(pick.padEnd(19));
    const probDisplay = chalk.blue(prob.padStart(4));
    const oddsDisplay = chalk.magenta(odds.padStart(5));
    const evDisplay = chalk.cyan(ev.padStart(5));
    const edgeDisplay = chalk.green(edge.padStart(5));
    const historicalDisplay = historicalInsight.padEnd(18);

    console.log(`${rank} | ${sportDisplay} | ${marketDisplay} | ${lineDisplayFormatted} | ${time} | ${matchupDisplay} | ${pickDisplay} | ${probDisplay} | ${oddsDisplay} | ${evDisplay} | ${edgeDisplay} | ${resultDisplay.padEnd(17)} | ${historicalDisplay}`);
  }

  console.log('');

  // Removed duplicate detailed historical context section - info is already in the main table

  // Kelly Criterion section
  const bankroll = options.bankroll ? parseFloat(options.bankroll) : null;
  const dailyBudget = options.dailyBudget ? parseFloat(options.dailyBudget) : null;

  if (bankroll || dailyBudget) {
    const kellyBets = allRecommendations.map(({ sport, market, recommendation: rec }) => ({
      sport,
      market,
      matchup: `${rec.away_team.substring(0, 15)} @ ${rec.home_team.substring(0, 15)}`,
      betSize: calculateKellyBetSize(
        rec.recommended_side === 'home' ? rec.model_prob_home : rec.model_prob_away,
        rec.recommended_side === 'home' ? rec.odds_home! : rec.odds_away!,
        bankroll || 1000
      ),
      betPct: ((calculateKellyBetSize(
        rec.recommended_side === 'home' ? rec.model_prob_home : rec.model_prob_away,
        rec.recommended_side === 'home' ? rec.odds_home! : rec.odds_away!,
        bankroll || 1000
      ) / (bankroll || 1000)) * 100),
      scaledBet: undefined as number | undefined,
      scaledPct: undefined as number | undefined,
    }));

    if (dailyBudget) {
      // Scale bets to fit daily budget proportionally
      const totalKelly = kellyBets.reduce((sum, kelly) => sum + kelly.betSize, 0);
      if (totalKelly > 0) {
        const scaleFactor = dailyBudget / totalKelly;
        kellyBets.forEach(kelly => {
          kelly.scaledBet = kelly.betSize * scaleFactor;
          kelly.scaledPct = (kelly.scaledBet / dailyBudget) * 100;
        });
      }

      console.log(chalk.cyan.bold(`\n💰 Kelly Criterion Bet Sizing (Daily Budget: ${formatCurrency(dailyBudget)})\n`));

      console.log(`${chalk.yellow.bold('Rank')} | ${chalk.bold('Sport')} | ${chalk.gray.bold('Market')} | ${chalk.gray.bold('Matchup')}                | ${chalk.blue.bold('Raw Kelly Bet')} | ${chalk.green.bold('Scaled Bet')}`);
      console.log(chalk.gray('-----+-------+--------+---------------------------+---------------+-----------------'));

      for (let i = 0; i < kellyBets.length; i++) {
        const kelly = kellyBets[i];
        const rank = chalk.yellow((i + 1).toString().padStart(4));
        const sportDisplay = chalk.bold(kelly.sport.padEnd(5));
        const marketDisplay = chalk.gray(kelly.market.padEnd(6));
        const matchup = kelly.matchup.padEnd(25);
        const kellyDisplay = `${formatCurrency(kelly.betSize)} (${kelly.betPct.toFixed(1)}%)`;
        const scaledDisplay = `${formatCurrency(kelly.scaledBet!)} (${kelly.scaledPct!.toFixed(1)}%)`;

        console.log(`${rank} | ${sportDisplay} | ${marketDisplay} | ${matchup} | ${chalk.blue(kellyDisplay)} | ${chalk.green(scaledDisplay)}`);
      }

      const totalScaled = kellyBets.reduce((sum, kelly) => sum + (kelly.scaledBet || 0), 0);
      console.log(chalk.gray(`\nTotal: ${formatCurrency(totalScaled)} (exactly matches your budget)`));
    } else {
      // Regular bankroll display
      console.log(chalk.cyan.bold(`\n💰 Kelly Criterion Bet Sizing (Bankroll: ${formatCurrency(bankroll!)})\n`));

      console.log(`${chalk.yellow.bold('Rank')} | ${chalk.bold('Sport')} | ${chalk.gray.bold('Market')} | ${chalk.gray.bold('Matchup')}                | ${chalk.green.bold('Recommended Bet')}`);
      console.log(chalk.gray('-----+-------+--------+---------------------------+-----------------'));

      for (let i = 0; i < kellyBets.length; i++) {
        const kelly = kellyBets[i];
        const rank = chalk.yellow((i + 1).toString().padStart(4));
        const sportDisplay = chalk.bold(kelly.sport.padEnd(5));
        const marketDisplay = chalk.gray(kelly.market.padEnd(6));
        const matchup = kelly.matchup.padEnd(25);
        const betDisplay = `${formatCurrency(kelly.betSize)} (${kelly.betPct.toFixed(1)}%)`;

        console.log(`${rank} | ${sportDisplay} | ${marketDisplay} | ${matchup} | ${chalk.green(betDisplay)}`);
      }
    }
    console.log('');
  }

  console.log(chalk.blue.bold('💡 Tips:'));
  console.log(chalk.gray('   - These are recommendations, not guarantees'));
  console.log(chalk.gray('   - Kelly sizing optimizes long-term growth'));
  console.log(chalk.gray('   - Always gamble responsibly\n'));
}

// Helper function to display recommendations for a specific sport (kept for backward compatibility)
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

  console.log(`${chalk.bold('Rank')} | ${chalk.white.bold('Time')}  | ${chalk.gray.bold('Matchup')}                        | ${chalk.white.bold('Pick')}                | ${chalk.blue.bold('Prob')} | ${chalk.magenta.bold('Odds')}  | ${chalk.cyan.bold('EV')}    | ${chalk.green.bold('Edge')}  | ${chalk.gray.bold('Provider')}`);
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

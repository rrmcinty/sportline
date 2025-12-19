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
  formatOdds,
  formatPercentage,
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

const IS_VERBOSE = process.env.SPORTLINE_VERBOSE === '1';

/**
 * Analyze a specific game by ID
 */
async function analyzeSpecificGame(gameId: string, options: RecommendOptions, db: DatabaseQueries): Promise<void> {
  console.log(chalk.yellow(`🔍 Analyzing Game: ${gameId}\n`));

  // Get the specific game
  const game = db.getGameById(gameId);
  if (!game) {
    console.error(chalk.red(`❌ Game not found: ${gameId}`));
    return;
  }

  console.log(chalk.cyan.bold(`${game.sport.toUpperCase()} Game Analysis`));
  
  // Get team details
  const homeTeam = db.getTeam(game.home_team_id, game.sport);
  const awayTeam = db.getTeam(game.away_team_id, game.sport);
  
  if (!homeTeam || !awayTeam) {
    console.error(chalk.red('❌ Could not load team information'));
    return;
  }

  const gameDate = new Date(game.date);
  console.log(`📅 ${gameDate.toLocaleDateString()} ${gameDate.toLocaleTimeString()}`);
  console.log(`🏠 ${homeTeam.display_name || homeTeam.name}`);
  console.log(`✈️  ${awayTeam.display_name || awayTeam.name}`);
  if (game.venue) {
    console.log(`📍 ${game.venue}`);
  }
  console.log('');

  // Determine markets to analyze
  const marketsToProcess = options.market === 'all' 
    ? ['moneyline', 'spread'] 
    : [options.market];

  for (const market of marketsToProcess) {
    console.log(chalk.green.bold(`\n📊 ${market.toUpperCase()} ANALYSIS\n`));

    try {
      // Load model for this sport/market
      const sportToCategory: Record<string, string> = {
        'ncaam': 'basketball',
        'nba': 'basketball', 
        'nhl': 'hockey',
        'nfl': 'football',
        'cfb': 'football'
      };
      
      const sportCategory = sportToCategory[game.sport] || 'basketball';
      const modelsDir = path.join(process.cwd(), `src/train/${sportCategory}/${game.sport}/models`);
      const modelPath = findLatestModel(game.sport, market, modelsDir);
      
      if (!modelPath) {
        console.log(chalk.yellow(`⚠️  No trained model found for ${game.sport} ${market}`));
        continue;
      }

      const model = loadModel(modelPath);
      console.log(chalk.gray(`🤖 Using model: ${path.basename(modelPath)}`));
      console.log(chalk.gray(`📈 Model accuracy: ${(model.backtestMetrics.accuracy * 100).toFixed(1)}%`));
      
      // Color code ROI - green for positive, red for negative
      const roiColor = model.backtestMetrics.roi > 0 ? chalk.green : chalk.red;
      const roiSign = model.backtestMetrics.roi > 0 ? '+' : '';
      console.log(chalk.gray(`💰 Model historical ROI: ${roiColor(`${roiSign}${(model.backtestMetrics.roi * 100).toFixed(1)}%`)} ${chalk.gray('(all past recommendations)')}\n`));

      // Extract features for this game
      const config = {
        sport: model.sport,
        model: model.modelType,
        market: model.market,
        seasons: model.seasons,
        features: model.features,
        rolling_windows: model.rollingWindows,
        allowed_providers: ['draftkings', 'fanduel', 'betmgm'],
        recency_weighting: model.recencyWeighting,
        min_edge: model.thresholds.min_edge,
        min_ev: model.thresholds.min_ev
      } as FeatureConfig;

      // Get all games for feature extraction
      const allGames = db.getHistoricalGames(game.sport, model.seasons);
      const features = extractFeaturesForGame(game, db, config, model.featureMeans, allGames);
      if (!features) {
        console.log(chalk.red('❌ Could not extract features for this game'));
        continue;
      }

      // Generate prediction
      const prediction = predict(features, model);
      console.log(chalk.magenta.bold(`🎯 Model Prediction:`));
      
      // Color code based on confidence - higher probability gets green, lower gets red
      const homeColor = prediction.prob_home > 0.55 ? chalk.green.bold : 
                       prediction.prob_home > 0.45 ? chalk.yellow.bold : chalk.red.bold;
      const awayColor = prediction.prob_away > 0.55 ? chalk.green.bold : 
                       prediction.prob_away > 0.45 ? chalk.yellow.bold : chalk.red.bold;
      
      console.log(`   🏠 ${homeTeam.display_name || homeTeam.name}: ${homeColor(formatPercentage(prediction.prob_home))}`);
      console.log(`   ✈️  ${awayTeam.display_name || awayTeam.name}: ${awayColor(formatPercentage(prediction.prob_away))}`);
      
      // Show model's favorite
      const favorite = prediction.prob_home > prediction.prob_away ? 
        { team: homeTeam.display_name || homeTeam.name, prob: prediction.prob_home, icon: '🏠' } :
        { team: awayTeam.display_name || awayTeam.name, prob: prediction.prob_away, icon: '✈️' };
      
      const confidence = favorite.prob > 0.65 ? 'High' : favorite.prob > 0.55 ? 'Medium' : 'Low';
      const confidenceColor = favorite.prob > 0.65 ? chalk.green : favorite.prob > 0.55 ? chalk.yellow : chalk.red;
      
      console.log(chalk.blue(`   📊 Model favors: ${favorite.icon} ${chalk.bold(favorite.team)} (${confidenceColor(confidence)} confidence)`));

      // Get odds and calculate metrics
      const odds = db.getOdds(game.id, market, ['draftkings', 'fanduel', 'betmgm']);
      
      if (odds.length === 0) {
        console.log(chalk.yellow('\n⚠️  No odds available for this market'));
        continue;
      }

      console.log(chalk.cyan.bold(`\n💰 Betting Analysis:`));
      
      for (const odd of odds) {
        console.log(chalk.blue.bold(`\n📊 ${odd.provider.toUpperCase()}:`));
        
        if (market === 'moneyline') {
          // Calculate metrics for both sides
          const metrics = calculateBettingMetrics(prediction.prob_home, odd.price_home, odd.price_away);
          
          // Home team analysis
          if (odd.price_home && metrics.ev_home !== null) {
            const evColor = metrics.ev_home > 0.05 ? chalk.green.bold : 
                           metrics.ev_home > 0.02 ? chalk.yellow.bold : 
                           metrics.ev_home > 0 ? chalk.white : chalk.red;
            
            console.log(`   🏠 ${chalk.bold(homeTeam.display_name || homeTeam.name)}:`);
            console.log(`      Odds: ${chalk.cyan(formatOdds(odd.price_home))} | EV: ${evColor(formatPercentage(metrics.ev_home))} | Edge: ${evColor(formatPercentage(metrics.edge_home || 0))}`);

            if (metrics.ev_home > 0) {
              console.log(chalk.yellow(`      ⚠️  Marginal value`));
            } else {
              console.log(chalk.red(`      ❌ No value`));
            }
          }
          
          // Away team analysis  
          if (odd.price_away && metrics.ev_away !== null) {
            const evColor = metrics.ev_away > 0.05 ? chalk.green.bold : 
                           metrics.ev_away > 0.02 ? chalk.yellow.bold : 
                           metrics.ev_away > 0 ? chalk.white : chalk.red;
            
            console.log(`   ✈️  ${chalk.bold(awayTeam.display_name || awayTeam.name)}:`);
            console.log(`      Odds: ${chalk.cyan(formatOdds(odd.price_away))} | EV: ${evColor(formatPercentage(metrics.ev_away))} | Edge: ${evColor(formatPercentage(metrics.edge_away || 0))}`);

            if (metrics.ev_away > 0) {
              console.log(chalk.yellow(`      ⚠️  Marginal value`));
            } else {
              console.log(chalk.red(`      ❌ No value`));
            }
          }
        } else if (market === 'spread') {
          // Spread betting analysis
          const metrics = calculateBettingMetrics(prediction.prob_home, odd.price_home, odd.price_away);
          
          console.log(`   ${chalk.magenta.bold(`Spread: ${odd.line}`)}`);
          
          if (odd.price_home && metrics.ev_home !== null) {
            const evColor = metrics.ev_home > 0.05 ? chalk.green.bold : 
                           metrics.ev_home > 0.02 ? chalk.yellow.bold : 
                           metrics.ev_home > 0 ? chalk.white : chalk.red;
            
            const homeSpread = odd.line || 0;
            console.log(`   🏠 ${chalk.bold(homeTeam.display_name || homeTeam.name)} ${chalk.gray(`(${homeSpread > 0 ? '+' : ''}${homeSpread})`)}: ${chalk.cyan(formatOdds(odd.price_home))} | EV: ${evColor(formatPercentage(metrics.ev_home))}`);
          }
          
          if (odd.price_away && metrics.ev_away !== null) {
            const evColor = metrics.ev_away > 0.05 ? chalk.green.bold : 
                           metrics.ev_away > 0.02 ? chalk.yellow.bold : 
                           metrics.ev_away > 0 ? chalk.white : chalk.red;
            
            const awaySpread = odd.line ? -odd.line : 0;
            console.log(`   ✈️  ${chalk.bold(awayTeam.display_name || awayTeam.name)} ${chalk.gray(`(${awaySpread > 0 ? '+' : ''}${awaySpread})`)}: ${chalk.cyan(formatOdds(odd.price_away))} | EV: ${evColor(formatPercentage(metrics.ev_away))}`);
          }
        }
      }

      // Historical context
      const dummyRecommendation = {
        game_id: game.id,
        home_team: homeTeam.display_name || homeTeam.name,
        away_team: awayTeam.display_name || awayTeam.name,
        model_prob_home: prediction.prob_home,
        model_prob_away: prediction.prob_away,
        odds_home: odds[0]?.price_home || null,
        odds_away: odds[0]?.price_away || null,
        ev_home: null,
        ev_away: null,
        edge_home: null,
        edge_away: null,
        recommended_side: null,
        actual: null,
        provider: odds[0]?.provider || '',
        line: odds[0]?.line || null,
        date: game.date
      } as Recommendation;

      console.log(chalk.blue.bold(`\n📈 Historical Context:`));
      const insight = getShortHistoricalInsight(dummyRecommendation, undefined, game.sport, market);
      console.log(`   ${insight}`);

    } catch (error) {
      console.error(chalk.red(`❌ Error analyzing ${market}:`), error);
    }
  }
}

interface RecommendOptions {
  sport?: string;
  game?: string;
  date?: string;
  market: string;
  minBets: string;
}

// Helper function to get recommendations for a specific sport
async function getRecommendationsForSport(
  sport: string,
  options: RecommendOptions,
  db: DatabaseQueries
): Promise<{ recommendations: Recommendation[], gameFeatures: GameFeatures[], games: TodaysGame[] }> {
  if (IS_VERBOSE) {
    console.log(`\n[${sport.toUpperCase()}] Starting recommendation generation...`);
    console.log(`[${sport.toUpperCase()}] Loading trained model...`);
  }
  
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
    if (IS_VERBOSE) {
      console.log(`⚠️  No trained model found for ${sport} ${options.market}`);
      console.log(`   Run "sportline train --sport ${sport}" first to train a model.`);
    }
    return { recommendations: [], gameFeatures: [], games: [] };
  }

  const model = loadModel(modelPath);

  if (IS_VERBOSE) {
    console.log(`[${sport.toUpperCase()}] Loading configuration...`);
  }
  const configPath = path.join(
    process.cwd(),
    `src/train/${sportCategory}/${sport}/featuresConfig.json`
  );
  const config = loadFeatureConfig(configPath);

  // Step 3: Query today's games
  if (IS_VERBOSE) {
    console.log(`[${sport.toUpperCase()}] Querying games from database...`);
  }
  const targetDate = options.date || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;
  const todaysGames = db.getTodaysGames(sport, targetDate, options.market);

  if (IS_VERBOSE) {
    console.log(`✓ Found ${todaysGames.length} ${sport.toUpperCase()} scheduled games for ${targetDate}`);
  }

  if (todaysGames.length === 0) {
    return { recommendations: [], gameFeatures: [], games: [] };
  }

  // Step 4: Generate predictions and recommendations
  if (IS_VERBOSE) {
    console.log(`[${sport.toUpperCase()}] Generating predictions...`);
  }

  // Get all historical games for feature extraction
  const allGames = db.getHistoricalGames(sport, model.seasons);

  const recommendations: Recommendation[] = [];
  const gameFeatures: GameFeatures[] = [];

  const stats = {
    totalGames: todaysGames.length,
    gamesWithAnyOddsRows: 0,
    skippedNoFeatures: 0,
    skippedNoOddsRows: 0,
    skippedMissingPrices: 0,
    skippedNoRecommendedSide: 0,
    processed: 0,
  };

  for (const game of todaysGames) {
    try {
      stats.processed++;
      if (game.odds.length > 0) {
        stats.gamesWithAnyOddsRows++;
      }

      // Extract features for this game
      const features = extractFeaturesForGame(
        game,
        db,
        config,
        model.featureMeans,
        allGames
      );

      if (!features) {
        stats.skippedNoFeatures++;
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

      if (!odds) {
        stats.skippedNoOddsRows++;
        continue;
      }

      if (odds.price_home === null || odds.price_away === null) {
        stats.skippedMissingPrices++;
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
      } else {
        stats.skippedNoRecommendedSide++;
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

  if (IS_VERBOSE) {
    console.log(`✓ Generated ${recommendations.length} ${sport.toUpperCase()} recommendations`);
  }

  if (IS_VERBOSE && recommendations.length === 0) {
    console.log(`[${sport.toUpperCase()}] Skip summary for ${targetDate} (${options.market}):`);
    console.log(`  - Total games: ${stats.totalGames}`);
    console.log(`  - Games with any odds rows attached: ${stats.gamesWithAnyOddsRows}`);
    console.log(`  - Skipped (feature extraction returned null): ${stats.skippedNoFeatures}`);
    console.log(`  - Skipped (no odds rows for this market/date): ${stats.skippedNoOddsRows}`);
    console.log(`  - Skipped (odds missing price_home/price_away): ${stats.skippedMissingPrices}`);
    console.log(`  - Skipped (could not choose recommended side): ${stats.skippedNoRecommendedSide}`);
    console.log(`  - Note: sportline date filtering uses DATE(DATETIME(g.date, '-5 hours')) when querying games.`);
  }

  return { recommendations, gameFeatures, games: todaysGames };
}

export async function recommend(options: RecommendOptions): Promise<void> {
  console.log(chalk.cyan.bold('\n🎯 Sportline Betting Recommendations\n'));

  const dbPath = path.join(process.cwd(), 'data', 'sportline.db');
  const db = new DatabaseQueries(dbPath);

  // Handle specific game analysis
  if (options.game) {
    await analyzeSpecificGame(options.game, options, db);
    db.close();
    return;
  }

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

  // Sort all recommendations by historical ROI (best ROI first)
  allRecommendations.sort((a, b) => {
    // Get historical context for ROI comparison
    const contextA = getHistoricalContext(a.recommendation, undefined, a.sport.toLowerCase(), a.market.toLowerCase());
    const contextB = getHistoricalContext(b.recommendation, undefined, b.sport.toLowerCase(), b.market.toLowerCase());
    
    // Primary sort: Historical ROI (higher is better)
    const roiA = contextA.oddsRangeROI || -1; // Default to -100% if no ROI data
    const roiB = contextB.oddsRangeROI || -1;
    
    if (Math.abs(roiA - roiB) > 0.01) { // If ROI difference is significant (>1%)
      return roiB - roiA; // Higher ROI first
    }
    
    // Secondary sort: EV (if ROI is similar)
    const evA = a.recommendation.recommended_side === 'home'
      ? a.recommendation.ev_home!
      : a.recommendation.ev_away!;
    const evB = b.recommendation.recommended_side === 'home'
      ? b.recommendation.ev_home!
      : b.recommendation.ev_away!;
    
    return evB - evA;
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
  const status = (game.status || '').toLowerCase();
  const isFinal = status === 'post' || status === 'final' || status === 'completed';

  // Only evaluate bets for completed games
  if (!isFinal || game.home_score === null || game.away_score === null) {
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
  const formatOddsTimestamp = (ts?: string | null): string => {
    if (!ts) return 'N/A';
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return 'N/A';

    return d.toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

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
  if (IS_VERBOSE) {
    console.log(chalk.gray(`Sports: ${sportsList} | Markets: ${marketsList} | Total Recommendations: ${allRecommendations.length}`));
  }

  // Main recommendations table
  console.log(chalk.cyan.bold('\n🎯 Top Recommendations Across All Sports\n'));

  for (let i = 0; i < allRecommendations.length; i++) {
    const { sport, market, recommendation: rec, game } = allRecommendations[i];
    const gameTime = new Date(rec.date).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const oddsTimestamp = game?.odds?.[0]?.timestamp;
    const oddsTimeDisplay = formatOddsTimestamp(oddsTimestamp);

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
        const status = (game.status || '').toLowerCase();
        const isLive = status === 'in' || status === 'live' || status === 'inprogress';
        if (isLive && game.home_score !== null && game.away_score !== null) {
          resultDisplay = chalk.yellow(`LIVE (${game.away_score}-${game.home_score})`);
        } else {
          resultDisplay = chalk.gray('PENDING');
        }
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

    const rank = chalk.yellow.bold(`#${(i + 1).toString()}`);
    const meta = chalk.white(`${sport} ${market}${lineDisplay !== 'N/A' ? ` ${lineDisplay}` : ''} · ${gameTime}`);

    const pickLabel = rec.recommended_side === 'home' ? chalk.green.bold(pick) : chalk.red.bold(pick);
    const modelLine = `${chalk.blue(`Prob ${prob}`)}  ${chalk.cyan(`EV ${ev}`)}  ${chalk.green(`Edge ${edge}`)}`;
    const oddsLine = `${chalk.magenta(`Odds ${odds}`)}  ${chalk.gray(`${rec.provider || 'Unknown'} · ${oddsTimeDisplay}`)}`;

    console.log(`${rank} ${meta} · ${pickLabel}`);
    console.log(chalk.white(` ${matchup}`));
    console.log(` ${modelLine}`);
    console.log(` ${oddsLine}`);
    console.log(` ${resultDisplay}  ${historicalInsight}`);
    console.log('');
  }

  console.log('');

  // Removed duplicate detailed historical context section - info is already in the main table

  console.log(chalk.blue.bold('💡 Tips:'));
  console.log(chalk.gray('   - These are recommendations, not guarantees'));
  console.log(chalk.gray('   - Always gamble responsibly\n'));
}

// Helper function to display recommendations for a specific sport (kept for backward compatibility)
function displayRecommendations(sport: string, recommendations: Recommendation[], options: RecommendOptions): void {
  if (recommendations.length === 0) return;

  const formatOddsTimestamp = (ts?: string | null): string => {
    if (!ts) return 'N/A';
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return 'N/A';

    return d.toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

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

  console.log(`${chalk.bold('Rank')} | ${chalk.white.bold('Time')}  | ${chalk.gray.bold('Matchup')}                        | ${chalk.white.bold('Pick')}                | ${chalk.blue.bold('Prob')} | ${chalk.magenta.bold('Odds')}  | ${chalk.cyan.bold('EV')}    | ${chalk.green.bold('Edge')}  | ${chalk.gray.bold('Book')}      | ${chalk.gray.bold('Odds Time')}`);
  console.log(chalk.gray('-----+-------+--------------------------------+---------------------+------+-------+-------+-------+-----------+---------------'));

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

    const oddsTimeDisplay = formatOddsTimestamp(null);

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

    const oddsTimeDisplayFormatted = chalk.gray(oddsTimeDisplay.padEnd(13));

    console.log(`${rank} | ${time} | ${matchupDisplay} | ${pickDisplay} | ${probDisplay} | ${oddsDisplay} | ${evDisplay} | ${edgeDisplay} | ${providerDisplay} | ${oddsTimeDisplayFormatted}`);
  }

  console.log('');
}

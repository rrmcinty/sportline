/**
 * Feature engineering for sports betting models
 * Extracts features from game data, including rolling averages and fixed features
 */

import type { Game, GameFeatures, OddsData, FeatureConfig } from '../db/types.js';
import { DatabaseQueries } from '../db/queries.js';
import { getMarketImpliedProb } from '../odds/evCalculator.js';
import { getEnabledRollingFeatures, isFeatureEnabled } from './featureConfig.js';
import { 
  calculateAdvancedStats, 
  computeOffensiveDefensiveRatings,
  getAdvancedFeatures
} from './sportFeatureFactory.js';
import { 
  calculateSOSDifferential,
  getStrengthOfScheduleFeatures
} from './strengthOfSchedule.js';

/**
 * Generate exponential recency weights for a given window size
 */
export function getExponentialWeights(window: number, decay: number = 0.7): number[] {
  const weights: number[] = [];
  for (let i = 0; i < window; i++) {
    weights.push(Math.pow(decay, i));
  }
  // Reverse so most recent game gets highest weight
  return weights.reverse();
}

/**
 * Compute a weighted average using provided values and weights
 */
export function weightedAverage(values: number[], weights: number[]): number {
  if (values.length === 0) return 0;
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  return values.reduce((sum, v, i) => sum + v * weights[i], 0) / totalWeight;
}

// This function is now handled by sport-specific modules
// See sportFeatureFactory.ts for the new implementation

/**
 * Calculate form indicators from game history
 */
export function calculateFormIndicators(
  teamGames: Array<{ id: string; date: string; home_team_id: string; away_team_id: string; home_score: number; away_score: number }>,
  teamId: string,
  currentGameId: string
): Record<string, number> {
  const formStats: Record<string, number> = {};

  // Sort games by date (most recent first)
  const sortedGames = teamGames
    .filter(g => g.id !== currentGameId) // Exclude current game
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Calculate win streak
  let winStreak = 0;
  for (const game of sortedGames.slice(0, 20)) { // Check last 20 games
    const isHome = game.home_team_id === teamId;
    const teamScore = isHome ? game.home_score : game.away_score;
    const oppScore = isHome ? game.away_score : game.home_score;
    const isWin = teamScore > oppScore;

    if (isWin) {
      winStreak++;
    } else {
      break; // Streak ends on first loss
    }
  }
  formStats.winStreak = winStreak;

  // Calculate recent form (last 5 games win percentage)
  const recentGames = sortedGames.slice(0, 5);
  if (recentGames.length > 0) {
    const recentWins = recentGames.filter(game => {
      const isHome = game.home_team_id === teamId;
      const teamScore = isHome ? game.home_score : game.away_score;
      const oppScore = isHome ? game.away_score : game.home_score;
      return teamScore > oppScore;
    }).length;
    formStats.recentForm = recentWins / recentGames.length;
  }

  // Calculate rest days (days since last game)
  if (sortedGames.length > 0) {
    const lastGameDate = new Date(sortedGames[0].date);
    const currentGame = teamGames.find(g => g.id === currentGameId);
    if (currentGame) {
      const currentGameDate = new Date(currentGame.date);
      const restDays = Math.max(0, Math.floor((currentGameDate.getTime() - lastGameDate.getTime()) / (1000 * 60 * 60 * 24)));
      formStats.restDays = Math.min(restDays, 7); // Cap at 7 days
    }
  }

  // Calculate back-to-back indicator
  if (sortedGames.length > 0) {
    const lastGameDate = new Date(sortedGames[0].date);
    const currentGame = teamGames.find(g => g.id === currentGameId);
    if (currentGame) {
      const currentGameDate = new Date(currentGame.date);
      const daysSinceLastGame = Math.floor((currentGameDate.getTime() - lastGameDate.getTime()) / (1000 * 60 * 60 * 24));
      formStats.backToBack = daysSinceLastGame === 1 ? 1 : 0;
    }
  }

  return formStats;
}

/**
 * Simplified form indicators that can be calculated from rolling stats
 */
export function calculateSimpleFormIndicators(
  rollingStats: Record<string, Record<string, number>>,
  latestGameId: string
): Record<string, number> {
  const formStats: Record<string, number> = {};

  // Recent form momentum (difference between recent 5-game and 10-game win rates)
  const winRate5 = rollingStats[latestGameId]?.['homeWinRate5_avg_5'] || 0;
  const winRate10 = rollingStats[latestGameId]?.['homeWinRate10_avg_5'] || 0;
  formStats.momentum = winRate5 - winRate10;

  // Consistency (variance in recent performance - simplified)
  // For now, just use the difference between max and min rolling win rates
  formStats.consistency = Math.abs(winRate5 - winRate10);

  return formStats;
}

/**
 * Compute win streak for a team leading up to a game
 */
export function computeWinStreak(teamId: string, gameId: string, games: Game[]): number {
  const sortedGames = games
    .filter(g => (g.home_team_id === teamId || g.away_team_id === teamId) && g.id !== gameId)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  let streak = 0;
  for (const game of sortedGames) {
    const isHome = game.home_team_id === teamId;
    const teamScore = isHome ? game.home_score : game.away_score;
    const oppScore = isHome ? game.away_score : game.home_score;

    if (teamScore !== null && oppScore !== null) {
      if (teamScore > oppScore) {
        streak++; // Win, continue streak
      } else {
        break; // Loss, end streak
      }
    } else {
      break; // Incomplete game, end streak
    }

    if (streak >= 10) break; // Cap at reasonable maximum
  }

  return streak;
}

/**
 * Compute rest days for a team before a game
 */
export function computeRestDays(teamId: string, gameId: string, games: Game[]): number {
  const sortedGames = games
    .filter(g => (g.home_team_id === teamId || g.away_team_id === teamId) && g.id !== gameId)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (sortedGames.length === 0) return 7; // Default for teams with no recent games

  const currentGame = games.find(g => g.id === gameId);
  if (!currentGame) return 7;

  const lastGameDate = new Date(sortedGames[0].date);
  const currentGameDate = new Date(currentGame.date);

  const daysDiff = Math.floor((currentGameDate.getTime() - lastGameDate.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, daysDiff);
}

/**
 * Compute head-to-head record between two teams
 */
export function computeHeadToHead(homeId: string, awayId: string, gameId: string, games: Game[]): { wins: number; games: number } {
  const h2hGames = games.filter(g =>
    g.id !== gameId &&
    ((g.home_team_id === homeId && g.away_team_id === awayId) ||
     (g.home_team_id === awayId && g.away_team_id === homeId))
  );

  let homeWins = 0;
  for (const game of h2hGames) {
    if (game.home_score !== null && game.away_score !== null) {
      if (game.home_score > game.away_score) {
        if (game.home_team_id === homeId) {
          homeWins++; // Home team won
        }
      } else {
        if (game.away_team_id === homeId) {
          homeWins++; // Away team (which is home in this context) won
        }
      }
    }
  }

  return {
    wins: homeWins,
    games: h2hGames.length
  };
}

// These functions are now handled by sport-specific modules
// See sportFeatureFactory.ts for the new implementation

/**
 * Compute rolling averages for a team's game stats
 */
export function computeRollingAverages(
  statsByGame: Record<string, Record<string, number>>,
  gameOrder: string[],
  windows: number[],
  enabledFeatures: string[],
  useExponentialRecency: boolean,
  recencyDecay: number
): Record<string, Record<string, number>> {
  // Returns: { game_id: { stat_window: value } }
  const result: Record<string, Record<string, number>> = {};

  for (let i = 0; i < gameOrder.length; ++i) {
    const gid = gameOrder[i];
    result[gid] = {};

    for (const stat of enabledFeatures) {
      for (const w of windows) {
        const prevGames = gameOrder.slice(Math.max(0, i - w), i);
        const vals = prevGames
          .map((g) => statsByGame[g]?.[stat])
          .filter((v) => v !== undefined);

        let avg = 0;
        if (vals.length) {
          if (useExponentialRecency) {
            // Use exponential recency weighting (most recent first)
            const weights = getExponentialWeights(vals.length, recencyDecay);
            avg = weightedAverage(vals.slice().reverse(), weights); // reverse: most recent first
          } else {
            avg = vals.reduce((a, b) => a + b, 0) / vals.length;
          }
        }
        result[gid][`${stat}_avg_${w}`] = avg;
      }
    }
  }

  return result;
}

/**
 * Compute win rate for a team over a window of games
 */
export function computeWinRate(
  teamId: string,
  gameId: string,
  window: number,
  games: Game[]
): number {
  const gamesForTeam = games
    .filter(
      (g) =>
        (g.home_team_id === teamId || g.away_team_id === teamId) && g.id < gameId
    )
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-window);

  if (!gamesForTeam.length) return 0;

  let wins = 0;
  for (const g of gamesForTeam) {
    const isHome = g.home_team_id === teamId;
    if (g.home_score == null || g.away_score == null) continue;
    if (isHome && g.home_score > g.away_score) wins++;
    if (!isHome && g.away_score > g.home_score) wins++;
  }

  return wins / gamesForTeam.length;
}

/**
 * Compute average margin for a team over a window of games
 */
export function computeAvgMargin(
  teamId: string,
  gameId: string,
  window: number,
  games: Game[]
): number {
  const gamesForTeam = games
    .filter(
      (g) =>
        (g.home_team_id === teamId || g.away_team_id === teamId) && g.id < gameId
    )
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-window);

  if (!gamesForTeam.length) return 0;

  let marginSum = 0;
  for (const g of gamesForTeam) {
    const isHome = g.home_team_id === teamId;
    if (g.home_score == null || g.away_score == null) continue;
    marginSum += isHome
      ? g.home_score - g.away_score
      : g.away_score - g.home_score;
  }

  return marginSum / gamesForTeam.length;
}

/**
 * Compute recent form (win rate in last 3 games)
 */
export function computeRecentForm(
  teamId: string,
  gameId: string,
  games: Game[]
): number {
  const gamesForTeam = games
    .filter(
      (g) =>
        (g.home_team_id === teamId || g.away_team_id === teamId) && g.id < gameId
    )
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-3); // Last 3 games

  if (!gamesForTeam.length) return 0;

  let wins = 0;
  for (const g of gamesForTeam) {
    const isHome = g.home_team_id === teamId;
    if (g.home_score == null || g.away_score == null) continue;
    if (isHome && g.home_score > g.away_score) wins++;
    if (!isHome && g.away_score > g.home_score) wins++;
  }

  return wins / gamesForTeam.length;
}

/**
 * Compute all fixed features for a game
 */
export function computeFixedFeatures(
  homeId: string,
  awayId: string,
  gameId: string,
  games: Game[],
  oddsArr: OddsData[],
  db: DatabaseQueries,
  sport?: string
): Record<string, number> {
  const marketImpliedProbVal = getMarketImpliedProb(oddsArr);

  const features: Record<string, number> = {
    homeWinRate5: computeWinRate(homeId, gameId, 5, games),
    awayWinRate5: computeWinRate(awayId, gameId, 5, games),
    homeAvgMargin5: computeAvgMargin(homeId, gameId, 5, games),
    awayAvgMargin5: computeAvgMargin(awayId, gameId, 5, games),
    homeWinRate10: computeWinRate(homeId, gameId, 10, games),
    awayWinRate10: computeWinRate(awayId, gameId, 10, games),
    homeAvgMargin10: computeAvgMargin(homeId, gameId, 10, games),
    awayAvgMargin10: computeAvgMargin(awayId, gameId, 10, games),
    homeRecentForm: computeRecentForm(homeId, gameId, games),
    awayRecentForm: computeRecentForm(awayId, gameId, games),
    homeAdvantage: 0, // Will be set below
    marketImpliedProb: marketImpliedProbVal ?? 0,
  };

  // Add form indicators calculated from win rates
  // Momentum: difference between recent 5-game and 10-game win rates
  features.homeMomentum = features.homeWinRate5 - features.homeWinRate10;
  features.awayMomentum = features.awayWinRate5 - features.awayWinRate10;

  // Consistency: simplified as the absolute difference (lower is more consistent)
  features.homeConsistency = Math.abs(features.homeWinRate5 - features.homeWinRate10);
  features.awayConsistency = Math.abs(features.awayWinRate5 - features.awayWinRate10);

  // Advanced form features
  const homeWinStreak = computeWinStreak(homeId, gameId, games);
  const awayWinStreak = computeWinStreak(awayId, gameId, games);
  features.homeWinStreak = homeWinStreak;
  features.awayWinStreak = awayWinStreak;

  const homeRestDays = computeRestDays(homeId, gameId, games);
  const awayRestDays = computeRestDays(awayId, gameId, games);
  features.homeRestDays = Math.min(homeRestDays, 7); // Cap at 7 days
  features.awayRestDays = Math.min(awayRestDays, 7);

  // Head-to-head record
  const headToHead = computeHeadToHead(homeId, awayId, gameId, games);
  features.headToHeadWins = headToHead.wins;
  features.headToHeadGames = headToHead.games;
  features.headToHeadWinRate = headToHead.games > 0 ? headToHead.wins / headToHead.games : 0.5;

  // Sport-specific offensive/defensive ratings
  if (sport) {
    const ratings = computeOffensiveDefensiveRatings(sport, homeId, awayId, gameId, games, db);
    features.homeOffensiveRating = ratings.homeORtg;
    features.awayOffensiveRating = ratings.awayORtg;
    features.homeDefensiveRating = ratings.homeDRtg;
    features.awayDefensiveRating = ratings.awayDRtg;
  }

  // Strength of Schedule features
  const sosFeatures = calculateSOSDifferential(homeId, awayId, gameId, games, db);
  Object.assign(features, sosFeatures);

  return features;
}

/**
 * Extract features for all games in the dataset
 */
export function extractFeaturesForDataset(
  games: Game[],
  db: DatabaseQueries,
  config: FeatureConfig
): {
  dataset: GameFeatures[];
  featureMeans: Record<string, number>;
  skipStats: { skipNoRollingStats: number; skipNoOdds: number };
} {
  const enabledRollingFeatures = getEnabledRollingFeatures(config);
  const useExponentialRecency = config.recency_weighting?.enabled ?? true;
  const recencyDecay = config.recency_weighting?.decay ?? 0.7;


  // Step 1: Extract and pivot game_stats for all games/teams
  const gameStatsMap = db.getGameStatsForSeasons(
    config.sport,
    config.seasons,
    enabledRollingFeatures
  );

  // Step 2: Compute rolling averages for each team
  const teamRollingStats: Record<
    string,
    Record<string, Record<string, number>>
  > = {};


  // Get sport-specific advanced features that should be included in rolling calculations
  const advancedFeatures = getAdvancedFeatures(config.sport);
  const enabledAdvancedFeatures = advancedFeatures.filter(feature => isFeatureEnabled(config, feature));

  for (const [teamId, teamGames] of gameStatsMap.entries()) {
    const gameIds = Array.from(teamGames.keys()).sort();
    const statsByGame: Record<string, Record<string, number>> = {};

    for (const [gameId, stats] of teamGames.entries()) {
      // Start with raw stats
      const gameStats = { ...stats };

      // Calculate and add sport-specific advanced stats
      const advancedStats = calculateAdvancedStats(config.sport, stats);
      Object.assign(gameStats, advancedStats);

      statsByGame[gameId] = gameStats;
    }

    // Include advanced features in rolling calculations if they're enabled
    const allRollingFeatures = [...enabledRollingFeatures, ...enabledAdvancedFeatures];

    teamRollingStats[teamId] = computeRollingAverages(
      statsByGame,
      gameIds,
      config.rolling_windows,
      allRollingFeatures,
      useExponentialRecency,
      recencyDecay
    );
  }

  // Step 3: First pass - collect feature values for mean imputation
  const featureSums: Record<string, number> = {};
  const featureCounts: Record<string, number> = {};
  const tempRows: Array<{ features: Record<string, number | null> }> = [];

  let skipNoRollingStats = 0;
  let skipNoOdds = 0;

  for (const game of games) {
    const homeId = game.home_team_id;
    const awayId = game.away_team_id;
    const gid = game.id;

    if (!teamRollingStats[homeId]?.[gid] || !teamRollingStats[awayId]?.[gid]) {
      skipNoRollingStats++;
      continue;
    }

    const oddsArr = db.getMoneylineOdds(gid, config.allowed_providers);
    if (!oddsArr.length) {
      skipNoOdds++;
      continue;
    }

    const features: Record<string, number | null> = {};

    // Add rolling stat features
    for (const stat of enabledRollingFeatures) {
      for (const w of config.rolling_windows) {
        const homeKey = `home_${stat}_avg_${w}`;
        const awayKey = `away_${stat}_avg_${w}`;
        const homeVal = teamRollingStats[homeId][gid][`${stat}_avg_${w}`];
        const awayVal = teamRollingStats[awayId][gid][`${stat}_avg_${w}`];

        features[homeKey] = homeVal ?? null;
        features[awayKey] = awayVal ?? null;

        if (homeVal !== null && homeVal !== undefined) {
          featureSums[homeKey] = (featureSums[homeKey] ?? 0) + homeVal;
          featureCounts[homeKey] = (featureCounts[homeKey] ?? 0) + 1;
        }
        if (awayVal !== null && awayVal !== undefined) {
          featureSums[awayKey] = (featureSums[awayKey] ?? 0) + awayVal;
          featureCounts[awayKey] = (featureCounts[awayKey] ?? 0) + 1;
        }
      }
    }

    tempRows.push({ features });
  }

  // Compute means for imputation
  const featureMeans: Record<string, number> = {};
  for (const key of Object.keys(featureSums)) {
    featureMeans[key] = featureSums[key] / featureCounts[key];
  }

  // Step 4: Second pass - build dataset with imputed means and fixed features
  const dataset: GameFeatures[] = [];
  let rowIdx = 0;

  for (const game of games) {
    const homeId = game.home_team_id;
    const awayId = game.away_team_id;
    const gid = game.id;

    if (!teamRollingStats[homeId]?.[gid] || !teamRollingStats[awayId]?.[gid]) {
      continue;
    }

    const oddsArr = db.getMoneylineOdds(gid, config.allowed_providers);
    if (!oddsArr.length) continue;

    // Build features from rolling stats
    const features: Record<string, number> = {};
    const tempFeatures = tempRows[rowIdx].features;

    for (const stat of enabledRollingFeatures) {
      for (const w of config.rolling_windows) {
        const homeKey = `home_${stat}_avg_${w}`;
        const awayKey = `away_${stat}_avg_${w}`;

        if (homeKey in tempFeatures) {
          features[homeKey] =
            tempFeatures[homeKey] !== null && tempFeatures[homeKey] !== undefined
              ? tempFeatures[homeKey]!
              : featureMeans[homeKey];
        }
        if (awayKey in tempFeatures) {
          features[awayKey] =
            tempFeatures[awayKey] !== null && tempFeatures[awayKey] !== undefined
              ? tempFeatures[awayKey]!
              : featureMeans[awayKey];
        }
      }
    }

    // Add fixed features if enabled
    const fixedFeatureValues = computeFixedFeatures(
      homeId,
      awayId,
      gid,
      games,
      oddsArr,
      db,
      config.sport
    );

    // Set home advantage
    fixedFeatureValues.homeAdvantage =
      fixedFeatureValues.homeWinRate5 - fixedFeatureValues.awayWinRate5;

    // Note: marketImpliedProb will be imputed later if missing
    // No longer skipping games with missing odds to ensure consistent training/prediction

    // Only add enabled fixed features (imputation will happen later)
    for (const [key, value] of Object.entries(fixedFeatureValues)) {
      if (isFeatureEnabled(config, key)) {
        features[key] = value;
      }
    }

    // Determine target (1 for home win, 0 for away win)
    let target: number | null = null;
    if (game.home_score !== null && game.away_score !== null) {
      target = game.home_score > game.away_score ? 1 : 0;
    }

    dataset.push({
      game_id: gid,
      season: game.season,
      date: game.date,
      home_team: homeId,
      away_team: awayId,
      features,
      odds: oddsArr,
      target,
    });

    rowIdx++;
  }

  // Apply imputation to handle missing values consistently
  console.log('[FeatureEngineering] Applying imputation for missing values...');
  let imputedCount = 0;

  for (const gameFeatures of dataset) {
    for (const [key, value] of Object.entries(gameFeatures.features)) {
      if (value === null || value === undefined ||
          (key === 'marketImpliedProb' && value === 0)) {
        // Use training set mean for imputation
        const imputedValue = featureMeans[key] ?? (key === 'marketImpliedProb' ? 0.5 : 0);
        gameFeatures.features[key] = imputedValue;
        imputedCount++;
      }
    }
  }

  console.log(`[FeatureEngineering] Imputed ${imputedCount} missing values across ${dataset.length} games`);

  return {
    dataset,
    featureMeans,
    skipStats: { skipNoRollingStats, skipNoOdds },
  };
}

/**
 * Extract features for a single game (used during prediction)
 */
export function extractFeaturesForGame(
  game: Game,
  db: DatabaseQueries,
  config: FeatureConfig,
  featureMeans: Record<string, number>,
  allGames: Game[]
): Record<string, number> | null {
  const enabledRollingFeatures = getEnabledRollingFeatures(config);
  const useExponentialRecency = config.recency_weighting?.enabled ?? true;
  const recencyDecay = config.recency_weighting?.decay ?? 0.7;

  const homeId = game.home_team_id;
  const awayId = game.away_team_id;
  const gid = game.id;

  // Get game stats for home and away teams
  const homeGames = allGames.filter(
    (g) =>
      (g.home_team_id === homeId || g.away_team_id === homeId) && g.id < gid
  );
  const awayGames = allGames.filter(
    (g) =>
      (g.home_team_id === awayId || g.away_team_id === awayId) && g.id < gid
  );

  // Build stats map for home team
  const homeStatsByGame: Record<string, Record<string, number>> = {};
  const homeGameIds: string[] = [];

  for (const g of homeGames.sort((a, b) => a.date.localeCompare(b.date))) {
    const stats = db.getGameStats(g.id, homeId);
    if (Object.keys(stats).length > 0) {
      homeStatsByGame[g.id] = stats;
      homeGameIds.push(g.id);
    }
  }

  // Build stats map for away team
  const awayStatsByGame: Record<string, Record<string, number>> = {};
  const awayGameIds: string[] = [];

  for (const g of awayGames.sort((a, b) => a.date.localeCompare(b.date))) {
    const stats = db.getGameStats(g.id, awayId);
    if (Object.keys(stats).length > 0) {
      awayStatsByGame[g.id] = stats;
      awayGameIds.push(g.id);
    }
  }

  // Compute rolling averages
  const homeRolling = computeRollingAverages(
    homeStatsByGame,
    homeGameIds,
    config.rolling_windows,
    enabledRollingFeatures,
    useExponentialRecency,
    recencyDecay
  );

  const awayRolling = computeRollingAverages(
    awayStatsByGame,
    awayGameIds,
    config.rolling_windows,
    enabledRollingFeatures,
    useExponentialRecency,
    recencyDecay
  );


  // Get most recent rolling stats (or use all if not enough games)
  const homeLatestGameId = homeGameIds.length > 0 ? homeGameIds[homeGameIds.length - 1] : null;
  const awayLatestGameId = awayGameIds.length > 0 ? awayGameIds[awayGameIds.length - 1] : null;

  const features: Record<string, number> = {};

  // Add rolling stat features with fallback to feature means
  for (const stat of enabledRollingFeatures) {
    for (const w of config.rolling_windows) {
      const homeKey = `home_${stat}_avg_${w}`;
      const awayKey = `away_${stat}_avg_${w}`;

      // Use rolling stats if available, otherwise use training means
      if (homeLatestGameId && homeRolling[homeLatestGameId]) {
        features[homeKey] = homeRolling[homeLatestGameId][`${stat}_avg_${w}`] ?? featureMeans[homeKey] ?? 0;
      } else {
        features[homeKey] = featureMeans[homeKey] ?? 0;
      }

      if (awayLatestGameId && awayRolling[awayLatestGameId]) {
        features[awayKey] = awayRolling[awayLatestGameId][`${stat}_avg_${w}`] ?? featureMeans[awayKey] ?? 0;
      } else {
        features[awayKey] = featureMeans[awayKey] ?? 0;
      }
    }
  }


  // Add fixed features if enabled
  const oddsArr = db.getMoneylineOdds(gid, config.allowed_providers);
  const fixedFeatureValues = computeFixedFeatures(
    homeId,
    awayId,
    gid,
    allGames,
    oddsArr,
    db,
    config.sport
  );

  fixedFeatureValues.homeAdvantage =
    fixedFeatureValues.homeWinRate5 - fixedFeatureValues.awayWinRate5;

  for (const [key, value] of Object.entries(fixedFeatureValues)) {
    if (isFeatureEnabled(config, key)) {
      // Apply same imputation logic as training
      if (value === null || value === undefined ||
          (key === 'marketImpliedProb' && value === 0)) {
        features[key] = featureMeans[key] ?? (key === 'marketImpliedProb' ? 0.5 : 0);
      } else {
        features[key] = value;
      }
    }
  }

  return features;
}


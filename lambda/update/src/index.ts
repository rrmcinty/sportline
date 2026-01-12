/**
 * Update Lambda Handler
 * Fetches fresh odds, runs predictions, writes recommendations to S3
 */

import { getJsonFromS3, putJsonToS3 } from './s3.js';
import { fetchOddsForGames } from './espn.js';
import { predict, type TrainedModel, type TeamFeatures } from './predict.js';

interface UpcomingGame {
  id: string;
  sport: string;
  date: string;
  season: number;
  homeTeamId: string;
  awayTeamId: string;
}

interface SportFeatures {
  teams: Record<string, TeamFeatures>;
  exportedAt: string;
  season: number;
}

interface GamesBySpor {
  games: UpcomingGame[];
  exportedAt: string;
}

interface Recommendation {
  gameId: string;
  gameDate: string;
  sport: string;
  homeTeamId: string;
  awayTeamId: string;
  market: string;
  side: 'home' | 'away';
  modelProbability: number;
  impliedProbability: number;
  odds: number;
  line: number | null;
  edge: number;
  ev: number;
  provider: string;
}

interface RecommendationsOutput {
  generatedAt: string;
  recommendations: Recommendation[];
}

const BUCKET = process.env.BUCKET || `sportline-data-${process.env.USER || 'dev'}`;
const MIN_EDGE = 0.03; // 3% minimum edge

/**
 * Convert American odds to implied probability
 */
function americanToImpliedProb(americanOdds: number): number {
  if (americanOdds > 0) {
    return 100 / (americanOdds + 100);
  } else {
    return -americanOdds / (-americanOdds + 100);
  }
}

/**
 * Calculate expected value
 */
function calculateEV(probability: number, americanOdds: number): number {
  const impliedProb = americanToImpliedProb(americanOdds);
  const decimalOdds = americanOdds > 0 ? americanOdds / 100 + 1 : 100 / -americanOdds + 1;
  return probability * decimalOdds - 1;
}

/**
 * Check if bet passes vigorish gate
 */
function passesJuiceGate(betOdds: number, betEdge: number): boolean {
  const MAX_VIG_PRICE = -115;
  const EDGE_REQUIRED_IF_VIGGY = 0.04;
  if (betOdds <= MAX_VIG_PRICE && betEdge < EDGE_REQUIRED_IF_VIGGY) return false;
  return true;
}

/**
 * Lambda handler
 */
export async function handler(event: unknown) {
  console.log('Update Lambda starting...', { event });

  const sports = ['nba', 'ncaam', 'nhl'];
  const allRecommendations: Recommendation[] = [];

  for (const sport of sports) {
    try {
      console.log(`Processing ${sport}...`);

      // 1. Load models (moneyline and spread)
      const moneylineModel = await getJsonFromS3<TrainedModel>(
        BUCKET,
        `models/${sport}/moneyline-2025.json`,
      );
      const spreadModel = await getJsonFromS3<TrainedModel>(
        BUCKET,
        `models/${sport}/spread-2025.json`,
      );

      // 2. Load pre-computed features
      const featuresData = await getJsonFromS3<SportFeatures>(
        BUCKET,
        `features/${sport}-features.json`,
      );

      // 3. Load upcoming games
      const gamesData = await getJsonFromS3<GamesBySpor>(BUCKET, `features/${sport}-games.json`);

      console.log(`  Found ${gamesData.games.length} upcoming games`);

      if (gamesData.games.length === 0) {
        continue;
      }

      // 4. Fetch fresh odds from ESPN
      const gameIds = gamesData.games.map((g) => g.id);
      const oddsMap = await fetchOddsForGames(sport, gameIds);
      console.log(`  Fetched odds for ${oddsMap.size} games`);

      // 5. Generate recommendations
      let gamesProcessed = 0;
      for (const game of gamesData.games) {
        const odds = oddsMap.get(game.id);
        if (!odds) {
          continue;
        }

        const homeFeatures = featuresData.teams[game.homeTeamId];
        const awayFeatures = featuresData.teams[game.awayTeamId];

        if (!homeFeatures || !awayFeatures) {
          console.warn(`  Missing features for game ${game.id}`);
          continue;
        }

        // Moneyline predictions
        if (odds.priceHome !== null) {
          const homeWinProb = predict(moneylineModel, homeFeatures, awayFeatures);
          const homeImpliedProb = americanToImpliedProb(odds.priceHome);
          const edge = homeWinProb - homeImpliedProb;
          const ev = calculateEV(homeWinProb, odds.priceHome);

          // Debug logging for first 3 games
          if (gamesProcessed < 3) {
            console.log(
              `  DEBUG ${game.id}: Home=${game.homeTeamId} Away=${game.awayTeamId} Prob=${(homeWinProb * 100).toFixed(1)}% Implied=${(homeImpliedProb * 100).toFixed(1)}% Edge=${(edge * 100).toFixed(1)}%`,
            );
          }
          gamesProcessed++;

          if (edge >= MIN_EDGE && passesJuiceGate(odds.priceHome, edge)) {
            allRecommendations.push({
              gameId: game.id,
              gameDate: game.date,
              sport,
              homeTeamId: game.homeTeamId,
              awayTeamId: game.awayTeamId,
              market: 'moneyline',
              side: 'home',
              modelProbability: homeWinProb,
              impliedProbability: homeImpliedProb,
              odds: odds.priceHome,
              line: null,
              edge,
              ev,
              provider: odds.provider,
            });
          }
        }

        if (odds.priceAway !== null) {
          const homeWinProb = predict(moneylineModel, homeFeatures, awayFeatures);
          const awayWinProb = 1 - homeWinProb;
          const impliedProb = americanToImpliedProb(odds.priceAway);
          const edge = awayWinProb - impliedProb;
          const ev = calculateEV(awayWinProb, odds.priceAway);

          if (edge >= MIN_EDGE && passesJuiceGate(odds.priceAway, edge)) {
            allRecommendations.push({
              gameId: game.id,
              gameDate: game.date,
              sport,
              homeTeamId: game.homeTeamId,
              awayTeamId: game.awayTeamId,
              market: 'moneyline',
              side: 'away',
              modelProbability: awayWinProb,
              impliedProbability: impliedProb,
              odds: odds.priceAway,
              line: null,
              edge,
              ev,
              provider: odds.provider,
            });
          }
        }

        // Spread predictions (if line available)
        if (odds.line !== null) {
          const homeCoversProb = predict(spreadModel, homeFeatures, awayFeatures);
          // For spreads, odds are typically -110 on both sides
          const spreadOdds = -110;
          const impliedProb = americanToImpliedProb(spreadOdds);
          const edge = homeCoversProb - impliedProb;
          const ev = calculateEV(homeCoversProb, spreadOdds);

          if (edge >= MIN_EDGE && passesJuiceGate(spreadOdds, edge)) {
            allRecommendations.push({
              gameId: game.id,
              gameDate: game.date,
              sport,
              homeTeamId: game.homeTeamId,
              awayTeamId: game.awayTeamId,
              market: 'spread',
              side: homeCoversProb >= 0.5 ? 'home' : 'away',
              modelProbability: homeCoversProb >= 0.5 ? homeCoversProb : 1 - homeCoversProb,
              impliedProbability: impliedProb,
              odds: spreadOdds,
              line: odds.line,
              edge,
              ev,
              provider: odds.provider,
            });
          }
        }
      }
    } catch (error) {
      console.error(`Error processing ${sport}:`, error);
    }
  }

  // Sort by edge descending
  allRecommendations.sort((a, b) => b.edge - a.edge);

  // Write to S3
  const output: RecommendationsOutput = {
    generatedAt: new Date().toISOString(),
    recommendations: allRecommendations,
  };

  await putJsonToS3(BUCKET, 'daily/recs.json', output);

  console.log(`Update complete: ${allRecommendations.length} recommendations`);

  return {
    statusCode: 200,
    body: JSON.stringify({
      success: true,
      count: allRecommendations.length,
      generatedAt: output.generatedAt,
    }),
  };
}

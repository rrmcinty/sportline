/**
 * Update Lambda Handler
 * Fetches fresh odds, runs predictions, writes recommendations to S3
 */

import { getJsonFromS3, putJsonToS3 } from './s3.js';
import { fetchOddsForGames, fetchUpcomingGames, type UpcomingGame } from './espn.js';

interface GamePrediction {
  homeTeamId: string;
  awayTeamId: string;
  moneyline: number;
  spread: number;
}

interface PredictionsData {
  predictions: Record<string, GamePrediction>;
  exportedAt: string;
  season: number;
}

interface BucketInfo {
  range: string; // Display label (e.g., "70-80%")
  roi: number; // ROI as decimal (e.g., 0.2776)
  sampleSize: number; // Number of bets used for calculation
}

interface Recommendation {
  gameId: string;
  gameDate: string;
  sport: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  pickTeamName: string;
  market: string;
  side: 'home' | 'away';
  modelProbability: number;
  impliedProbability: number;
  odds: number;
  line: number | null;
  edge: number;
  ev: number;
  provider: string;
  bucketInfo: BucketInfo | null; // Optimal bucket info or null if not in profitable bucket
}

interface RecommendationsOutput {
  generatedAt: string;
  recommendations: Recommendation[];
}

interface TeamsData {
  [sport: string]: {
    [teamId: string]: string;
  };
}

interface BucketRange {
  min: number;
  max: number;
  roi: number; // ROI as decimal (e.g., 0.2776 for 27.76%)
  sampleSize: number; // Number of bets this was calculated on
  label: string; // Display label (e.g., "70-80%")
}

interface ConfigData {
  optimalBuckets: {
    [sport: string]: {
      moneyline: BucketRange[];
      spread: BucketRange[];
    };
  };
}

const BUCKET = process.env.BUCKET || `sportline-data-${process.env.USER || 'dev'}`;
const MIN_EDGE = 0.07; // 7% minimum edge (verified profitable for NHL ML - Jan 13, 2026)
const MAX_EV = 0.5; // 50% maximum EV (filters extreme outliers)

// IMPORTANT: Only NHL Moneyline is verified profitable (+13.40% ROI out-of-sample)
// All other models (NBA, NCAAM, NHL Spread) lose money when properly tested
// See data/REAL-OUT-OF-SAMPLE-RESULTS.md for details

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
 * Get optimal bucket info for a probability (returns null if not in any optimal bucket)
 */
function getOptimalBucket(
  config: ConfigData,
  sport: string,
  market: 'moneyline' | 'spread',
  probability: number,
): BucketInfo | null {
  const sportBuckets = config.optimalBuckets[sport];
  if (!sportBuckets) return null;

  const buckets = sportBuckets[market];
  const probPercent = probability * 100;

  const matchedBucket = buckets.find(
    (bucket) => probPercent >= bucket.min && probPercent <= bucket.max,
  );

  if (!matchedBucket) return null;

  return {
    range: matchedBucket.label,
    roi: matchedBucket.roi,
    sampleSize: matchedBucket.sampleSize,
  };
}

/**
 * Enrich recommendation with team names and bucket info
 */
function enrichRecommendation(
  rec: Omit<Recommendation, 'homeTeamName' | 'awayTeamName' | 'pickTeamName' | 'bucketInfo'>,
  teamsData: TeamsData,
  configData: ConfigData,
): Recommendation {
  const sportTeams = teamsData[rec.sport] || {};
  const homeTeamName = sportTeams[rec.homeTeamId] || `Team ${rec.homeTeamId}`;
  const awayTeamName = sportTeams[rec.awayTeamId] || `Team ${rec.awayTeamId}`;
  const pickTeamName = rec.side === 'home' ? homeTeamName : awayTeamName;
  const bucketInfo = getOptimalBucket(
    configData,
    rec.sport,
    rec.market as 'moneyline' | 'spread',
    rec.modelProbability,
  );

  return {
    ...rec,
    homeTeamName,
    awayTeamName,
    pickTeamName,
    bucketInfo,
  };
}

/**
 * Lambda handler
 */
export async function handler(event: unknown) {
  console.log('Update Lambda starting...', { event });

  const sports = ['nba', 'ncaam', 'nhl'];
  const allRecommendations: Recommendation[] = [];

  // Load teams and config (shared across all sports)
  const teamsData = await getJsonFromS3<TeamsData>(BUCKET, 'features/teams.json');
  const configData = await getJsonFromS3<ConfigData>(BUCKET, 'features/config.json');

  for (const sport of sports) {
    try {
      console.log(`Processing ${sport}...`);

      // 1. Load pre-computed predictions (generated by CLI sync command)
      const predictionsData = await getJsonFromS3<PredictionsData>(
        BUCKET,
        `features/${sport}-predictions.json`,
      );
      console.log(`  Loaded ${Object.keys(predictionsData.predictions).length} predictions`);

      // 2. Fetch upcoming games from ESPN (filter to today only in EST)
      const allUpcomingGames = await fetchUpcomingGames(sport);
      const todayEST = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

      const upcomingGames = allUpcomingGames.filter((game) => {
        const gameDate = new Date(game.date);
        const gameDateEST = gameDate.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        return gameDateEST === todayEST;
      });
      console.log(`  Found ${upcomingGames.length} upcoming games for today (${todayEST})`);

      if (upcomingGames.length === 0) {
        continue;
      }

      // 3. Fetch fresh odds from ESPN
      const gameIds = upcomingGames.map((g) => g.id);
      const oddsMap = await fetchOddsForGames(sport, gameIds);
      console.log(`  Fetched odds for ${oddsMap.size} games`);

      // 4. Generate recommendations
      let gamesProcessed = 0;
      for (const game of upcomingGames) {
        const odds = oddsMap.get(game.id);
        if (!odds) {
          continue;
        }

        // Load pre-computed prediction (already computed by CLI code!)
        const prediction = predictionsData.predictions[game.id];
        if (!prediction) {
          console.warn(`  No prediction for game ${game.id} - run npm run sync`);
          continue;
        }

        const homeWinProb = prediction.moneyline;
        const spreadProb = prediction.spread;

        // Moneyline recommendations
        if (odds.priceHome !== null) {
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

          if (edge >= MIN_EDGE && ev <= MAX_EV && passesJuiceGate(odds.priceHome, edge)) {
            const baseRec = {
              gameId: game.id,
              gameDate: game.date,
              sport,
              homeTeamId: game.homeTeamId,
              awayTeamId: game.awayTeamId,
              market: 'moneyline',
              side: 'home' as const,
              modelProbability: homeWinProb,
              impliedProbability: homeImpliedProb,
              odds: odds.priceHome,
              line: null,
              edge,
              ev,
              provider: odds.provider,
            };
            allRecommendations.push(enrichRecommendation(baseRec, teamsData, configData));
          }
        }

        if (odds.priceAway !== null) {
          const awayWinProb = 1 - homeWinProb;
          const impliedProb = americanToImpliedProb(odds.priceAway);
          const edge = awayWinProb - impliedProb;
          const ev = calculateEV(awayWinProb, odds.priceAway);

          if (edge >= MIN_EDGE && ev <= MAX_EV && passesJuiceGate(odds.priceAway, edge)) {
            const baseRec = {
              gameId: game.id,
              gameDate: game.date,
              sport,
              homeTeamId: game.homeTeamId,
              awayTeamId: game.awayTeamId,
              market: 'moneyline',
              side: 'away' as const,
              modelProbability: awayWinProb,
              impliedProbability: impliedProb,
              odds: odds.priceAway,
              line: null,
              edge,
              ev,
              provider: odds.provider,
            };
            allRecommendations.push(enrichRecommendation(baseRec, teamsData, configData));
          }
        }

        // Spread recommendations (if line available)
        if (odds.line !== null) {
          // Use pre-computed spread probability (already computed by CLI code!)
          const homeCoversProb = spreadProb;
          // For spreads, odds are typically -110 on both sides
          const spreadOdds = -110;
          const impliedProb = americanToImpliedProb(spreadOdds);
          const edge = homeCoversProb - impliedProb;
          const ev = calculateEV(homeCoversProb, spreadOdds);

          if (edge >= MIN_EDGE && ev <= MAX_EV && passesJuiceGate(spreadOdds, edge)) {
            const baseRec = {
              gameId: game.id,
              gameDate: game.date,
              sport,
              homeTeamId: game.homeTeamId,
              awayTeamId: game.awayTeamId,
              market: 'spread',
              side: (homeCoversProb >= 0.5 ? 'home' : 'away') as 'home' | 'away',
              modelProbability: homeCoversProb >= 0.5 ? homeCoversProb : 1 - homeCoversProb,
              impliedProbability: impliedProb,
              odds: spreadOdds,
              line: odds.line,
              edge,
              ev,
              provider: odds.provider,
            };
            allRecommendations.push(enrichRecommendation(baseRec, teamsData, configData));
          }
        }
      }
    } catch (error) {
      console.error(`Error processing ${sport}:`, error);
    }
  }

  // Filter to only include recommendations in optimal buckets (bucketInfo !== null)
  const profitableBets = allRecommendations.filter((rec) => rec.bucketInfo !== null);

  // Sort by edge descending
  profitableBets.sort((a, b) => b.edge - a.edge);

  // Write to S3
  const output: RecommendationsOutput = {
    generatedAt: new Date().toISOString(),
    recommendations: profitableBets,
  };

  await putJsonToS3(BUCKET, 'daily/recs.json', output);

  console.log(
    `Update complete: ${profitableBets.length}/${allRecommendations.length} recommendations in profitable buckets`,
  );

  return {
    statusCode: 200,
    body: JSON.stringify({
      success: true,
      count: profitableBets.length,
      total: allRecommendations.length,
      generatedAt: output.generatedAt,
    }),
  };
}

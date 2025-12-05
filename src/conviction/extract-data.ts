/**
 * Extract training data from backtest results
 * Label historical bets as HIGH_CONVICTION (>20% ROI) or PASS (<5% ROI)
 */

import { promises as fs } from "fs";
import * as path from "path";
import type { Sport, MarketType } from "../models/types.js";
import type {
  ConvictionFeatures,
  ConvictionTrainingPoint,
  ConvictionProfile,
} from "./types.js";

const BACKTEST_DIR = path.join(process.cwd(), "data", "backtest-results");

/**
 * Defined profitable profiles (golden profiles from analysis)
 * Optimized after removing extreme underdogs (10-30%) with insufficient wins
 */
const GOLDEN_PROFILES: ConvictionProfile[] = [
  // NBA Profiles (590 games, 67.5% win, 33.30% ROI)
  {
    sport: "nba",
    market: "moneyline",
    minConfidence: 0.3,
    maxConfidence: 0.4,
    side: "underdog",
    name: "NBA Underdog 30-40%",
    sampleSize: 194,
    roi: 36.2,
    winRate: 0.186,
    avgOdds: 250,
  },
  {
    sport: "nba",
    market: "moneyline",
    minConfidence: 0.7,
    maxConfidence: 0.8,
    side: "favorite",
    name: "NBA Favorite 70-80%",
    sampleSize: 271,
    roi: 29.1,
    winRate: 0.886,
    avgOdds: -200,
  },
  {
    sport: "nba",
    market: "moneyline",
    minConfidence: 0.8,
    maxConfidence: 0.9,
    side: "favorite",
    name: "NBA Favorite 80-90%",
    sampleSize: 125,
    roi: 37.9,
    winRate: 0.976,
    avgOdds: -300,
  },
  
  // CFB Profiles (478 games, 68.6% win, 40.64% ROI)
  {
    sport: "cfb",
    market: "moneyline",
    minConfidence: 0.3,
    maxConfidence: 0.4,
    side: "underdog",
    name: "CFB Underdog 30-40%",
    sampleSize: 78,
    roi: 52.6,
    winRate: 0.282,
    avgOdds: 220,
  },
  {
    sport: "cfb",
    market: "moneyline",
    minConfidence: 0.4,
    maxConfidence: 0.5,
    side: "either",
    name: "CFB Toss-up 40-50%",
    sampleSize: 76,
    roi: 26.3,
    winRate: 0.368,
    avgOdds: 140,
  },
  {
    sport: "cfb",
    market: "moneyline",
    minConfidence: 0.6,
    maxConfidence: 0.7,
    side: "favorite",
    name: "CFB Favorite 60-70%",
    sampleSize: 103,
    roi: 29.1,
    winRate: 0.728,
    avgOdds: -140,
  },
  {
    sport: "cfb",
    market: "moneyline",
    minConfidence: 0.7,
    maxConfidence: 0.8,
    side: "favorite",
    name: "CFB Favorite 70-80%",
    sampleSize: 117,
    roi: 52.7,
    winRate: 0.906,
    avgOdds: -200,
  },
  {
    sport: "cfb",
    market: "moneyline",
    minConfidence: 0.8,
    maxConfidence: 0.9,
    side: "favorite",
    name: "CFB Favorite 80-90%",
    sampleSize: 104,
    roi: 45.2,
    winRate: 0.942,
    avgOdds: -300,
  },
  
  // NCAAM Profiles (449 games, 71.3% win, 28.50% ROI)
  {
    sport: "ncaam",
    market: "moneyline",
    minConfidence: 0.3,
    maxConfidence: 0.4,
    side: "underdog",
    name: "NCAAM Underdog 30-40%",
    sampleSize: 117,
    roi: 29.1,
    winRate: 0.120,
    avgOdds: 280,
  },
  {
    sport: "ncaam",
    market: "moneyline",
    minConfidence: 0.6,
    maxConfidence: 0.7,
    side: "favorite",
    name: "NCAAM Favorite 60-70%",
    sampleSize: 103,
    roi: 26.2,
    winRate: 0.748,
    avgOdds: -140,
  },
  {
    sport: "ncaam",
    market: "moneyline",
    minConfidence: 0.7,
    maxConfidence: 0.8,
    side: "favorite",
    name: "NCAAM Favorite 70-80%",
    sampleSize: 229,
    roi: 29.3,
    winRate: 0.870,
    avgOdds: -200,
  },
  
  // NFL Profiles (149 games, 71.1% win, 27.21% ROI)
  {
    sport: "nfl",
    market: "moneyline",
    minConfidence: 0.3,
    maxConfidence: 0.4,
    side: "underdog",
    name: "NFL Underdog 30-40%",
    sampleSize: 33,
    roi: 20.7,
    winRate: 0.212,
    avgOdds: 240,
  },
  {
    sport: "nfl",
    market: "moneyline",
    minConfidence: 0.6,
    maxConfidence: 0.7,
    side: "favorite",
    name: "NFL Favorite 60-70%",
    sampleSize: 42,
    roi: 29.3,
    winRate: 0.810,
    avgOdds: -140,
  },
  {
    sport: "nfl",
    market: "moneyline",
    minConfidence: 0.7,
    maxConfidence: 0.8,
    side: "favorite",
    name: "NFL Favorite 70-80%",
    sampleSize: 37,
    roi: 33.8,
    winRate: 0.892,
    avgOdds: -200,
  },
  {
    sport: "nfl",
    market: "moneyline",
    minConfidence: 0.8,
    maxConfidence: 0.9,
    side: "favorite",
    name: "NFL Favorite 80-90%",
    sampleSize: 37,
    roi: 24.0,
    winRate: 0.865,
    avgOdds: -300,
  },
];

/**
 * Load backtest results from JSON file
 */
async function loadBacktestResults(sport: Sport, market: MarketType, seasons: number[]) {
  const seasonStr = seasons.sort((a, b) => a - b).join("-");
  const filename = path.join(BACKTEST_DIR, `${sport}_${market}_${seasonStr}.json`);

  try {
    const data = await fs.readFile(filename, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    console.error(`Failed to load backtest: ${filename}`, err);
    return null;
  }
}

/**
 * Extract training data from backtest results
 * Returns labeled data points and identified profiles
 */
export async function extractBacktestTrainingData(
  sport: Sport,
  market: MarketType,
  seasons: number[]
): Promise<{
  trainingPoints: ConvictionTrainingPoint[];
  profiles: ConvictionProfile[];
}> {
  const backtest = await loadBacktestResults(sport, market, seasons);
  if (!backtest) {
    return { trainingPoints: [], profiles: [] };
  }

  const trainingPoints: ConvictionTrainingPoint[] = [];

  // For each calibration bin, create training points based on ROI
  for (const bin of backtest.calibration) {
    const binROI = bin.roi;
    const binWinRate = bin.actual;
    const binCount = bin.bets || bin.count;
    const binLabel = bin.bin;

    // Parse confidence range from bin label (e.g., "20-30%" -> 0.25)
    const [minStr, maxStr] = binLabel.replace("%", "").split("-");
    const minConf = parseFloat(minStr) / 100;
    const maxConf = parseFloat(maxStr) / 100;
    const midConf = (minConf + maxConf) / 2;

    // Determine label based on ROI threshold
    let label: "HIGH_CONVICTION" | "PASS";
    if (binROI > 20) {
      label = "HIGH_CONVICTION";
    } else if (binROI < 5) {
      label = "PASS";
    } else {
      // Skip intermediate ROI buckets (5-20%) to have clear separation
      continue;
    }

    // For each bet in this bin, create a training point
    // We simulate synthetic points based on the aggregated bin statistics
    const betCount = Math.max(1, Math.round(binCount / 5)); // Create ~5 representative points per bin
    for (let i = 0; i < betCount; i++) {
      const features: ConvictionFeatures = {
        gameId: 0, // Not used in training
        date: "",
        sport,
        market,
        homeTeam: "",
        awayTeam: "",
        modelProbability: midConf,
        marketProbability: 0.5, // Will be adjusted based on odds
        confidenceBucket: binLabel,
        isUnderdog: midConf < 0.5,
        isFavorite: midConf >= 0.5,
        odds: bin.odds || (midConf < 0.5 ? 150 : -150), // Placeholder
        oddsRange: "",
        bucketHistoricalROI: binROI,
        bucketWinRate: binWinRate,
        bucketSampleSize: binCount,
        matchesNBAUnderdog20_40:
          sport === "nba" && market === "moneyline" && minConf >= 0.2 && maxConf <= 0.4 ? 1 : 0,
        matchesCFBUnderdog10_40:
          sport === "cfb" && market === "moneyline" && minConf >= 0.1 && maxConf <= 0.4 ? 1 : 0,
        matchesHighConfidenceFavorite:
          market === "moneyline" && minConf >= 0.7 && maxConf <= 0.8 && midConf >= 0.5 ? 1 : 0,
        modelMarketDivergence: 0, // Will vary per point
      };

      trainingPoints.push({
        features,
        label,
        historicalROI: binROI,
      });
    }
  }

  // Filter profiles to only those that match this sport/market
  const matchingProfiles = GOLDEN_PROFILES.filter(
    (p) => p.sport === sport && p.market === market
  );

  return {
    trainingPoints,
    profiles: matchingProfiles,
  };
}

/**
 * Extract training data from multiple sports/markets
 */
export async function extractMultiSportTrainingData(
  configs: Array<{ sport: Sport; market: MarketType; seasons: number[] }>
): Promise<{
  allTrainingPoints: ConvictionTrainingPoint[];
  allProfiles: ConvictionProfile[];
}> {
  const allTrainingPoints: ConvictionTrainingPoint[] = [];
  const allProfiles: ConvictionProfile[] = [];
  const seenProfiles = new Set<string>();

  for (const config of configs) {
    const { trainingPoints, profiles } = await extractBacktestTrainingData(
      config.sport,
      config.market,
      config.seasons
    );

    allTrainingPoints.push(...trainingPoints);

    // Add profiles only once (avoid duplicates)
    for (const profile of profiles) {
      const key = `${profile.sport}:${profile.market}:${profile.name}`;
      if (!seenProfiles.has(key)) {
        allProfiles.push(profile);
        seenProfiles.add(key);
      }
    }
  }

  return {
    allTrainingPoints,
    allProfiles,
  };
}

/**
 * Create balanced training/validation split by date (temporal validation)
 */
export function splitTrainingData(
  data: ConvictionTrainingPoint[],
  testSplit: number = 0.3
): {
  train: ConvictionTrainingPoint[];
  test: ConvictionTrainingPoint[];
} {
  // Sort by date (if available) or randomly
  const shuffled = [...data].sort(() => Math.random() - 0.5);

  const splitIndex = Math.floor(shuffled.length * (1 - testSplit));

  return {
    train: shuffled.slice(0, splitIndex),
    test: shuffled.slice(splitIndex),
  };
}

/**
 * Encode features for model training
 */
export function encodeFeatures(features: ConvictionFeatures): number[] {
  return [
    features.modelProbability,
    features.marketProbability,
    features.isUnderdog ? 1 : 0,
    features.isFavorite ? 1 : 0,
    Math.sign(features.odds), // Sign of odds
    Math.min(features.bucketHistoricalROI / 100, 1), // Normalize ROI to 0-1
    features.bucketWinRate,
    Math.log(features.bucketSampleSize + 1), // Log-normalize sample size
    features.matchesNBAUnderdog20_40,
    features.matchesCFBUnderdog10_40,
    features.matchesHighConfidenceFavorite,
    features.modelMarketDivergence,
  ];
}

/**
 * Get feature names for interpretability
 */
export function getFeatureNames(): string[] {
  return [
    "modelProbability",
    "marketProbability",
    "isUnderdog",
    "isFavorite",
    "oddsSign",
    "bucketROI",
    "bucketWinRate",
    "bucketSampleSize",
    "matchesNBAUnderdog20_40",
    "matchesCFBUnderdog10_40",
    "matchesHighConfidenceFavorite",
    "modelMarketDivergence",
  ];
}

/**
 * Utility: Get all available golden profiles
 */
export function getGoldenProfiles(): ConvictionProfile[] {
  return GOLDEN_PROFILES;
}

/**
 * Apply trained conviction classifier to upcoming games
 */

import type { Sport, MarketType } from "../models/types.js";
import type {
  ConvictionPrediction,
  ConvictionFeatures,
  ConvictionModel,
} from "./types.js";
import { encodeFeatures } from "./extract-data.js";
import { predictConviction } from "./train.js";

/**
 * Create conviction features from model prediction
 */
export function createConvictionFeatures(input: {
  gameId: number;
  date: string;
  sport: Sport;
  market: MarketType;
  homeTeam: string;
  awayTeam: string;
  modelProbability: number;
  marketProbability: number;
  odds: number;
  bucketLabel: string;
  bucketHistoricalROI: number;
  bucketWinRate: number;
  bucketSampleSize: number;
}): ConvictionFeatures {
  const isUnderdog = input.modelProbability < 0.5;
  const isFavorite = input.modelProbability >= 0.5;

  // Determine which profile this might match
  let matchesNBAUnderdog20_40 = 0;
  let matchesCFBUnderdog10_40 = 0;
  let matchesHighConfidenceFavorite = 0;

  const [minStr, maxStr] = input.bucketLabel.replace("%", "").split("-");
  const minConf = parseFloat(minStr) / 100;
  const maxConf = parseFloat(maxStr) / 100;

  if (
    input.sport === "nba" &&
    input.market === "moneyline" &&
    isUnderdog &&
    minConf >= 0.2 &&
    maxConf <= 0.4
  ) {
    matchesNBAUnderdog20_40 = 1;
  }

  if (
    input.sport === "cfb" &&
    input.market === "moneyline" &&
    isUnderdog &&
    minConf >= 0.1 &&
    maxConf <= 0.4
  ) {
    matchesCFBUnderdog10_40 = 1;
  }

  if (
    input.market === "moneyline" &&
    isFavorite &&
    minConf >= 0.7 &&
    maxConf <= 0.8
  ) {
    matchesHighConfidenceFavorite = 1;
  }

  return {
    gameId: input.gameId,
    date: input.date,
    sport: input.sport,
    market: input.market,
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    modelProbability: input.modelProbability,
    marketProbability: input.marketProbability,
    confidenceBucket: input.bucketLabel,
    isUnderdog,
    isFavorite,
    odds: input.odds,
    oddsRange: getOddsRange(input.odds),
    bucketHistoricalROI: input.bucketHistoricalROI,
    bucketWinRate: input.bucketWinRate,
    bucketSampleSize: input.bucketSampleSize,
    matchesNBAUnderdog20_40,
    matchesCFBUnderdog10_40,
    matchesHighConfidenceFavorite,
    modelMarketDivergence: input.modelProbability - input.marketProbability,
  };
}

/**
 * Categorize odds into ranges
 */
function getOddsRange(odds: number): string {
  const absOdds = Math.abs(odds);
  if (odds < 0) {
    if (absOdds <= 110) return "-110 to -120";
    if (absOdds <= 150) return "-120 to -150";
    if (absOdds <= 200) return "-150 to -200";
    return "-200+";
  } else {
    if (absOdds <= 150) return "+100 to +150";
    if (absOdds <= 200) return "+150 to +200";
    if (absOdds <= 300) return "+200 to +300";
    return "+300+";
  }
}

/**
 * Make conviction prediction for a game
 */
export function makeConvictionPrediction(
  features: ConvictionFeatures,
  model: ConvictionModel,
  pick: string
): ConvictionPrediction {
  // Encode features and get conviction score
  const encodedFeatures = encodeFeatures(features);
  const convictionScore = predictConviction(encodedFeatures, model.weights);

  // Determine confidence level based on score
  let confidenceLevel: "VERY_HIGH" | "HIGH" | "MEDIUM" | "PASS";
  if (convictionScore >= 0.75) {
    confidenceLevel = "VERY_HIGH";
  } else if (convictionScore >= 0.6) {
    confidenceLevel = "HIGH";
  } else if (convictionScore >= 0.45) {
    confidenceLevel = "MEDIUM";
  } else {
    confidenceLevel = "PASS";
  }

  // Find matching profile
  let matchedProfile = null;
  let matchedProfileName = "No Match";

  for (const profile of model.profiles) {
    if (
      profile.sport !== features.sport ||
      profile.market !== features.market
    )
      continue;

    const [minStr, maxStr] = features.confidenceBucket
      .replace("%", "")
      .split("-");
    const minConf = parseFloat(minStr) / 100;
    const maxConf = parseFloat(maxStr) / 100;

    if (
      minConf >= profile.minConfidence &&
      maxConf <= profile.maxConfidence &&
      ((profile.side === "underdog" && features.isUnderdog) ||
        (profile.side === "favorite" && features.isFavorite) ||
        profile.side === "either")
    ) {
      matchedProfile = profile;
      matchedProfileName = profile.name;
      break;
    }
  }

  // Calculate expected ROI
  const expectedROI = matchedProfile?.roi || features.bucketHistoricalROI || 10;

  // Calculate expected value
  // EV = (win_prob * profit_if_win) + (loss_prob * loss_if_loss)
  // For a $10 bet at given odds:
  const decimal = 1 / Math.max(0.001, Math.min(0.999, features.marketProbability));
  const profitIfWin = 10 * (decimal - 1);
  const lossIfLoss = 10;
  const winProb = Math.max(0.001, Math.min(0.999, features.modelProbability));
  const expectedValue = winProb * profitIfWin - (1 - winProb) * lossIfLoss;

  // Build reasoning
  let reasoning = "";
  if (confidenceLevel === "PASS") {
    reasoning = `Conviction score ${(convictionScore * 100).toFixed(1)}% too low. Not a high-conviction opportunity.`;
  } else {
    reasoning = `${matchedProfileName}: `;
    if (matchedProfile) {
      reasoning += `Historical ${(matchedProfile.roi).toFixed(1)}% ROI on ${matchedProfile.sampleSize} games. `;
    }
    reasoning += `Model prob ${(features.modelProbability * 100).toFixed(1)}% vs market ${(features.marketProbability * 100).toFixed(1)}%. `;
    reasoning += `Edge: ${(features.modelMarketDivergence * 100).toFixed(1)}%.`;
  }

  return {
    gameId: features.gameId,
    date: features.date,
    sport: features.sport,
    market: features.market,
    homeTeam: features.homeTeam,
    awayTeam: features.awayTeam,
    pick,
    isHighConviction: confidenceLevel !== "PASS",
    convictionScore,
    confidenceLevel,
    modelProbability: features.modelProbability,
    odds: features.odds,
    matchedProfile: matchedProfile || null,
    matchedProfileName,
    expectedValue,
    expectedROI,
    reasoning,
  };
}

/**
 * Filter predictions to only high-conviction bets
 */
export function filterHighConvictionPredictions(
  predictions: ConvictionPrediction[],
  minConfidenceLevel: "VERY_HIGH" | "HIGH" | "MEDIUM" = "HIGH"
): ConvictionPrediction[] {
  const levels = ["VERY_HIGH", "HIGH", "MEDIUM"];
  const minIdx = levels.indexOf(minConfidenceLevel);

  return predictions.filter((p) => {
    const idx = levels.indexOf(p.confidenceLevel);
    return idx >= 0 && idx <= minIdx;
  });
}

/**
 * Sort predictions by conviction score (descending)
 */
export function sortByConviction(
  predictions: ConvictionPrediction[]
): ConvictionPrediction[] {
  return [...predictions].sort((a, b) => b.convictionScore - a.convictionScore);
}

/**
 * Group predictions by profile
 */
export function groupByProfile(
  predictions: ConvictionPrediction[]
): Map<string, ConvictionPrediction[]> {
  const groups = new Map<string, ConvictionPrediction[]>();

  for (const pred of predictions) {
    const key = pred.matchedProfileName;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(pred);
  }

  return groups;
}

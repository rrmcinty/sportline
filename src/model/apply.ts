import { getDb } from "../db/index.js";
import { computeFeatures } from "./features.js";
import { fetchEvents as fetchEventsNcaam } from "../espn/ncaam/events.js";
import { fetchEvents as fetchEventsCfb } from "../espn/cfb/events.js";
import { fetchEvents as fetchEventsNfl } from "../espn/nfl/events.js";
import { fetchEvents as fetchEventsNba } from "../espn/nba/events.js";
import { fetchNHLEvents } from "../espn/nhl/events.js";
import type { Sport } from "../models/types.js";
import { readFileSync } from "fs";
import { join } from "path";
import { applyCalibration, type CalibrationCurve } from "./calibration.js";

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

function getFetchEvents(sport: Sport) {
  if (sport === "cfb") return fetchEventsCfb;
  if (sport === "nfl") return fetchEventsNfl;
  if (sport === "nba") return fetchEventsNba;
  if (sport === "nhl") return fetchNHLEvents;
  return fetchEventsNcaam;
}

/**
 * Load latest model and produce home win probabilities per eventId for given date.
 * Returns undefined if no model available or no games.
 * Supports ensemble models (base + market-aware blending).
 */
export async function getHomeWinModelProbabilities(sport: Sport, date: string): Promise<Map<string, number> | undefined> {
  const db = getDb();

  const latestRun = db.prepare(`SELECT run_id, artifacts_path FROM model_runs WHERE sport = ? AND config_json LIKE '%moneyline%' ORDER BY finished_at DESC LIMIT 1`).get(sport) as { run_id: string; artifacts_path: string } | undefined;
  if (!latestRun) return undefined;

  // Check if ensemble model
  const ensemblePath = join(latestRun.artifacts_path, "ensemble.json");
  let isEnsemble = false;
  let baseModel: { type: string; weights: number[]; featureNames: string[]; seasons?: number[] } | undefined;
  let marketModel: { type: string; weights: number[]; featureNames: string[]; seasons?: number[] } | undefined;
  let ensembleConfig: { baseWeight: number; marketWeight: number; seasons?: number[] } | undefined;
  let seasons: number[] = [2025];

  try {
    ensembleConfig = JSON.parse(readFileSync(ensemblePath, "utf-8"));
    baseModel = JSON.parse(readFileSync(join(latestRun.artifacts_path, "base_model.json"), "utf-8")) as any;
    marketModel = JSON.parse(readFileSync(join(latestRun.artifacts_path, "market_model.json"), "utf-8")) as any;
    seasons = ensembleConfig?.seasons || baseModel?.seasons || marketModel?.seasons || [2025];
    isEnsemble = true;
  } catch {
    // Fall back to single model
    const modelPath = join(latestRun.artifacts_path, "model.json");
    try {
      const model = JSON.parse(readFileSync(modelPath, "utf-8"));
      baseModel = { type: 'single', weights: model.weights, featureNames: model.featureNames } as any;
      seasons = model.seasons || [model.season] || [2025];
    } catch {
      return undefined; // no artifacts
    }
  }

  // Use database only - no API fetches during backtest/predictions
  const isoPrefix = `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`;
  const nextDay = new Date(isoPrefix);
  nextDay.setDate(nextDay.getDate() + 1);
  const nextDayPrefix = nextDay.toISOString().slice(0, 10);

  // Compute features for season
  const allFeatures = computeFeatures(db, sport, Array.isArray(seasons) && seasons.length ? seasons : [2025]);
  const featureMap = new Map<number, { base: number[]; market: number[] }>();
  
  for (const f of allFeatures) {
    const baseFeatures = [f.homeWinRate5, f.awayWinRate5, f.homeAvgMargin5, f.awayAvgMargin5, f.homeAdvantage, f.homeOppWinRate5, f.awayOppWinRate5, f.homeOppAvgMargin5, f.awayOppAvgMargin5, f.homeWinRate10, f.awayWinRate10, f.homeAvgMargin10, f.awayAvgMargin10, f.homeOppWinRate10, f.awayOppWinRate10, f.homeOppAvgMargin10, f.awayOppAvgMargin10];
    const marketFeatures = [...baseFeatures, f.marketImpliedProb];
    featureMap.set(f.gameId, { base: baseFeatures, market: marketFeatures });
  }

  // Query games matching date prefix (already calculated above)
  
  const rows = db.prepare(`SELECT id, espn_event_id FROM games WHERE sport = ? AND (date LIKE ? || '%' OR date LIKE ? || '%')`).all(sport, isoPrefix, nextDayPrefix) as Array<{ id: number; espn_event_id: string }>;
  if (rows.length === 0) return undefined;

  const probs = new Map<string, number>();
  
  if (isEnsemble && baseModel && marketModel && ensembleConfig) {
    // Ensemble prediction: blend base (no market) + market-aware
    for (const r of rows) {
      const features = featureMap.get(r.id) || { base: [0.5, 0.5, 0, 0, 1, 0.5, 0.5, 0, 0], market: [0.5, 0.5, 0, 0, 1, 0.5, 0.5, 0, 0, 0.5] };
      
      const baseZ = features.base.reduce((acc: number, v: number, i: number) => acc + v * (baseModel as any).weights[i], 0);
      const baseProb = sigmoid(baseZ);
      
      const marketZ = features.market.reduce((acc: number, v: number, i: number) => acc + v * (marketModel as any).weights[i], 0);
      const marketProb = sigmoid(marketZ);
      
      const ensembleProb = ensembleConfig.baseWeight * baseProb + ensembleConfig.marketWeight * marketProb;
      // Clip extreme predictions to prevent overconfidence on outliers
      const clippedProb = Math.max(0.05, Math.min(0.95, ensembleProb));
      
      // For extreme market lines (massive underdogs/favorites), trust market more than model
      // If market < 10% or > 90%, blend more toward market to prevent overconfidence
      const marketImplied = features.market[features.market.length - 1]; // Last feature is market implied prob
      let finalProb = clippedProb;
      if (marketImplied < 0.15) {
        // Massive underdog - blend 90% market, 10% model to prevent overconfidence
        finalProb = 0.90 * marketImplied + 0.10 * clippedProb;
      } else if (marketImplied > 0.85) {
        // Massive favorite - blend 90% market, 10% model
        finalProb = 0.90 * marketImplied + 0.10 * clippedProb;
      }
      
      probs.set(r.espn_event_id, finalProb);
    }
  } else if (baseModel) {
    // Single model fallback
    for (const r of rows) {
      const features = featureMap.get(r.id) || { base: [0.5, 0.5, 0, 0, 1, 0.5, 0.5, 0, 0], market: [0.5, 0.5, 0, 0, 1, 0.5, 0.5, 0, 0, 0.5] };
      const x = (baseModel as any).featureNames.length === 9 ? features.base : features.market;
      
      const z = x.reduce((acc: number, v: number, i: number) => acc + v * (baseModel as any).weights[i], 0);
      const rawProb = sigmoid(z);
      // Clip extreme predictions to prevent overconfidence on outliers
      const clippedProb = Math.max(0.05, Math.min(0.95, rawProb));
      
      // For single model with market feature, apply same extreme line logic
      if (x.length === 10) { // Has market feature
        const marketImplied = x[x.length - 1];
        let finalProb = clippedProb;
        if (marketImplied < 0.15) {
          finalProb = 0.90 * marketImplied + 0.10 * clippedProb;
        } else if (marketImplied > 0.85) {
          finalProb = 0.90 * marketImplied + 0.10 * clippedProb;
        }
        probs.set(r.espn_event_id, finalProb);
      } else {
        probs.set(r.espn_event_id, clippedProb);
      }
    }
  }
  
  return probs;
}

/**
 * Load latest spread model and produce home cover probabilities per eventId+line for given date.
 * Returns undefined if no model available or no games.
 */
export async function getHomeSpreadCoverProbabilities(sport: Sport, date: string): Promise<Map<string, number> | undefined> {
  const db = getDb();

  const latestRun = db.prepare(`SELECT run_id, artifacts_path FROM model_runs WHERE sport = ? AND config_json LIKE '%spread%' ORDER BY finished_at DESC LIMIT 1`).get(sport) as { run_id: string; artifacts_path: string } | undefined;
  if (!latestRun) return undefined;

  const modelPath = join(latestRun.artifacts_path, "model.json");
  let model: { market: string; weights: number[]; means?: number[]; stds?: number[]; featureNames: string[]; seasons?: number[]; calibration?: CalibrationCurve | null };
  try {
    model = JSON.parse(readFileSync(modelPath, "utf-8"));
  } catch {
    return undefined;
  }

  if (model.market !== 'spread') return undefined;

  // Use database only - no API fetches during backtest/predictions
  const isoPrefix = `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`;
  const nextDay = new Date(isoPrefix);
  nextDay.setDate(nextDay.getDate() + 1);
  const nextDayPrefix = nextDay.toISOString().slice(0, 10);

  // Compute features for season
  const allFeatures = computeFeatures(db, sport, Array.isArray(model.seasons) && model.seasons.length ? model.seasons : [2025]);
  const featureMap = new Map<number, number[]>();
  for (const f of allFeatures) {
    // Only include if spread data is available
    if (f.spreadLine !== null && f.spreadMarketImpliedProb !== null) {
      featureMap.set(f.gameId, [f.homeWinRate5, f.awayWinRate5, f.homeAvgMargin5, f.awayAvgMargin5, f.homeAdvantage, f.homeOppWinRate5, f.awayOppWinRate5, f.homeOppAvgMargin5, f.awayOppAvgMargin5, f.homeWinRate10, f.awayWinRate10, f.homeAvgMargin10, f.awayAvgMargin10, f.homeOppWinRate10, f.awayOppWinRate10, f.homeOppAvgMargin10, f.awayOppAvgMargin10, f.spreadLine, f.spreadMarketImpliedProb]);
    }
  }

  // Query games matching date prefix (already calculated above)
  const rows = db.prepare(`SELECT id, espn_event_id FROM games WHERE sport = ? AND (date LIKE ? || '%' OR date LIKE ? || '%')`).all(sport, isoPrefix, nextDayPrefix) as Array<{ id: number; espn_event_id: string }>;
  if (rows.length === 0) return undefined;

  const probs = new Map<string, number>();
  for (const r of rows) {
    const x = featureMap.get(r.id);
    if (!x) continue; // Skip games without spread data
    
    const z = x.reduce((acc, v, i) => acc + v * model.weights[i], 0);
    const rawProb = sigmoid(z);
    const calibratedProb = model.calibration ? applyCalibration(rawProb, model.calibration) : rawProb;
    
    // Clip extreme predictions to prevent overconfidence on outliers
    // Model trained mostly on 30-50% range, so extreme predictions (>95% or <5%) are likely extrapolations
    const clippedProb = Math.max(0.05, Math.min(0.95, calibratedProb));
    
    probs.set(r.espn_event_id, clippedProb);
  }
  return probs;
}

/**
 * Load latest total model and produce probability game goes OVER for given date (eventId -> P(over))
 */
export async function getTotalOverModelProbabilities(sport: Sport, date: string): Promise<Map<string, number> | undefined> {
  const db = getDb();
  const latestRun = db.prepare(`SELECT run_id, artifacts_path FROM model_runs WHERE sport = ? AND config_json LIKE '%total%' ORDER BY finished_at DESC LIMIT 1`).get(sport) as { run_id: string; artifacts_path: string } | undefined;
  if (!latestRun) return undefined;

  const modelPath = join(latestRun.artifacts_path, 'model.json');
  let model: { market: string; predictionType?: string; weights: number[]; featureNames: string[]; seasons?: number[]; means?: number[]; stds?: number[]; sigma?: number; calibration?: CalibrationCurve | null };
  try {
    model = JSON.parse(readFileSync(modelPath, 'utf-8'));
  } catch {
    return undefined;
  }
  if (model.market !== 'total') return undefined;

  // Use database only - no API fetches during backtest/predictions
  const isoPrefix = `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`;
  const nextDayT = new Date(isoPrefix);
  nextDayT.setDate(nextDayT.getDate() + 1);
  const nextDayPrefixT = nextDayT.toISOString().slice(0, 10);

  const allFeatures = computeFeatures(db, sport, Array.isArray(model.seasons) && model.seasons.length ? model.seasons : [2025]);
  const featureMap = new Map<number, number[]>();
  for (const f of allFeatures) {
    if (f.totalLine !== null) {
      // Build regression feature vector matching featureNames
      const vecMap: Record<string, number> = {
        homePointsAvg5: f.homePointsAvg5,
        awayPointsAvg5: f.awayPointsAvg5,
        homeOppPointsAvg5: f.homeOppPointsAvg5,
        awayOppPointsAvg5: f.awayOppPointsAvg5,
        homeWinRate5: f.homeWinRate5,
        awayWinRate5: f.awayWinRate5,
        homeAvgMargin5: f.homeAvgMargin5,
        awayAvgMargin5: f.awayAvgMargin5,
        homeOppAvgMargin5: f.homeOppAvgMargin5,
        awayOppAvgMargin5: f.awayOppAvgMargin5,
        homeOppWinRate5: f.homeOppWinRate5,
        awayOppWinRate5: f.awayOppWinRate5,
        homePace5: f.homePace5,
        awayPace5: f.awayPace5,
        homeOffEff5: f.homeOffEff5,
        awayOffEff5: f.awayOffEff5,
        homeDefEff5: f.homeDefEff5,
        awayDefEff5: f.awayDefEff5,
        homePointsAvg10: f.homePointsAvg10,
        awayPointsAvg10: f.awayPointsAvg10,
        homeOppPointsAvg10: f.homeOppPointsAvg10,
        awayOppPointsAvg10: f.awayOppPointsAvg10,
        homeWinRate10: f.homeWinRate10,
        awayWinRate10: f.awayWinRate10,
        homeAvgMargin10: f.homeAvgMargin10,
        awayAvgMargin10: f.awayAvgMargin10,
        homeOppAvgMargin10: f.homeOppAvgMargin10,
        awayOppAvgMargin10: f.awayOppAvgMargin10,
        homeOppWinRate10: f.homeOppWinRate10,
        awayOppWinRate10: f.awayOppWinRate10,
        homePace10: f.homePace10,
        awayPace10: f.awayPace10,
        homeOffEff10: f.homeOffEff10,
        awayOffEff10: f.awayOffEff10,
        homeDefEff10: f.homeDefEff10,
        awayDefEff10: f.awayDefEff10
      };
      const featureVector = model.featureNames.map(n => vecMap[n] ?? 0);
      featureMap.set(f.gameId, featureVector);
    }
  }

  // Query games matching date prefix
  const rows = db.prepare(`SELECT id, espn_event_id FROM games WHERE sport = ? AND (date LIKE ? || '%' OR date LIKE ? || '%')`).all(sport, isoPrefix, nextDayPrefixT) as Array<{ id: number; espn_event_id: string }>;
  if (!rows.length) return undefined;

  const probs = new Map<string, number>();
  if ((model as any).predictionType === 'regression' && model.means && model.stds && model.sigma) {
    const bias = (model as any).bias || 0;
    function normalCdf(z: number): number {
      const t = 1 / (1 + 0.5 * Math.abs(z));
      const tau = t * Math.exp(-z*z - 1.26551223 + 1.00002368*t + 0.37409196*t*t + 0.09678418*t*t*t - 0.18628806*t*t*t*t + 0.27886807*t*t*t*t*t - 1.13520398*t*t*t*t*t*t + 1.48851587*t*t*t*t*t*t*t - 0.82215223*t*t*t*t*t*t*t*t + 0.17087277*t*t*t*t*t*t*t*t*t);
      const erf = z >= 0 ? 1 - tau : tau - 1;
      return 0.5 * (1 + erf);
    }
    for (const r of rows) {
      const xRaw = featureMap.get(r.id);
      if (!xRaw) continue;
      // Scale
      const xScaled = xRaw.map((v,i) => (v - model.means![i]) / model.stds![i]);
      const predictedScore = xScaled.reduce((acc,v,i)=>acc + v * model.weights[i],0) + bias;
      // Need total line from features list: retrieve from allFeatures by gameId
      const f = allFeatures.find(ff => ff.gameId === r.id);
      const line = f?.totalLine ?? null;
      if (line === null) continue;
      const z = (line - predictedScore) / model.sigma;
      const pOver = 1 - normalCdf(z);
      probs.set(r.espn_event_id, pOver);
    }
  } else {
    // Fallback: treat as logistic classification legacy
    for (const r of rows) {
      const x = featureMap.get(r.id);
      if (!x) continue;
      const z = x.reduce((acc,v,i)=>acc+v*model.weights[i],0);
      const rawProb = sigmoid(z);
      probs.set(r.espn_event_id, rawProb);
    }
  }
  return probs;
}

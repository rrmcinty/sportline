import { getDb } from "../db/index.js";
import { computeFeatures } from "./features.js";
import { fetchEvents as fetchEventsNcaam } from "../espn/ncaam/events.js";
import { fetchEvents as fetchEventsCfb } from "../espn/cfb/events.js";
import type { Sport } from "../models/types.js";
import { readFileSync } from "fs";
import { join } from "path";
import { applyCalibration, type CalibrationCurve } from "./calibration.js";

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

function getFetchEvents(sport: Sport) {
  return sport === "cfb" ? fetchEventsCfb : fetchEventsNcaam;
}

/**
 * Load latest model and produce home win probabilities per eventId for given date.
 * Returns undefined if no model available or no games.
 */
export async function getHomeWinModelProbabilities(sport: Sport, date: string): Promise<Map<string, number> | undefined> {
  const db = getDb();

  const latestRun = db.prepare(`SELECT run_id, artifacts_path FROM model_runs WHERE sport = ? AND config_json LIKE '%moneyline%' ORDER BY finished_at DESC LIMIT 1`).get(sport) as { run_id: string; artifacts_path: string } | undefined;
  if (!latestRun) return undefined;

  const modelPath = join(latestRun.artifacts_path, "model.json");
  let model: { weights: number[]; featureNames: string[]; season: number; calibration?: CalibrationCurve | null };
  try {
    model = JSON.parse(readFileSync(modelPath, "utf-8"));
  } catch {
    return undefined; // artifact missing
  }

  const fetchEvents = getFetchEvents(sport);
  const competitions = await fetchEvents(date);
  if (competitions.length === 0) return undefined;

  // Upsert teams and games (in case not ingested yet)
  const upsertTeam = db.prepare(`INSERT INTO teams (sport, espn_id, name, abbreviation) VALUES (?, ?, ?, ?) ON CONFLICT(sport, espn_id) DO UPDATE SET name=excluded.name, abbreviation=excluded.abbreviation RETURNING id`);
  const insertGame = db.prepare(`INSERT INTO games (espn_event_id, sport, date, season, home_team_id, away_team_id, home_score, away_score, venue, status) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, 'scheduled') ON CONFLICT(espn_event_id) DO NOTHING`);

  for (const comp of competitions) {
    const home = upsertTeam.get(sport, comp.homeTeam.id, comp.homeTeam.name, comp.homeTeam.abbreviation || null) as { id: number };
    const away = upsertTeam.get(sport, comp.awayTeam.id, comp.awayTeam.name, comp.awayTeam.abbreviation || null) as { id: number };
    insertGame.run(comp.eventId, sport, comp.date, model.season, home.id, away.id, comp.venue || null);
  }

  // Compute features for season and map gameId -> feature vector
  const allFeatures = computeFeatures(db, sport, model.season);
  const featureMap = new Map<number, number[]>();
  for (const f of allFeatures) {
    featureMap.set(f.gameId, [f.homeWinRate5, f.awayWinRate5, f.homeAvgMargin5, f.awayAvgMargin5, f.homeAdvantage, f.homeOppWinRate5, f.awayOppWinRate5, f.homeOppAvgMargin5, f.awayOppAvgMargin5, f.marketImpliedProb]);
  }

  // Query games matching date prefix
  const isoPrefix = `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`;
  const rows = db.prepare(`SELECT id, espn_event_id FROM games WHERE sport = ? AND date LIKE ? || '%'`).all(sport, isoPrefix) as Array<{ id: number; espn_event_id: string }>;
  if (rows.length === 0) return undefined;

  const probs = new Map<string, number>();
  for (const r of rows) {
    const x = featureMap.get(r.id) || [0.5, 0.5, 0, 0, 1, 0.5, 0.5, 0, 0, 0.5];
    const z = x.reduce((acc, v, i) => acc + v * model.weights[i], 0);
    const rawProb = sigmoid(z);
    const calibratedProb = model.calibration ? applyCalibration(rawProb, model.calibration) : rawProb;
    probs.set(r.espn_event_id, calibratedProb);
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
  let model: { market: string; weights: number[]; featureNames: string[]; season: number; calibration?: CalibrationCurve | null };
  try {
    model = JSON.parse(readFileSync(modelPath, "utf-8"));
  } catch {
    return undefined;
  }

  if (model.market !== 'spread') return undefined;

  const fetchEvents = getFetchEvents(sport);
  const competitions = await fetchEvents(date);
  if (competitions.length === 0) return undefined;

  // Upsert teams and games
  const upsertTeam = db.prepare(`INSERT INTO teams (sport, espn_id, name, abbreviation) VALUES (?, ?, ?, ?) ON CONFLICT(sport, espn_id) DO UPDATE SET name=excluded.name, abbreviation=excluded.abbreviation RETURNING id`);
  const insertGame = db.prepare(`INSERT INTO games (espn_event_id, sport, date, season, home_team_id, away_team_id, home_score, away_score, venue, status) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, 'scheduled') ON CONFLICT(espn_event_id) DO NOTHING`);

  for (const comp of competitions) {
    const home = upsertTeam.get(sport, comp.homeTeam.id, comp.homeTeam.name, comp.homeTeam.abbreviation || null) as { id: number };
    const away = upsertTeam.get(sport, comp.awayTeam.id, comp.awayTeam.name, comp.awayTeam.abbreviation || null) as { id: number };
    insertGame.run(comp.eventId, sport, comp.date, model.season, home.id, away.id, comp.venue || null);
  }

  // Compute features for season
  const allFeatures = computeFeatures(db, sport, model.season);
  const featureMap = new Map<number, number[]>();
  for (const f of allFeatures) {
    // Only include if spread data is available
    if (f.spreadLine !== null && f.spreadMarketImpliedProb !== null) {
      featureMap.set(f.gameId, [f.homeWinRate5, f.awayWinRate5, f.homeAvgMargin5, f.awayAvgMargin5, f.homeAdvantage, f.homeOppWinRate5, f.awayOppWinRate5, f.homeOppAvgMargin5, f.awayOppAvgMargin5, f.spreadLine, f.spreadMarketImpliedProb]);
    }
  }

  // Query games matching date prefix
  const isoPrefix = `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`;
  const rows = db.prepare(`SELECT id, espn_event_id FROM games WHERE sport = ? AND date LIKE ? || '%'`).all(sport, isoPrefix) as Array<{ id: number; espn_event_id: string }>;
  if (rows.length === 0) return undefined;

  const probs = new Map<string, number>();
  for (const r of rows) {
    const x = featureMap.get(r.id);
    if (!x) continue; // Skip games without spread data
    
    const z = x.reduce((acc, v, i) => acc + v * model.weights[i], 0);
    const rawProb = sigmoid(z);
    const calibratedProb = model.calibration ? applyCalibration(rawProb, model.calibration) : rawProb;
    probs.set(r.espn_event_id, calibratedProb);
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
  let model: { market: string; predictionType?: string; weights: number[]; featureNames: string[]; season: number; means?: number[]; stds?: number[]; sigma?: number; calibration?: CalibrationCurve | null };
  try {
    model = JSON.parse(readFileSync(modelPath, 'utf-8'));
  } catch {
    return undefined;
  }
  if (model.market !== 'total') return undefined;

  const fetchEvents = getFetchEvents(sport);
  const competitions = await fetchEvents(date);
  if (!competitions.length) return undefined;

  const upsertTeam = db.prepare(`INSERT INTO teams (sport, espn_id, name, abbreviation) VALUES (?, ?, ?, ?) ON CONFLICT(sport, espn_id) DO UPDATE SET name=excluded.name, abbreviation=excluded.abbreviation RETURNING id`);
  const insertGame = db.prepare(`INSERT INTO games (espn_event_id, sport, date, season, home_team_id, away_team_id, home_score, away_score, venue, status) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, 'scheduled') ON CONFLICT(espn_event_id) DO NOTHING`);
  for (const comp of competitions) {
    const home = upsertTeam.get(sport, comp.homeTeam.id, comp.homeTeam.name, comp.homeTeam.abbreviation || null) as { id: number };
    const away = upsertTeam.get(sport, comp.awayTeam.id, comp.awayTeam.name, comp.awayTeam.abbreviation || null) as { id: number };
    insertGame.run(comp.eventId, sport, comp.date, model.season, home.id, away.id, comp.venue || null);
  }

  const allFeatures = computeFeatures(db, sport, model.season);
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
        awayDefEff5: f.awayDefEff5
      };
      const featureVector = model.featureNames.map(n => vecMap[n] ?? 0);
      featureMap.set(f.gameId, featureVector);
    }
  }

  const isoPrefix = `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`;
  const rows = db.prepare(`SELECT id, espn_event_id FROM games WHERE sport = ? AND date LIKE ? || '%'`).all(sport, isoPrefix) as Array<{ id: number; espn_event_id: string }>;
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

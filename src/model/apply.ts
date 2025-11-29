import { getDb } from "../db/index.js";
import { computeFeatures } from "./features.js";
import { fetchEvents as fetchEventsNcaam } from "../espn/ncaam/events.js";
import { fetchEvents as fetchEventsCfb } from "../espn/cfb/events.js";
import type { Sport } from "../models/types.js";
import { readFileSync } from "fs";
import { join } from "path";

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

  const latestRun = db.prepare(`SELECT run_id, artifacts_path FROM model_runs WHERE sport = ? ORDER BY finished_at DESC LIMIT 1`).get(sport) as { run_id: string; artifacts_path: string } | undefined;
  if (!latestRun) return undefined;

  const modelPath = join(latestRun.artifacts_path, "model.json");
  let model: { weights: number[]; featureNames: string[]; season: number };
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
    featureMap.set(f.gameId, [f.homeWinRate5, f.awayWinRate5, f.homeAvgMargin5, f.awayAvgMargin5, f.homeAdvantage, f.homeOppWinRate5, f.awayOppWinRate5, f.homeOppAvgMargin5, f.awayOppAvgMargin5]);
  }

  // Query games matching date prefix
  const isoPrefix = `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`;
  const rows = db.prepare(`SELECT id, espn_event_id FROM games WHERE sport = ? AND date LIKE ? || '%'`).all(sport, isoPrefix) as Array<{ id: number; espn_event_id: string }>;
  if (rows.length === 0) return undefined;

  const probs = new Map<string, number>();
  for (const r of rows) {
    const x = featureMap.get(r.id) || [0.5, 0.5, 0, 0, 1, 0.5, 0.5, 0, 0];
    const z = x.reduce((acc, v, i) => acc + v * model.weights[i], 0);
    probs.set(r.espn_event_id, sigmoid(z));
  }
  return probs;
}

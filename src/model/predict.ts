/**
 * Model prediction command handlers
 */

import chalk from "chalk";
import type { Sport } from "../models/types.js";
import { getDb } from "../db/index.js";
import { readFileSync } from "fs";
import { join } from "path";
import { fetchEvents as fetchEventsNcaam } from "../espn/ncaam/events.js";
import { fetchEvents as fetchEventsCfb } from "../espn/cfb/events.js";
import { computeFeatures } from "./features.js";

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

function yyyymmddToIsoPrefix(date: string): string {
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
}

function getFetchEvents(sport: Sport) {
  return sport === "cfb" ? fetchEventsCfb : fetchEventsNcaam;
}

/**
 * Generate predictions for upcoming games
 */
export async function cmdModelPredict(
  sport: Sport,
  date: string
): Promise<void> {
  try {
    console.log(chalk.bold.cyan(`\n🔮 Generating predictions for ${sport.toUpperCase()} on ${date}...\n`));

    const db = getDb();

    // 1) Load latest trained model for this sport
    const latestRun = db.prepare(
      `SELECT run_id, artifacts_path FROM model_runs WHERE sport = ? ORDER BY finished_at DESC LIMIT 1`
    ).get(sport) as { run_id: string; artifacts_path: string } | undefined;

    if (!latestRun) {
      console.log(chalk.yellow("⚠️  No trained model found. Run 'model train' first."));
      return;
    }

    const modelPath = join(latestRun.artifacts_path, "model.json");
    const model = JSON.parse(readFileSync(modelPath, "utf-8")) as {
      weights: number[];
      featureNames: string[];
      sport: string;
      season: number;
      trainedAt: string;
    };

    // 2) Ensure games for date exist in DB (upsert teams and games)
    const fetchEvents = getFetchEvents(sport);
    const competitions = await fetchEvents(date);
    if (competitions.length === 0) {
      console.log(chalk.yellow(`No games found for ${date}`));
      return;
    }

    const isoPrefix = yyyymmddToIsoPrefix(date);

    const upsertTeam = db.prepare(
      `INSERT INTO teams (sport, espn_id, name, abbreviation)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(sport, espn_id) DO UPDATE SET name = excluded.name, abbreviation = excluded.abbreviation
       RETURNING id`
    );

    const insertGame = db.prepare(
      `INSERT INTO games (espn_event_id, sport, date, season, home_team_id, away_team_id, home_score, away_score, venue, status)
       VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, 'scheduled')
       ON CONFLICT(espn_event_id) DO NOTHING`
    );

    for (const comp of competitions) {
      const home = upsertTeam.get(sport, comp.homeTeam.id, comp.homeTeam.name, comp.homeTeam.abbreviation || null) as { id: number };
      const away = upsertTeam.get(sport, comp.awayTeam.id, comp.awayTeam.name, comp.awayTeam.abbreviation || null) as { id: number };
      insertGame.run(comp.eventId, sport, comp.date, model.season, home.id, away.id, comp.venue || null);
    }

    // 3) Compute features for the model's season
    const allFeatures = computeFeatures(db, sport, model.season);
    const featureMap = new Map<number, number[]>();
    for (const f of allFeatures) {
      featureMap.set(
        f.gameId,
        [f.homeWinRate5, f.awayWinRate5, f.homeAvgMargin5, f.awayAvgMargin5, f.homeAdvantage, f.homeOppWinRate5, f.awayOppWinRate5, f.homeOppAvgMargin5, f.awayOppAvgMargin5]
      );
    }

    // 4) Query today's games from DB and score
    const rows = db.prepare(
      `SELECT g.id as game_id, g.espn_event_id, g.date, th.name as home_name, ta.name as away_name
       FROM games g
       JOIN teams th ON th.id = g.home_team_id
       JOIN teams ta ON ta.id = g.away_team_id
       WHERE g.sport = ? AND g.date LIKE ? || '%'
       ORDER BY g.date ASC`
    ).all(sport, isoPrefix) as Array<{ game_id: number; espn_event_id: string; date: string; home_name: string; away_name: string }>;

    if (rows.length === 0) {
      console.log(chalk.yellow(`No stored games found for ${date}.`));
      return;
    }

    console.log(chalk.gray(`Using model trained on season ${model.season} (${model.trainedAt})`));
    console.log(chalk.dim(`Features: ${model.featureNames.join(", ")}\n`));

    const scored = rows
      .map((r) => {
        const x = featureMap.get(r.game_id) || [0.5, 0.5, 0, 0, 1, 0.5, 0.5, 0, 0];
        const z = x.reduce((acc, v, i) => acc + v * model.weights[i], 0);
        const pHome = sigmoid(z);
        return { ...r, pHome };
      })
      .sort((a, b) => b.pHome - a.pHome);

    for (const s of scored) {
      const pct = (s.pHome * 100).toFixed(1) + "%";
      const color = s.pHome >= 0.5 ? chalk.green : chalk.yellow;
      console.log(`${chalk.bold(s.away_name)} @ ${chalk.bold(s.home_name)}  →  Home win: ${color(pct)}  (${new Date(s.date).toLocaleString()})`);
    }

    console.log();
    console.log(chalk.dim("💡 Tip: Use 'odds --sport <sport> --event <id> --date <yyyymmdd>' to compare with market."));
  } catch (error) {
    console.error(chalk.red("Error generating predictions:"), error);
    process.exit(1);
  }
}

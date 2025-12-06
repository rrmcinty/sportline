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
import { applyCalibration, type CalibrationCurve } from "./calibration.js";

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
      seasons?: number[];
      season?: number;
      trainedAt: string;
      calibration?: CalibrationCurve | null;
    };

    // Try to load metrics.json for training/validation stats
    let metrics: any = null;
    try {
      const metricsPath = join(latestRun.artifacts_path, "metrics.json");
      metrics = JSON.parse(readFileSync(metricsPath, "utf-8"));
    } catch {}

    if (metrics) {
      console.log(chalk.magenta.bold("Model Training/Validation Stats:"));
      if (metrics.numTrainingSamples !== undefined && metrics.numValidationSamples !== undefined) {
        console.log(chalk.magenta(`  Training samples: ${metrics.numTrainingSamples}`));
        console.log(chalk.magenta(`  Validation samples: ${metrics.numValidationSamples}`));
      }
      if (metrics.validationAccuracy !== undefined) {
        console.log(chalk.magenta(`  Validation accuracy: ${metrics.validationAccuracy.toFixed(2)}%`));
      }
      if (metrics.brierScore !== undefined) {
        console.log(chalk.magenta(`  Brier score: ${metrics.brierScore.toFixed(4)}`));
      }
      if (metrics.logLoss !== undefined) {
        console.log(chalk.magenta(`  Log loss: ${metrics.logLoss.toFixed(4)}`));
      }
      if (metrics.splitDate) {
        console.log(chalk.magenta(`  Train/validation split date: ${metrics.splitDate}`));
      }
      console.log();
    }

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
      insertGame.run(comp.eventId, sport, comp.date, (Array.isArray(model.seasons) && model.seasons.length ? model.seasons[0] : 2025), home.id, away.id, comp.venue || null);
    }

    // 3) Compute features for the model's season
    const allFeatures = computeFeatures(db, sport, Array.isArray(model.seasons) && model.seasons.length ? model.seasons : [2025]);
    const featureMap = new Map<number, number[]>();
    for (const f of allFeatures) {
      featureMap.set(
        f.gameId,
        [f.homeWinRate5, f.awayWinRate5, f.homeAvgMargin5, f.awayAvgMargin5, f.homeAdvantage, f.homeOppWinRate5, f.awayOppWinRate5, f.homeOppAvgMargin5, f.awayOppAvgMargin5, f.homeWinRate10, f.awayWinRate10, f.homeAvgMargin10, f.awayAvgMargin10, f.homeOppWinRate10, f.awayOppWinRate10, f.homeOppAvgMargin10, f.awayOppAvgMargin10, f.marketImpliedProb]
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

    console.log(chalk.gray(`Using model trained on season${model.seasons && model.seasons.length > 1 ? 's' : ''} ${(model.seasons ? model.seasons.join(', ') : model.season)} (${model.trainedAt})`));
    console.log(chalk.dim(`Features: ${model.featureNames.join(", ")}\n`));

    const scored = rows
      .map((r) => {
        const x = featureMap.get(r.game_id) || [0.5, 0.5, 0, 0, 1, 0.5, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0.5];
        const z = x.reduce((acc, v, i) => acc + v * model.weights[i], 0);
        const rawProb = sigmoid(z);
        let pHome = rawProb;
        const cal = model.calibration;
        if (
          cal &&
          typeof cal === 'object' &&
          Array.isArray(cal.x) &&
          Array.isArray(cal.y) &&
          cal.x.length > 0 &&
          cal.y.length > 0
        ) {
          pHome = applyCalibration(rawProb, cal);
        }
        return { ...r, pHome };
      })
      .sort((a, b) => b.pHome - a.pHome);

    // Dynamically import odds fetchers/normalizers for the sport
    let fetchOdds: ((eventId: string) => Promise<any>) | undefined = undefined;
    let normalizeOdds: ((eventId: string, oddsEntries: any[], homeTeam: string, awayTeam: string) => any[]) | undefined = undefined;
    if (sport === "cfb") {
      ({ fetchOdds, normalizeOdds } = await import("../espn/cfb/odds.js"));
    } else if (sport === "ncaam") {
      ({ fetchOdds, normalizeOdds } = await import("../espn/ncaam/odds.js"));
    } else if (sport === "nfl") {
      ({ fetchOdds, normalizeOdds } = await import("../espn/nfl/odds.js"));
    } else if (sport === "nba") {
      ({ fetchOdds, normalizeOdds } = await import("../espn/nba/odds.js"));
    } else if (sport === "nhl") {
      const nhlOdds = await import("../espn/nhl/odds.js");
      fetchOdds = nhlOdds.fetchNHLOdds;
      normalizeOdds = nhlOdds.normalizeOdds;
    }

    for (const s of scored) {
      const pct = (s.pHome * 100).toFixed(1) + "%";
      const home = s.pHome >= 0.5 ? chalk.green.bold(s.home_name) : chalk.bold(s.home_name);
      const away = chalk.bold(s.away_name);
      const winnerProb = (s.pHome * 100).toFixed(1) + "%";
      // Home team is green if predicted winner, otherwise yellow
      const probColor = s.pHome >= 0.5 ? chalk.green(winnerProb) : chalk.yellow(winnerProb);
      // Show prediction line without event ID (odds are now shown below)
      console.log(`${away} @ ${home}  →  Home win: ${probColor}  (${new Date(s.date).toLocaleString()})`);

      // Fetch and display market odds for this event
      if (fetchOdds && normalizeOdds) {
        try {
          const oddsEntries = await fetchOdds(s.espn_event_id);
          if (oddsEntries && oddsEntries.length > 0) {
            const legs = normalizeOdds(
              s.espn_event_id,
              oddsEntries,
              s.home_name,
              s.away_name
            );
            // Show moneyline odds for both teams
            const moneylines = legs.filter((l: any) => l.market === "moneyline");
            if (moneylines.length > 0) {
              console.log(chalk.gray("  Market Moneylines (vig-free):"));
              for (const leg of moneylines) {
                const color = leg.impliedProbability > 0.5 ? chalk.green : chalk.yellow;
                let oddsStr = `${leg.description} → ${(leg.impliedProbability * 100).toFixed(1)}%`;
                if (leg.currentOdds && leg.currentOdds !== leg.odds) {
                  oddsStr += chalk.dim(` (current: ${leg.currentOdds > 0 ? "+" : ""}${leg.currentOdds})`);
                }
                console.log("    " + color(oddsStr));
              }
            }
            // Show spread odds
            const spreads = legs.filter((l: any) => l.market === "spread");
            if (spreads.length > 0) {
              console.log(chalk.gray("  Market Spreads (vig-free):"));
              for (const leg of spreads) {
                let oddsStr = `${leg.description} → ${(leg.impliedProbability * 100).toFixed(1)}%`;
                if (leg.currentOdds && leg.currentOdds !== leg.odds) {
                  oddsStr += chalk.dim(` (current: ${leg.currentOdds > 0 ? "+" : ""}${leg.currentOdds})`);
                }
                console.log("    " + chalk.cyan(oddsStr));
              }
            }
            // Show totals odds
            const totals = legs.filter((l: any) => l.market === "total");
            if (totals.length > 0) {
              console.log(chalk.gray("  Market Totals (vig-free):"));
              for (const leg of totals) {
                let oddsStr = `${leg.description} → ${(leg.impliedProbability * 100).toFixed(1)}%`;
                if (leg.currentOdds && leg.currentOdds !== leg.odds) {
                  oddsStr += chalk.dim(` (current: ${leg.currentOdds > 0 ? "+" : ""}${leg.currentOdds})`);
                }
                console.log("    " + chalk.magenta(oddsStr));
              }
            }
          } else {
            console.log(chalk.gray("  No market odds available for this event."));
          }
        } catch (err) {
          let msg = "";
          if (err && typeof err === "object" && "message" in err && typeof (err as any).message === "string") {
            msg = (err as any).message;
          } else {
            msg = String(err);
          }
          console.log(chalk.red("  Error fetching market odds: " + msg));
        }
      }
    }

    console.log();
    console.log(chalk.dim("💡 Tip: Use 'odds --sport <sport> --event <id> --date <yyyymmdd>' to compare with market."));
  } catch (error) {
    console.error(chalk.red("Error generating predictions:"), error);
    process.exit(1);
  }
}

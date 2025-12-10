import { getDb } from "../db/index.js";
import { computeFeatures } from "./features.js";
import chalk from "chalk";
import { readFileSync } from "fs";
import { join } from "path";

interface ModelMeta {
  run_id: string;
  artifacts_path: string;
  metrics_json: string;
  config_json: string;
}

function loadLatestModel(db: any, sport: string, market: string) {
  const row = db
    .prepare(
      `SELECT run_id, artifacts_path, metrics_json, config_json FROM model_runs WHERE sport = ? AND config_json LIKE ? ORDER BY finished_at DESC LIMIT 1`,
    )
    .get(sport, `%${market}%`) as ModelMeta | undefined;
  if (!row) return undefined;

  // Check for ensemble model (moneyline)
  try {
    const ensemblePath = join(row.artifacts_path, "ensemble.json");
    const baseModel = JSON.parse(
      readFileSync(join(row.artifacts_path, "base_model.json"), "utf-8"),
    );
    const marketModel = JSON.parse(
      readFileSync(join(row.artifacts_path, "market_model.json"), "utf-8"),
    );
    const ensemble = JSON.parse(readFileSync(ensemblePath, "utf-8"));
    return {
      meta: row,
      model: null,
      ensemble: { base: baseModel, market: marketModel, config: ensemble },
    };
  } catch {
    // Fall back to single model
    try {
      const model = JSON.parse(
        readFileSync(join(row.artifacts_path, "model.json"), "utf-8"),
      );
      return { meta: row, model, ensemble: null };
    } catch {
      return undefined;
    }
  }
}

function percentile(arr: number[], p: number): number {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const w = idx - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

function binCalibration(preds: number[], labels: number[], bins: number = 10) {
  const result: {
    bin: string;
    count: number;
    avgPred: number;
    avgActual: number;
  }[] = [];
  for (let b = 0; b < bins; b++) {
    const lo = b / bins;
    const hi = (b + 1) / bins + 1e-9;
    const idxs = preds
      .map((p, i) => ({ p, i }))
      .filter((o) => o.p >= lo && o.p < hi);
    if (!idxs.length) continue;
    const avgPred = idxs.reduce((a, o) => a + o.p, 0) / idxs.length;
    const avgActual = idxs.reduce((a, o) => a + labels[o.i], 0) / idxs.length;
    result.push({
      bin: `${(lo * 100).toFixed(0)}-${(hi * 100).toFixed(0)}%`,
      count: idxs.length,
      avgPred,
      avgActual,
    });
  }
  const ece = result.reduce(
    (acc, r) =>
      acc + (r.count / preds.length) * Math.abs(r.avgPred - r.avgActual),
    0,
  );
  return { bins: result, ece };
}

function summaryStats(values: number[]) {
  const n = values.length;
  if (!n)
    return { n: 0, mean: 0, std: 0, min: 0, max: 0, p10: 0, p50: 0, p90: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n;
  const std = Math.sqrt(variance);
  return {
    n,
    mean,
    std,
    min: Math.min(...values),
    max: Math.max(...values),
    p10: percentile(values, 10),
    p50: percentile(values, 50),
    p90: percentile(values, 90),
  };
}

function printCalibration(
  title: string,
  cal: {
    bins: { bin: string; count: number; avgPred: number; avgActual: number }[];
    ece: number;
  },
) {
  console.log(chalk.bold(title));
  for (const b of cal.bins) {
    console.log(
      chalk.dim(
        `  Bin ${b.bin} n=${b.count} pred=${(b.avgPred * 100).toFixed(1)}% actual=${(b.avgActual * 100).toFixed(1)}%`,
      ),
    );
  }
  console.log(chalk.cyan(`  ECE: ${cal.ece.toFixed(4)}`));
  console.log();
}

async function runDiagnostics() {
  const sport = process.argv.includes("--sport")
    ? process.argv[process.argv.indexOf("--sport") + 1]
    : "cfb";
  const seasonStr = process.argv.includes("--season")
    ? process.argv[process.argv.indexOf("--season") + 1]
    : "2025";
  const seasons = seasonStr.split(",").map((s) => parseInt(s.trim(), 10));
  const db = getDb();
  console.log(
    chalk.bold.cyan(
      `\n🔬 Diagnostics for ${sport.toUpperCase()} season${seasons.length > 1 ? "s" : ""} ${seasons.join(", ")}\n`,
    ),
  );

  const features = computeFeatures(db, sport, seasons);
  const moneylineModel = loadLatestModel(db, sport, "moneyline");
  const spreadModel = loadLatestModel(db, sport, "spread");
  const totalModel = loadLatestModel(db, sport, "total");

  // Build maps for scores and odds lines
  const seasonPlaceholders = seasons.map(() => "?").join(",");
  const gamesComplete = db
    .prepare(
      `SELECT id, home_score, away_score, date FROM games WHERE sport = ? AND season IN (${seasonPlaceholders}) AND home_score IS NOT NULL AND away_score IS NOT NULL`,
    )
    .all(sport, ...seasons) as Array<{
    id: number;
    home_score: number;
    away_score: number;
    date: string;
  }>;
  const gameMap = new Map(gamesComplete.map((g) => [g.id, g]));

  // Moneyline diagnostics
  if (moneylineModel) {
    const valDate = JSON.parse(moneylineModel.meta.metrics_json).splitDate;
    const valGames = features.filter(
      (f) => f.date >= valDate && gameMap.has(f.gameId),
    );
    const preds: number[] = [];
    const labels: number[] = [];
    const divergences: number[] = [];

    if (moneylineModel.ensemble) {
      // Ensemble prediction
      const baseWeights = moneylineModel.ensemble.base.weights;
      const marketWeights = moneylineModel.ensemble.market.weights;
      const ensembleConfig = moneylineModel.ensemble.config;

      for (const f of valGames) {
        const baseFeatures = [
          f.homeWinRate5,
          f.awayWinRate5,
          f.homeAvgMargin5,
          f.awayAvgMargin5,
          f.homeAdvantage,
          f.homeOppWinRate5,
          f.awayOppWinRate5,
          f.homeOppAvgMargin5,
          f.awayOppAvgMargin5,
        ];
        const marketFeatures = [...baseFeatures, f.marketImpliedProb];

        const baseZ = baseFeatures.reduce(
          (acc, v, i) => acc + v * baseWeights[i],
          0,
        );
        const baseP = 1 / (1 + Math.exp(-baseZ));

        const marketZ = marketFeatures.reduce(
          (acc, v, i) => acc + v * marketWeights[i],
          0,
        );
        const marketP = 1 / (1 + Math.exp(-marketZ));

        const p =
          ensembleConfig.baseWeight * baseP +
          ensembleConfig.marketWeight * marketP;
        const game = gameMap.get(f.gameId)!;
        const label = game.home_score > game.away_score ? 1 : 0;
        preds.push(p);
        labels.push(label);
        divergences.push(p - f.marketImpliedProb);
      }
    } else if (moneylineModel.model) {
      // Single model
      const m = moneylineModel.model;
      for (const f of valGames) {
        const x = [
          f.homeWinRate5,
          f.awayWinRate5,
          f.homeAvgMargin5,
          f.awayAvgMargin5,
          f.homeAdvantage,
          f.homeOppWinRate5,
          f.awayOppWinRate5,
          f.homeOppAvgMargin5,
          f.awayOppAvgMargin5,
          f.marketImpliedProb,
        ];
        const z = x.reduce((acc, v, i) => acc + v * m.weights[i], 0);
        const p = 1 / (1 + Math.exp(-z));
        const game = gameMap.get(f.gameId)!;
        const label = game.home_score > game.away_score ? 1 : 0;
        preds.push(p);
        labels.push(label);
        divergences.push(p - f.marketImpliedProb);
      }
    }

    console.log(chalk.bold.green("Moneyline Model"));
    console.log(chalk.dim(` Validation games: ${preds.length}`));
    const cal = binCalibration(preds, labels, 10);
    printCalibration(" Moneyline Calibration (10 bins)", cal);
    const divStats = summaryStats(divergences);
    console.log(
      chalk.magenta(
        ` Divergence (model - market) mean=${(divStats.mean * 100).toFixed(2)}% std=${(divStats.std * 100).toFixed(2)}% min=${(divStats.min * 100).toFixed(2)}% max=${(divStats.max * 100).toFixed(2)}% p90=${(divStats.p90 * 100).toFixed(2)}%`,
      ),
    );
    console.log();
  }

  // Spread diagnostics
  if (spreadModel) {
    const m = spreadModel.model;
    if (m.market === "spread") {
      const valDate = JSON.parse(spreadModel.meta.metrics_json).splitDate;
      const valGames = features.filter(
        (f) =>
          f.date >= valDate &&
          gameMap.has(f.gameId) &&
          f.spreadLine !== null &&
          f.spreadMarketImpliedProb !== null,
      );
      const preds: number[] = [];
      const labels: number[] = [];
      const divergences: number[] = [];
      for (const f of valGames) {
        const x = [
          f.homeWinRate5,
          f.awayWinRate5,
          f.homeAvgMargin5,
          f.awayAvgMargin5,
          f.homeAdvantage,
          f.homeOppWinRate5,
          f.awayOppWinRate5,
          f.homeOppAvgMargin5,
          f.awayOppAvgMargin5,
          f.spreadLine!,
          f.spreadMarketImpliedProb!,
        ];
        const z = x.reduce((acc, v, i) => acc + v * m.weights[i], 0);
        const p = 1 / (1 + Math.exp(-z));
        const game = gameMap.get(f.gameId)!;
        const diff = game.home_score - game.away_score;
        const label = diff + f.spreadLine! > 0 ? 1 : 0; // home covers if home_score - away_score + spreadLine > 0
        preds.push(p);
        labels.push(label);
        divergences.push(p - (f.spreadMarketImpliedProb ?? 0.5));
      }
      console.log(chalk.bold.green("Spread Model"));
      console.log(chalk.dim(` Validation games: ${preds.length}`));
      const cal = binCalibration(preds, labels, 10);
      printCalibration(" Spread Calibration (10 bins)", cal);
      const divStats = summaryStats(divergences);
      console.log(
        chalk.magenta(
          ` Divergence (model - market spread prob) mean=${(divStats.mean * 100).toFixed(2)}% std=${(divStats.std * 100).toFixed(2)}% p90=${(divStats.p90 * 100).toFixed(2)}%`,
        ),
      );
      console.log();
    }
  }

  // Totals diagnostics
  if (totalModel) {
    const m = totalModel.model;
    const metrics = JSON.parse(totalModel.meta.metrics_json);
    if (m.predictionType === "regression") {
      const valDate = metrics.splitDate;
      const valGames = features.filter(
        (f) =>
          f.date >= valDate && gameMap.has(f.gameId) && f.totalLine !== null,
      );
      const predsOver: number[] = [];
      const labelsOver: number[] = [];
      const residuals: number[] = [];
      const divergences: number[] = [];
      for (const f of valGames) {
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
        };
        const featureVector = m.featureNames.map((n: string) => vecMap[n] ?? 0);
        const scaled = featureVector.map(
          (v: number, i: number) => (v - m.means[i]) / m.stds[i],
        );
        const bias = (m as any).bias || 0;
        const predictedScore =
          scaled.reduce(
            (acc: number, v: number, i: number) => acc + v * m.weights[i],
            0,
          ) + bias;
        const game = gameMap.get(f.gameId)!;
        const actualCombined = game.home_score + game.away_score;
        const sigma = m.sigma;
        const z = (f.totalLine! - predictedScore) / sigma;
        // normal cdf approximation
        const t = 1 / (1 + 0.5 * Math.abs(z));
        const tau =
          t *
          Math.exp(
            -z * z -
              1.26551223 +
              1.00002368 * t +
              0.37409196 * t * t +
              0.09678418 * t * t * t -
              0.18628806 * t * t * t * t +
              0.27886807 * t * t * t * t * t -
              1.13520398 * t * t * t * t * t * t +
              1.48851587 * t * t * t * t * t * t * t -
              0.82215223 * t * t * t * t * t * t * t * t +
              0.17087277 * t * t * t * t * t * t * t * t * t,
          );
        const erf = z >= 0 ? 1 - tau : tau - 1;
        const normalCdf = 0.5 * (1 + erf);
        const pOver = 1 - normalCdf;
        const labelOver = actualCombined > f.totalLine! ? 1 : 0;
        predsOver.push(pOver);
        labelsOver.push(labelOver);
        residuals.push(actualCombined - predictedScore);
        if (f.totalMarketImpliedProb !== null)
          divergences.push(pOver - f.totalMarketImpliedProb);
      }
      console.log(chalk.bold.green("Totals Model (Regression)"));
      console.log(chalk.dim(` Validation games: ${predsOver.length}`));
      const cal = binCalibration(predsOver, labelsOver, 10);
      printCalibration(" Totals Over Probability Calibration (10 bins)", cal);
      const resStats = summaryStats(residuals);
      console.log(
        chalk.yellow(
          ` Residuals mean=${resStats.mean.toFixed(2)} std=${resStats.std.toFixed(2)} p10=${resStats.p10.toFixed(2)} p90=${resStats.p90.toFixed(2)} range=[${resStats.min.toFixed(2)}, ${resStats.max.toFixed(2)}]`,
        ),
      );
      if (divergences.length) {
        const divStats = summaryStats(divergences);
        console.log(
          chalk.magenta(
            ` Divergence (model - market total over prob) mean=${(divStats.mean * 100).toFixed(2)}% std=${(divStats.std * 100).toFixed(2)}% p90=${(divStats.p90 * 100).toFixed(2)}%`,
          ),
        );
      }
      console.log();
    }
  }

  console.log(chalk.bold.cyan("✅ Diagnostics complete"));
}

runDiagnostics().catch((err) => {
  console.error("Diagnostics failed", err);
  process.exit(1);
});

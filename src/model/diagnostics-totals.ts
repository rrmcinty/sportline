/**
 * Totals model diagnostic tool
 * Inspects predictions vs actual outcomes to debug calibration issues
 */

import chalk from "chalk";
import { getDb } from "../db/index.js";
import type { Sport } from "../models/types.js";
import { computeFeatures } from "./features.js";
import { readFileSync } from "fs";
import { join } from "path";

interface DiagnosticResult {
  eventId: string;
  homeTeam: string;
  awayTeam: string;
  date: string;
  predictedScore: number;
  actualScore: number;
  line: number;
  modelProb: number;
  marketProb: number;
  wentOver: boolean;
  zScore: number;
  residual: number;
}

export async function cmdTotalsDiagnostics(
  sport: Sport,
  seasons: number[],
  limit: number = 20
): Promise<void> {
  console.log(chalk.bold.cyan(`\n🔍 Totals Model Diagnostics: ${sport.toUpperCase()}\n`));
  console.log(chalk.dim(`Seasons: ${seasons.join(", ")}`));
  console.log(chalk.dim(`Sample size: ${limit} games\n`));

  const db = getDb();

  // Load the most recent totals model for this sport
  const latestRun = db.prepare(`
    SELECT run_id, artifacts_path 
    FROM model_runs 
    WHERE sport = ? AND config_json LIKE '%total%' 
    ORDER BY finished_at DESC 
    LIMIT 1
  `).get(sport) as { run_id: string; artifacts_path: string } | undefined;

  if (!latestRun) {
    console.log(chalk.red(`No totals models found for ${sport}`));
    return;
  }

  console.log(chalk.dim(`Loading model: ${latestRun.run_id}\n`));

  const modelPath = join(latestRun.artifacts_path, "model.json");
  const model = JSON.parse(readFileSync(modelPath, "utf-8")) as {
    market?: string;
    predictionType?: string;
    weights: number[];
    means?: number[];
    stds?: number[];
    bias?: number;
    sigma: number;
  };

  if (model.market !== "total" || model.predictionType !== "regression") {
    console.log(chalk.red(`Model is not a totals regression model (market: ${model.market}, type: ${model.predictionType})`));
    return;
  }

  // Get completed games with odds
  const games = db.prepare(`
    SELECT 
      g.id,
      g.espn_event_id,
      g.home_team_id,
      g.away_team_id,
      g.home_score,
      g.away_score,
      g.date,
      ht.name as home_team,
      at.name as away_team,
      o.line as total_line,
      o.price_over,
      o.price_under
    FROM games g
    JOIN teams ht ON g.home_team_id = ht.id
    JOIN teams at ON g.away_team_id = at.id
    JOIN odds o ON g.id = o.game_id
    WHERE g.sport = ?
      AND g.season IN (${seasons.map(() => "?").join(",")})
      AND g.home_score IS NOT NULL
      AND g.away_score IS NOT NULL
      AND o.market = 'total'
      AND o.line IS NOT NULL
    ORDER BY g.date DESC
    LIMIT ?
  `).all(sport, ...seasons, limit) as any[];

  if (games.length === 0) {
    console.log(chalk.yellow(`No completed games found with totals odds`));
    return;
  }

  console.log(chalk.green(`Found ${games.length} completed games\n`));

  // Compute features for all games
  console.log(chalk.dim("Computing features..."));
  const allFeatures = computeFeatures(db, sport, seasons);
  const featureMap = new Map(allFeatures.map(f => [f.gameId, f]));

  // Normal CDF approximation
  function normalCdf(z: number): number {
    const t = 1 / (1 + 0.5 * Math.abs(z));
    const tau = t * Math.exp(-z*z - 1.26551223 + 1.00002368*t + 0.37409196*t*t + 0.09678418*t*t*t - 0.18628806*t*t*t*t + 0.27886807*t*t*t*t*t - 1.13520398*t*t*t*t*t*t + 1.48851587*t*t*t*t*t*t*t - 0.82215223*t*t*t*t*t*t*t*t + 0.17087277*t*t*t*t*t*t*t*t*t);
    const erf = z >= 0 ? tau - 1 : 1 - tau;  // FIX: was inverted!
    return 0.5 * (1 + erf);
  }

  const results: DiagnosticResult[] = [];

  for (const game of games) {
    const f = featureMap.get(game.id);
    if (!f) continue;

    // Build feature vector (36 features)
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

    const featureNames = Object.keys(vecMap);
    const xRaw = featureNames.map(name => vecMap[name]);

    // Standardize
    const xScaled = xRaw.map((v, i) => (v - model.means![i]) / model.stds![i]);

    // Predict score
    const bias = model.bias ?? 0;
    const predictedScore = xScaled.reduce((acc, v, i) => acc + v * model.weights[i], 0) + bias;

    // Calculate z-score and probability
    const line = game.total_line;
    const z = (line - predictedScore) / model.sigma;
    const pOver = 1 - normalCdf(z);

    // Calculate market probability (vig-free)
    const overDecimal = game.price_over < 0 ? (100 / Math.abs(game.price_over)) + 1 : (game.price_over / 100) + 1;
    const underDecimal = game.price_under < 0 ? (100 / Math.abs(game.price_under)) + 1 : (game.price_under / 100) + 1;
    const overImplied = 1 / overDecimal;
    const underImplied = 1 / underDecimal;
    const marketProb = overImplied / (overImplied + underImplied);

    const actualScore = game.home_score + game.away_score;
    const wentOver = actualScore > line;
    const residual = actualScore - predictedScore;

    results.push({
      eventId: game.espn_event_id,
      homeTeam: game.home_team,
      awayTeam: game.away_team,
      date: game.date,
      predictedScore,
      actualScore,
      line,
      modelProb: pOver,
      marketProb,
      wentOver,
      zScore: z,
      residual
    });
  }

  // Print detailed results
  console.log(chalk.bold("═".repeat(120)));
  console.log(chalk.bold("DETAILED PREDICTIONS"));
  console.log(chalk.bold("═".repeat(120)));

  for (const r of results) {
    const modelPct = (r.modelProb * 100).toFixed(1);
    const marketPct = (r.marketProb * 100).toFixed(1);
    const divergence = ((r.modelProb - r.marketProb) * 100).toFixed(1);
    const outcome = r.wentOver ? chalk.green("OVER") : chalk.red("UNDER");
    const correct = (r.modelProb > 0.5 && r.wentOver) || (r.modelProb <= 0.5 && !r.wentOver);
    const correctness = correct ? chalk.green("✓") : chalk.red("✗");

    console.log(chalk.bold(`\n${r.homeTeam} @ ${r.awayTeam}`));
    console.log(chalk.dim(`Date: ${r.date} | Event: ${r.eventId}`));
    console.log(`Line: ${r.line.toFixed(1)}`);
    console.log(`Predicted Score: ${r.predictedScore.toFixed(1)}`);
    console.log(`Actual Score: ${r.actualScore} ${outcome} ${correctness}`);
    console.log(`Residual: ${r.residual >= 0 ? '+' : ''}${r.residual.toFixed(1)} points`);
    console.log(`Z-Score: ${r.zScore.toFixed(2)}`);
    console.log(`Model P(Over): ${modelPct}% | Market: ${marketPct}% | Divergence: ${divergence}%`);
  }

  // Summary statistics
  console.log(chalk.bold("\n" + "═".repeat(120)));
  console.log(chalk.bold("SUMMARY STATISTICS"));
  console.log(chalk.bold("═".repeat(120)));

  const avgPredicted = results.reduce((sum, r) => sum + r.predictedScore, 0) / results.length;
  const avgActual = results.reduce((sum, r) => sum + r.actualScore, 0) / results.length;
  const avgLine = results.reduce((sum, r) => sum + r.line, 0) / results.length;
  const avgResidual = results.reduce((sum, r) => sum + r.residual, 0) / results.length;
  const avgZScore = results.reduce((sum, r) => sum + r.zScore, 0) / results.length;
  const avgModelProb = results.reduce((sum, r) => sum + r.modelProb, 0) / results.length;
  const avgMarketProb = results.reduce((sum, r) => sum + r.marketProb, 0) / results.length;

  const overRate = results.filter(r => r.wentOver).length / results.length;
  const modelFavorsOverRate = results.filter(r => r.modelProb > 0.5).length / results.length;
  const marketFavorsOverRate = results.filter(r => r.marketProb > 0.5).length / results.length;

  const modelCorrect = results.filter(r => 
    (r.modelProb > 0.5 && r.wentOver) || (r.modelProb <= 0.5 && !r.wentOver)
  ).length;

  console.log(`Average Predicted Score: ${avgPredicted.toFixed(2)}`);
  console.log(`Average Actual Score: ${avgActual.toFixed(2)}`);
  console.log(`Average Line: ${avgLine.toFixed(2)}`);
  console.log(`Average Residual: ${avgResidual >= 0 ? '+' : ''}${avgResidual.toFixed(2)} points`);
  console.log(`Average Z-Score: ${avgZScore.toFixed(2)}`);
  console.log(`\nAverage Model P(Over): ${(avgModelProb * 100).toFixed(1)}%`);
  console.log(`Average Market P(Over): ${(avgMarketProb * 100).toFixed(1)}%`);
  console.log(`\nActual Over Rate: ${(overRate * 100).toFixed(1)}%`);
  console.log(`Model Favors Over: ${(modelFavorsOverRate * 100).toFixed(1)}%`);
  console.log(`Market Favors Over: ${(marketFavorsOverRate * 100).toFixed(1)}%`);
  console.log(`\nModel Accuracy: ${modelCorrect}/${results.length} (${((modelCorrect / results.length) * 100).toFixed(1)}%)`);

  // Systematic bias detection
  console.log(chalk.bold("\n" + "═".repeat(120)));
  console.log(chalk.bold("BIAS DETECTION"));
  console.log(chalk.bold("═".repeat(120)));

  const systematicUnderpredict = avgResidual > 2;
  const systematicOverpredict = avgResidual < -2;

  if (systematicUnderpredict) {
    console.log(chalk.red(`⚠️  SYSTEMATIC UNDERPREDICTION detected!`));
    console.log(chalk.red(`    Model predicts ${avgResidual.toFixed(1)} points lower than actual on average`));
    console.log(chalk.yellow(`    This causes model to favor UNDER when it should favor OVER`));
  } else if (systematicOverpredict) {
    console.log(chalk.red(`⚠️  SYSTEMATIC OVERPREDICTION detected!`));
    console.log(chalk.red(`    Model predicts ${Math.abs(avgResidual).toFixed(1)} points higher than actual on average`));
    console.log(chalk.yellow(`    This causes model to favor OVER when it should favor UNDER`));
  } else {
    console.log(chalk.green(`✓ No systematic bias detected (avg residual: ${avgResidual.toFixed(2)} points)`));
  }

  // Z-score interpretation
  const avgZPositive = avgZScore > 0.5;
  const avgZNegative = avgZScore < -0.5;

  if (avgZPositive) {
    console.log(chalk.yellow(`\n⚠️  Average Z-score is positive (${avgZScore.toFixed(2)})`));
    console.log(chalk.yellow(`    This means lines are typically ABOVE predicted scores`));
    console.log(chalk.yellow(`    Model will systematically favor UNDER`));
  } else if (avgZNegative) {
    console.log(chalk.yellow(`\n⚠️  Average Z-score is negative (${avgZScore.toFixed(2)})`));
    console.log(chalk.yellow(`    This means lines are typically BELOW predicted scores`));
    console.log(chalk.yellow(`    Model will systematically favor OVER`));
  } else {
    console.log(chalk.green(`\n✓ Z-scores are well-centered (avg: ${avgZScore.toFixed(2)})`));
  }

  console.log(chalk.bold("\n" + "═".repeat(120) + "\n"));
}

/**
 * NCAAM Moneyline Model Training Script
 *
 * All user-facing configuration is in featuresConfig.json:
 * {
 *   "sport": "ncaam",
 *   "model": "logistic_regression" | "ensemble",
 *   "market": "moneyline",
 *   "seasons": [2023,2024,2025],
 *   "features": { ... },
 *   "rolling_windows": [5,10],
 *   "allowed_providers": [ ... ],
 *   "recency_weighting": { "enabled": true, "decay": 0.5 },
 *   "min_edge": 0.03, // minimum model-vs-market edge to recommend
 *   "min_ev": 0.01    // minimum expected value to recommend
 * }
 *
 * To run new experiments, edit featuresConfig.json only.
 */

function toCSV(rows: any[], columns: string[]): string {
	const header = columns.join(",");
	const data = rows.map(row => columns.map(col => row[col] ?? "").join(",")).join("\n");
	return header + "\n" + data;
}
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Load config ---
const configPath = path.join(__dirname, "featuresConfig.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

const minEdge = config.min_edge ?? 0.03;
const minEV = config.min_ev ?? 0.01;

// Write recommendations to CSV
const recsCsvPath = path.join(__dirname, 'trainNcaamMoneyline.recommendations.csv');
const recsColumns = [
	'game_id','date','home_team','away_team','model_prob_home','model_prob_away','odds_home','odds_away','ev_home','ev_away','edge_home','edge_away','recommended_side','actual','provider'
];
// For each test set game, calculate EV for home and away
type BetRecommendation = {
    game_id: string;
    date: string;
    home_team: string;
    away_team: string;
    model_prob_home: number;
    model_prob_away: number;
    odds_home: number|null;
    odds_away: number|null;
    ev_home: number|null;
    ev_away: number|null;
    edge_home: number|null;
    edge_away: number|null;
    recommended_side: 'home'|'away'|null;
    actual: number|null;
    provider: string;
};

const betRecs: BetRecommendation[] = [];

type BucketResult = {
	bucket: string;
	count: number;
	accuracy: number;
	avg_ev: number;
	avg_edge: number;
	win_count: number;
	loss_count: number;
};

const bucketSize = 0.1;
const buckets: BucketResult[] = [];

// Write bucket calibration to CSV
const bucketCsvPath = path.join(__dirname, 'trainNcaamMoneyline.buckets.csv');
const bucketColumns = ['bucket','count','accuracy','avg_ev','avg_edge','win_count','loss_count'];
fs.writeFileSync(bucketCsvPath, toCSV(buckets, bucketColumns));
console.log(`[trainNcaamMoneyline] Wrote probability bucket calibration CSV to ${bucketCsvPath}`);
// --- Fixed feature helpers ---
function computeWinRate(teamId: string, gameId: string, window: number): number {
	const gamesForTeam = games
		.filter(g => (g.home_team_id === teamId || g.away_team_id === teamId) && g.id < gameId)
		.sort((a, b) => a.date.localeCompare(b.date))
		.slice(-window);
	if (!gamesForTeam.length) return 0;
	let wins = 0;
	for (const g of gamesForTeam) {
		const isHome = g.home_team_id === teamId;
		if (g.home_score == null || g.away_score == null) continue;
		if (isHome && g.home_score > g.away_score) wins++;
		if (!isHome && g.away_score > g.home_score) wins++;
	}
	return wins / gamesForTeam.length;
}
function computeAvgMargin(teamId: string, gameId: string, window: number): number {
	const gamesForTeam = games
		.filter(g => (g.home_team_id === teamId || g.away_team_id === teamId) && g.id < gameId)
		.sort((a, b) => a.date.localeCompare(b.date))
		.slice(-window);
	if (!gamesForTeam.length) return 0;
	let marginSum = 0;
	for (const g of gamesForTeam) {
		const isHome = g.home_team_id === teamId;
		if (g.home_score == null || g.away_score == null) continue;
		marginSum += isHome ? (g.home_score - g.away_score) : (g.away_score - g.home_score);
	}
	return marginSum / gamesForTeam.length;
}
function getMarketImpliedProb(oddsArr: { home: number|null, away: number|null }[]): number|null {
	for (const odds of oddsArr) {
		if (odds.home != null && odds.away != null) {
			const probHome = 1 / (odds.home > 0 ? (odds.home / 100 + 1) : (100 / Math.abs(odds.home) + 1));
			const probAway = 1 / (odds.away > 0 ? (odds.away / 100 + 1) : (100 / Math.abs(odds.away) + 1));
			return probHome / (probHome + probAway);
		}
	}
	return null;
}
// NCAAM Moneyline Model Training Script (Scaffold)
// Reads config, extracts features, computes rolling windows, joins with odds, trains model

import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import Database from "better-sqlite3";
// @ts-ignore

import LogisticRegression from 'ml-logistic-regression';
import { Matrix } from 'ml-matrix';
import { RandomForestClassifier as RFClassifier } from 'ml-random-forest';

const sport = config.sport;
const market = config.market;
const modelType: string = config.model || "logistic_regression";
const seasons: number[] = config.seasons;
const featuresConfig: Record<string, boolean> = config.features;
const rollingWindows: number[] = config.rolling_windows;
const allowedProviders: string[] = config.allowed_providers;

const dbPath = path.join("data", "sportline.db");
const db = new Database(dbPath);


// --- Step 1: Extract games for selected seasons ---

const games = db.prepare(`
	SELECT * FROM games
	WHERE sport = ? AND season IN (${seasons.map(() => '?').join(',')})
	ORDER BY date ASC
`).all(sport, ...seasons) as Array<{
	id: string;
	sport: string;
	date: string;
	season: number;
	home_team_id: string;
	away_team_id: string;
	home_score: number|null;
	away_score: number|null;
}>;

// Log the first 10 games to file for debugging
// const gamesLogPath = path.join(__dirname, 'trainNcaamMoneyline.games.log.json');
// fs.writeFileSync(
//     gamesLogPath,
//     JSON.stringify(games.slice(0, 10), null, 2)
// );
// console.log(`[trainNcaamMoneyline] Wrote first 10 games to ${gamesLogPath}`);

// --- Step 2: Extract and pivot game_stats for all games/teams ---
const enabledFeatures = Object.entries(featuresConfig).filter(([k, v]) => v).map(([k]) => k);
const gameStatsRows = db.prepare(`
	SELECT game_id, team_id, metric_name, metric_value
	FROM game_stats
	WHERE sport = ? AND season IN (${seasons.map(() => '?').join(',')})
		AND metric_name IN (${enabledFeatures.map(() => '?').join(',')})
	ORDER BY team_id, game_id
`).all(sport, ...seasons, ...enabledFeatures) as Array<{
	game_id: string;
	team_id: string;
	metric_name: string;
	metric_value: string | number;
}>;

// Pivot stats: { team_id: { game_id: { metric_name: value } } }
const teamGameStats: Record<string, Record<string, Record<string, number>>> = {};
for (const row of gameStatsRows) {
	if (!teamGameStats[row.team_id]) teamGameStats[row.team_id] = {};
	if (!teamGameStats[row.team_id][row.game_id]) teamGameStats[row.team_id][row.game_id] = {};
	teamGameStats[row.team_id][row.game_id][row.metric_name] = Number(row.metric_value);
}


// Allow config to specify recency weighting and decay
const useExponentialRecency: boolean = config.recency_weighting?.enabled ?? true;
const recencyDecay: number = config.recency_weighting?.decay ?? 0.7;

function computeRollingAverages(
	statsByGame: Record<string, Record<string, number>>,
	gameOrder: string[],
	windows: number[]
): Record<string, Record<string, number>> {
	// Returns: { game_id: { stat_window: value } }
	const result: Record<string, Record<string, number>> = {};
	for (let i = 0; i < gameOrder.length; ++i) {
		const gid = gameOrder[i];
		result[gid] = {};
		for (const stat of enabledFeatures) {
			for (const w of windows) {
				const prevGames = gameOrder.slice(Math.max(0, i - w), i);
				const vals = prevGames.map(g => statsByGame[g]?.[stat]).filter(v => v !== undefined);
				let avg = 0;
				if (vals.length) {
					if (useExponentialRecency) {
						// Use exponential recency weighting (most recent first)
						const weights = getExponentialWeights(vals.length, recencyDecay);
						avg = weightedAverage(vals, weights); // vals are already in chronological order, weights are reversed
					} else {
						avg = vals.reduce((a, b) => a + b, 0) / vals.length;
					}
				}
				result[gid][`${stat}_avg_${w}`] = avg;
			}
		}
	}
	return result;
}

// For each team, compute rolling averages for each game
const teamRollingStats: Record<string, Record<string, Record<string, number>>> = {};
for (const teamId of Object.keys(teamGameStats)) {
	// Get games in chronological order for this team
	const gameIds = Object.keys(teamGameStats[teamId]).sort();
	teamRollingStats[teamId] = computeRollingAverages(teamGameStats[teamId], gameIds, rollingWindows);
}

// --- Step 4: Join with odds and build dataset ---
// Helper: get odds for a game from allowed providers
function getMoneylineOdds(gameId: string): { provider: string, home: number|null, away: number|null }[] {
	let oddsRows = db.prepare(`
		SELECT provider, price_home, price_away
		FROM odds
		WHERE game_id = ? AND market = 'moneyline' AND provider IN (${allowedProviders.map(() => '?').join(',')})
	`).all(gameId, ...allowedProviders);
	if (!oddsRows.length) {
		// Fallback: try any provider
		oddsRows = db.prepare(`
			SELECT provider, price_home, price_away
			FROM odds
			WHERE game_id = ? AND market = 'moneyline'
		`).all(gameId);
	}
	return oddsRows.map((row: any) => ({
		provider: row.provider,
		home: row.price_home ?? null,
		away: row.price_away ?? null
	}));
}

// Build dataset rows
type DatasetRow = {
	game_id: string;
	season: number;
	date: string;
	home_team: string;
	away_team: string;
	features: Record<string, number>; // always number, never null
	odds: { provider: string, home: number|null, away: number|null }[];
	target: number|null;
};


// First pass: collect all feature values for mean imputation, with skip logging
const featureSums: Record<string, number> = {};
const featureCounts: Record<string, number> = {};
const tempRows: Array<{ features: Record<string, number|null> }> = [];
let skipNoRollingStats = 0;
let skipNoOdds = 0;
let totalGames = 0;
const skippedNoOddsHomeWins: any[] = [];
const skippedNoOddsAwayWins: any[] = [];
const skippedRollingStatsGames: any[] = [];
const skippedOddsGames: any[] = [];

for (const game of games) {
	totalGames++;
	const gameObj = game as {
		id: string;
		sport: string;
		date: string;
		season: number;
		home_team_id: string;
		away_team_id: string;
		home_score: number|null;
		away_score: number|null;
	};
	if (!teamRollingStats[gameObj.home_team_id]?.[gameObj.id] || !teamRollingStats[gameObj.away_team_id]?.[gameObj.id]) {
		skipNoRollingStats++;
		skippedRollingStatsGames.push({
			game_id: gameObj.id,
			date: gameObj.date,
			home_team: gameObj.home_team_id,
			away_team: gameObj.away_team_id,
			home_score: gameObj.home_score,
			away_score: gameObj.away_score
		});
		continue;
	}
	const oddsArr = getMoneylineOdds(gameObj.id);
	if (!oddsArr.length) {
		skipNoOdds++;
		// Log up to 10 skipped home wins and 10 away wins with their available odds providers
		const oddsRowsFull = db.prepare(`
			SELECT * FROM odds WHERE game_id = ? AND market = 'moneyline'
		`).all(gameObj.id);
		skippedOddsGames.push({
			game_id: gameObj.id,
			date: gameObj.date,
			home_team: gameObj.home_team_id,
			away_team: gameObj.away_team_id,
			home_score: gameObj.home_score,
			away_score: gameObj.away_score,
			oddsRows: oddsRowsFull
		});
		if (gameObj.home_score !== null && gameObj.away_score !== null) {
			const oddsProviders = oddsRowsFull.map((row: any) => row.provider);
			if (gameObj.home_score > gameObj.away_score && skippedNoOddsHomeWins.length < 10) {
				skippedNoOddsHomeWins.push({
					game_id: gameObj.id,
					date: gameObj.date,
					home_team: gameObj.home_team_id,
					away_team: gameObj.away_team_id,
					home_score: gameObj.home_score,
					away_score: gameObj.away_score,
					oddsProviders,
					oddsRows: oddsRowsFull
				});
			}
			if (gameObj.away_score > gameObj.home_score && skippedNoOddsAwayWins.length < 10) {
				skippedNoOddsAwayWins.push({
					game_id: gameObj.id,
					date: gameObj.date,
					home_team: gameObj.home_team_id,
					away_team: gameObj.away_team_id,
					home_score: gameObj.home_score,
					away_score: gameObj.away_score,
					oddsProviders,
					oddsRows: oddsRowsFull
				});
			}
		}
		continue;
	}
	// ...existing feature collection logic...
	const features: Record<string, number|null> = {};
	for (const stat of enabledFeatures) {
		for (const w of rollingWindows) {
			const homeKey = `home_${stat}_avg_${w}`;
			const awayKey = `away_${stat}_avg_${w}`;
			const homeVal = teamRollingStats[gameObj.home_team_id][gameObj.id][`${stat}_avg_${w}`];
			const awayVal = teamRollingStats[gameObj.away_team_id][gameObj.id][`${stat}_avg_${w}`];
			features[homeKey] = homeVal ?? null;
			features[awayKey] = awayVal ?? null;
			if (homeVal !== null && homeVal !== undefined) {
				featureSums[homeKey] = (featureSums[homeKey] ?? 0) + homeVal;
				featureCounts[homeKey] = (featureCounts[homeKey] ?? 0) + 1;
			}
			if (awayVal !== null && awayVal !== undefined) {
				featureSums[awayKey] = (featureSums[awayKey] ?? 0) + awayVal;
				featureCounts[awayKey] = (featureCounts[awayKey] ?? 0) + 1;
			}
		}
	}
	tempRows.push({ features });
}


// Write all skip logs to file for easier inspection
// const skipLogPath = path.join(__dirname, 'trainNcaamMoneyline.skips.log.json');
// const skipLogObj = {
// 	totalGames,
// 	skipNoRollingStats,
// 	skipNoOdds,
// 	skippedRollingStatsGames,
// 	skippedOddsGames,
// 	skippedNoOddsHomeWins,
// 	skippedNoOddsAwayWins
// };
// fs.writeFileSync(skipLogPath, JSON.stringify(skipLogObj, null, 2));
console.log(`[trainNcaamMoneyline] Total games: ${totalGames}`);
console.log(`[trainNcaamMoneyline] Skipped (no rolling stats): ${skipNoRollingStats}`);
console.log(`[trainNcaamMoneyline] Skipped (no odds): ${skipNoOdds}`);
// console.log(`[trainNcaamMoneyline] Wrote skip details to ${skipLogPath}`);

// Compute means for each feature
const featureMeans: Record<string, number> = {};
for (const key of Object.keys(featureSums)) {
	featureMeans[key] = featureSums[key] / featureCounts[key];
}


// Second pass: build dataset with imputed means, only including enabled features
const dataset: DatasetRow[] = [];
let rowIdx = 0;

for (const game of games) {
	const g = game as {
		id: string;
		sport: string;
		date: string;
		season: number;
		home_team_id: string;
		away_team_id: string;
		home_score: number|null;
		away_score: number|null;
	};
	const homeId = g.home_team_id;
	const awayId = g.away_team_id;
	const gid = g.id;
	if (!teamRollingStats[homeId]?.[gid] || !teamRollingStats[awayId]?.[gid]) continue;
	const oddsArr = getMoneylineOdds(gid);
	if (!oddsArr.length) continue;
	// Only include enabled rolling stat features
	const features: Record<string, number> = {};
	const tempFeatures = tempRows[rowIdx].features;
	// Only include keys for enabled features (rolling stat features)
	for (const stat of enabledFeatures) {
		for (const w of rollingWindows) {
			const homeKey = `home_${stat}_avg_${w}`;
			const awayKey = `away_${stat}_avg_${w}`;
			if (homeKey in tempFeatures) {
				features[homeKey] = tempFeatures[homeKey] !== null && tempFeatures[homeKey] !== undefined ? tempFeatures[homeKey]! : featureMeans[homeKey];
			}
			if (awayKey in tempFeatures) {
				features[awayKey] = tempFeatures[awayKey] !== null && tempFeatures[awayKey] !== undefined ? tempFeatures[awayKey]! : featureMeans[awayKey];
			}
		}
	}
	// --- Add fixed features if enabled in config ---
	// Compute all fixed features
	const marketImpliedProbVal = getMarketImpliedProb(oddsArr);
	if (featuresConfig["marketImpliedProb"] && marketImpliedProbVal === null) {
		// Skip this game if marketImpliedProb is required but missing
		continue;
	}
	const fixedFeatureValues: Record<string, number> = {
		homeWinRate5: computeWinRate(homeId, gid, 5),
		awayWinRate5: computeWinRate(awayId, gid, 5),
		homeAvgMargin5: computeAvgMargin(homeId, gid, 5),
		awayAvgMargin5: computeAvgMargin(awayId, gid, 5),
		homeWinRate10: computeWinRate(homeId, gid, 10),
		awayWinRate10: computeWinRate(awayId, gid, 10),
		homeAdvantage: 0, // set below
		marketImpliedProb: marketImpliedProbVal ?? 0
	};
	fixedFeatureValues.homeAdvantage = fixedFeatureValues.homeWinRate5 - fixedFeatureValues.awayWinRate5;
	// Only add if enabled in config
	for (const key of Object.keys(fixedFeatureValues)) {
		if (featuresConfig[key]) {
			features[key] = fixedFeatureValues[key];
		}
	}
	let target: number|null = null;
	if (g.home_score !== null && g.away_score !== null) {
		const homeWin = g.home_score > g.away_score;
		target = homeWin ? 1 : 0;
	}
	dataset.push({
		game_id: gid,
		season: g.season,
		date: g.date,
		home_team: homeId,
		away_team: awayId,
		features,
		odds: oddsArr,
		target
	});
	rowIdx++;
}



console.log(`[trainNcaamMoneyline] Prepared dataset with ${dataset.length} games.`);
if (dataset.length === 0) {
	console.error('[trainNcaamMoneyline] ERROR: No games available in dataset after filtering/skipping. Check your config and data.');
	process.exit(1);
}

// --- Step 5: Model training and evaluation ---
// We'll use ml-logistic-regression (npm install ml-logistic-regression ml-matrix)




// Build featureKeys from the first dataset row (which is constructed using only enabled features)
// This ensures the order and presence matches the config exactly
const featureKeys = Object.keys(dataset[0].features);
const X: number[][] = dataset.map(row => featureKeys.map(k => row.features[k]));
const y = dataset.map(row => row.target ?? 0); // Should filter out nulls, but for now use 0

// Optionally, filter out rows with null target

const filtered = dataset.filter(row => row.target !== null);
// Ensure all features are numbers (no nulls)
const Xf: number[][] = filtered.map(row =>
	featureKeys.map(k => {
		const v = row.features[k];
		// Defensive: if any nulls remain, impute with featureMeans
		return v !== null && v !== undefined ? v : featureMeans[k];
	})
);
const yf = filtered.map(row => row.target!);

// Split into train/test (80/20)

const splitIdx = Math.floor(0.8 * Xf.length);
const X_train: number[][] = Xf.slice(0, splitIdx);
const y_train = yf.slice(0, splitIdx);
const X_test: number[][] = Xf.slice(splitIdx);
const y_test = yf.slice(splitIdx);


let y_pred_prob: number[] = [];
let y_pred: number[] = [];
let accuracy = 0;
let modelUsed = modelType;

if (modelType === "ensemble") {
	// Use Random Forest Classifier
	const rf = new RFClassifier({
		nEstimators: 100,
		maxFeatures: Math.floor(Math.sqrt(featureKeys.length)),
		replacement: true,
		seed: 42
	});
	rf.train(X_train, y_train);
	y_pred = rf.predict(X_test);
	// Estimate probability as the proportion of trees voting for class 1
	// ml-random-forest does not provide predictProba, so we approximate
	let nSamples = X_test.length;
	if (Array.isArray(rf.estimators) && rf.estimators.length > 0) {
		const allPredictions = rf.estimators.map(tree => tree.predict(X_test)); // shape: [nTrees][nSamples]
		const nTrees = allPredictions.length;
		y_pred_prob = Array(nSamples).fill(0).map((_, i) => {
			let votesFor1 = 0;
			for (let t = 0; t < nTrees; ++t) {
				if (allPredictions[t][i] === 1) votesFor1++;
			}
			return votesFor1 / nTrees;
		});
	} else {
		// Fallback: assign 0.5 probability if estimators are missing
		y_pred_prob = Array(nSamples).fill(0.5);
	}
	accuracy = y_pred.filter((p, i) => p === y_test[i]).length / y_test.length;
	modelUsed = "ensemble (RandomForest)";
} else {
	// Default: Logistic Regression
	const logreg = new LogisticRegression({ numSteps: 1000, learningRate: 5e-3 });
	// ml-logistic-regression expects y to be a column vector Matrix
	const y_train_matrix = Matrix.columnVector(y_train);
	logreg.train(new Matrix(X_train), y_train_matrix);
	y_pred_prob = logreg.predict(new Matrix(X_test));
	y_pred = y_pred_prob.map((p: number) => (p >= 0.5 ? 1 : 0));
	accuracy = y_pred.filter((p: number, i: number) => p === y_test[i]).length / y_test.length;
	modelUsed = "logistic_regression";
}


// --- Debug: Print and log class distributions and sample predictions ---
function countClasses(arr: number[]): Record<string, number> {
	return arr.reduce((acc, v) => {
		 acc[v] = (acc[v] || 0) + 1;
		 return acc;
	}, {} as Record<string, number>);
}

const classCounts = {
	full: countClasses(filtered.map(row => row.target!)),
	train: countClasses(y_train),
	test: countClasses(y_test)
};

// --- EV Calculation and Bet Recommendation ---
// Helper: Convert American odds to decimal payout (profit per $1 staked)
function americanToDecimal(odds: number): number {
    if (odds > 0) return 1 + odds / 100;
    else return 1 + 100 / Math.abs(odds);
}



for (let i = 0; i < X_test.length; ++i) {
    const testRow = X_test[i];
    const datasetIdx = splitIdx + i;
    const row = dataset[datasetIdx];
    const oddsArr = row.odds;
    // Use first available odds provider for simplicity
    const odds = oddsArr[0] || { home: null, away: null, provider: '' };
    const odds_home = odds.home;
    const odds_away = odds.away;
    const provider = odds.provider;
    // Model probabilities
    const model_prob_home = y_pred_prob[i];
    const model_prob_away = 1 - model_prob_home;
    // EV calculation
    let ev_home: number|null = null, ev_away: number|null = null;
    let edge_home: number|null = null, edge_away: number|null = null;
    if (odds_home !== null && odds_away !== null) {
	 const payout_home = americanToDecimal(odds_home);
	 const payout_away = americanToDecimal(odds_away);
	 ev_home = model_prob_home * (payout_home - 1) - (1 - model_prob_home);
	 ev_away = model_prob_away * (payout_away - 1) - (1 - model_prob_away);
	 // Market implied probabilities
	 const implied_home = odds_home > 0 ? 100 / (odds_home + 100) : Math.abs(odds_home) / (Math.abs(odds_home) + 100);
	 const implied_away = odds_away > 0 ? 100 / (odds_away + 100) : Math.abs(odds_away) / (Math.abs(odds_away) + 100);
	 edge_home = model_prob_home - implied_home;
	 edge_away = model_prob_away - implied_away;
    }
    // Recommendation logic
    let recommended_side: 'home'|'away'|null = null;
    if (ev_home !== null && ev_home > minEV && edge_home !== null && edge_home > minEdge) recommended_side = 'home';
    else if (ev_away !== null && ev_away > minEV && edge_away !== null && edge_away > minEdge) recommended_side = 'away';
    betRecs.push({
	 game_id: row.game_id,
	 date: row.date,
	 home_team: row.home_team,
	 away_team: row.away_team,
	 model_prob_home,
	 model_prob_away,
	 odds_home,
	 odds_away,
	 ev_home,
	 ev_away,
	 edge_home,
	 edge_away,
	 recommended_side,
	 actual: row.target,
	 provider
    });
}


// Output recommendations to file
const recsPath = path.join(__dirname, 'trainNcaamMoneyline.recommendations.json');
fs.writeFileSync(recsPath, JSON.stringify(betRecs, null, 2));
console.log(`[trainNcaamMoneyline] Wrote bet recommendations to ${recsPath}`);

// --- Probability Bucketing and Calibration Logging ---

for (let b = 0; b < 1; b += bucketSize) {
	const lower = b;
	const upper = b + bucketSize;
	const label = `${Math.round(lower*100)}-${Math.round(upper*100)}`;
	const inBucket = betRecs.filter(r => r.model_prob_home >= lower && r.model_prob_home < upper);
	if (inBucket.length === 0) continue;
	const win_count = inBucket.filter(r => r.actual === 1).length;
	const loss_count = inBucket.filter(r => r.actual === 0).length;
	const accuracy = win_count / inBucket.length;
	const avg_ev = inBucket.reduce((sum, r) => sum + (r.ev_home ?? 0), 0) / inBucket.length;
	const avg_edge = inBucket.reduce((sum, r) => sum + (r.edge_home ?? 0), 0) / inBucket.length;
	buckets.push({
		bucket: label,
		count: inBucket.length,
		accuracy,
		avg_ev,
		avg_edge,
		win_count,
		loss_count
	});
}

const bucketLogPath = path.join(__dirname, 'trainNcaamMoneyline.buckets.json');
fs.writeFileSync(bucketLogPath, JSON.stringify(buckets, null, 2));
console.log(`[trainNcaamMoneyline] Wrote probability bucket calibration to ${bucketLogPath}`);

// Log to file for inspection (unchanged)
const logPath = path.join(__dirname, 'trainNcaamMoneyline.log.json');
const logObj = {
	classCounts,
	samplePredictions: [] as any[],
	featureDebug: {
		 featureKeys: featureKeys,
		 firstTrainRow: X_train[0],
		 firstTestRow: X_test[0],
		 featureKeysLength: featureKeys.length,
		 XTrainRowLength: X_train[0]?.length,
		 XTestRowLength: X_test[0]?.length
	}
};
for (let i = 0; i < Math.min(10, y_test.length); ++i) {
	const entry = {
		 pred_prob: y_pred_prob[i],
		 pred: y_pred[i],
		 actual: y_test[i],
		 features: X_test[i]
	};
	logObj.samplePredictions.push(entry);
}
fs.writeFileSync(logPath, JSON.stringify(logObj, null, 2));
// No console.log here; all debug goes to file

function logLoss(yTrue: number[], yProb: number[]): number {
	let loss = 0;
	for (let i = 0; i < yTrue.length; ++i) {
		const p = Math.max(Math.min(yProb[i], 1 - 1e-15), 1e-15);
		loss += yTrue[i] * Math.log(p) + (1 - yTrue[i]) * Math.log(1 - p);
	}
	return -loss / yTrue.length;
}

const logloss = logLoss(y_test, y_pred_prob);

console.log(`[trainNcaamMoneyline] Test accuracy: ${(accuracy * 100).toFixed(2)}%`);
console.log(`[trainNcaamMoneyline] Test log loss: ${logloss.toFixed(4)}`);

// --- Append summary log for this run as a JSON array ---
const summaryLogPath = path.join(__dirname, 'trainNcaamMoneyline.runs.log.json');
const summary = {
	timestamp: new Date().toISOString(),
	config: {
		sport,
		market,
		model: modelUsed,
		seasons,
		features: Object.fromEntries(Object.entries(featuresConfig).filter(([k, v]) => v)),
		rolling_windows: rollingWindows,
		allowed_providers: allowedProviders,
		recency_weighting: {
			enabled: config.recency_weighting?.enabled ?? true,
			decay: config.recency_weighting?.decay ?? 0.7
		}
    },
    dataset: {
        totalGames,
        usedGames: dataset.length,
        skippedNoRollingStats: skipNoRollingStats,
        skippedNoOdds: skipNoOdds
    },
    results: {
        accuracy: Number((accuracy * 100).toFixed(2)),
        logLoss: Number(logloss.toFixed(4)),
        classCounts
    }
};
let runLogArr = [];
if (fs.existsSync(summaryLogPath)) {
	try {
		const fileData = fs.readFileSync(summaryLogPath, 'utf8');
		runLogArr = JSON.parse(fileData);
		if (!Array.isArray(runLogArr)) runLogArr = [];
	} catch (e) {
		runLogArr = [];
	}
}
runLogArr.push(summary);
fs.writeFileSync(summaryLogPath, JSON.stringify(runLogArr, null, 2));
console.log(`[trainNcaamMoneyline] Appended summary to ${summaryLogPath}`);


// recencyWeights.ts
// Utility for generating and applying exponential recency weights for rolling stats

/**
 * Generate exponential recency weights for a given window size.
 * @param {number} window - Number of games in the rolling window
 * @param {number} decay - Decay rate (0 < decay < 1, e.g. 0.7)
 * @returns {number[]} Array of weights (most recent first)
 */
function getExponentialWeights(window: number, decay: number = 0.7): number[] {
  const weights = [];
  for (let i = 0; i < window; i++) {
    weights.push(Math.pow(decay, i));
  }
  // Reverse so most recent game gets highest weight
  return weights.reverse();
}

/**
 * Compute a weighted average using provided values and weights.
 * @param {number[]} values - Array of values (most recent first)
 * @param {number[]} weights - Array of weights (same length as values)
 * @returns {number} Weighted average
 */
function weightedAverage(values: number[], weights: number[]): number {
  if (values.length === 0) return 0;
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  return values.reduce((sum, v, i) => sum + v * weights[i], 0) / totalWeight;
}

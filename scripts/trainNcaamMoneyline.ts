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
	if (!oddsArr.length) return null;
	const odds = oddsArr[0];
	if (odds.home == null || odds.away == null) return null;
	const probHome = 1 / (odds.home > 0 ? (odds.home / 100 + 1) : (100 / Math.abs(odds.home) + 1));
	const probAway = 1 / (odds.away > 0 ? (odds.away / 100 + 1) : (100 / Math.abs(odds.away) + 1));
	return probHome / (probHome + probAway);
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

// --- Load config ---

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configPath = path.join(__dirname, "ncaam_moneyline_features.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

const sport = config.sport;
const market = config.market;
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
const gamesLogPath = path.join(__dirname, 'trainNcaamMoneyline.games.log.json');
fs.writeFileSync(
    gamesLogPath,
    JSON.stringify(games.slice(0, 10), null, 2)
);
console.log(`[trainNcaamMoneyline] Wrote first 10 games to ${gamesLogPath}`);

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

// --- Step 3: Compute rolling averages for each stat (5, 10 games) ---
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
				// Use 0 if no previous games (so always returns number)
				const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
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
const skipLogPath = path.join(__dirname, 'trainNcaamMoneyline.skips.log.json');
const skipLogObj = {
	totalGames,
	skipNoRollingStats,
	skipNoOdds,
	skippedRollingStatsGames,
	skippedOddsGames,
	skippedNoOddsHomeWins,
	skippedNoOddsAwayWins
};
fs.writeFileSync(skipLogPath, JSON.stringify(skipLogObj, null, 2));
console.log(`[trainNcaamMoneyline] Total games: ${totalGames}`);
console.log(`[trainNcaamMoneyline] Skipped (no rolling stats): ${skipNoRollingStats}`);
console.log(`[trainNcaamMoneyline] Skipped (no odds): ${skipNoOdds}`);
console.log(`[trainNcaamMoneyline] Wrote skip details to ${skipLogPath}`);

// Compute means for each feature
const featureMeans: Record<string, number> = {};
for (const key of Object.keys(featureSums)) {
	featureMeans[key] = featureSums[key] / featureCounts[key];
}

// Second pass: build dataset with imputed means
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
	// Use features from tempRows, impute nulls with mean
	const features: Record<string, number> = {};
	const tempFeatures = tempRows[rowIdx].features;
	for (const key of Object.keys(tempFeatures)) {
		features[key] = tempFeatures[key] !== null && tempFeatures[key] !== undefined ? tempFeatures[key]! : featureMeans[key];
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


// Prepare X (features) and y (target)
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

// Train logistic regression

const logreg = new LogisticRegression({ numSteps: 1000, learningRate: 5e-3 });
// ml-logistic-regression expects y to be a column vector Matrix
const y_train_matrix = Matrix.columnVector(y_train);
logreg.train(new Matrix(X_train), y_train_matrix);

// Predict and evaluate
const y_pred_prob = logreg.predict(new Matrix(X_test));

const y_pred = y_pred_prob.map((p: number) => (p >= 0.5 ? 1 : 0));
const accuracy = y_pred.filter((p: number, i: number) => p === y_test[i]).length / y_test.length;

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
// console.log("[trainNcaamMoneyline] Class distribution:", classCounts);

// Log to file for inspection
const logPath = path.join(__dirname, 'trainNcaamMoneyline.log.json');
const logObj = {
	classCounts,
	samplePredictions: [] as any[]
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
console.log(`[trainNcaamMoneyline] Wrote debug log to ${logPath}`);

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
		seasons,
		features: Object.fromEntries(Object.entries(featuresConfig).filter(([k, v]) => v)),
		rolling_windows: rollingWindows,
		allowed_providers: allowedProviders
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

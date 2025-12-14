import fetch from "node-fetch";
import fs from "fs";
import path from "path";

// League configurations
interface LeagueConfig {
	name: string;
	teamsApiBase: string;
	scheduleApi: (teamId: string, season: number) => string;
	teamStatsApi: (teamId: string, season: number) => string;
	gameSummaryApi: (eventId: string) => string;
	oddsApi: (eventId: string) => string;
}

const LEAGUES: Record<string, LeagueConfig> = {
	ncaam: {
		name: "ncaam",
		teamsApiBase: "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams",
		scheduleApi: (teamId: string, season: number) =>
			`https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/${teamId}/schedule?season=${season}`,
		teamStatsApi: (teamId: string, season: number) =>
			`https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/${teamId}/statistics?season=${season}`,
		gameSummaryApi: (eventId: string) =>
			`https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary?event=${eventId}`,
		oddsApi: (eventId: string) =>
			`https://sports.core.api.espn.com/v2/sports/basketball/leagues/mens-college-basketball/events/${eventId}/competitions/${eventId}/odds`
	},
	nba: {
		name: "nba",
		teamsApiBase: "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams",
		scheduleApi: (teamId: string, season: number) =>
			`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${teamId}/schedule?season=${season}`,
		teamStatsApi: (teamId: string, season: number) =>
			`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${teamId}/statistics?season=${season}`,
		gameSummaryApi: (eventId: string) =>
			`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${eventId}`,
		oddsApi: (eventId: string) =>
			`https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/events/${eventId}/competitions/${eventId}/odds`
	}
};

// Simple concurrency limiter
async function asyncPool(poolLimit: number, array: any[], iteratorFn: (item: any, idx: number, arr: any[]) => Promise<any>) {
	const ret: any[] = [];
	const executing: Promise<any>[] = [];
	for (const [i, item] of array.entries()) {
		const p = Promise.resolve().then(() => iteratorFn(item, i, array));
		ret.push(p);
		if (poolLimit <= array.length) {
			const e: Promise<any> = p.then(() => executing.splice(executing.indexOf(e), 1));
			executing.push(e);
			if (executing.length >= poolLimit) {
				await Promise.race(executing);
			}
		}
	}
	return Promise.all(ret);
}

async function fetchTeamStats(teamId: string, season: number, league: LeagueConfig) {
	const url = league.teamStatsApi(teamId, season);
	const res = await fetch(url);
	if (res.status === 404) {
		// Log missing teamId to a file for later review
		const logPath = path.join("data", league.name, String(season), "missing_team_stats.log");
		fs.appendFileSync(logPath, `${teamId}\n`);
		return null;
	}
	if (!res.ok) throw new Error(`Failed to fetch stats for team ${teamId}: ${res.status}`);
	const data = await res.json();
	return data;
}

async function fetchGameOdds(eventId: string, league: LeagueConfig) {
	const url = league.oddsApi(eventId);
	const res = await fetch(url);
	if (!res.ok) return null;
	const data = (await res.json()) as any;
	// Return the items array or empty
	return Array.isArray(data.items) ? data.items : [];
}

async function fetchGameStats(eventId: string, league: LeagueConfig) {
	const url = league.gameSummaryApi(eventId);
	const res = await fetch(url);
	if (!res.ok) return null;
	const data = (await res.json()) as any;
	// Extract team box score stats if available
	if (!data.boxscore || !data.boxscore.teams) return null;
	return data.boxscore.teams;
}

async function fetchTeamSchedule(teamId: string, season: number, league: LeagueConfig) {
	const url = league.scheduleApi(teamId, season);
	const res = await fetch(url);
	if (!res.ok) throw new Error(`Failed to fetch schedule for team ${teamId}: ${res.status}`);
	const data = await res.json();
	// Type guard for 'events' property
	const events = (data && typeof data === "object" && "events" in data) ? (data as any).events : [];
	return events;
}

async function processAllTeams(season: number, league: LeagueConfig) {
	const outDir = path.join("data", league.name, String(season));
	if (!fs.existsSync(outDir)) {
		fs.mkdirSync(outDir, { recursive: true });
	}
	const teamsFile = path.join(outDir, "teams.json");
	const gamesFile = path.join(outDir, "games.json");
	const seasonStatsFile = path.join(outDir, "season_stats.json");
	const oddsFile = path.join(outDir, "odds.json");
	const gameStatsFile = path.join(outDir, "game_stats.json");

	// 1. Fetch all teams and write teams.json
	console.log(`Fetching all ${league.name.toUpperCase()} teams and writing teams.json...`);
	const url = `${league.teamsApiBase}?limit=400&offset=0`;
	const res = await fetch(url);
	if (!res.ok) throw new Error(`Failed to fetch teams: ${res.status}`);
	const data = await res.json();
	const sports = (data && typeof data === "object" && "sports" in data) ? (data as any).sports : [];
	const teams = sports?.[0]?.leagues?.[0]?.teams?.map((t: any) => t.team) || [];

	// Write teams.json (deduped, minimal fields)
	const seenTeamIds = new Set();
	const teamsOut = [];
	for (const team of teams) {
		if (seenTeamIds.has(team.id)) continue;
		seenTeamIds.add(team.id);
		teamsOut.push({
			teamId: team.id,
			teamName: team.name,
			abbreviation: team.abbreviation,
			displayName: team.displayName,
			shortDisplayName: team.shortDisplayName
		});
	}
	fs.writeFileSync(teamsFile, JSON.stringify(teamsOut, null, 2));
	console.log(`Wrote ${teamsOut.length} teams to ${teamsFile}`);

	// 2. Read teams.json and process each team for stats, schedules, odds, and game stats
	console.log(`Processing ${league.name.toUpperCase()} teams for stats, schedules, odds, and game stats...`);
	const teamsToProcess = JSON.parse(fs.readFileSync(teamsFile, "utf-8"));

	// Start JSON arrays for downstream files
	fs.writeFileSync(gamesFile, "[\n");
	fs.writeFileSync(seasonStatsFile, "[\n");
	fs.writeFileSync(oddsFile, "[\n");
	fs.writeFileSync(gameStatsFile, "[\n");

	let firstGame = true;
	let firstStat = true;
	let gamesSeen = new Set();
	let oddsSeen = new Set();
	let totalGames = 0;
	let totalOdds = 0;
	let totalGameStats = 0;
	let firstOdds = true;
	let firstGameStat = true;
	const seenTeamStats = new Set();

	await asyncPool(5, teamsToProcess, async (team: any) => {
		// Fetch schedule and stats in parallel
		const [schedule, statsRaw] = await Promise.all([
			fetchTeamSchedule(team.teamId, season, league),
			fetchTeamStats(team.teamId, season, league)
		]);
		const statsObj = statsRaw as any;
		let stats = null;
		try {
			const categories = (statsObj.results?.stats?.categories || []).map((cat: any) => ({
				name: cat.name,
				abbreviation: cat.abbreviation,
				stats: (cat.stats || []).map((s: any) => ({
					name: s.name,
					abbreviation: s.abbreviation,
					value: s.value
				}))
			}));
			stats = { categories };
		} catch (e) {
			stats = null;
		}

		if (!seenTeamStats.has(team.teamId)) {
			const statData = { teamId: team.teamId, stats };
			if (!firstStat) {
				fs.appendFileSync(seasonStatsFile, ",\n");
			}
			fs.appendFileSync(seasonStatsFile, JSON.stringify(statData, null, 2));
			firstStat = false;
			seenTeamStats.add(team.teamId);
		}

		const trimmedSchedule = schedule.map((game: any) => {
			const comp = game.competitions?.[0];
			const home = comp?.competitors?.find((c: any) => c.homeAway === "home");
			const away = comp?.competitors?.find((c: any) => c.homeAway === "away");
			return {
				id: game.id,
				date: game.date,
				homeTeamId: home?.team?.id,
				homeTeamAbbr: home?.team?.abbreviation,
				homeScore: home?.score?.value ? Number(home.score.value) : (home?.score ? Number(home.score) : null),
				awayTeamId: away?.team?.id,
				awayTeamAbbr: away?.team?.abbreviation,
				awayScore: away?.score?.value ? Number(away.score.value) : (away?.score ? Number(away.score) : null),
				status: comp?.status?.type?.state || null
			};
		});

		await asyncPool(5, trimmedSchedule, async (game: any) => {
			if (gamesSeen.has(game.id)) return;
			gamesSeen.add(game.id);
			const gameJson = JSON.stringify(game, null, 2);
			if (!firstGame) {
				fs.appendFileSync(gamesFile, ",\n");
			}
			fs.appendFileSync(gamesFile, gameJson);
			firstGame = false;
			totalGames++;
			if (totalGames % 500 === 0) {
				console.log(`[Progress] Processed ${totalGames} games so far...`);
			}

			const [oddsArr, gameStatsArr] = await Promise.all([
				oddsSeen.has(game.id) ? [] : fetchGameOdds(game.id, league),
				fetchGameStats(game.id, league)
			]);
			if (!oddsSeen.has(game.id) && Array.isArray(oddsArr)) {
				for (const odds of oddsArr) {
					// Write one object per market with a 'market' field
					// Spread market
					if (odds.spread !== undefined && odds.spread !== null) {
						const spreadOdds = {
							eventId: game.id,
							provider: odds.provider?.name || odds.provider,
							market: "spread",
							value: odds.spread,
							homeTeamOdds: odds.homeTeamOdds?.spreadOdds ?? null,
							awayTeamOdds: odds.awayTeamOdds?.spreadOdds ?? null
						};
						const spreadJson = JSON.stringify(spreadOdds, null, 2);
						if (!firstOdds) {
							fs.appendFileSync(oddsFile, ",\n");
						}
						fs.appendFileSync(oddsFile, spreadJson);
						firstOdds = false;
						totalOdds++;
					}
					// Total market
					if (odds.overUnder !== undefined && odds.overUnder !== null) {
						const totalOddsObj = {
							eventId: game.id,
							provider: odds.provider?.name || odds.provider,
							market: "total",
							value: odds.overUnder,
							overOdds: odds.overOdds ?? null,
							underOdds: odds.underOdds ?? null
						};
						const totalJson = JSON.stringify(totalOddsObj, null, 2);
						if (!firstOdds) {
							fs.appendFileSync(oddsFile, ",\n");
						}
						fs.appendFileSync(oddsFile, totalJson);
						firstOdds = false;
						totalOdds++;
					}
					// Moneyline market
					if ((odds.homeTeamOdds?.moneyLine !== undefined && odds.homeTeamOdds?.moneyLine !== null) ||
						(odds.awayTeamOdds?.moneyLine !== undefined && odds.awayTeamOdds?.moneyLine !== null)) {
						const moneylineOdds = {
							eventId: game.id,
							provider: odds.provider?.name || odds.provider,
							market: "moneyline",
							homeTeamOdds: odds.homeTeamOdds?.moneyLine ?? null,
							awayTeamOdds: odds.awayTeamOdds?.moneyLine ?? null
						};
						const moneylineJson = JSON.stringify(moneylineOdds, null, 2);
						if (!firstOdds) {
							fs.appendFileSync(oddsFile, ",\n");
						}
						fs.appendFileSync(oddsFile, moneylineJson);
						firstOdds = false;
						totalOdds++;
					}
				}
				oddsSeen.add(game.id);
			}
			if (Array.isArray(gameStatsArr)) {
				for (const stat of gameStatsArr) {
					// Write game_id (eventId) and team_id, matching new schema. No game_date.
					const statData = {
						game_id: game.id, // Use game_id as per schema
						team_id: stat.team?.id,
						abbreviation: stat.team?.abbreviation,
						stats: (stat.statistics || []).map((s: any) => ({
							name: s.name,
							abbreviation: s.abbreviation,
							value: s.displayValue || s.value
						}))
					};
					const statJson = JSON.stringify(statData, null, 2);
					if (!firstGameStat) {
						fs.appendFileSync(gameStatsFile, ",\n");
					}
					fs.appendFileSync(gameStatsFile, statJson);
					firstGameStat = false;
					totalGameStats++;
				}
			}
		});

		console.log(`Processed team ${team.teamName} (${team.teamId}) - Games: ${trimmedSchedule.length}`);
	});

	// End JSON arrays
	fs.appendFileSync(gamesFile, "\n]\n");
	fs.appendFileSync(seasonStatsFile, "\n]\n");
	fs.appendFileSync(oddsFile, "\n]\n");
	fs.appendFileSync(gameStatsFile, "\n]\n");
	console.log(`Finished processing ${teamsToProcess.length} teams, ${totalGames} games, ${totalOdds} odds, and ${totalGameStats} game stats. Output written to ${outDir}`);
}

async function main() {
	try {
		const leagueArg = process.argv[2];
		const seasonArg = process.argv[3];

		if (!leagueArg || !LEAGUES[leagueArg]) {
			console.error(`Invalid or missing league. Supported leagues: ${Object.keys(LEAGUES).join(', ')}`);
			console.error("Usage: node script.js <league> [season]");
			console.error("Examples:");
			console.error("  node script.js ncaam 2025");
			console.error("  node script.js nba 2024");
			process.exit(1);
		}

		const league = LEAGUES[leagueArg];
		const season = seasonArg ? parseInt(seasonArg, 10) : 2025;

		if (isNaN(season)) {
			console.error("Invalid season argument. Usage: node script.js <league> [season]");
			process.exit(1);
		}

		console.log(`Starting ingestion for ${league.name.toUpperCase()} season ${season}`);
		await processAllTeams(season, league);
	} catch (err) {
		console.error("Error processing teams or schedules:", err);
		process.exit(1);
	}
}

// ES module entrypoint check
if (import.meta.url === `file://${process.argv[1]}`) {
	main();
}
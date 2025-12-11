
import fetch from "node-fetch";
import fs from "fs";
import path from "path";

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

// ESPN NCAAM teams API endpoint

// ESPN NCAAM teams API endpoint with pagination
const TEAMS_API_BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams";
const PAGE_SIZE = 50;





// ESPN NCAAM team stats API endpoint
const TEAM_STATS_API = (teamId: string, season: number) =>
	`https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/${teamId}/statistics?season=${season}`;

async function fetchTeamStats(teamId: string, season: number) {
	const url = TEAM_STATS_API(teamId, season);
	const res = await fetch(url);
	if (!res.ok) throw new Error(`Failed to fetch stats for team ${teamId}: ${res.status}`);
	const data = await res.json();
	// Return the whole stats object for now; can trim fields later
	return data;
}

// ESPN NCAAM odds API endpoint
const ODDS_API = (eventId: string) =>
	`https://sports.core.api.espn.com/v2/sports/basketball/leagues/mens-college-basketball/events/${eventId}/competitions/${eventId}/odds`;

async function fetchGameOdds(eventId: string) {
	const url = ODDS_API(eventId);
	const res = await fetch(url);
	if (!res.ok) return null;
	const data = (await res.json()) as any;
	// Return the items array or empty
	return Array.isArray(data.items) ? data.items : [];
}

// ESPN NCAAM game summary (box score) API endpoint
const GAME_SUMMARY_API = (eventId: string) =>
	`https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary?event=${eventId}`;

async function fetchGameStats(eventId: string) {
	const url = GAME_SUMMARY_API(eventId);
	const res = await fetch(url);
	if (!res.ok) return null;
	const data = (await res.json()) as any;
	// Extract team box score stats if available
	if (!data.boxscore || !data.boxscore.teams) return null;
	return data.boxscore.teams;
}

async function processAllTeams(season: number) {
	let offset = 0;
	let more = true;
	let totalTeams = 0;
	// No team or game limit; process all teams and all games
	const TEAM_LIMIT = Infinity;
	const GAME_LIMIT = Infinity;
	// Prepare output files
	const outDir = path.join("data", "ncaam", String(season));
	if (!fs.existsSync(outDir)) {
		fs.mkdirSync(outDir, { recursive: true });
	}
	const teamsFile = path.join(outDir, "teams.json");
	const gamesFile = path.join(outDir, "games.json");
	const teamStatsFile = path.join(outDir, "team_stats.json");
	const oddsFile = path.join(outDir, "odds.json");
	const gameStatsFile = path.join(outDir, "game_stats.json");

	// Start JSON arrays
	fs.writeFileSync(teamsFile, "[\n");
	fs.writeFileSync(gamesFile, "[\n");
	fs.writeFileSync(teamStatsFile, "[\n");
	fs.writeFileSync(oddsFile, "[\n");
	fs.writeFileSync(gameStatsFile, "[\n");

	let firstTeam = true;
	let firstGame = true;
	let firstStat = true;
	let gamesSeen = new Set();
	let oddsSeen = new Set();
	let totalGames = 0;
	let totalOdds = 0;
	let totalGameStats = 0;
	let firstOdds = true;
	let firstGameStat = true;
    const seenTeamIds = new Set();
    const seenTeamStats = new Set();

	while (more && totalTeams < TEAM_LIMIT) {
		const url = `${TEAMS_API_BASE}?limit=${PAGE_SIZE}&offset=${offset}`;
		const res = await fetch(url);
		if (!res.ok) throw new Error(`Failed to fetch teams: ${res.status}`);
		const data = await res.json();
		const sports = (data && typeof data === "object" && "sports" in data) ? (data as any).sports : [];
		const teams = sports?.[0]?.leagues?.[0]?.teams?.map((t: any) => t.team) || [];
		// Deduplicate teams by teamId
		await asyncPool(5, teams, async (team: any) => {
			if (seenTeamIds.has(team.id)) return;
			seenTeamIds.add(team.id);
			if (totalTeams >= TEAM_LIMIT) return;
			totalTeams++;
			if (totalTeams % 10 === 0) {
				console.log(`[Progress] Processed ${totalTeams} teams so far...`);
			}
			// Fetch schedule and stats in parallel
			const [schedule, statsRaw] = await Promise.all([
				fetchTeamSchedule(team.id, season),
				fetchTeamStats(team.id, season)
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
			// Write team info (without schedule) to teams.json
			const teamData = {
				teamId: team.id,
				teamName: team.name,
				abbreviation: team.abbreviation
			};
			if (!firstTeam) {
				fs.appendFileSync(teamsFile, ",\n");
			}
			fs.appendFileSync(teamsFile, JSON.stringify(teamData, null, 2));
			firstTeam = false;

			// Write team stats to team_stats.json (deduped)
			if (!seenTeamStats.has(team.id)) {
				const statData = { teamId: team.id, stats };
				if (!firstStat) {
					fs.appendFileSync(teamStatsFile, ",\n");
				}
				fs.appendFileSync(teamStatsFile, JSON.stringify(statData, null, 2));
				firstStat = false;
				seenTeamStats.add(team.id);
			}

			// Parallelize odds and game stats fetching for all games for this team (limit 5 at a time)
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

				// Fetch odds and game stats in parallel
				const [oddsArr, gameStatsArr] = await Promise.all([
					oddsSeen.has(game.id) ? [] : fetchGameOdds(game.id),
					fetchGameStats(game.id)
				]);
				if (!oddsSeen.has(game.id) && Array.isArray(oddsArr)) {
					for (const odds of oddsArr) {
						const oddsData = {
							eventId: game.id,
							provider: odds.provider?.name,
							spread: odds.spread,
							overUnder: odds.overUnder,
							homeTeamOdds: odds.homeTeamOdds,
							awayTeamOdds: odds.awayTeamOdds,
							overOdds: odds.overOdds,
							underOdds: odds.underOdds
						};
						const oddsJson = JSON.stringify(oddsData, null, 2);
						if (!firstOdds) {
							fs.appendFileSync(oddsFile, ",\n");
						}
						fs.appendFileSync(oddsFile, oddsJson);
						firstOdds = false;
						totalOdds++;
					}
					oddsSeen.add(game.id);
				}
				if (Array.isArray(gameStatsArr)) {
					for (const stat of gameStatsArr) {
						const statData = {
							eventId: game.id,
							teamId: stat.team?.id,
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

			// Optionally log progress
			console.log(`Processed team ${team.name} (${team.id}) - Games: ${trimmedSchedule.length}`);
		});
		if (teams.length < PAGE_SIZE || totalTeams >= TEAM_LIMIT) {
			more = false;
		} else {
			offset += PAGE_SIZE;
		}
		console.log(`Processed ${totalTeams} teams so far...`);
	}

	// End JSON arrays
	fs.appendFileSync(teamsFile, "\n]\n");
	fs.appendFileSync(gamesFile, "\n]\n");
	fs.appendFileSync(teamStatsFile, "\n]\n");
	fs.appendFileSync(oddsFile, "\n]\n");
	fs.appendFileSync(gameStatsFile, "\n]\n");
	console.log(`Finished processing ${totalTeams} teams, ${totalGames} games, ${totalOdds} odds, and ${totalGameStats} game stats. Output written to ${outDir}`);
}



// ESPN NCAAM schedule API endpoint template
const SCHEDULE_API = (teamId: string, season: number) =>
	`https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/${teamId}/schedule?season=${season}`;

async function fetchTeamSchedule(teamId: string, season: number) {
	const url = SCHEDULE_API(teamId, season);
	const res = await fetch(url);
	if (!res.ok) throw new Error(`Failed to fetch schedule for team ${teamId}: ${res.status}`);
	const data = await res.json();
	// Type guard for 'events' property
	const events = (data && typeof data === "object" && "events" in data) ? (data as any).events : [];
	return events;
}

async function main() {
	try {
		const season = 2025;
		await processAllTeams(season);
	} catch (err) {
		console.error("Error processing teams or schedules:", err);
		process.exit(1);
	}
}


// ES module entrypoint check
if (import.meta.url === `file://${process.argv[1]}`) {
	main();
}

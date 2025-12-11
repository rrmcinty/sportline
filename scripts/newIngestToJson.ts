
import fetch from "node-fetch";
import fs from "fs";
import path from "path";

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

	while (more && totalTeams < TEAM_LIMIT) {
		const url = `${TEAMS_API_BASE}?limit=${PAGE_SIZE}&offset=${offset}`;
		const res = await fetch(url);
		if (!res.ok) throw new Error(`Failed to fetch teams: ${res.status}`);
		const data = await res.json();
		const sports = (data && typeof data === "object" && "sports" in data) ? (data as any).sports : [];
		const teams = sports?.[0]?.leagues?.[0]?.teams?.map((t: any) => t.team) || [];
		for (const team of teams) {
			if (totalTeams >= TEAM_LIMIT) break;
			totalTeams++;
			// Fetch schedule for this team
			const schedule = await fetchTeamSchedule(team.id, season);
			// Fetch team stats for this team
			const statsRaw = await fetchTeamStats(team.id, season);
			// Type assertion to avoid 'unknown' type error
			const statsObj = statsRaw as any;
			// Trim stats to only relevant fields
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
			// Trim each game to minimal fields
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
			const teamJson = JSON.stringify(teamData, null, 2);
			if (!firstTeam) {
				fs.appendFileSync(teamsFile, ",\n");
			}
			fs.appendFileSync(teamsFile, teamJson);
			firstTeam = false;

			// Write team stats to team_stats.json
			const statData = { teamId: team.id, stats };
			const statJson = JSON.stringify(statData, null, 2);
			if (!firstStat) {
				fs.appendFileSync(teamStatsFile, ",\n");
			}
			fs.appendFileSync(teamStatsFile, statJson);
			firstStat = false;

			// Write games to games.json (deduped, no limit)
			for (const game of trimmedSchedule) {
				if (gamesSeen.has(game.id)) continue;
				gamesSeen.add(game.id);
				const gameJson = JSON.stringify(game, null, 2);
				if (!firstGame) {
					fs.appendFileSync(gamesFile, ",\n");
				}
				fs.appendFileSync(gamesFile, gameJson);
				firstGame = false;
				totalGames++;

				// Fetch and write odds for this game (no limit)
				if (!oddsSeen.has(game.id)) {
					const oddsArr = await fetchGameOdds(game.id);
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

				// Fetch and write game stats for this game (no limit)
				const gameStatsArr = await fetchGameStats(game.id);
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
			}

			// Optionally log progress
			console.log(`Processed team ${team.name} (${team.id}) - Games: ${trimmedSchedule.length}`);
		}
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

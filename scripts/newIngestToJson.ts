
import fetch from "node-fetch";
import fs from "fs";
import path from "path";

// ESPN NCAAM teams API endpoint

// ESPN NCAAM teams API endpoint with pagination
const TEAMS_API_BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams";
const PAGE_SIZE = 50;



async function processAllTeams(season: number) {
	let offset = 0;
	let more = true;
	let totalTeams = 0;
	const TEAM_LIMIT = 30;
	// Prepare output file
	const outDir = path.join("data", "ncaam", String(season));
	if (!fs.existsSync(outDir)) {
		fs.mkdirSync(outDir, { recursive: true });
	}
	const outFile = path.join(outDir, "data.json");
	// Start JSON array
	fs.writeFileSync(outFile, "[\n");
	let first = true;
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
			// Prepare team+trimmed schedule object
			const teamData = {
				teamId: team.id,
				teamName: team.name,
				abbreviation: team.abbreviation,
				schedule: trimmedSchedule
			};
			// Write to file as JSON array element
			const jsonStr = JSON.stringify(teamData, null, 2);
			if (!first) {
				fs.appendFileSync(outFile, ",\n");
			}
			fs.appendFileSync(outFile, jsonStr);
			first = false;
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
	// End JSON array
	fs.appendFileSync(outFile, "\n]\n");
	console.log(`Finished processing ${totalTeams} teams. Output written to ${outFile}`);
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

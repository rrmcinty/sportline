import fs from "fs";
import path from "path";

// List of NC State Wolfpack men's basketball games (date, opponent) for 2022–23, 2023–24, 2024–25, 2025–26 seasons
const ncStateGames = [
	{ date: "2024-11-04", opponent: "" },
	{ date: "2024-11-08", opponent: "" },
	{ date: "2024-11-13", opponent: "" },
	{ date: "2024-11-18", opponent: "" },
	{ date: "2024-11-22", opponent: "" },
	{ date: "2024-11-28", opponent: "" },
	{ date: "2024-11-29", opponent: "" },
	{ date: "2024-12-04", opponent: "" },
	{ date: "2024-12-07", opponent: "" },
	{ date: "2024-12-10", opponent: "" },
	{ date: "2025-11-03", opponent: "" },
	{ date: "2025-11-07", opponent: "" },
	{ date: "2025-11-12", opponent: "" },
	{ date: "2025-11-17", opponent: "" },
	{ date: "2025-11-24", opponent: "" },
	{ date: "2025-11-25", opponent: "" },
	{ date: "2025-11-26", opponent: "" },
	{ date: "2025-12-03", opponent: "" },
	{ date: "2025-12-06", opponent: "" },
	{ date: "2025-12-10", opponent: "" },
];


import fetch from "node-fetch";


// Helper: Fetch games from ESPN API for a given date
async function fetchGamesForDate(dateStr: string) {
	const apiDate = dateStr.replace(/-/g, "");
	const url = `http://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=${apiDate}`;
	try {
		const res = await fetch(url);
		if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
		const data: any = await res.json();
		return data.events || [];
	} catch (err) {
		console.warn(`Error fetching games for ${dateStr}:`, err);
		return [];
	}
}


async function main() {
	const logResults = [];
	for (const { date } of ncStateGames) {
		const events = await fetchGamesForDate(date);
		const games = events
			.filter((e: any) => {
				const teams = e.competitions?.[0]?.competitors || [];
				return teams.some((t: any) => t.team?.displayName === "NC State Wolfpack");
			})
			.map((e: any) => {
				const comp = e.competitions?.[0];
				const homeTeam = comp?.competitors?.find((t: any) => t.homeAway === "home")?.team?.displayName || null;
				const awayTeam = comp?.competitors?.find((t: any) => t.homeAway === "away")?.team?.displayName || null;
				return {
					homeTeam,
					awayTeam,
					eventId: e.id || null,
					hasStats: !!comp?.boxscore,
					// ESPN API may not have hasAllStats/missingStats fields, so leave blank or false
					hasAllStats: false,
					missingStats: [],
				};
			});
		logResults.push({ date, games });
		// Rate limit
		await new Promise(res => setTimeout(res, 200));
	}

	// Write results to JSON file
	const outPath = path.join("data", "ncaam", "2024", "ncstate_api_check.json");
	fs.writeFileSync(outPath, JSON.stringify(logResults, null, 2));
	console.log(`NC State API check complete. Results written to ${outPath}`);
}

main();

// Write results to JSON file

import chalk from "chalk";
const { fetchEvents: fetchEventsNcaam } = require("../src/espn/ncaam/events");
const { fetchEvents: fetchEventsNba } = require("../src/espn/nba/events");
const { fetchEvents: fetchEventsCfb } = require("../src/espn/cfb/events");
const { fetchEvents: fetchEventsNfl } = require("../src/espn/nfl/events");
const { fetchNHLEvents: fetchEventsNhl } = require("../src/espn/nhl/events");
const { fetchOdds: fetchOddsNcaam } = require("../src/espn/ncaam/odds");
const { fetchOdds: fetchOddsNba } = require("../src/espn/nba/odds");
const { fetchOdds: fetchOddsCfb } = require("../src/espn/cfb/odds");
const { fetchOdds: fetchOddsNfl } = require("../src/espn/nfl/odds");
const { fetchNHLOdds: fetchOddsNhl } = require("../src/espn/nhl/odds");

/**
 * Test ESPN NCAAM API reliability for the past 7 days
 * Logs: games fetched, games with boxScore/team_stats, and missing stats per day
 * Does NOT write to the database
 */
// Dictionary of sport/season to date ranges
const seasonDateRanges: Record<string, (season: number) => { start: string; end: string }> = {
  ncaam: (season: number) => ({
    start: `${season}-11-04`,
    end: `${season + 1}-03-31`,
  }),
  nba: (season: number) => ({
    start: `${season}-10-01`,
    end: `${season + 1}-06-30`,
  }),
  cfb: (season: number) => ({
    start: `${season}-08-20`,
    end: `${season + 1}-01-31`,
  }),
  nfl: (season: number) => ({
    start: `${season}-09-01`,
    end: `${season + 1}-02-15`,
  }),
  nhl: (season: number) => ({
    start: `${season}-10-01`,
    end: `${season + 1}-06-30`,
  }),
};

// Map sport to fetchEvents and fetchOdds functions


const fetchEventsMap: Record<string, (date: string) => Promise<any[]>> = {
  ncaam: fetchEventsNcaam,
  nba: fetchEventsNba,
  cfb: fetchEventsCfb,
  nfl: fetchEventsNfl,
  nhl: fetchEventsNhl,
};

const fetchOddsMap: Record<string, (eventId: string) => Promise<any[]>> = {
  ncaam: fetchOddsNcaam,
  nba: fetchOddsNba,
  cfb: fetchOddsCfb,
  nfl: fetchOddsNfl,
  nhl: fetchOddsNhl,
};

async function testApiReliability(sport: string, season: number) {
  if (!seasonDateRanges[sport]) {
    console.error(`Unknown sport: ${sport}`);
    process.exit(1);
  }
  const { start, end } = seasonDateRanges[sport](season);
  const startDate = new Date(start);
  const seasonEndDate = new Date(end);
  const today = new Date();
  // Zero out time for today for accurate comparison
  today.setHours(0, 0, 0, 0);
  // Use the earlier of seasonEndDate or today
  const endDate = seasonEndDate > today ? today : seasonEndDate;
  const fetchEvents = fetchEventsMap[sport];
  const results: Array<{ date: string; games: number; gamesWithStats: number; missingStats: number }> = [];
  const allGames: Record<string, any[]> = {};
  const fetchOdds = fetchOddsMap[sport];
  const requiredStats = [
    "fieldGoalsMade-fieldGoalsAttempted_made",
    "fieldGoalsMade-fieldGoalsAttempted_attempted",
    "threePointFieldGoalsMade-threePointFieldGoalsAttempted_made",
    "threePointFieldGoalsMade-threePointFieldGoalsAttempted_attempted",
    "freeThrowsMade-freeThrowsAttempted_made",
    "freeThrowsMade-freeThrowsAttempted_attempted",
    "totalRebounds",
    "offensiveRebounds",
    "defensiveRebounds",
    "assists",
    "steals",
    "blocks",
    "turnovers",
  ];


  let currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    const yyyy = currentDate.getFullYear();
    const mm = String(currentDate.getMonth() + 1).padStart(2, "0");
    const dd = String(currentDate.getDate()).padStart(2, "0");
    const dateStr = `${yyyy}${mm}${dd}`;

    // Fetch games for this day
    let competitions: any[] = [];
    let fetchSuccess = false;
    let retries = 0;
    const maxRetries = 3;
    while (!fetchSuccess && retries < maxRetries) {
      try {
        competitions = await fetchEvents(dateStr);
        fetchSuccess = true;
      } catch (err: any) {
        let statusCode = "";
        if (err.message && err.message.match(/(\d{3})/)) {
          statusCode = err.message.match(/(\d{3})/)[1];
        }
        if (statusCode === "503") {
          retries++;
          console.warn(chalk.yellow(`[RETRY] ${dateStr}: Received status code ${statusCode}. Retrying (${retries}/${maxRetries})...`));
          await new Promise((resolve) => setTimeout(resolve, 1000 * retries));
        } else if (statusCode) {
          retries++;
          console.warn(chalk.yellow(`[RETRY] ${dateStr}: Received status code ${statusCode}. Retrying (${retries}/${maxRetries})...`));
          await new Promise((resolve) => setTimeout(resolve, 1000 * retries));
        } else {
          console.warn(chalk.yellow(`Failed to fetch games for ${dateStr}: ${err.message || err}`));
          break;
        }
      }
    }
    if (!fetchSuccess || competitions.length === 0) {
      // Don't log empty dates in JSON
      currentDate.setDate(currentDate.getDate() + 1);
      continue;
    }

    const gamesCount = competitions.length;
    let gamesWithStats = 0;
    let missingStats = 0;
    const gamesForDay: any[] = [];


    for (const comp of competitions) {
      let hasAllStats = false;
      let missingStatsList: string[] = [];
      if (comp.boxScore) {
        const homeStats = comp.boxScore.home as Record<string, string | number>;
        const awayStats = comp.boxScore.away as Record<string, string | number>;

        const hasAllHome = requiredStats.every((stat) =>
          Object.keys(homeStats).some((m) => m.startsWith(stat.split("_")[0]))
        );
        const hasAllAway = requiredStats.every((stat) =>
          Object.keys(awayStats).some((m) => m.startsWith(stat.split("_")[0]))
        );
        hasAllStats = hasAllHome && hasAllAway;

        if (!hasAllHome) {
          missingStatsList.push("home");
        }
        if (!hasAllAway) {
          missingStatsList.push("away");
        }
      } else {
        missingStatsList.push("no_boxScore");
      }

      // Fetch odds for this event
      let odds: any[] = [];
      try {
        odds = await fetchOdds(comp.eventId);
      } catch (oddsErr) {
        odds = [];
      }

      // Map odds to DB schema fields
      const mappedOdds = [];
      const now = new Date().toISOString();
      for (const entry of odds) {
        // Moneyline
        if (entry.homeTeamOdds?.moneyLine !== undefined && entry.awayTeamOdds?.moneyLine !== undefined) {
          mappedOdds.push({
            provider: entry.provider?.name || "Unknown",
            market: "moneyline",
            line: null,
            price_home: entry.homeTeamOdds.moneyLine,
            price_away: entry.awayTeamOdds.moneyLine,
            price_over: null,
            price_under: null,
            timestamp: now,
          });
        }
        // Spread
        if (entry.spread !== undefined && entry.homeTeamOdds?.spreadOdds !== undefined && entry.awayTeamOdds?.spreadOdds !== undefined) {
          mappedOdds.push({
            provider: entry.provider?.name || "Unknown",
            market: "spread",
            line: entry.spread,
            price_home: entry.homeTeamOdds.spreadOdds,
            price_away: entry.awayTeamOdds.spreadOdds,
            price_over: null,
            price_under: null,
            timestamp: now,
          });
        }
        // Total
        if (entry.overUnder !== undefined && entry.overOdds !== undefined && entry.underOdds !== undefined) {
          mappedOdds.push({
            provider: entry.provider?.name || "Unknown",
            market: "total",
            line: entry.overUnder,
            price_home: null,
            price_away: null,
            price_over: entry.overOdds,
            price_under: entry.underOdds,
            timestamp: now,
          });
        }
      }

      gamesForDay.push({
        eventId: comp.eventId,
        date: comp.date,
        homeTeam: {
          id: comp.homeTeam?.id,
          name: comp.homeTeam?.name,
          abbreviation: comp.homeTeam?.abbreviation,
        },
        awayTeam: {
          id: comp.awayTeam?.id,
          name: comp.awayTeam?.name,
          abbreviation: comp.awayTeam?.abbreviation,
        },
        hasBoxScore: !!comp.boxScore,
        hasAllStats,
        missingStats: missingStatsList,
        boxScore: comp.boxScore || null,
        odds: mappedOdds,
      });

      if (hasAllStats) {
        gamesWithStats++;
      } else {
        missingStats++;
      }
    }

    allGames[dateStr] = gamesForDay;
    results.push({ date: dateStr, games: gamesCount, gamesWithStats, missingStats });
    console.log(
      chalk.cyan(
        `Date: ${dateStr} | Games: ${gamesCount} | With All Stats: ${gamesWithStats} | Missing Required Stats: ${missingStats}`
      )
    );

    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Add summary object to JSON
  const apiResultSummary = results.reduce(
    (acc, r) => {
      acc.totalGames += r.games;
      acc.totalWithStats += r.gamesWithStats;
      acc.totalMissingStats += r.missingStats;
      return acc;
    },
    { totalGames: 0, totalWithStats: 0, totalMissingStats: 0 }
  );

  const output = { ...allGames, apiResultSummary };
  const fs = await import("fs");
  const path = await import("path");
  // Output folder: data/ncaam/{season}/data.json
  const outDir = path.join("data", sport, String(season));
  const outFile = path.join(outDir, "data.json");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  fs.writeFileSync(outFile, JSON.stringify(output, null, 2));

  // Summary
  console.log(chalk.bold.green(`\nSummary for ${sport.toUpperCase()} ${season}-${season + 1} season:`));
  console.log(chalk.gray(`Total Games: ${apiResultSummary.totalGames}`));
  console.log(chalk.gray(`Total With All Stats: ${apiResultSummary.totalWithStats}`));
  console.log(chalk.gray(`Total Missing Required Stats: ${apiResultSummary.totalMissingStats}`));
  console.log(chalk.gray(`Output written to: ${outFile}`));
}


// CLI usage: npx ts-node scripts/testApiReliability.ts <sport> <season>
const [,, sportArg, seasonArg] = process.argv;
if (!sportArg || !seasonArg) {
  console.error("Usage: npx ts-node scripts/testApiReliability.ts <sport> <season>");
  process.exit(1);
}
testApiReliability(sportArg, parseInt(seasonArg, 10)).catch((err) => {
  console.error(chalk.red("Error running API reliability test:"), err);
  process.exit(1);
});

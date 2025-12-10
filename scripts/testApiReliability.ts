import chalk from "chalk";
import { fetchEvents as fetchEventsNcaam } from "../src/espn/ncaam/events.js";

/**
 * Test ESPN NCAAM API reliability for the past 7 days
 * Logs: games fetched, games with boxScore/team_stats, and missing stats per day
 * Does NOT write to the database
 */
async function testNcaamApiReliability() {
  // Set date range for 2019-2020 NCAAM season
  const startDate = new Date("2019-11-04");
  const endDate = new Date("2020-03-31");
  const results: Array<{ date: string; games: number; gamesWithStats: number; missingStats: number }> = [];
  const allGames: Record<string, any[]> = {};
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
        competitions = await fetchEventsNcaam(dateStr);
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

      gamesForDay.push({
        eventId: comp.eventId,
        date: comp.date,
        homeTeam: comp.homeTeam,
        awayTeam: comp.awayTeam,
        hasBoxScore: !!comp.boxScore,
        hasAllStats,
        missingStats: missingStatsList,
        boxScore: comp.boxScore || null,
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
  fs.writeFileSync("scripts/ncaam_api_results_2020_season.json", JSON.stringify(output, null, 2));

  // Summary
  console.log(chalk.bold.green("\nSummary for 2019-2020 season:"));
  console.log(chalk.gray(`Total Games: ${apiResultSummary.totalGames}`));
  console.log(chalk.gray(`Total With All Stats: ${apiResultSummary.totalWithStats}`));
  console.log(chalk.gray(`Total Missing Required Stats: ${apiResultSummary.totalMissingStats}`));
}

// Run the test
testNcaamApiReliability().catch((err) => {
  console.error(chalk.red("Error running API reliability test:"), err);
  process.exit(1);
});

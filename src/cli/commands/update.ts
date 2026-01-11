/**
 * CLI command for updating game data (odds, scores, stats)
 */

import { Command } from 'commander';
import chalk from 'chalk';
import fetch from 'node-fetch';
import Database from 'better-sqlite3';
import path from 'path';

// ESPN API endpoints - sport-generic
const ODDS_API = (eventId: string, sport: string) => {
  const sportConfig = getSportConfig(sport);
  return `https://sports.core.api.espn.com/v2/sports/${sportConfig.espnSport}/leagues/${sportConfig.league}/events/${eventId}/competitions/${eventId}/odds`;
};

const GAME_SUMMARY_API = (eventId: string, sport: string) => {
  const sportConfig = getSportConfig(sport);
  return `https://site.api.espn.com/apis/site/v2/sports/${sportConfig.espnSport}/${sportConfig.league}/summary?event=${eventId}`;
};

// Sport configuration mapping
function getSportConfig(sport: string) {
  const configs: Record<string, { espnSport: string; league: string }> = {
    ncaam: { espnSport: 'basketball', league: 'mens-college-basketball' },
    nba: { espnSport: 'basketball', league: 'nba' },
    nhl: { espnSport: 'hockey', league: 'nhl' },
    nfl: { espnSport: 'football', league: 'nfl' },
    cfb: { espnSport: 'football', league: 'college-football' },
  };

  return configs[sport] || configs['ncaam'];
}

async function fetchGameOdds(eventId: string, sport: string) {
  try {
    const url = ODDS_API(eventId, sport);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      if (res.status === 429) {
        console.log(`  ${chalk.yellow('⚠')}  Rate limited for ${eventId}, skipping odds...`);
      }
      return null;
    }
    const data = (await res.json()) as any;
    return Array.isArray(data.items) ? data.items : [];
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      console.log(`  ${chalk.yellow('⚠')}  Timeout fetching odds for ${eventId}`);
    }
    return null;
  }
}

async function fetchGameSummary(eventId: string, sport: string) {
  try {
    const url = GAME_SUMMARY_API(eventId, sport);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      if (res.status === 429) {
        console.log(`  ${chalk.yellow('⚠')}  Rate limited for ${eventId}, skipping summary...`);
      }
      return null;
    }
    return (await res.json()) as any;
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      console.log(`  ${chalk.yellow('⚠')}  Timeout fetching summary for ${eventId}`);
    }
    return null;
  }
}

async function runUpdate(options: { back: number; forward: number; sport?: string }) {
  const dbPath = path.join(process.cwd(), 'data', 'sportline.db');
  const db = new Database(dbPath);

  const daysBack = options.back;
  const daysForward = options.forward;
  const sportFilter = options.sport;

  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(now.getDate() - daysBack);
  const endDate = new Date(now);
  endDate.setDate(now.getDate() + daysForward);

  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = endDate.toISOString().split('T')[0];

  console.log(`\n${chalk.bold.cyan('🔄 Sportline Update')}`);
  console.log(
    `${chalk.bold('Date Range:')} ${chalk.yellow(startDateStr)} to ${chalk.yellow(endDateStr)}`,
  );
  console.log(
    `${chalk.bold('Days Back:')} ${chalk.green(daysBack)} | ${chalk.bold('Days Forward:')} ${chalk.green(daysForward)}`,
  );
  if (sportFilter) {
    console.log(`${chalk.bold('Sport:')} ${chalk.yellow(sportFilter.toUpperCase())}`);
  }
  console.log('');

  // Build query based on sport filter
  const sportList = sportFilter ? [sportFilter] : ['ncaam', 'nba', 'nhl', 'nfl', 'cfb'];

  const placeholders = sportList.map(() => '?').join(',');

  // Find games that need updating
  const gamesToUpdate = db
    .prepare(
      `
    SELECT id, date, status, home_team_id, away_team_id, home_score, away_score, sport
    FROM games
    WHERE sport IN (${placeholders})
      AND DATE(DATETIME(date, '-5 hours')) >= DATE(?)
      AND DATE(DATETIME(date, '-5 hours')) <= DATE(?)
      AND (status IN ('pre', 'scheduled', 'in') OR (status = 'post' AND home_score IS NULL))
    ORDER BY date ASC
  `,
    )
    .all(...sportList, startDateStr, endDateStr) as any[];

  console.log(`Found ${chalk.bold(gamesToUpdate.length)} games to update\n`);

  if (gamesToUpdate.length === 0) {
    console.log(chalk.green('✅ No games need updating!'));
    db.close();
    return;
  }

  // Group by status and sport
  const scheduled = gamesToUpdate.filter((g) => g.status === 'scheduled' || g.status === 'pre');
  const inProgress = gamesToUpdate.filter((g) => g.status === 'in');
  const needStats = gamesToUpdate.filter((g) => g.status === 'post' && g.home_score === null);

  // Sport breakdown
  const sportCounts = gamesToUpdate.reduce(
    (acc, game) => {
      acc[game.sport] = (acc[game.sport] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  console.log(`${chalk.bold('📊 Status breakdown:')}`);
  console.log(`  - Scheduled/Pre: ${chalk.cyan(scheduled.length)}`);
  console.log(`  - In Progress: ${chalk.yellow(inProgress.length)}`);
  console.log(`  - Need final stats: ${chalk.magenta(needStats.length)}`);

  console.log(`\n${chalk.bold('🏈 Sport breakdown:')}`);
  Object.entries(sportCounts).forEach(([sport, count]) => {
    console.log(`  - ${sport.toUpperCase()}: ${chalk.cyan(count)}`);
  });
  console.log('');

  let oddsUpdated = 0;
  let scoresUpdated = 0;
  let statsUpdated = 0;
  let processed = 0;
  let errors = 0;

  const BATCH_SIZE = 10;
  const DELAY_BETWEEN_BATCHES = 2000;
  const DELAY_BETWEEN_REQUESTS = 200;

  console.log(
    `${chalk.bold('🔄 Processing')} ${gamesToUpdate.length} games in batches of ${BATCH_SIZE}...\n`,
  );

  for (let i = 0; i < gamesToUpdate.length; i += BATCH_SIZE) {
    const batch = gamesToUpdate.slice(i, i + BATCH_SIZE);
    console.log(
      `${chalk.bold('📦 Batch')} ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(gamesToUpdate.length / BATCH_SIZE)} (${batch.length} games)...`,
    );

    for (const game of batch) {
      try {
        const [summary, oddsData] = await Promise.all([
          fetchGameSummary(game.id, game.sport),
          fetchGameOdds(game.id, game.sport),
        ]);

        // Update game status and scores if available
        if (summary) {
          const competition = summary.header?.competitions?.[0];
          const newStatus = competition?.status?.type?.state;
          const competitors = competition?.competitors || [];
          const home = competitors.find((c: any) => c.homeAway === 'home');
          const away = competitors.find((c: any) => c.homeAway === 'away');

          const homeScore = home?.score ? Number(home.score) : null;
          const awayScore = away?.score ? Number(away.score) : null;

          if (newStatus && newStatus !== game.status) {
            db.prepare(
              `UPDATE games SET status = ?, home_score = ?, away_score = ? WHERE id = ?`,
            ).run(newStatus, homeScore, awayScore, game.id);
            scoresUpdated++;
            console.log(
              `  ${chalk.green('✓')} Updated ${game.id}: ${game.status} → ${newStatus}${homeScore !== null ? ` (${homeScore}-${awayScore})` : ''}`,
            );
          } else if (
            homeScore !== null &&
            (game.home_score === null || game.home_score !== homeScore)
          ) {
            db.prepare(`UPDATE games SET home_score = ?, away_score = ? WHERE id = ?`).run(
              homeScore,
              awayScore,
              game.id,
            );
            scoresUpdated++;
            console.log(
              `  ${chalk.green('✓')} Updated score for ${game.id}: ${homeScore}-${awayScore}`,
            );
          }

          // If game just completed, fetch detailed stats
          if (newStatus === 'post' && summary.boxscore?.teams) {
            const teams = summary.boxscore.teams;
            for (const teamData of teams) {
              const teamId = teamData.team?.id;
              if (!teamId) continue;

              const stats = teamData.statistics || [];
              for (const stat of stats) {
                const existing = db
                  .prepare(
                    `SELECT id FROM game_stats WHERE game_id = ? AND team_id = ? AND metric_name = ?`,
                  )
                  .get(game.id, teamId, stat.name);

                if (!existing) {
                  db.prepare(
                    `INSERT INTO game_stats (game_id, team_id, sport, season, metric_name, metric_value)
                   VALUES (?, ?, ?, ?, ?, ?)`,
                  ).run(
                    game.id,
                    teamId,
                    game.sport,
                    new Date(game.date).getFullYear(),
                    stat.name,
                    stat.displayValue || stat.value,
                  );
                  statsUpdated++;
                }
              }
            }
            console.log(`  ${chalk.green('✓')} Updated stats for ${game.id}`);
          }
        }

        // Update odds
        if (oddsData && Array.isArray(oddsData)) {
          for (const odds of oddsData) {
            const provider = odds.provider?.name || odds.provider || 'Unknown';
            const timestamp = new Date().toISOString();

            // Moneyline
            if (
              odds.homeTeamOdds?.moneyLine !== undefined ||
              odds.awayTeamOdds?.moneyLine !== undefined
            ) {
              db.prepare(
                `DELETE FROM odds WHERE game_id = ? AND provider = ? AND market = 'moneyline'`,
              ).run(game.id, provider);

              db.prepare(
                `INSERT INTO odds (game_id, provider, market, price_home, price_away, timestamp)
               VALUES (?, ?, ?, ?, ?, ?)`,
              ).run(
                game.id,
                provider,
                'moneyline',
                odds.homeTeamOdds?.moneyLine ?? null,
                odds.awayTeamOdds?.moneyLine ?? null,
                timestamp,
              );
              oddsUpdated++;
            }

            // Spread
            if (odds.spread !== undefined) {
              db.prepare(
                `DELETE FROM odds WHERE game_id = ? AND provider = ? AND market = 'spread'`,
              ).run(game.id, provider);

              db.prepare(
                `INSERT INTO odds (game_id, provider, market, line, price_home, price_away, timestamp)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              ).run(
                game.id,
                provider,
                'spread',
                odds.spread,
                odds.homeTeamOdds?.spreadOdds ?? null,
                odds.awayTeamOdds?.spreadOdds ?? null,
                timestamp,
              );
            }

            // Total
            if (odds.overUnder !== undefined) {
              db.prepare(
                `DELETE FROM odds WHERE game_id = ? AND provider = ? AND market = 'total'`,
              ).run(game.id, provider);

              db.prepare(
                `INSERT INTO odds (game_id, provider, market, line, price_over, price_under, timestamp)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              ).run(
                game.id,
                provider,
                'total',
                odds.overUnder,
                odds.overOdds ?? null,
                odds.underOdds ?? null,
                timestamp,
              );
            }
          }
        }

        processed++;

        if (processed % 20 === 0) {
          console.log(
            `  ${chalk.dim(`Progress: ${processed}/${gamesToUpdate.length} games processed`)}`,
          );
        }

        await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
      } catch (error: any) {
        errors++;
        console.error(
          `  ${chalk.red('✗')} Error updating game ${game.id}:`,
          error?.message || error,
        );

        if (errors > 5) {
          console.log(`  ${chalk.yellow('⚠')}  Many errors detected, increasing delay...`);
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }

    if (i + BATCH_SIZE < gamesToUpdate.length) {
      console.log(
        `  ${chalk.dim(`Waiting ${DELAY_BETWEEN_BATCHES / 1000}s before next batch...`)}\n`,
      );
      await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
    }
  }

  console.log(`\n${chalk.bold.green('✅ Update complete!')}`);
  console.log(`${chalk.bold('📊 Results:')}`);
  console.log(`  - Games processed: ${chalk.cyan(`${processed}/${gamesToUpdate.length}`)}`);
  console.log(`  - Odds updated: ${chalk.green(oddsUpdated)}`);
  console.log(`  - Scores updated: ${chalk.yellow(scoresUpdated)}`);
  console.log(`  - Stats added: ${chalk.magenta(statsUpdated)}`);
  if (errors > 0) {
    console.log(`  - Errors: ${chalk.red(errors)}`);
  }
  console.log('');

  db.close();
}

export function updateCommand(): Command {
  const command = new Command('update');

  command
    .description('Update game odds, scores, and stats from ESPN')
    .option('-b, --back <days>', 'Days back to check for completed games', '1')
    .option('-f, --forward <days>', 'Days forward to fetch odds', '7')
    .option('-s, --sport <sport>', 'Specific sport to update (nba, ncaam, nhl, nfl, cfb)')
    .action(async (options: { back: string; forward: string; sport?: string }) => {
      const back = parseInt(options.back) || 1;
      const forward = parseInt(options.forward) || 7;

      if (options.sport && !['nba', 'ncaam', 'nhl', 'nfl', 'cfb'].includes(options.sport)) {
        console.error(chalk.red(`Invalid sport: ${options.sport}`));
        console.error('Valid sports: nba, ncaam, nhl, nfl, cfb');
        process.exit(1);
      }

      await runUpdate({ back, forward, sport: options.sport });
    });

  return command;
}

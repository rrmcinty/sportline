/**
 * CLI command for syncing data to AWS S3
 * Exports models, team features, and upcoming games for cloud Lambda functions
 */

import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import {
  getDatabase,
  getUpcomingGames,
  getTeamStatsBeforeDate,
  getRecentGames,
} from '../../db/queries.js';
import type { GameRow } from '../../models/types.js';
import { OPTIMAL_BUCKETS } from '../../config/optimalBuckets.js';
import {
  calculateWinStreak,
  calculateRestDays,
  calculateStrengthOfSchedule,
} from '../../models/advancedFeatures.js';
import { loadModel, predictHomeWinProbability } from '../../models/predict.js';

interface TeamFeatures {
  [teamId: string]: Record<string, number | string>;
}

interface SportFeatures {
  teams: TeamFeatures;
  exportedAt: string;
  season: number;
}

interface UpcomingGame {
  id: string;
  sport: string;
  date: string;
  season: number;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName?: string;
  awayTeamName?: string;
}

interface GamesBySpor {
  games: UpcomingGame[];
  exportedAt: string;
}

interface GamePrediction {
  homeTeamId: string;
  awayTeamId: string;
  moneyline: number;
  spread: number;
}

interface PredictionsExport {
  predictions: Record<string, GamePrediction>;
  exportedAt: string;
  season: number;
}

/**
 * Get environment name (username or 'prod')
 */
function getEnv(): string {
  return process.env.ENV || process.env.USER || 'dev';
}

/**
 * Export team features for a sport
 */
function exportTeamFeatures(
  db: any,
  sport: string,
  season: number,
  teamIds: Set<string>,
): SportFeatures {
  console.log(`  Exporting features for ${teamIds.size} teams...`);
  const teams: TeamFeatures = {};
  const now = new Date().toISOString();

  for (const teamId of teamIds) {
    const stats = getTeamStatsBeforeDate(db, sport, teamId, season, now);
    const recentGames = getRecentGames(db, sport, teamId, season, now, 10);

    // Calculate win percentage from recent games
    let wins = 0;
    for (const game of recentGames) {
      if (game.home_score === null || game.away_score === null) continue;
      const isHome = game.home_team_id === teamId;
      const won = isHome ? game.home_score > game.away_score : game.away_score > game.home_score;
      if (won) wins++;
    }
    const winPct = recentGames.length > 0 ? wins / recentGames.length : 0.5;

    // Sport-specific feature extraction
    if (sport === 'nhl') {
      // Hockey-specific features
      const goalsPerGame = parseFloat(stats.avgGoals || '0');
      const goalsAgainstPerGame = parseFloat(stats.avgGoalsAgainst || '0');
      const shotsPerGame = parseFloat(stats.avgShots || '0');
      const shotsAgainstPerGame = parseFloat(stats.avgShotsAgainst || '0');

      // Calculate shooting and save percentages (same as features.ts)
      const shootingPct = shotsPerGame > 0 ? (goalsPerGame / shotsPerGame) * 100 : 0;
      const savePct =
        shotsAgainstPerGame > 0
          ? ((shotsAgainstPerGame - goalsAgainstPerGame) / shotsAgainstPerGame) * 100
          : 0;

      // Advanced features (calculated from recent games)
      const winStreak = calculateWinStreak(recentGames, teamId);
      const restDays = calculateRestDays(now, recentGames);
      const backToBack = restDays <= 1 ? 1 : 0;
      const strengthOfSchedule = calculateStrengthOfSchedule(db, sport, teamId, season, now, 10);

      teams[teamId] = {
        goalsPerGame,
        goalsAgainstPerGame,
        shotsPerGame,
        shotsAgainstPerGame,
        shootingPct,
        savePct,
        powerPlayPct: parseFloat(stats.powerPlayPct || '0'),
        penaltyKillPct: parseFloat(stats.penaltyKillPct || '0'),
        powerPlayGoals: parseFloat(stats.powerPlayGoals || '0'),
        shortHandedGoals: parseFloat(stats.shortHandedGoals || '0'),
        hitsPerGame: parseFloat(stats.hits || '0'),
        blockedShotsPerGame: parseFloat(stats.blockedShots || '0'),
        penaltyMinutes: parseFloat(stats.penaltyMinutes || stats.penalties || '0'),
        faceoffPct: parseFloat(stats.faceoffPercent || '0'),
        takeaways: parseFloat(stats.takeaways || '0'),
        giveaways: parseFloat(stats.giveaways || '0'),
        winPct,
        winPercentage: winPct, // Alias for model compatibility
        winStreak,
        restDays,
        backToBack,
        strengthOfSchedule,
      };
    } else {
      // Basketball features (NBA/NCAAM)
      teams[teamId] = {
        pointsPerGame: parseFloat(stats.avgPoints || '0'),
        pointsAllowed:
          parseFloat(stats.avgOpponentPoints || '0') || parseFloat(stats.avgPoints || '0') * 0.95,
        fieldGoalPct: parseFloat(stats.fieldGoalPct || '0'),
        threePointPct: parseFloat(stats.threePointPct || '0'),
        freeThrowPct: parseFloat(stats.freeThrowPct || '0'),
        scoringEfficiency: parseFloat(stats.scoringEfficiency || '0'),
        shootingEfficiency: parseFloat(stats.shootingEfficiency || '0'),
        assistsPerGame: parseFloat(stats.avgAssists || '0'),
        turnoversPerGame: parseFloat(stats.avgTurnovers || '0'),
        assistTurnoverRatio: parseFloat(stats.assistTurnoverRatio || '0'),
        reboundsPerGame: parseFloat(stats.avgRebounds || '0'),
        offensiveReboundsPerGame: parseFloat(stats.avgOffensiveRebounds || '0'),
        defensiveReboundsPerGame: parseFloat(stats.avgDefensiveRebounds || '0'),
        reboundMargin: parseFloat(stats.reboundMargin || '0'),
        stealsPerGame: parseFloat(stats.avgSteals || '0'),
        blocksPerGame: parseFloat(stats.avgBlocks || '0'),
        foulsPerGame: parseFloat(stats.avgFouls || '0'),
        winPct,
        pace: parseFloat(stats.pace || '0'),
      };
    }
  }

  return {
    teams,
    exportedAt: now,
    season,
  };
}

/**
 * Export upcoming games for a sport
 */
function exportUpcomingGames(db: any, sport: string): GamesBySpor {
  const games = getUpcomingGames(db, sport);
  console.log(`  Found ${games.length} upcoming games`);

  const exportedGames: UpcomingGame[] = games.map((game: GameRow) => ({
    id: game.id,
    sport: game.sport,
    date: game.date,
    season: game.season,
    homeTeamId: game.home_team_id,
    awayTeamId: game.away_team_id,
  }));

  return {
    games: exportedGames,
    exportedAt: new Date().toISOString(),
  };
}

/**
 * Export game predictions for upcoming games
 * Uses the EXACT same prediction code as CLI recommend command
 */
function exportGamePredictions(
  db: any,
  sport: string,
  season: number,
  games: UpcomingGame[],
): PredictionsExport {
  console.log(`  Computing predictions for ${games.length} games...`);

  // Load models (same as CLI recommend command)
  const moneylineModelPath = path.join(
    process.cwd(),
    'data',
    'models',
    sport,
    `moneyline-${season}.json`,
  );
  const spreadModelPath = path.join(
    process.cwd(),
    'data',
    'models',
    sport,
    `spread-${season}.json`,
  );

  let moneylineModel;
  let spreadModel;

  try {
    moneylineModel = loadModel(moneylineModelPath);
    console.log(`    ✓ Loaded moneyline model`);
  } catch (error) {
    console.log(chalk.yellow(`    ⚠ No moneyline model for ${sport}`));
  }

  try {
    spreadModel = loadModel(spreadModelPath);
    console.log(`    ✓ Loaded spread model`);
  } catch (error) {
    console.log(chalk.yellow(`    ⚠ No spread model for ${sport}`));
  }

  const predictions: Record<string, GamePrediction> = {};

  for (const game of games) {
    let moneylineProb = 0.5; // Default neutral
    let spreadProb = 0.5;

    // Use EXACT same prediction function as CLI recommend
    if (moneylineModel) {
      try {
        moneylineProb = predictHomeWinProbability(
          db,
          moneylineModel,
          game.id,
          game.homeTeamId,
          game.awayTeamId,
          game.season,
          game.date,
        );
      } catch (error) {
        console.warn(`    ⚠ Failed to predict moneyline for game ${game.id}: ${error}`);
      }
    }

    if (spreadModel) {
      try {
        spreadProb = predictHomeWinProbability(
          db,
          spreadModel,
          game.id,
          game.homeTeamId,
          game.awayTeamId,
          game.season,
          game.date,
        );
      } catch (error) {
        console.warn(`    ⚠ Failed to predict spread for game ${game.id}: ${error}`);
      }
    }

    predictions[game.id] = {
      homeTeamId: game.homeTeamId,
      awayTeamId: game.awayTeamId,
      moneyline: moneylineProb,
      spread: spreadProb,
    };
  }

  console.log(`    ✓ Generated ${Object.keys(predictions).length} predictions`);

  return {
    predictions,
    exportedAt: new Date().toISOString(),
    season,
  };
}

/**
 * Export all teams (ID -> name mapping) for all sports
 */
function exportAllTeams(db: any, sports: string[]): Record<string, Record<string, string>> {
  console.log(`\n  Exporting team names for all sports...`);
  const allTeams: Record<string, Record<string, string>> = {};

  for (const sport of sports) {
    const teams = db
      .prepare('SELECT id, display_name FROM teams WHERE sport = ?')
      .all(sport) as Array<{
      id: string;
      display_name: string;
    }>;

    allTeams[sport] = {};
    for (const team of teams) {
      allTeams[sport][team.id] = team.display_name;
    }
    console.log(`    ${sport}: ${teams.length} teams`);
  }

  return allTeams;
}

/**
 * Export configuration (optimal buckets, etc.)
 */
function exportConfig(): Record<string, unknown> {
  console.log(`\n  Exporting configuration...`);
  return {
    optimalBuckets: OPTIMAL_BUCKETS,
    exportedAt: new Date().toISOString(),
  };
}

/**
 * Upload file to S3
 */
function uploadToS3(localPath: string, s3Path: string, bucket: string): void {
  try {
    const command = `aws s3 cp "${localPath}" "s3://${bucket}/${s3Path}"`;
    console.log(chalk.dim(`    Uploading: ${s3Path}`));
    execSync(command, { stdio: 'pipe' });
  } catch (error) {
    console.error(chalk.red(`    ✗ Failed to upload ${s3Path}`));
    throw error;
  }
}

/**
 * Upload directory to S3 recursively
 */
function uploadDirectoryToS3(localDir: string, s3Prefix: string, bucket: string): void {
  try {
    const command = `aws s3 sync "${localDir}" "s3://${bucket}/${s3Prefix}" --exclude "*.gitkeep"`;
    console.log(chalk.dim(`    Syncing: ${localDir} → ${s3Prefix}`));
    execSync(command, { stdio: 'pipe' });
  } catch (error) {
    console.error(chalk.red(`    ✗ Failed to sync ${localDir}`));
    throw error;
  }
}

export function syncCommand(): Command {
  const command = new Command('sync');

  command
    .description('Export models, features, and games to AWS S3 for Lambda functions')
    .option('-s, --sports <sports>', 'Comma-separated list of sports (default: nba,ncaam,nhl)')
    .option('-b, --bucket <bucket>', 'S3 bucket name (overrides default naming)')
    .option('--no-upload', 'Skip S3 upload (just export locally)')
    .option('--season <season>', 'Season year to export (default: 2025)', '2025')
    .action((options: { sports?: string; bucket?: string; upload: boolean; season: string }) => {
      console.log(`\n${chalk.bold.cyan('📦 Syncing Data to S3')}\n`);

      const supportedSports = options.sports?.split(',') || ['nba', 'ncaam', 'nhl'];
      const season = parseInt(options.season, 10);
      const env = getEnv();
      const bucket = options.bucket || `sportline-data-${env}`;

      console.log(`Environment: ${chalk.yellow(env)}`);
      console.log(`S3 Bucket: ${chalk.yellow(bucket)}`);
      console.log(`Season: ${chalk.yellow(season)}`);
      console.log(`Sports: ${chalk.yellow(supportedSports.join(', '))}\n`);

      // Create export directory
      const exportDir = path.join(process.cwd(), 'data', 'export');
      if (!fs.existsSync(exportDir)) {
        fs.mkdirSync(exportDir, { recursive: true });
      }

      const featuresDir = path.join(exportDir, 'features');
      if (!fs.existsSync(featuresDir)) {
        fs.mkdirSync(featuresDir, { recursive: true });
      }

      const db = getDatabase();

      for (const sport of supportedSports) {
        console.log(`${chalk.bold(sport.toUpperCase())}:`);

        try {
          // 1. Export upcoming games
          console.log(`  ${chalk.cyan('→')} Exporting upcoming games...`);
          const gamesData = exportUpcomingGames(db, sport);
          const gamesPath = path.join(featuresDir, `${sport}-games.json`);
          fs.writeFileSync(gamesPath, JSON.stringify(gamesData, null, 2));
          console.log(chalk.green(`    ✓ Saved to ${gamesPath}`));

          // 2. Extract unique team IDs from upcoming games
          const teamIds = new Set<string>();
          for (const game of gamesData.games) {
            teamIds.add(game.homeTeamId);
            teamIds.add(game.awayTeamId);
          }

          if (teamIds.size === 0) {
            console.log(chalk.yellow(`    ⚠ No upcoming games, skipping exports`));
            continue;
          }

          // 3. Export game predictions (NEW - uses CLI prediction code!)
          console.log(`  ${chalk.cyan('→')} Computing game predictions...`);
          const predictionsData = exportGamePredictions(db, sport, season, gamesData.games);
          const predictionsPath = path.join(featuresDir, `${sport}-predictions.json`);
          fs.writeFileSync(predictionsPath, JSON.stringify(predictionsData, null, 2));
          console.log(chalk.green(`    ✓ Saved to ${predictionsPath}`));

          // 4. Export team features
          console.log(`  ${chalk.cyan('→')} Exporting team features...`);
          const featuresData = exportTeamFeatures(db, sport, season, teamIds);
          const featuresPath = path.join(featuresDir, `${sport}-features.json`);
          fs.writeFileSync(featuresPath, JSON.stringify(featuresData, null, 2));
          console.log(chalk.green(`    ✓ Saved to ${featuresPath}`));

          // 5. Check for models
          const modelsDir = path.join(process.cwd(), 'data', 'models', sport);
          if (fs.existsSync(modelsDir)) {
            console.log(chalk.green(`    ✓ Models found at ${modelsDir}`));
          } else {
            console.log(chalk.yellow(`    ⚠ No models found at ${modelsDir}`));
          }
        } catch (error) {
          console.error(
            chalk.red(`    ✗ Failed to export data for ${sport}:`),
            (error as Error).message,
          );
          continue;
        }

        console.log('');
      }

      // 5. Export teams and config (shared across all sports)
      const teamsData = exportAllTeams(db, supportedSports);
      const teamsPath = path.join(featuresDir, 'teams.json');
      fs.writeFileSync(teamsPath, JSON.stringify(teamsData, null, 2));
      console.log(chalk.green(`  ✓ Saved teams to ${teamsPath}`));

      const configData = exportConfig();
      const configPath = path.join(featuresDir, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify(configData, null, 2));
      console.log(chalk.green(`  ✓ Saved config to ${configPath}`));

      db.close();

      // Upload to S3 if enabled
      if (options.upload) {
        console.log(`${chalk.bold.cyan('☁️  Uploading to S3')}\n`);

        try {
          // Upload features
          console.log(`${chalk.bold('Features:')}`);
          uploadDirectoryToS3(featuresDir, 'features', bucket);
          console.log(chalk.green(`  ✓ Features uploaded\n`));

          // Upload models
          const modelsDir = path.join(process.cwd(), 'data', 'models');
          if (fs.existsSync(modelsDir)) {
            console.log(`${chalk.bold('Models:')}`);
            uploadDirectoryToS3(modelsDir, 'models', bucket);
            console.log(chalk.green(`  ✓ Models uploaded\n`));
          }

          console.log(chalk.bold.green('✓ Sync complete!'));
          console.log(chalk.dim(`  Bucket: s3://${bucket}`));
        } catch (error) {
          console.error(chalk.red('\n✗ Upload failed:'), (error as Error).message);
          console.log(
            chalk.yellow('\nTip: Make sure AWS CLI is configured and you have S3 permissions'),
          );
          process.exit(1);
        }
      } else {
        console.log(chalk.yellow('⚠  Skipping S3 upload (--no-upload flag set)'));
        console.log(chalk.dim(`  Local export directory: ${exportDir}`));
      }
    });

  return command;
}

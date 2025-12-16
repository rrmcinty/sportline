/**
 * Update command - Fetch fresh odds and update game data for upcoming games
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface UpdateOptions {
  daysBack?: string;
  daysForward?: string;
}

export async function update(options: UpdateOptions): Promise<void> {
  console.log(chalk.cyan.bold('\n🔄 Sportline Data Update\n'));

  const dbPath = path.join(process.cwd(), 'data', 'sportline.db');
  const updateScriptPath = path.join(process.cwd(), 'src/ingest/updateRecentGames.ts');

  // Default values (look back 1 day, forward 3 days to avoid overwhelming API)
  const daysBack = options.daysBack || '1';
  const daysForward = options.daysForward || '3';

  console.log(`Updating games from ${daysBack} day(s) ago to ${daysForward} day(s) ahead...`);
  console.log(`Database: ${dbPath}`);
  console.log(`Script: ${updateScriptPath}\n`);

  // Run the update script as a child process
  const child = spawn('node', [updateScriptPath, daysBack, daysForward], {
    stdio: 'inherit',
    cwd: process.cwd()
  });

  return new Promise((resolve, reject) => {
    child.on('close', (code) => {
      if (code === 0) {
        console.log(chalk.green('\n✅ Update complete!'));
        console.log(chalk.gray('Run "sportline recommend" to see updated recommendations.'));
        resolve();
      } else {
        console.error(chalk.red(`\n❌ Update failed with exit code ${code}`));
        reject(new Error(`Update script failed with code ${code}`));
      }
    });

    child.on('error', (error) => {
      console.error(chalk.red('Error running update script:'), error);
      reject(error);
    });
  });
}
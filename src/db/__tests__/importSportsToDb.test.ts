import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function makeTempDir(): { dir: string; cleanup: () => void } {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sportline-import-test-'));
    return {
        dir,
        cleanup: () => {
            try {
                fs.rmSync(dir, { recursive: true, force: true });
            } catch {
                // ignore
            }
        },
    };
}

describe('importSportsToDb', () => {
    it('imports teams, games, odds, game_stats, and season_stats into sqlite db', () => {
        const { dir, cleanup } = makeTempDir();

        try {
            const sport = 'ncaam';
            const season = 2025;

            const dataDir = path.join(dir, 'data', sport, String(season));
            fs.mkdirSync(dataDir, { recursive: true });

            fs.writeFileSync(
                path.join(dataDir, 'teams.json'),
                JSON.stringify(
                    [
                        {
                            teamId: 'team1',
                            teamName: 'Team One',
                            abbreviation: 'T1',
                            displayName: 'Team One',
                            shortDisplayName: 'One',
                        },
                        {
                            teamId: 'team2',
                            teamName: 'Team Two',
                            abbreviation: 'T2',
                            displayName: 'Team Two',
                            shortDisplayName: 'Two',
                        },
                    ],
                    null,
                    2,
                ),
            );

            fs.writeFileSync(
                path.join(dataDir, 'games.json'),
                JSON.stringify(
                    [
                        {
                            id: 'game1',
                            date: '2025-01-01T05:00:00Z',
                            homeTeamId: 'team1',
                            awayTeamId: 'team2',
                            homeScore: null,
                            awayScore: null,
                            venue: 'Arena',
                            status: 'scheduled',
                        },
                    ],
                    null,
                    2,
                ),
            );

            fs.writeFileSync(
                path.join(dataDir, 'odds.json'),
                JSON.stringify(
                    [
                        {
                            eventId: 'game1',
                            provider: 'espn',
                            market: 'moneyline',
                            homeTeamOdds: 110,
                            awayTeamOdds: -110,
                        },
                        {
                            eventId: 'game1',
                            provider: 'espn',
                            market: 'spread',
                            value: -3.5,
                            homeTeamOdds: -110,
                            awayTeamOdds: -110,
                        },
                        {
                            eventId: 'game1',
                            provider: 'espn',
                            market: 'total',
                            value: 220.5,
                            overOdds: -105,
                            underOdds: -115,
                        },
                    ],
                    null,
                    2,
                ),
            );

            fs.writeFileSync(
                path.join(dataDir, 'game_stats.json'),
                JSON.stringify(
                    [
                        {
                            game_id: 'game1',
                            team_id: 'team1',
                            stats: [
                                {
                                    name: 'fieldGoalsMade-fieldGoalsAttempted',
                                    value: '10-20',
                                },
                            ],
                        },
                    ],
                    null,
                    2,
                ),
            );

            fs.writeFileSync(
                path.join(dataDir, 'season_stats.json'),
                JSON.stringify(
                    [
                        {
                            teamId: 'team1',
                            stats: {
                                categories: [
                                    {
                                        name: 'General',
                                        stats: [
                                            {
                                                name: 'wins',
                                                abbreviation: 'W',
                                                value: '20',
                                            },
                                        ],
                                    },
                                ],
                            },
                        },
                    ],
                    null,
                    2,
                ),
            );

            const repoRoot = path.resolve(__dirname, '../../..');
            const schemaPath = path.join(repoRoot, 'src', 'db', 'schema.sql');
            const importScriptPath = path.join(repoRoot, 'src', 'db', 'importSportsToDb.ts');

            const requireFromRepo = createRequire(path.join(repoRoot, 'package.json'));
            const tsNodeLoaderPath = requireFromRepo.resolve('ts-node/esm');

            const dbPath = path.join(dir, 'data', 'sportline.db');
            fs.mkdirSync(path.dirname(dbPath), { recursive: true });

            const schemaSql = fs.readFileSync(schemaPath, 'utf8');
            const db = new Database(dbPath);
            db.exec(schemaSql);
            db.close();

            const result = spawnSync(
                process.execPath,
                ['--loader', tsNodeLoaderPath, importScriptPath, sport, String(season)],
                { cwd: dir, encoding: 'utf8' },
            );

            if (result.status !== 0) {
                throw new Error(
                    `importSportsToDb exited with status ${result.status}\n` +
                    `stdout:\n${result.stdout || ''}\n` +
                    `stderr:\n${result.stderr || ''}`,
                );
            }

            expect(result.status).toBe(0);

            const db2 = new Database(dbPath, { readonly: true });
            const teamsCount = db2.prepare('SELECT COUNT(*) as c FROM teams WHERE sport = ?').get(sport) as {
                c: number;
            };
            const gamesCount = db2.prepare('SELECT COUNT(*) as c FROM games WHERE sport = ?').get(sport) as {
                c: number;
            };
            const oddsCount = db2.prepare('SELECT COUNT(*) as c FROM odds WHERE game_id = ?').get('game1') as {
                c: number;
            };
            const gameStatsMade = db2
                .prepare(
                    'SELECT COUNT(*) as c FROM game_stats WHERE game_id = ? AND team_id = ? AND metric_name = ?',
                )
                .get('game1', 'team1', 'fieldGoalsMade') as { c: number };
            const gameStatsAtt = db2
                .prepare(
                    'SELECT COUNT(*) as c FROM game_stats WHERE game_id = ? AND team_id = ? AND metric_name = ?',
                )
                .get('game1', 'team1', 'fieldGoalsAttempted') as { c: number };
            const seasonStatsCount = db2
                .prepare('SELECT COUNT(*) as c FROM season_stats WHERE team_id = ? AND sport = ? AND season = ?')
                .get('team1', sport, season) as { c: number };

            expect(teamsCount.c).toBe(2);
            expect(gamesCount.c).toBe(1);
            expect(oddsCount.c).toBe(3);
            expect(gameStatsMade.c).toBe(1);
            expect(gameStatsAtt.c).toBe(1);
            expect(seasonStatsCount.c).toBe(1);

            db2.close();
        } finally {
            cleanup();
        }
    });

    it('skips games with missing teams and writes missing_teams.log', () => {
        const { dir, cleanup } = makeTempDir();

        try {
            const sport = 'nba';
            const season = 2024;

            const dataDir = path.join(dir, 'data', sport, String(season));
            fs.mkdirSync(dataDir, { recursive: true });

            // Only one team exists; game references missing away team
            fs.writeFileSync(
                path.join(dataDir, 'teams.json'),
                JSON.stringify(
                    [
                        {
                            teamId: 'team1',
                            teamName: 'Team One',
                            abbreviation: 'T1',
                            displayName: 'Team One',
                            shortDisplayName: 'One',
                        },
                    ],
                    null,
                    2,
                ),
            );

            fs.writeFileSync(
                path.join(dataDir, 'games.json'),
                JSON.stringify(
                    [
                        {
                            id: 'game_missing_team',
                            date: '2024-01-01T05:00:00Z',
                            homeTeamId: 'team1',
                            awayTeamId: 'team2',
                            homeScore: null,
                            awayScore: null,
                            venue: 'Arena',
                            status: 'scheduled',
                        },
                    ],
                    null,
                    2,
                ),
            );

            // Still required by the importer
            fs.writeFileSync(path.join(dataDir, 'odds.json'), JSON.stringify([], null, 2));
            fs.writeFileSync(path.join(dataDir, 'game_stats.json'), JSON.stringify([], null, 2));
            fs.writeFileSync(path.join(dataDir, 'season_stats.json'), JSON.stringify([], null, 2));

            const repoRoot = path.resolve(__dirname, '../../..');
            const schemaPath = path.join(repoRoot, 'src', 'db', 'schema.sql');
            const importScriptPath = path.join(repoRoot, 'src', 'db', 'importSportsToDb.ts');

            const requireFromRepo = createRequire(path.join(repoRoot, 'package.json'));
            const tsNodeLoaderPath = requireFromRepo.resolve('ts-node/esm');

            const dbPath = path.join(dir, 'data', 'sportline.db');
            fs.mkdirSync(path.dirname(dbPath), { recursive: true });

            const schemaSql = fs.readFileSync(schemaPath, 'utf8');
            const db = new Database(dbPath);
            db.exec(schemaSql);
            db.close();

            const result = spawnSync(
                process.execPath,
                ['--loader', tsNodeLoaderPath, importScriptPath, sport, String(season)],
                { cwd: dir, encoding: 'utf8' },
            );

            if (result.status !== 0) {
                throw new Error(
                    `importSportsToDb exited with status ${result.status}\n` +
                    `stdout:\n${result.stdout || ''}\n` +
                    `stderr:\n${result.stderr || ''}`,
                );
            }

            const db2 = new Database(dbPath, { readonly: true });
            const gamesCount = db2.prepare('SELECT COUNT(*) as c FROM games WHERE sport = ?').get(sport) as {
                c: number;
            };
            expect(gamesCount.c).toBe(0);
            db2.close();

            const missingTeamsLog = fs.readFileSync(path.join(dataDir, 'missing_teams.log'), 'utf8');
            expect(missingTeamsLog).toContain('Game game_missing_team: missing team(s): team2');
        } finally {
            cleanup();
        }
    });

    it('logs odds rows with missing market and odds rows referencing missing games', () => {
        const { dir, cleanup } = makeTempDir();

        try {
            const sport = 'nba';
            const season = 2024;

            const dataDir = path.join(dir, 'data', sport, String(season));
            fs.mkdirSync(dataDir, { recursive: true });

            fs.writeFileSync(
                path.join(dataDir, 'teams.json'),
                JSON.stringify(
                    [
                        {
                            teamId: 'team1',
                            teamName: 'Team One',
                            abbreviation: 'T1',
                            displayName: 'Team One',
                            shortDisplayName: 'One',
                        },
                        {
                            teamId: 'team2',
                            teamName: 'Team Two',
                            abbreviation: 'T2',
                            displayName: 'Team Two',
                            shortDisplayName: 'Two',
                        },
                    ],
                    null,
                    2,
                ),
            );

            fs.writeFileSync(
                path.join(dataDir, 'games.json'),
                JSON.stringify(
                    [
                        {
                            id: 'game1',
                            date: '2024-01-01T05:00:00Z',
                            homeTeamId: 'team1',
                            awayTeamId: 'team2',
                            homeScore: null,
                            awayScore: null,
                            venue: 'Arena',
                            status: 'scheduled',
                        },
                    ],
                    null,
                    2,
                ),
            );

            fs.writeFileSync(
                path.join(dataDir, 'odds.json'),
                JSON.stringify(
                    [
                        {
                            eventId: 'game1',
                            provider: 'espn',
                            // missing market on purpose
                            homeTeamOdds: 110,
                            awayTeamOdds: -110,
                        },
                        {
                            eventId: 'game_does_not_exist',
                            provider: 'espn',
                            market: 'moneyline',
                            homeTeamOdds: 110,
                            awayTeamOdds: -110,
                        },
                    ],
                    null,
                    2,
                ),
            );

            // Still required by the importer
            fs.writeFileSync(path.join(dataDir, 'game_stats.json'), JSON.stringify([], null, 2));
            fs.writeFileSync(path.join(dataDir, 'season_stats.json'), JSON.stringify([], null, 2));

            const repoRoot = path.resolve(__dirname, '../../..');
            const schemaPath = path.join(repoRoot, 'src', 'db', 'schema.sql');
            const importScriptPath = path.join(repoRoot, 'src', 'db', 'importSportsToDb.ts');

            const requireFromRepo = createRequire(path.join(repoRoot, 'package.json'));
            const tsNodeLoaderPath = requireFromRepo.resolve('ts-node/esm');

            const dbPath = path.join(dir, 'data', 'sportline.db');
            fs.mkdirSync(path.dirname(dbPath), { recursive: true });

            const schemaSql = fs.readFileSync(schemaPath, 'utf8');
            const db = new Database(dbPath);
            db.exec(schemaSql);
            db.close();

            const result = spawnSync(
                process.execPath,
                ['--loader', tsNodeLoaderPath, importScriptPath, sport, String(season)],
                { cwd: dir, encoding: 'utf8' },
            );

            if (result.status !== 0) {
                throw new Error(
                    `importSportsToDb exited with status ${result.status}\n` +
                    `stdout:\n${result.stdout || ''}\n` +
                    `stderr:\n${result.stderr || ''}`,
                );
            }

            const missingOddsLog = fs.readFileSync(path.join(dataDir, 'missing_odds.log'), 'utf8');
            expect(missingOddsLog).toContain('Odds for game game1 missing market.');

            const missingOddsGamesLog = fs.readFileSync(path.join(dataDir, 'missing_odds_games.log'), 'utf8');
            expect(missingOddsGamesLog).toContain(
                'Odds for game game_does_not_exist (market: moneyline) missing game in games table.',
            );

            const db2 = new Database(dbPath, { readonly: true });
            const oddsCount = db2.prepare('SELECT COUNT(*) as c FROM odds').get() as { c: number };
            // both odds rows should have been skipped
            expect(oddsCount.c).toBe(0);
            db2.close();
        } finally {
            cleanup();
        }
    });
});

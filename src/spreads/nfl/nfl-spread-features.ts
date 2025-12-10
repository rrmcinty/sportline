/**
 * Feature engineering for NFL spread modeling
 * Extends standard features with spread-specific metrics
 */

import type Database from "better-sqlite3";
import { computeFeatures, type GameFeatures } from "../../model/features.js";
import type { NFLSpreadGameFeatures } from "./types.js";

/**
 * Compute NFL spread-specific features for all games
 */
export function computeNFLSpreadFeatures(
  db: Database.Database,
  seasons: number[],
): NFLSpreadGameFeatures[] {
  // Start with standard features
  const standardFeatures = computeFeatures(db, "nfl", seasons);

  // Build ATS history for each team
  const atsHistory = buildATSHistory(db, seasons);

  // Extend with spread-specific features
  const spreadFeatures: NFLSpreadGameFeatures[] = [];

  for (const features of standardFeatures) {
    const gameId = features.gameId;

    // Get spread info
    const spreadLine = features.spreadLine || 0;
    const favoriteTeam =
      spreadLine < 0 ? "home" : spreadLine > 0 ? "away" : null;
    const spreadSize = Math.abs(spreadLine);
    const isTightSpread = spreadSize <= 3 ? 1 : 0;

    // Get team IDs
    const game = db
      .prepare(
        `
      SELECT home_team_id, away_team_id, date
      FROM games
      WHERE id = ?
    `,
      )
      .get(gameId) as
      | { home_team_id: number; away_team_id: number; date: string }
      | undefined;

    if (!game) continue;

    const homeTeamId = game.home_team_id;
    const awayTeamId = game.away_team_id;
    const gameDate = game.date;

    // Get ATS records
    const homeATS5 = getATSRecord(atsHistory, homeTeamId, gameDate, 5);
    const awayATS5 = getATSRecord(atsHistory, awayTeamId, gameDate, 5);
    const homeATS10 = getATSRecord(atsHistory, homeTeamId, gameDate, 10);
    const awayATS10 = getATSRecord(atsHistory, awayTeamId, gameDate, 10);

    // Get ATS margins
    const homeATSMargin5 = getATSMargin(atsHistory, homeTeamId, gameDate, 5);
    const awayATSMargin5 = getATSMargin(atsHistory, awayTeamId, gameDate, 5);
    const homeATSMargin10 = getATSMargin(atsHistory, homeTeamId, gameDate, 10);
    const awayATSMargin10 = getATSMargin(atsHistory, awayTeamId, gameDate, 10);

    // Compute spread movement (placeholder - would need opening line data)
    const spreadMovement = 0; // TODO: track opening vs closing spread

    // Compute market overreaction (spread vs recent performance)
    const recentMarginDiff = features.homeAvgMargin5 - features.awayAvgMargin5;
    const marketOverreaction = Math.abs(spreadLine - recentMarginDiff);

    // Rest days (placeholder - would need game schedule data)
    const homeRestDays = null;
    const awayRestDays = null;

    spreadFeatures.push({
      ...features,
      homeATSRecord5: homeATS5.winRate,
      awayATSRecord5: awayATS5.winRate,
      homeATSRecord10: homeATS10.winRate,
      awayATSRecord10: awayATS10.winRate,
      homeATSMargin5: homeATSMargin5,
      awayATSMargin5: awayATSMargin5,
      homeATSMargin10: homeATSMargin10,
      awayATSMargin10: awayATSMargin10,
      spreadMovement,
      marketOverreaction,
      homeRestDays,
      awayRestDays,
      favoriteTeam,
      spreadSize,
      isTightSpread,
    });
  }

  return spreadFeatures;
}

/**
 * Build ATS (Against The Spread) history for all teams
 */
function buildATSHistory(
  db: Database.Database,
  seasons: number[],
): Map<
  number,
  Array<{ date: string; covered: boolean; margin: number; spread: number }>
> {
  const seasonPlaceholders = seasons.map(() => "?").join(",");

  const games = db
    .prepare(
      `
    SELECT 
      g.id,
      g.date,
      g.home_team_id,
      g.away_team_id,
      g.home_score,
      g.away_score,
      o.line as spread
    FROM games g
    LEFT JOIN odds o ON g.id = o.game_id AND o.market = 'spread'
    WHERE g.sport = 'nfl' 
      AND g.season IN (${seasonPlaceholders})
      AND g.home_score IS NOT NULL
      AND g.away_score IS NOT NULL
      AND o.line IS NOT NULL
    ORDER BY g.date ASC
  `,
    )
    .all(...seasons) as Array<{
    id: number;
    date: string;
    home_team_id: number;
    away_team_id: number;
    home_score: number;
    away_score: number;
    spread: number;
  }>;

  const atsHistory = new Map<
    number,
    Array<{ date: string; covered: boolean; margin: number; spread: number }>
  >();

  for (const game of games) {
    const actualMargin = game.home_score - game.away_score;
    const homeMarginVsSpread = actualMargin + game.spread; // If home is -7 and wins by 10, margin is +3
    const homeCovered = homeMarginVsSpread > 0;
    const awayCovered = homeMarginVsSpread < 0;

    // Record for home team
    if (!atsHistory.has(game.home_team_id)) {
      atsHistory.set(game.home_team_id, []);
    }
    atsHistory.get(game.home_team_id)!.push({
      date: game.date,
      covered: homeCovered,
      margin: homeMarginVsSpread,
      spread: -game.spread, // Home perspective
    });

    // Record for away team
    if (!atsHistory.has(game.away_team_id)) {
      atsHistory.set(game.away_team_id, []);
    }
    atsHistory.get(game.away_team_id)!.push({
      date: game.date,
      covered: awayCovered,
      margin: -homeMarginVsSpread,
      spread: game.spread, // Away perspective
    });
  }

  return atsHistory;
}

/**
 * Get ATS win rate for a team over last N games before a date
 */
function getATSRecord(
  atsHistory: Map<
    number,
    Array<{ date: string; covered: boolean; margin: number; spread: number }>
  >,
  teamId: number,
  beforeDate: string,
  n: number,
): { winRate: number; sampleSize: number } {
  const history = atsHistory.get(teamId) || [];
  const relevantGames = history.filter((g) => g.date < beforeDate).slice(-n);

  if (relevantGames.length === 0) {
    return { winRate: 0.5, sampleSize: 0 };
  }

  const covers = relevantGames.filter((g) => g.covered).length;
  return {
    winRate: covers / relevantGames.length,
    sampleSize: relevantGames.length,
  };
}

/**
 * Get average ATS margin for a team over last N games before a date
 */
function getATSMargin(
  atsHistory: Map<
    number,
    Array<{ date: string; covered: boolean; margin: number; spread: number }>
  >,
  teamId: number,
  beforeDate: string,
  n: number,
): number {
  const history = atsHistory.get(teamId) || [];
  const relevantGames = history.filter((g) => g.date < beforeDate).slice(-n);

  if (relevantGames.length === 0) {
    return 0;
  }

  const totalMargin = relevantGames.reduce((sum, g) => sum + g.margin, 0);
  return totalMargin / relevantGames.length;
}

/**
 * Filter to games with spreads only
 */
export function filterSpreadGames(
  features: NFLSpreadGameFeatures[],
): NFLSpreadGameFeatures[] {
  return features.filter((f) => f.spreadLine !== null && f.spreadLine !== 0);
}

/**
 * Feature engineering for predictive modeling
 */

import type Database from "better-sqlite3";

export interface GameFeatures {
  gameId: number;
  homeWinRate5: number;  // Last 5 games win rate
  awayWinRate5: number;
  homeAvgMargin5: number;  // Last 5 games average margin
  awayAvgMargin5: number;
  homeAdvantage: number;  // 1 for home, 0 for neutral/away
}

/**
 * Compute features for all games
 */
export function computeFeatures(db: Database.Database, sport: string, season: number): GameFeatures[] {
  const games = db.prepare(`
    SELECT id, date, home_team_id, away_team_id, home_score, away_score
    FROM games
    WHERE sport = ? AND season = ?
    ORDER BY date ASC
  `).all(sport, season) as Array<{
    id: number;
    date: string;
    home_team_id: number;
    away_team_id: number;
    home_score: number | null;
    away_score: number | null;
  }>;

  const features: GameFeatures[] = [];

  // Build team performance history
  const teamHistory = new Map<number, Array<{ date: string; margin: number; won: boolean }>>();

  for (const game of games) {
    const homeHistory = teamHistory.get(game.home_team_id) || [];
    const awayHistory = teamHistory.get(game.away_team_id) || [];

    // Compute rolling features
    const homeWinRate5 = computeWinRate(homeHistory, 5);
    const awayWinRate5 = computeWinRate(awayHistory, 5);
    const homeAvgMargin5 = computeAvgMargin(homeHistory, 5);
    const awayAvgMargin5 = computeAvgMargin(awayHistory, 5);

    features.push({
      gameId: game.id,
      homeWinRate5,
      awayWinRate5,
      homeAvgMargin5,
      awayAvgMargin5,
      homeAdvantage: 1  // Assume home advantage
    });

    // Update history if game is complete
    if (game.home_score !== null && game.away_score !== null) {
      const homeMargin = game.home_score - game.away_score;
      const awayMargin = game.away_score - game.home_score;

      homeHistory.push({
        date: game.date,
        margin: homeMargin,
        won: homeMargin > 0
      });

      awayHistory.push({
        date: game.date,
        margin: awayMargin,
        won: awayMargin > 0
      });

      teamHistory.set(game.home_team_id, homeHistory);
      teamHistory.set(game.away_team_id, awayHistory);
    }
  }

  return features;
}

/**
 * Compute win rate over last N games
 */
function computeWinRate(history: Array<{ won: boolean }>, window: number): number {
  if (history.length === 0) return 0.5;  // Neutral prior
  const recent = history.slice(-window);
  const wins = recent.filter(g => g.won).length;
  return wins / recent.length;
}

/**
 * Compute average margin over last N games
 */
function computeAvgMargin(history: Array<{ margin: number }>, window: number): number {
  if (history.length === 0) return 0;
  const recent = history.slice(-window);
  const sum = recent.reduce((acc, g) => acc + g.margin, 0);
  return sum / recent.length;
}

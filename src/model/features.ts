/**
 * Feature engineering for predictive modeling
 */

import type Database from "better-sqlite3";

export interface GameFeatures {
  gameId: number;
  date: string;  // Game date for temporal splitting
  homeWinRate5: number;  // Last 5 games win rate
  awayWinRate5: number;
  homeAvgMargin5: number;  // Last 5 games average margin
  awayAvgMargin5: number;
  homeAdvantage: number;  // 1 for home, 0 for neutral/away
  homeOppWinRate5: number;  // Avg opponent win rate (SoS)
  awayOppWinRate5: number;
  homeOppAvgMargin5: number;  // Avg opponent margin (SoS quality)
  awayOppAvgMargin5: number;
  marketImpliedProb: number;  // Market consensus probability for home team win
  spreadLine: number | null;  // Spread line (negative = home favored, e.g., -7.5)
  spreadMarketImpliedProb: number | null;  // Market consensus for home team covering spread
}

/**
 * Compute features for all games
 */
export function computeFeatures(db: Database.Database, sport: string, season: number): GameFeatures[] {
  const games = db.prepare(`
    SELECT g.id, g.date, g.home_team_id, g.away_team_id, g.home_score, g.away_score
    FROM games g
    WHERE g.sport = ? AND g.season = ?
    ORDER BY g.date ASC
  `).all(sport, season) as Array<{
    id: number;
    date: string;
    home_team_id: number;
    away_team_id: number;
    home_score: number | null;
    away_score: number | null;
  }>;

  // Fetch market odds for all games (moneyline and spread)
  const marketOdds = new Map<number, { homePrice: number; awayPrice: number }>();
  const spreadOdds = new Map<number, { line: number; homePrice: number; awayPrice: number }>();
  
  const moneylineData = db.prepare(`
    SELECT game_id, price_home, price_away
    FROM odds
    WHERE market = 'moneyline'
  `).all() as Array<{
    game_id: number;
    price_home: number | null;
    price_away: number | null;
  }>;

  for (const odd of moneylineData) {
    if (odd.price_home && odd.price_away) {
      marketOdds.set(odd.game_id, {
        homePrice: odd.price_home,
        awayPrice: odd.price_away
      });
    }
  }

  const spreadData = db.prepare(`
    SELECT game_id, line, price_home, price_away
    FROM odds
    WHERE market = 'spread'
  `).all() as Array<{
    game_id: number;
    line: number | null;
    price_home: number | null;
    price_away: number | null;
  }>;

  for (const odd of spreadData) {
    if (odd.line !== null && odd.price_home && odd.price_away) {
      spreadOdds.set(odd.game_id, {
        line: odd.line,
        homePrice: odd.price_home,
        awayPrice: odd.price_away
      });
    }
  }

  const features: GameFeatures[] = [];

  // Build team performance history
  const teamHistory = new Map<number, Array<{ date: string; margin: number; won: boolean; oppTeamId: number }>>();

  for (const game of games) {
    const homeHistory = teamHistory.get(game.home_team_id) || [];
    const awayHistory = teamHistory.get(game.away_team_id) || [];

    // Compute rolling features
    const homeWinRate5 = computeWinRate(homeHistory, 5);
    const awayWinRate5 = computeWinRate(awayHistory, 5);
    const homeAvgMargin5 = computeAvgMargin(homeHistory, 5);
    const awayAvgMargin5 = computeAvgMargin(awayHistory, 5);

    // Compute SoS: average opponent stats
    const homeOppWinRate5 = computeOpponentAvgWinRate(homeHistory, teamHistory, 5);
    const awayOppWinRate5 = computeOpponentAvgWinRate(awayHistory, teamHistory, 5);
    const homeOppAvgMargin5 = computeOpponentAvgMargin(homeHistory, teamHistory, 5);
    const awayOppAvgMargin5 = computeOpponentAvgMargin(awayHistory, teamHistory, 5);

    // Compute market implied probability (vig-free) for moneyline
    let marketImpliedProb = 0.5;  // Default to 50/50 if no odds
    const odds = marketOdds.get(game.id);
    if (odds) {
      const homeImplied = americanToImplied(odds.homePrice);
      const awayImplied = americanToImplied(odds.awayPrice);
      const total = homeImplied + awayImplied;
      // Remove vig by normalizing
      marketImpliedProb = homeImplied / total;
    }

    // Compute spread line and market implied probability for spread
    let spreadLine: number | null = null;
    let spreadMarketImpliedProb: number | null = null;
    const spread = spreadOdds.get(game.id);
    if (spread) {
      spreadLine = spread.line;
      const homeImplied = americanToImplied(spread.homePrice);
      const awayImplied = americanToImplied(spread.awayPrice);
      const total = homeImplied + awayImplied;
      spreadMarketImpliedProb = homeImplied / total;
    }

    features.push({
      gameId: game.id,
      date: game.date,
      homeWinRate5,
      awayWinRate5,
      homeAvgMargin5,
      awayAvgMargin5,
      homeAdvantage: 1,  // Assume home advantage
      homeOppWinRate5,
      awayOppWinRate5,
      homeOppAvgMargin5,
      awayOppAvgMargin5,
      marketImpliedProb,
      spreadLine,
      spreadMarketImpliedProb
    });

    // Update history if game is complete
    if (game.home_score !== null && game.away_score !== null) {
      const homeMargin = game.home_score - game.away_score;
      const awayMargin = game.away_score - game.home_score;

      homeHistory.push({
        date: game.date,
        margin: homeMargin,
        won: homeMargin > 0,
        oppTeamId: game.away_team_id
      });

      awayHistory.push({
        date: game.date,
        margin: awayMargin,
        won: awayMargin > 0,
        oppTeamId: game.home_team_id
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

/**
 * Convert American odds to implied probability
 */
function americanToImplied(price: number): number {
  if (price > 0) {
    return 100 / (price + 100);
  } else {
    return -price / (-price + 100);
  }
}

/**
 * Compute average opponent win rate (SoS)
 */
function computeOpponentAvgWinRate(
  history: Array<{ oppTeamId: number }>,
  teamHistory: Map<number, Array<{ won: boolean }>>,
  window: number
): number {
  if (history.length === 0) return 0.5;
  const recent = history.slice(-window);
  let sumOppWinRate = 0;
  let count = 0;
  for (const game of recent) {
    const oppHistory = teamHistory.get(game.oppTeamId);
    if (oppHistory && oppHistory.length > 0) {
      const oppWinRate = computeWinRate(oppHistory, 5);
      sumOppWinRate += oppWinRate;
      count++;
    }
  }
  return count > 0 ? sumOppWinRate / count : 0.5;
}

/**
 * Compute average opponent margin (SoS quality)
 */
function computeOpponentAvgMargin(
  history: Array<{ oppTeamId: number }>,
  teamHistory: Map<number, Array<{ margin: number }>>,
  window: number
): number {
  if (history.length === 0) return 0;
  const recent = history.slice(-window);
  let sumOppMargin = 0;
  let count = 0;
  for (const game of recent) {
    const oppHistory = teamHistory.get(game.oppTeamId);
    if (oppHistory && oppHistory.length > 0) {
      const oppMargin = computeAvgMargin(oppHistory, 5);
      sumOppMargin += oppMargin;
      count++;
    }
  }
  return count > 0 ? sumOppMargin / count : 0;
}

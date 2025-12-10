/**
 * Feature engineering for predictive modeling
 */

import type Database from "better-sqlite3";

export interface GameFeatures {
  // Basketball-specific features
  fg_pct?: number;
  fg3_pct?: number;
  turnovers?: number;
  fgs_attempted?: number;
  steals?: number;
  gameId: number;
  date: string; // Game date for temporal splitting
  homeWinRate5: number; // Last 5 games win rate
  awayWinRate5: number;
  homeAvgMargin5: number; // Last 5 games average margin
  awayAvgMargin5: number;
  homeAdvantage: number; // 1 for home, 0 for neutral/away
  homeOppWinRate5: number; // Avg opponent win rate (SoS)
  awayOppWinRate5: number;
  homeOppAvgMargin5: number; // Avg opponent margin (SoS quality)
  awayOppAvgMargin5: number;
  marketImpliedProb: number; // Market consensus probability for home team win
  spreadLine: number | null; // Spread line (negative = home favored, e.g., -7.5)
  spreadMarketImpliedProb: number | null; // Market consensus for home team covering spread
  totalLine: number | null; // Total points line
  totalMarketImpliedProb: number | null; // Market consensus probability for over
  homePointsAvg5: number; // Rolling avg points scored (home team)
  awayPointsAvg5: number; // Rolling avg points scored (away team)
  homeOppPointsAvg5: number; // Rolling avg points allowed by home opponents
  awayOppPointsAvg5: number; // Rolling avg points allowed by away opponents
  homePace5: number; // Rolling avg combined points (proxy for pace/tempo)
  awayPace5: number; // Rolling avg combined points (proxy for pace/tempo)
  homeOffEff5: number; // Rolling avg points scored (offensive efficiency proxy)
  awayOffEff5: number; // Rolling avg points scored (offensive efficiency proxy)
  homeDefEff5: number; // Rolling avg points allowed (defensive efficiency proxy)
  awayDefEff5: number; // Rolling avg points allowed (defensive efficiency proxy)
  // 10-game window features for better stability
  homeWinRate10: number;
  awayWinRate10: number;
  homeAvgMargin10: number;
  awayAvgMargin10: number;
  homeOppWinRate10: number;
  awayOppWinRate10: number;
  homeOppAvgMargin10: number;
  awayOppAvgMargin10: number;
  homePointsAvg10: number;
  awayPointsAvg10: number;
  homeOppPointsAvg10: number;
  awayOppPointsAvg10: number;
  homePace10: number;
  awayPace10: number;
  homeOffEff10: number;
  awayOffEff10: number;
  homeDefEff10: number;
  awayDefEff10: number;
  home_fg_pct?: number;
  away_fg_pct?: number;
  home_fg3_pct?: number;
  away_fg3_pct?: number;
  home_turnovers?: number;
  away_turnovers?: number;
  home_fgs_attempted?: number;
  away_fgs_attempted?: number;
  home_steals?: number;
  away_steals?: number;
}

/**
 * Compute features for all games across multiple seasons
 */
export function computeFeatures(
  db: Database.Database,
  sport: string,
  seasons: number[],
): GameFeatures[] {
  // Helper to get rolling stat for a team
  function getRollingStat(
    teamId: number,
    stat: string,
    gameDate: string,
    window: number,
  ): number | undefined {
    const rows = db
      .prepare(
        `
          SELECT metric_value FROM team_stats
          WHERE team_id = ? AND sport = ? AND metric_name = ? AND game_date < ?
          ORDER BY game_date DESC LIMIT ?
        `,
      )
      .all(teamId, sport, stat, gameDate, window) as Array<{
      metric_value: number;
    }>;
    if (!rows.length) {
      return undefined;
    }
    // Use recency weights if available
    const weights =
      window === 5
        ? RECENCY_WEIGHTS_5
        : window === 10
          ? RECENCY_WEIGHTS_10
          : null;
    if (weights && rows.length === weights.length) {
      let weightedSum = 0,
        totalWeight = 0;
      for (let i = 0; i < rows.length; i++) {
        weightedSum += rows[i].metric_value * weights[i];
        totalWeight += weights[i];
      }
      return weightedSum / totalWeight;
    }
    // Fallback to uniform average
    return rows.reduce((acc, r) => acc + r.metric_value, 0) / rows.length;
  }
  // --- Basketball-specific feature computation boilerplate ---
  // Example: Compute rolling averages for basketball stats
  // if (sport === 'nba' || sport === 'ncaam') {
  //   gameFeatures.fg_pct = computeRollingMetric(teamHistory, 'fg_pct', 5);
  //   gameFeatures.fg3_pct = computeRollingMetric(teamHistory, '3p_fg_pct', 5);
  //   gameFeatures.turnovers = computeRollingMetric(teamHistory, 'turnovers', 5);
  //   gameFeatures.fgs_attempted = computeRollingMetric(teamHistory, 'fg_attempted', 5);
  //   gameFeatures.steals = computeRollingMetric(teamHistory, 'steals', 5);
  // }
  const seasonPlaceholders = seasons.map(() => "?").join(",");
  const games = db
    .prepare(
      `
    SELECT g.id, g.date, g.home_team_id, g.away_team_id, g.home_score, g.away_score
    FROM games g
    WHERE g.sport = ? AND g.season IN (${seasonPlaceholders})
    ORDER BY g.date ASC
  `,
    )
    .all(sport, ...seasons) as Array<{
    id: number;
    date: string;
    home_team_id: number;
    away_team_id: number;
    home_score: number | null;
    away_score: number | null;
  }>;

  // Fetch market odds for all games (moneyline, spread, total)
  const marketOdds = new Map<
    number,
    { homePrice: number; awayPrice: number }
  >();
  const spreadOdds = new Map<
    number,
    { line: number; homePrice: number; awayPrice: number }
  >();
  const totalOdds = new Map<
    number,
    { line: number; overPrice: number; underPrice: number }
  >();

  const moneylineData = db
    .prepare(
      `
    SELECT game_id, price_home, price_away
    FROM odds
    WHERE market = 'moneyline'
  `,
    )
    .all() as Array<{
    game_id: number;
    price_home: number | null;
    price_away: number | null;
  }>;

  for (const odd of moneylineData) {
    if (odd.price_home && odd.price_away) {
      marketOdds.set(odd.game_id, {
        homePrice: odd.price_home,
        awayPrice: odd.price_away,
      });
    }
  }

  const spreadData = db
    .prepare(
      `
    SELECT game_id, line, price_home, price_away
    FROM odds
    WHERE market = 'spread'
  `,
    )
    .all() as Array<{
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
        awayPrice: odd.price_away,
      });
    }
  }

  const totalData = db
    .prepare(
      `
    SELECT game_id, line, price_over, price_under
    FROM odds
    WHERE market = 'total'
  `,
    )
    .all() as Array<{
    game_id: number;
    line: number | null;
    price_over: number | null;
    price_under: number | null;
  }>;

  for (const odd of totalData) {
    if (odd.line !== null && odd.price_over && odd.price_under) {
      totalOdds.set(odd.game_id, {
        line: odd.line,
        overPrice: odd.price_over,
        underPrice: odd.price_under,
      });
    }
  }

  const features: GameFeatures[] = [];

  // Build team performance history incrementally
  const teamHistory = new Map<
    number,
    Array<{
      date: string;
      margin: number;
      won: boolean;
      oppTeamId: number;
      pointsFor: number;
      pointsAgainst: number;
      combined: number;
    }>
  >();

  for (const game of games) {
    // Basketball-specific features (NBA/NCAAM)
    let home_fg_pct,
      away_fg_pct,
      home_fg3_pct,
      away_fg3_pct,
      home_turnovers,
      away_turnovers,
      home_fgs_attempted,
      away_fgs_attempted,
      home_steals,
      away_steals;
    if (sport === "nba" || sport === "ncaam") {
      // Use metric names that exist in the database
      home_fg_pct = getRollingStat(
        game.home_team_id,
        "fieldGoalPct",
        game.date,
        5,
      );
      away_fg_pct = getRollingStat(
        game.away_team_id,
        "fieldGoalPct",
        game.date,
        5,
      );
      home_fg3_pct = getRollingStat(
        game.home_team_id,
        "threePointFieldGoalPct",
        game.date,
        5,
      );
      away_fg3_pct = getRollingStat(
        game.away_team_id,
        "threePointFieldGoalPct",
        game.date,
        5,
      );
      home_turnovers = getRollingStat(
        game.home_team_id,
        "turnovers",
        game.date,
        5,
      );
      away_turnovers = getRollingStat(
        game.away_team_id,
        "turnovers",
        game.date,
        5,
      );
      home_fgs_attempted = getRollingStat(
        game.home_team_id,
        "fieldGoalsMade-fieldGoalsAttempted_attempted",
        game.date,
        5,
      );
      away_fgs_attempted = getRollingStat(
        game.away_team_id,
        "fieldGoalsMade-fieldGoalsAttempted_attempted",
        game.date,
        5,
      );
      home_steals = getRollingStat(game.home_team_id, "steals", game.date, 5);
      away_steals = getRollingStat(game.away_team_id, "steals", game.date, 5);
    }
    const homeHistory = teamHistory.get(game.home_team_id) || [];
    const awayHistory = teamHistory.get(game.away_team_id) || [];

    // Compute rolling features (5-game window)
    const homeWinRate5 = computeWinRate(homeHistory, 5);
    const awayWinRate5 = computeWinRate(awayHistory, 5);
    const homeAvgMargin5 = computeAvgMargin(homeHistory, 5);
    const awayAvgMargin5 = computeAvgMargin(awayHistory, 5);
    const homePointsAvg5 = computeAvgPointsFor(homeHistory, 5);
    const awayPointsAvg5 = computeAvgPointsFor(awayHistory, 5);
    const homeOppPointsAvg5 = computeOpponentAvgPoints(
      homeHistory,
      teamHistory,
      5,
    );
    const awayOppPointsAvg5 = computeOpponentAvgPoints(
      awayHistory,
      teamHistory,
      5,
    );
    const homePace5 = computeAvgCombined(homeHistory, 5);
    const awayPace5 = computeAvgCombined(awayHistory, 5);
    const homeOffEff5 = homePointsAvg5; // Same as points scored avg for now
    const awayOffEff5 = awayPointsAvg5;
    const homeDefEff5 = computeAvgPointsAgainst(homeHistory, 5);
    const awayDefEff5 = computeAvgPointsAgainst(awayHistory, 5);

    // Compute SoS: average opponent stats (5-game)
    const homeOppWinRate5 = computeOpponentAvgWinRate(
      homeHistory,
      teamHistory,
      5,
    );
    const awayOppWinRate5 = computeOpponentAvgWinRate(
      awayHistory,
      teamHistory,
      5,
    );
    const homeOppAvgMargin5 = computeOpponentAvgMargin(
      homeHistory,
      teamHistory,
      5,
    );
    const awayOppAvgMargin5 = computeOpponentAvgMargin(
      awayHistory,
      teamHistory,
      5,
    );

    // Compute rolling features (10-game window)
    const homeWinRate10 = computeWinRate(homeHistory, 10);
    const awayWinRate10 = computeWinRate(awayHistory, 10);
    const homeAvgMargin10 = computeAvgMargin(homeHistory, 10);
    const awayAvgMargin10 = computeAvgMargin(awayHistory, 10);
    const homePointsAvg10 = computeAvgPointsFor(homeHistory, 10);
    const awayPointsAvg10 = computeAvgPointsFor(awayHistory, 10);
    const homeOppPointsAvg10 = computeOpponentAvgPoints(
      homeHistory,
      teamHistory,
      10,
    );
    const awayOppPointsAvg10 = computeOpponentAvgPoints(
      awayHistory,
      teamHistory,
      10,
    );
    const homePace10 = computeAvgCombined(homeHistory, 10);
    const awayPace10 = computeAvgCombined(awayHistory, 10);
    const homeOffEff10 = homePointsAvg10;
    const awayOffEff10 = awayPointsAvg10;
    const homeDefEff10 = computeAvgPointsAgainst(homeHistory, 10);
    const awayDefEff10 = computeAvgPointsAgainst(awayHistory, 10);

    // Compute SoS: average opponent stats (10-game)
    const homeOppWinRate10 = computeOpponentAvgWinRate(
      homeHistory,
      teamHistory,
      10,
    );
    const awayOppWinRate10 = computeOpponentAvgWinRate(
      awayHistory,
      teamHistory,
      10,
    );
    const homeOppAvgMargin10 = computeOpponentAvgMargin(
      homeHistory,
      teamHistory,
      10,
    );
    const awayOppAvgMargin10 = computeOpponentAvgMargin(
      awayHistory,
      teamHistory,
      10,
    );

    // Compute market implied probability (vig-free) for moneyline
    let marketImpliedProb = 0.5; // Default to 50/50 if no odds
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

    // Total odds implied probability (vig-free) of over
    let totalLine: number | null = null;
    let totalMarketImpliedProb: number | null = null;
    const totalEntry = totalOdds.get(game.id);
    if (totalEntry) {
      totalLine = totalEntry.line;
      const overImp = americanToImplied(totalEntry.overPrice);
      const underImp = americanToImplied(totalEntry.underPrice);
      const sum = overImp + underImp;
      totalMarketImpliedProb = overImp / sum;
    }

    // Only include games where both teams have at least 5 completed games
    // This ensures rolling features are based on sufficient data
    if (homeHistory.length >= 5 && awayHistory.length >= 5) {
      features.push({
        gameId: game.id,
        date: game.date,
        homeWinRate5,
        awayWinRate5,
        homeAvgMargin5,
        awayAvgMargin5,
        homeAdvantage: 1,
        homeOppWinRate5,
        awayOppWinRate5,
        homeOppAvgMargin5,
        awayOppAvgMargin5,
        marketImpliedProb,
        spreadLine,
        spreadMarketImpliedProb,
        totalLine,
        totalMarketImpliedProb,
        homePointsAvg5,
        awayPointsAvg5,
        homeOppPointsAvg5,
        awayOppPointsAvg5,
        homePace5,
        awayPace5,
        homeOffEff5,
        awayOffEff5,
        homeDefEff5,
        awayDefEff5,
        homeWinRate10,
        awayWinRate10,
        homeAvgMargin10,
        awayAvgMargin10,
        homeOppWinRate10,
        awayOppWinRate10,
        homeOppAvgMargin10,
        awayOppAvgMargin10,
        homePointsAvg10,
        awayPointsAvg10,
        homeOppPointsAvg10,
        awayOppPointsAvg10,
        homePace10,
        awayPace10,
        homeOffEff10,
        awayOffEff10,
        homeDefEff10,
        awayDefEff10,
        // Basketball-specific features (include both home and away for model input)
        home_fg_pct,
        away_fg_pct,
        home_fg3_pct,
        away_fg3_pct,
        home_turnovers,
        away_turnovers,
        home_fgs_attempted,
        away_fgs_attempted,
        home_steals,
        away_steals,
      });
    }

    // Update history AFTER computing features for this game
    if (game.home_score !== null && game.away_score !== null) {
      const homeMargin = game.home_score - game.away_score;
      const awayMargin = game.away_score - game.home_score;

      homeHistory.push({
        date: game.date,
        margin: homeMargin,
        won: homeMargin > 0,
        oppTeamId: game.away_team_id,
        pointsFor: game.home_score,
        pointsAgainst: game.away_score,
        combined: game.home_score + game.away_score,
      });

      awayHistory.push({
        date: game.date,
        margin: awayMargin,
        won: awayMargin > 0,
        oppTeamId: game.home_team_id,
        pointsFor: game.away_score,
        pointsAgainst: game.home_score,
        combined: game.home_score + game.away_score,
      });

      teamHistory.set(game.home_team_id, homeHistory);
      teamHistory.set(game.away_team_id, awayHistory);
    }
  }

  return features;
}

/**
 * Exponential decay weights for recency bias (oldest to most recent)
 * For 5-game window: [0.08, 0.12, 0.20, 0.25, 0.35]
      // ...existing code...
      // --- Sport-specific feature computation boilerplate ---
      // Example: Basketball 3-point percentage
      // if (sport === 'nba' || sport === 'ncaam') {
      //   gameFeatures.nba_3p_pct = compute3PointPct(...);
      //   gameFeatures.nba_turnovers = computeTurnovers(...);
      // }
      // Example: Football passing yards
      // if (sport === 'nfl' || sport === 'cfb') {
      //   gameFeatures.nfl_pass_yards = computePassYards(...);
      // }
      // Example: Hockey save percentage
      // if (sport === 'nhl') {
      //   gameFeatures.nhl_save_pct = computeSavePct(...);
      // }
      // ...existing code...
 * For 10-game window: weights decay exponentially with more emphasis on recent games
 */
const RECENCY_WEIGHTS_5 = [0.08, 0.12, 0.2, 0.25, 0.35];
const RECENCY_WEIGHTS_10 = [
  0.03, 0.04, 0.05, 0.06, 0.07, 0.09, 0.11, 0.14, 0.18, 0.23,
];

/**
 * Compute win rate over last N games with exponential recency weighting
 */
function computeWinRate(
  history: Array<{ won: boolean }>,
  window: number,
): number {
  if (history.length === 0) return 0.5; // Neutral prior
  const recent = history.slice(-window);

  // Use recency weights if window matches
  const weights =
    window === 5
      ? RECENCY_WEIGHTS_5
      : window === 10
        ? RECENCY_WEIGHTS_10
        : null;
  if (weights && recent.length === weights.length) {
    let weightedSum = 0;
    let totalWeight = 0;
    for (let i = 0; i < recent.length; i++) {
      const weight = weights[i];
      weightedSum += (recent[i].won ? 1 : 0) * weight;
      totalWeight += weight;
    }
    return weightedSum / totalWeight;
  } else {
    // Fallback to uniform average
    const wins = recent.filter((g) => g.won).length;
    return wins / recent.length;
  }
}

/**
 * Compute average margin over last N games with exponential recency weighting
 */
function computeAvgMargin(
  history: Array<{ margin: number }>,
  window: number,
): number {
  if (history.length === 0) return 0;
  const recent = history.slice(-window);

  // Use recency weights if window matches
  const weights =
    window === 5
      ? RECENCY_WEIGHTS_5
      : window === 10
        ? RECENCY_WEIGHTS_10
        : null;
  if (weights && recent.length === weights.length) {
    let weightedSum = 0;
    let totalWeight = 0;
    for (let i = 0; i < recent.length; i++) {
      const weight = weights[i];
      weightedSum += recent[i].margin * weight;
      totalWeight += weight;
    }
    return weightedSum / totalWeight;
  } else {
    // Fallback to uniform average
    const sum = recent.reduce((acc, g) => acc + g.margin, 0);
    return sum / recent.length;
  }
}

function computeAvgPointsFor(
  history: Array<{ pointsFor: number }>,
  window: number,
): number {
  if (history.length === 0) return 0;
  const recent = history.slice(-window);

  // Use recency weights if window matches
  const weights =
    window === 5
      ? RECENCY_WEIGHTS_5
      : window === 10
        ? RECENCY_WEIGHTS_10
        : null;
  if (weights && recent.length === weights.length) {
    let weightedSum = 0;
    let totalWeight = 0;
    for (let i = 0; i < recent.length; i++) {
      const weight = weights[i];
      weightedSum += recent[i].pointsFor * weight;
      totalWeight += weight;
    }
    return weightedSum / totalWeight;
  } else {
    const sum = recent.reduce((acc, g) => acc + g.pointsFor, 0);
    return sum / recent.length;
  }
}

function computeAvgPointsAgainst(
  history: Array<{ pointsAgainst: number }>,
  window: number,
): number {
  if (history.length === 0) return 0;
  const recent = history.slice(-window);

  // Use recency weights if window matches
  const weights =
    window === 5
      ? RECENCY_WEIGHTS_5
      : window === 10
        ? RECENCY_WEIGHTS_10
        : null;
  if (weights && recent.length === weights.length) {
    let weightedSum = 0;
    let totalWeight = 0;
    for (let i = 0; i < recent.length; i++) {
      const weight = weights[i];
      weightedSum += recent[i].pointsAgainst * weight;
      totalWeight += weight;
    }
    return weightedSum / totalWeight;
  } else {
    const sum = recent.reduce((acc, g) => acc + g.pointsAgainst, 0);
    return sum / recent.length;
  }
}

function computeAvgCombined(
  history: Array<{ combined: number }>,
  window: number,
): number {
  if (history.length === 0) return 0;
  const recent = history.slice(-window);

  // Use recency weights if window matches
  const weights =
    window === 5
      ? RECENCY_WEIGHTS_5
      : window === 10
        ? RECENCY_WEIGHTS_10
        : null;
  if (weights && recent.length === weights.length) {
    let weightedSum = 0;
    let totalWeight = 0;
    for (let i = 0; i < recent.length; i++) {
      const weight = weights[i];
      weightedSum += recent[i].combined * weight;
      totalWeight += weight;
    }
    return weightedSum / totalWeight;
  } else {
    const sum = recent.reduce((acc, g) => acc + g.combined, 0);
    return sum / recent.length;
  }
}

function computeOpponentAvgPoints(
  history: Array<{ oppTeamId: number }>,
  teamHistory: Map<number, Array<{ pointsAgainst: number }>>,
  window: number,
): number {
  if (history.length === 0) return 0;
  const recent = history.slice(-window);
  let total = 0;
  let count = 0;
  for (const h of recent) {
    const oppHist = teamHistory.get(h.oppTeamId) || [];
    if (oppHist.length) {
      const oppRecent = oppHist.slice(-window);
      const avgAllowed =
        oppRecent.reduce((acc, g) => acc + g.pointsAgainst, 0) /
        oppRecent.length;
      total += avgAllowed;
      count++;
    }
  }
  return count ? total / count : 0;
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
  window: number,
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
  window: number,
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

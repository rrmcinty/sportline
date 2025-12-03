import { getDb } from "../db/index.js";
import { computeUnderdogFeatures, filterUnderdogGames } from "./underdog-features.js";
import type { UnderdogTier, UnderdogGameFeatures } from "./types.js";
import chalk from "chalk";

/**
 * Analyze common traits among winning underdogs in specific odds ranges
 */
export function analyzeWinningUnderdogs(
  sport: "ncaam" | "cfb" | "nfl" | "nba" | "nhl",
  seasons: number[],
  tiers: UnderdogTier[],
  minOdds?: number,
  maxOdds?: number
): void {
  console.log(chalk.bold.cyan(`\n🔍 Analyzing Winning Underdog Traits for ${sport.toUpperCase()}...\n`));
  console.log(chalk.dim(`   Seasons: ${seasons.join(", ")}`));
  console.log(chalk.dim(`   Tiers: ${tiers.join(", ")}`));
  if (minOdds !== undefined || maxOdds !== undefined) {
    console.log(chalk.dim(`   Odds Range: ${minOdds ?? 0} to ${maxOdds ?? 999}\n`));
  }

  const db = getDb();

  // Get all underdog games
  const allFeatures = computeUnderdogFeatures(db, sport, seasons);
  const underdogGames = filterUnderdogGames(allFeatures, tiers);

  // Filter by odds range if specified
  let filteredGames = underdogGames;
  if (minOdds !== undefined || maxOdds !== undefined) {
    filteredGames = underdogGames.filter(g => {
      // Get odds from db since it's not in UnderdogGameFeatures
      const odds = db.prepare(`
        SELECT price_home, price_away
        FROM odds
        WHERE game_id = ? AND market = 'moneyline'
        ORDER BY ABS(julianday(timestamp) - julianday(datetime('now'))) ASC
        LIMIT 1
      `).get(g.gameId) as { price_home: number | null; price_away: number | null } | undefined;
      
      if (!odds) return false;
      
      const underdogOdds = g.underdogTeam === "home" ? odds.price_home : odds.price_away;
      if (underdogOdds === null) return false;
      
      const min = minOdds ?? 0;
      const max = maxOdds ?? 999;
      return underdogOdds >= min && underdogOdds <= max;
    });
  }

  // Split into winners and losers
  const winners: UnderdogGameFeatures[] = [];
  const losers: UnderdogGameFeatures[] = [];

  for (const game of filteredGames) {
    const result = db.prepare(`
      SELECT home_score, away_score
      FROM games
      WHERE id = ?
    `).get(game.gameId) as { home_score: number | null; away_score: number | null } | undefined;

    if (!result || result.home_score === null || result.away_score === null) {
      continue;
    }

    const isHomeUnderdog = game.underdogTeam === "home";
    const underdogWon = isHomeUnderdog
      ? result.home_score > result.away_score
      : result.away_score > result.home_score;

    if (underdogWon) {
      winners.push(game);
    } else {
      losers.push(game);
    }
  }

  console.log(chalk.bold(`\n📊 SAMPLE SIZE:`));
  console.log(`   Total Games: ${filteredGames.length}`);
  console.log(`   Underdog Wins: ${winners.length} (${((winners.length / filteredGames.length) * 100).toFixed(1)}%)`);
  console.log(`   Underdog Losses (Favorite Wins): ${losers.length} (${((losers.length / filteredGames.length) * 100).toFixed(1)}%)`);

  if (winners.length === 0) {
    console.log(chalk.red("\n❌ No winning underdogs found in this range"));
    return;
  }

  // Also get favorite features for when they LOSE
  const losingFavorites: Array<{
    game: UnderdogGameFeatures;
    favoriteFeatures: any;
  }> = [];
  
  for (const game of winners) {
    // When underdog wins, favorite loses - extract favorite's features
    const favoriteFeatures = {
      // Flip the perspective to the favorite's view
      homeUpsetRate10: game.underdogTeam === "home" ? game.awayUpsetRate10 : game.homeUpsetRate10,
      homeUpsetRate5: game.underdogTeam === "home" ? game.awayUpsetRate5 : game.homeUpsetRate5,
      recentDogTrend10: game.underdogTeam === "home" ? -game.recentDogTrend10 : game.recentDogTrend10,
      paceDifferential: -game.paceDifferential,
      confStrengthDiff: -game.confStrengthDiff,
      marketOverreaction: -game.marketOverreaction,
      homeDogAdvantage: game.underdogTeam === "home" ? -game.homeDogAdvantage : game.homeDogAdvantage,
      isFavoriteAtHome: game.underdogTeam === "away" ? 1 : 0,
    };
    losingFavorites.push({ game, favoriteFeatures });
  }

  // Analyze key features
  const features = [
    { key: "homeUpsetRate10", label: "upsetRate10" },
    { key: "homeUpsetRate5", label: "upsetRate5" },
    { key: "homeDogAdvantage", label: "homeDogAdvantage" },
    { key: "paceDifferential", label: "paceDifferential" },
    { key: "confStrengthDiff", label: "confStrengthDiff" },
    { key: "recentDogTrend10", label: "recentDogTrend10" },
    { key: "marketOverreaction", label: "marketOverreaction" },
    { key: "homeAsUnderdog", label: "isHomeUnderdog" },
  ];

  console.log(chalk.bold.green(`\n✅ WINNING UNDERDOG TRAITS (vs Losers):\n`));

  // Calculate averages for winners vs losers
  for (const feature of features) {
    if (feature.key === "homeAsUnderdog") {
      const winnersHome = winners.filter(g => g.homeAsUnderdog === 1).length;
      const losersHome = losers.filter(g => g.homeAsUnderdog === 1).length;
      const winnerHomePct = (winnersHome / winners.length) * 100;
      const loserHomePct = (losersHome / losers.length) * 100;
      const diff = winnerHomePct - loserHomePct;

      console.log(
        `   ${feature.label.padEnd(25)}: ${winnerHomePct.toFixed(1)}% vs ${loserHomePct.toFixed(1)}% ` +
        `(${diff > 0 ? "+" : ""}${diff.toFixed(1)}pp) ${Math.abs(diff) > 5 ? "🔥" : ""}`
      );
      continue;
    }

    const winnerAvg = winners.reduce((sum, g) => sum + (g as any)[feature.key], 0) / winners.length;
    const loserAvg = losers.reduce((sum, g) => sum + (g as any)[feature.key], 0) / losers.length;
    const diff = winnerAvg - loserAvg;
    const diffPct = loserAvg !== 0 ? (diff / Math.abs(loserAvg)) * 100 : 0;

    // Highlight significant differences
    const isSignificant = Math.abs(diffPct) > 20 || Math.abs(diff) > 10;
    const arrow = diff > 0 ? "↑" : "↓";

    console.log(
      `   ${feature.label.padEnd(25)}: ${winnerAvg.toFixed(3)} vs ${loserAvg.toFixed(3)} ` +
      `(${diff > 0 ? "+" : ""}${diff.toFixed(3)}) ${arrow} ${isSignificant ? "🔥" : ""}`
    );
  }

  // Additional insights
  console.log(chalk.bold.blue(`\n📈 ADDITIONAL INSIGHTS:\n`));

  // Upset rate buckets
  const highUpsetWinners = winners.filter(g => 
    (g.homeAsUnderdog ? g.homeUpsetRate10 : g.awayUpsetRate10) > 0.3
  ).length;
  const lowUpsetWinners = winners.filter(g => 
    (g.homeAsUnderdog ? g.homeUpsetRate10 : g.awayUpsetRate10) <= 0.3
  ).length;
  console.log(
    `   High upset history (>30%): ${highUpsetWinners}/${winners.length} ` +
    `(${((highUpsetWinners / winners.length) * 100).toFixed(1)}%)`
  );
  console.log(
    `   Low upset history (≤30%): ${lowUpsetWinners}/${winners.length} ` +
    `(${((lowUpsetWinners / winners.length) * 100).toFixed(1)}%)`
  );

  // Market overreaction
  const overreactedWinners = winners.filter(g => g.marketOverreaction > 0.05).length;
  console.log(
    `   Market overreaction (>5%): ${overreactedWinners}/${winners.length} ` +
    `(${((overreactedWinners / winners.length) * 100).toFixed(1)}%)`
  );

  // Recent dog trend
  const positiveTrendWinners = winners.filter(g => g.recentDogTrend10 > 0).length;
  console.log(
    `   Positive dog trend: ${positiveTrendWinners}/${winners.length} ` +
    `(${((positiveTrendWinners / winners.length) * 100).toFixed(1)}%)`
  );

  // Home vs away
  const homeWinners = winners.filter(g => g.homeAsUnderdog === 1).length;
  const awayWinners = winners.length - homeWinners;
  console.log(`   Home underdogs: ${homeWinners}/${winners.length} (${((homeWinners / winners.length) * 100).toFixed(1)}%)`);
  console.log(`   Away underdogs: ${awayWinners}/${winners.length} (${((awayWinners / winners.length) * 100).toFixed(1)}%)`);

  // ANALYZE LOSING FAVORITES
  console.log(chalk.bold.red(`\n❌ LOSING FAVORITE TRAITS (What Makes Favorites Vulnerable):\n`));
  
  const favHomeRate = losingFavorites.filter(f => f.favoriteFeatures.isFavoriteAtHome === 1).length;
  const favAwayRate = losingFavorites.length - favHomeRate;
  console.log(`   Home favorites who lose: ${favHomeRate}/${losingFavorites.length} (${((favHomeRate / losingFavorites.length) * 100).toFixed(1)}%)`);
  console.log(`   Away favorites who lose: ${favAwayRate}/${losingFavorites.length} (${((favAwayRate / losingFavorites.length) * 100).toFixed(1)}%)`);
  
  // Average losing favorite features
  const avgFavUpsetRate10 = losingFavorites.reduce((sum, f) => sum + f.favoriteFeatures.homeUpsetRate10, 0) / losingFavorites.length;
  const avgFavUpsetRate5 = losingFavorites.reduce((sum, f) => sum + f.favoriteFeatures.homeUpsetRate5, 0) / losingFavorites.length;
  const avgFavPaceDiff = losingFavorites.reduce((sum, f) => sum + f.favoriteFeatures.paceDifferential, 0) / losingFavorites.length;
  const avgFavConfDiff = losingFavorites.reduce((sum, f) => sum + f.favoriteFeatures.confStrengthDiff, 0) / losingFavorites.length;
  const avgFavMarketOverreact = losingFavorites.reduce((sum, f) => sum + f.favoriteFeatures.marketOverreaction, 0) / losingFavorites.length;
  const avgFavDogTrend = losingFavorites.reduce((sum, f) => sum + f.favoriteFeatures.recentDogTrend10, 0) / losingFavorites.length;
  
  console.log(chalk.dim(`\n   Vulnerable Favorite Profile:`));
  console.log(`   • Upset rate (10 games): ${avgFavUpsetRate10.toFixed(3)} ${avgFavUpsetRate10 > 0.3 ? "🔥 (high upset risk)" : ""}`);
  console.log(`   • Pace differential: ${avgFavPaceDiff.toFixed(3)} ${avgFavPaceDiff > 0 ? "(faster)" : "(slower)"}`);
  console.log(`   • Conference strength gap: ${avgFavConfDiff.toFixed(3)} ${Math.abs(avgFavConfDiff) < 0.05 ? "🔥 (narrow gap)" : ""}`);
  console.log(`   • Market overreaction: ${avgFavMarketOverreact.toFixed(3)} ${avgFavMarketOverreact < -0.1 ? "🔥 (overvalued)" : ""}`);
  console.log(`   • Recent underdog trend: ${avgFavDogTrend.toFixed(3)}`);
  
  console.log(chalk.bold.cyan(`\n💡 KEY INSIGHTS:`));
  console.log(`   ✓ Underdogs win ${((homeWinners / winners.length) * 100).toFixed(0)}% of the time at home vs ${((awayWinners / winners.length) * 100).toFixed(0)}% on road`);
  console.log(`   ✓ Favorites lose ${((favHomeRate / losingFavorites.length) * 100).toFixed(0)}% at home vs ${((favAwayRate / losingFavorites.length) * 100).toFixed(0)}% on road`);
  console.log(`   ✓ Look for: Home dogs from decent conferences with recent underdog losses`);
  console.log(`   ✓ Fade: Favorites with narrow conference advantage and market overvaluation`);

  console.log();
}

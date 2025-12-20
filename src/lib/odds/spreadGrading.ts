export type SpreadBetResult = 'WIN' | 'LOSS' | 'PUSH';

export function gradeSpreadBet(options: {
  homeScore: number;
  awayScore: number;
  homeLine: number;
  side: 'home' | 'away';
}): SpreadBetResult {
  const { homeScore, awayScore, homeLine, side } = options;

  // homeLine is expressed from the HOME team's perspective.
  // Example: -13.5 means home is favored by 13.5.
  // The bet wins if (homeScore - awayScore) + homeLine has the correct sign.
  const homeMargin = homeScore - awayScore;
  const adjusted = homeMargin + homeLine;

  if (adjusted === 0) return 'PUSH';

  if (side === 'home') {
    return adjusted > 0 ? 'WIN' : 'LOSS';
  }

  return adjusted < 0 ? 'WIN' : 'LOSS';
}

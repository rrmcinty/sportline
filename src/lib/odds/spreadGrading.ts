/**
 * Temporary stub for spread grading utilities
 */

export function gradeSpreadBet(
  actualMargin: number,
  spread: number,
  side: 'home' | 'away',
): 'win' | 'loss' | 'push' {
  const adjustedMargin = side === 'home' ? actualMargin : -actualMargin;
  if (adjustedMargin + spread > 0) return 'win';
  if (adjustedMargin + spread < 0) return 'loss';
  return 'push';
}

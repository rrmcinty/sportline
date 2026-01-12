/**
 * TypeScript types for dashboard frontend
 */

export interface Recommendation {
  gameId: string;
  gameDate: string;
  sport: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  pickTeamName: string;
  market: string;
  side: 'home' | 'away';
  modelProbability: number;
  impliedProbability: number;
  odds: number;
  line: number | null;
  edge: number;
  ev: number;
  provider: string;
  isBest: boolean;
}

export interface RecommendationsData {
  generatedAt: string;
  recommendations: Recommendation[];
}

/**
 * TypeScript types for dashboard frontend
 */

export interface BucketInfo {
  range: string; // Display label (e.g., "70-80%")
  roi: number; // ROI as decimal (e.g., 0.2776)
  sampleSize: number; // Number of bets used for calculation
}

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
  bucketInfo: BucketInfo | null; // Optimal bucket info or null if not in profitable bucket
}

export interface RecommendationsData {
  generatedAt: string;
  recommendations: Recommendation[];
}

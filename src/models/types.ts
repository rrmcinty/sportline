/**
 * Core types for sportline
 */

export type Sport = "ncaam" | "cfb" | "nfl" | "nba" | "nhl";

export type MarketType = "moneyline" | "spread" | "total";

export type TeamSide = "home" | "away";

export interface Team {
  id: string;
  name: string;
  abbreviation?: string;
}

export interface Competition {
  id: string;
  eventId: string;
  sport: Sport;
  date: string;
  homeTeam: Team;
  awayTeam: Team;
  status: string;
  venue?: string;
  homeScore?: number | null;
  awayScore?: number | null;
  boxScore?: {
    home: Record<string, number>;
    away: Record<string, number>;
  };
}

export interface BetLeg {
  eventId: string;
  market: MarketType;
  team?: TeamSide; // undefined for totals
  line?: number; // spread value or total value
  odds: number; // American odds (e.g., -110, +150) - opening odds
  currentOdds?: number; // Current/live odds for comparison (undefined if same as opening)
  decimalOdds: number;
  impliedProbability: number;
  marketImpliedProbability?: number; // Original vig-free market probability (before model override)
  provider?: string;
  description: string; // e.g., "IU -29.5 (-115)"
}

export interface ParlaySpec {
  legs: BetLeg[];
  stake: number;
}

export interface ParlayResult {
  legs: BetLeg[];
  stake: number;
  probability: number; // Combined probability (product of leg probabilities)
  payout: number; // Total payout if all legs win
  profit: number; // Payout - stake
  ev: number; // Expected value: (payout × probability) - stake
  roi: number; // Return on investment: (ev / stake) × 100
}

export interface OddsProvider {
  id: string;
  name: string;
  priority: number;
}

export interface OddsEntry {
  provider: OddsProvider;
  spread?: number;
  overUnder?: number;
  homeTeamOdds: {
    moneyLine?: number; // opening odds
    currentMoneyLine?: number; // current odds
    spreadOdds?: number; // opening odds
    currentSpreadOdds?: number; // current odds
  };
  awayTeamOdds: {
    moneyLine?: number; // opening odds
    currentMoneyLine?: number; // current odds
    spreadOdds?: number; // opening odds
    currentSpreadOdds?: number; // current odds
  };
  overOdds?: number; // opening odds
  currentOverOdds?: number; // current odds
  underOdds?: number; // opening odds
  currentUnderOdds?: number; // current odds
}

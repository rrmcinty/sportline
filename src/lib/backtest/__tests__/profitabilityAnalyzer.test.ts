import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractSituationalFeatures, analyzeProfitableBets } from '../profitabilityAnalyzer';
import type { Recommendation, GameFeatures } from '../../db/types';

describe('profitabilityAnalyzer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('extractSituationalFeatures', () => {
        it('should extract features from recommendation and game data', () => {
            const rec: Recommendation = {
                game_id: 'game1',
                date: '2024-01-01',
                home_team: 'Team A',
                away_team: 'Team B',
                model_prob_home: 0.6,
                model_prob_away: 0.4,
                odds_home: 110,
                odds_away: -110,
                ev_home: 0.15,
                ev_away: -0.1,
                edge_home: 0.1,
                edge_away: -0.05,
                recommended_side: 'home',
                actual: null,
                provider: 'espn',
                line: null
            };

            const gameFeatures: GameFeatures = {
                game_id: 'game1',
                date: '2024-01-01',
                home_team: 'Team A',
                away_team: 'Team B',
                season: 2024,
                features: {
                    homeWinStreak: 3,
                    awayWinStreak: 1,
                    homeRestDays: 2,
                    awayRestDays: 1,
                    homeRecentForm: 0.8,
                    awayRecentForm: 0.6,
                    headToHeadRecord: 0.6,
                    strengthDifference: 0.2
                },
                odds: [{
                    provider: 'espn',
                    market: 'moneyline',
                    line: null,
                    home: 110,
                    away: -110,
                    price_home: 110,
                    price_away: -110,
                    price_over: null,
                    price_under: null,
                    timestamp: '2024-01-01T00:00:00Z'
                }],
                target: null
            };

            const features = extractSituationalFeatures(rec, gameFeatures);

            expect(features.modelConfidence).toBeCloseTo(0.2, 2);
            expect(features.modelProbBucket).toBe('60-70%');
            expect(features.oddsRange).toBe('toss_up');
            expect(features.season).toBe(2024);
        });

        it('should handle null odds', () => {
            const rec: Recommendation = {
                game_id: 'game1',
                date: '2024-01-01',
                home_team: 'Team A',
                away_team: 'Team B',
                model_prob_home: 0.6,
                model_prob_away: 0.4,
                odds_home: null,
                odds_away: null,
                ev_home: null,
                ev_away: null,
                edge_home: null,
                edge_away: null,
                recommended_side: null,
                actual: null,
                provider: 'espn',
                line: null
            };

            const gameFeatures: GameFeatures = {
                game_id: 'game1',
                date: '2024-01-01',
                home_team: 'Team A',
                away_team: 'Team B',
                season: 2024,
                features: {},
                odds: [],
                target: null
            };

            const features = extractSituationalFeatures(rec, gameFeatures);
            expect(features.oddsRange).toBe('toss_up');
        });
    });

    describe('analyzeProfitableBets', () => {
        it('should handle empty recommendations', () => {
            const analysis = analyzeProfitableBets([], [], 0.05, 0.05);
            expect(analysis.allBets).toHaveLength(0);
            expect(analysis.profitableBets).toHaveLength(0);
            expect(analysis.unprofitableBets).toHaveLength(0);
        });

        it('should analyze recommendations without actual results', () => {
            const recommendations: Recommendation[] = [
                {
                    game_id: 'game1',
                    date: '2024-01-01',
                    home_team: 'Team A',
                    away_team: 'Team B',
                    model_prob_home: 0.6,
                    model_prob_away: 0.4,
                    odds_home: 110,
                    odds_away: -110,
                    ev_home: 0.15,
                    ev_away: -0.1,
                    edge_home: 0.1,
                    edge_away: -0.05,
                    recommended_side: 'home',
                    actual: null,
                    provider: 'espn',
                    line: null
                }
            ];

            const gameFeatures: GameFeatures[] = [
                {
                    game_id: 'game1',
                    date: '2024-01-01',
                    home_team: 'Team A',
                    away_team: 'Team B',
                    season: 2024,
                    features: {},
                    odds: [{
                        provider: 'espn',
                        market: 'moneyline',
                        line: null,
                        home: 110,
                        away: -110,
                        price_home: 110,
                        price_away: -110,
                        price_over: null,
                        price_under: null,
                        timestamp: '2024-01-01T00:00:00Z'
                    }],
                    target: null
                }
            ];

            const analysis = analyzeProfitableBets(recommendations, gameFeatures, 0.05, 0.05);

            // Should return empty results since actual is null
            expect(analysis.allBets).toHaveLength(0);
            expect(analysis.profitableBets).toHaveLength(0);
            expect(analysis.unprofitableBets).toHaveLength(0);
        });
    });
});
import { describe, it, expect } from 'vitest';
import { calculateEnhancedMetrics } from '../enhancedMetrics.js';
import type { Recommendation } from '../../db/types.js';

describe('enhancedMetrics', () => {
  describe('calculateEnhancedMetrics', () => {
    it('should return zero metrics for empty recommendations', () => {
      const recommendations: Recommendation[] = [];
      const metrics = calculateEnhancedMetrics(recommendations, 0.03, 0.03);

      expect(metrics.roi).toBe(0);
      expect(metrics.win_rate).toBe(0);
      expect(metrics.total_bets).toBe(0);
      expect(metrics.total_profit).toBe(0);
      expect(metrics.ece).toBe(0);
      expect(metrics.max_drawdown).toBe(0);
      expect(metrics.max_drawdown_duration).toBe(0);
      expect(metrics.sharpe_ratio).toBe(0);
      expect(metrics.sortino_ratio).toBe(0);
      expect(metrics.cumulative_roi_over_time).toHaveLength(0);
      expect(metrics.roi_by_confidence).toHaveLength(0);
    });

    it('should filter recommendations below threshold', () => {
      const recommendations: Recommendation[] = [
        {
          game_id: '1',
          date: '2024-01-01',
          home_team: 'Team A',
          away_team: 'Team B',
          model_prob_home: 0.6,
          model_prob_away: 0.4,
          odds_home: -110,
          odds_away: -110,
          ev_home: 0.02, // Below threshold
          ev_away: 0.01,
          edge_home: 0.02,
          edge_away: 0.01,
          recommended_side: 'home',
          actual: 1,
          provider: 'test',
          line: null,
        },
      ];

      const metrics = calculateEnhancedMetrics(recommendations, 0.05, 0.05);

      expect(metrics.total_bets).toBe(0);
    });

    it('should calculate metrics for single winning bet', () => {
      const recommendations: Recommendation[] = [
        {
          game_id: '1',
          date: '2024-01-01',
          home_team: 'Team A',
          away_team: 'Team B',
          model_prob_home: 0.7,
          model_prob_away: 0.3,
          odds_home: -110,
          odds_away: -110,
          ev_home: 0.1,
          ev_away: 0.02,
          edge_home: 0.08,
          edge_away: 0.02,
          recommended_side: 'home',
          actual: 1, // Home wins
          provider: 'test',
          line: null,
        },
      ];

      const metrics = calculateEnhancedMetrics(recommendations, 0.03, 0.03);

      expect(metrics.total_bets).toBe(1);
      expect(metrics.win_rate).toBe(1.0);
      expect(metrics.total_profit).toBeGreaterThan(0);
      expect(metrics.roi).toBeGreaterThan(0);
    });

    it('should calculate metrics for single losing bet', () => {
      const recommendations: Recommendation[] = [
        {
          game_id: '1',
          date: '2024-01-01',
          home_team: 'Team A',
          away_team: 'Team B',
          model_prob_home: 0.7,
          model_prob_away: 0.3,
          odds_home: -110,
          odds_away: -110,
          ev_home: 0.1,
          ev_away: 0.02,
          edge_home: 0.08,
          edge_away: 0.02,
          recommended_side: 'home',
          actual: 0, // Away wins
          provider: 'test',
          line: null,
        },
      ];

      const metrics = calculateEnhancedMetrics(recommendations, 0.03, 0.03);

      expect(metrics.total_bets).toBe(1);
      expect(metrics.win_rate).toBe(0);
      expect(metrics.total_profit).toBeLessThan(0);
      expect(metrics.roi).toBeLessThan(0);
    });

    it('should calculate cumulative_roi_over_time correctly', () => {
      const recommendations: Recommendation[] = [
        {
          game_id: '1',
          date: '2024-01-01',
          home_team: 'Team A',
          away_team: 'Team B',
          model_prob_home: 0.7,
          model_prob_away: 0.3,
          odds_home: 100,
          odds_away: -110,
          ev_home: 0.1,
          ev_away: 0.02,
          edge_home: 0.08,
          edge_away: 0.02,
          recommended_side: 'home',
          actual: 1,
          provider: 'test',
          line: null,
        },
        {
          game_id: '2',
          date: '2024-01-02',
          home_team: 'Team C',
          away_team: 'Team D',
          model_prob_home: 0.3,
          model_prob_away: 0.7,
          odds_home: -110,
          odds_away: 110,
          ev_home: 0.02,
          ev_away: 0.1,
          edge_home: 0.02,
          edge_away: 0.08,
          recommended_side: 'away',
          actual: 0,
          provider: 'test',
          line: null,
        },
      ];

      const metrics = calculateEnhancedMetrics(recommendations, 0.03, 0.03);

      expect(metrics.cumulative_roi_over_time).toHaveLength(2);
      expect(metrics.cumulative_roi_over_time[0].date).toBe('2024-01-01');
      expect(metrics.cumulative_roi_over_time[1].date).toBe('2024-01-02');
      expect(metrics.cumulative_roi_over_time[0].bet_count).toBe(1);
      expect(metrics.cumulative_roi_over_time[1].bet_count).toBe(2);
    });

    it('should calculate roi_by_confidence buckets', () => {
      const recommendations: Recommendation[] = [
        // 50-60% bucket
        {
          game_id: '1',
          date: '2024-01-01',
          home_team: 'Team A',
          away_team: 'Team B',
          model_prob_home: 0.55,
          model_prob_away: 0.45,
          odds_home: -110,
          odds_away: -110,
          ev_home: 0.1,
          ev_away: 0.02,
          edge_home: 0.08,
          edge_away: 0.02,
          recommended_side: 'home',
          actual: 1,
          provider: 'test',
          line: null,
        },
        // 70-80% bucket
        {
          game_id: '2',
          date: '2024-01-02',
          home_team: 'Team C',
          away_team: 'Team D',
          model_prob_home: 0.75,
          model_prob_away: 0.25,
          odds_home: -200,
          odds_away: 150,
          ev_home: 0.1,
          ev_away: 0.02,
          edge_home: 0.08,
          edge_away: 0.02,
          recommended_side: 'home',
          actual: 1,
          provider: 'test',
          line: null,
        },
      ];

      const metrics = calculateEnhancedMetrics(recommendations, 0.03, 0.03);

      expect(metrics.roi_by_confidence).toHaveLength(5);

      const bucket50_60 = metrics.roi_by_confidence.find((b) => b.bucket === '50-60%');
      expect(bucket50_60).toBeDefined();
      expect(bucket50_60!.bets).toBe(1);

      const bucket70_80 = metrics.roi_by_confidence.find((b) => b.bucket === '70-80%');
      expect(bucket70_80).toBeDefined();
      expect(bucket70_80!.bets).toBe(1);
    });

    it('should calculate drawdown correctly', () => {
      const recommendations: Recommendation[] = [
        // Win
        {
          game_id: '1',
          date: '2024-01-01',
          home_team: 'Team A',
          away_team: 'Team B',
          model_prob_home: 0.7,
          model_prob_away: 0.3,
          odds_home: 100,
          odds_away: -110,
          ev_home: 0.1,
          ev_away: 0.02,
          edge_home: 0.08,
          edge_away: 0.02,
          recommended_side: 'home',
          actual: 1,
          provider: 'test',
          line: null,
        },
        // Loss
        {
          game_id: '2',
          date: '2024-01-02',
          home_team: 'Team C',
          away_team: 'Team D',
          model_prob_home: 0.7,
          model_prob_away: 0.3,
          odds_home: 100,
          odds_away: -110,
          ev_home: 0.1,
          ev_away: 0.02,
          edge_home: 0.08,
          edge_away: 0.02,
          recommended_side: 'home',
          actual: 0,
          provider: 'test',
          line: null,
        },
        // Loss
        {
          game_id: '3',
          date: '2024-01-03',
          home_team: 'Team E',
          away_team: 'Team F',
          model_prob_home: 0.7,
          model_prob_away: 0.3,
          odds_home: 100,
          odds_away: -110,
          ev_home: 0.1,
          ev_away: 0.02,
          edge_home: 0.08,
          edge_away: 0.02,
          recommended_side: 'home',
          actual: 0,
          provider: 'test',
          line: null,
        },
      ];

      const metrics = calculateEnhancedMetrics(recommendations, 0.03, 0.03);

      expect(metrics.max_drawdown).toBeGreaterThan(0);
      expect(metrics.max_drawdown_duration).toBeGreaterThan(0);
    });

    it('should calculate Sharpe and Sortino ratios', () => {
      const recommendations: Recommendation[] = [
        {
          game_id: '1',
          date: '2024-01-01',
          home_team: 'Team A',
          away_team: 'Team B',
          model_prob_home: 0.7,
          model_prob_away: 0.3,
          odds_home: 100,
          odds_away: -110,
          ev_home: 0.1,
          ev_away: 0.02,
          edge_home: 0.08,
          edge_away: 0.02,
          recommended_side: 'home',
          actual: 1,
          provider: 'test',
          line: null,
        },
        {
          game_id: '2',
          date: '2024-01-02',
          home_team: 'Team C',
          away_team: 'Team D',
          model_prob_home: 0.7,
          model_prob_away: 0.3,
          odds_home: 100,
          odds_away: -110,
          ev_home: 0.1,
          ev_away: 0.02,
          edge_home: 0.08,
          edge_away: 0.02,
          recommended_side: 'home',
          actual: 0,
          provider: 'test',
          line: null,
        },
      ];

      const metrics = calculateEnhancedMetrics(recommendations, 0.03, 0.03);

      expect(typeof metrics.sharpe_ratio).toBe('number');
      expect(typeof metrics.sortino_ratio).toBe('number');
    });

    it('should handle away side recommendations', () => {
      const recommendations: Recommendation[] = [
        {
          game_id: '1',
          date: '2024-01-01',
          home_team: 'Team A',
          away_team: 'Team B',
          model_prob_home: 0.3,
          model_prob_away: 0.7,
          odds_home: -110,
          odds_away: -110,
          ev_home: 0.02,
          ev_away: 0.1,
          edge_home: 0.02,
          edge_away: 0.08,
          recommended_side: 'away',
          actual: 0, // Away wins
          provider: 'test',
          line: null,
        },
      ];

      const metrics = calculateEnhancedMetrics(recommendations, 0.03, 0.03);

      expect(metrics.total_bets).toBe(1);
      expect(metrics.win_rate).toBe(1.0);
      expect(metrics.roi).toBeGreaterThan(0);
    });

    it('should handle recommendations with null odds or actual during processing', () => {
      const recommendations: Recommendation[] = [
        {
          game_id: '1',
          date: '2024-01-01',
          home_team: 'Team A',
          away_team: 'Team B',
          model_prob_home: 0.7,
          model_prob_away: 0.3,
          odds_home: null, // Missing odds
          odds_away: -110,
          ev_home: 0.1,
          ev_away: 0.02,
          edge_home: 0.08,
          edge_away: 0.02,
          recommended_side: 'home',
          actual: 1,
          provider: 'test',
          line: null,
        },
        {
          game_id: '2',
          date: '2024-01-02',
          home_team: 'Team C',
          away_team: 'Team D',
          model_prob_home: 0.7,
          model_prob_away: 0.3,
          odds_home: -110,
          odds_away: -110,
          ev_home: 0.1,
          ev_away: 0.02,
          edge_home: 0.08,
          edge_away: 0.02,
          recommended_side: 'home',
          actual: null, // Game not completed
          provider: 'test',
          line: null,
        },
      ];

      const metrics = calculateEnhancedMetrics(recommendations, 0.03, 0.03);

      // Recommendations pass threshold filter but can't be processed
      // Total bets reflects filtered count, but metrics are empty
      expect(metrics.total_bets).toBe(2);
      expect(metrics.total_profit).toBe(0);
      expect(metrics.win_rate).toBe(0);
    });

    it('should calculate ECE from probabilities and outcomes', () => {
      const recommendations: Recommendation[] = [
        {
          game_id: '1',
          date: '2024-01-01',
          home_team: 'Team A',
          away_team: 'Team B',
          model_prob_home: 0.6,
          model_prob_away: 0.4,
          odds_home: -110,
          odds_away: -110,
          ev_home: 0.1,
          ev_away: 0.02,
          edge_home: 0.08,
          edge_away: 0.02,
          recommended_side: 'home',
          actual: 1,
          provider: 'test',
          line: null,
        },
        {
          game_id: '2',
          date: '2024-01-02',
          home_team: 'Team C',
          away_team: 'Team D',
          model_prob_home: 0.8,
          model_prob_away: 0.2,
          odds_home: -200,
          odds_away: 150,
          ev_home: 0.1,
          ev_away: 0.02,
          edge_home: 0.08,
          edge_away: 0.02,
          recommended_side: 'home',
          actual: 1,
          provider: 'test',
          line: null,
        },
      ];

      const metrics = calculateEnhancedMetrics(recommendations, 0.03, 0.03);

      expect(metrics.ece).toBeGreaterThanOrEqual(0);
      expect(metrics.ece).toBeLessThanOrEqual(1);
    });
  });
});

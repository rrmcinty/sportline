import { describe, it, expect } from 'vitest';
import {
  americanToDecimal,
  americanToImpliedProb,
  getMarketImpliedProb,
  calculateEV,
  calculateEdge,
  calculateBettingMetrics,
  getRecommendedSide,
  formatOdds,
  formatPercentage,
} from '../evCalculator.js';

describe('evCalculator', () => {
  describe('americanToDecimal', () => {
    it('should convert positive American odds to decimal', () => {
      expect(americanToDecimal(150)).toBeCloseTo(2.5, 2);
      expect(americanToDecimal(100)).toBeCloseTo(2.0, 2);
      expect(americanToDecimal(200)).toBeCloseTo(3.0, 2);
    });

    it('should convert negative American odds to decimal', () => {
      expect(americanToDecimal(-150)).toBeCloseTo(1.667, 2);
      expect(americanToDecimal(-200)).toBeCloseTo(1.5, 2);
      expect(americanToDecimal(-110)).toBeCloseTo(1.909, 2);
    });
  });

  describe('americanToImpliedProb', () => {
    it('should convert positive odds to implied probability', () => {
      expect(americanToImpliedProb(100)).toBeCloseTo(0.5, 2);
      expect(americanToImpliedProb(150)).toBeCloseTo(0.4, 2);
      expect(americanToImpliedProb(200)).toBeCloseTo(0.333, 2);
    });

    it('should convert negative odds to implied probability', () => {
      expect(americanToImpliedProb(-110)).toBeCloseTo(0.524, 2);
      expect(americanToImpliedProb(-200)).toBeCloseTo(0.667, 2);
      expect(americanToImpliedProb(-150)).toBeCloseTo(0.6, 2);
    });
  });

  describe('getMarketImpliedProb', () => {
    it('should normalize market probability from two-sided odds', () => {
      const oddsArr = [{ home: -110, away: -110 }];
      const result = getMarketImpliedProb(oddsArr);
      expect(result).toBeCloseTo(0.5, 2); // Equal odds should normalize to 50%
    });

    it('should handle asymmetric odds', () => {
      const oddsArr = [{ home: -200, away: 150 }];
      const result = getMarketImpliedProb(oddsArr);
      // -200 = 0.667, +150 = 0.4
      // Normalized: 0.667 / (0.667 + 0.4) = 0.625
      expect(result).toBeCloseTo(0.625, 2);
    });

    it('should return null if no valid odds found', () => {
      const oddsArr = [{ home: null, away: -110 }];
      expect(getMarketImpliedProb(oddsArr)).toBeNull();
    });

    it('should use first available odds pair', () => {
      const oddsArr = [
        { home: null, away: null },
        { home: -110, away: -110 },
        { home: -120, away: 100 },
      ];
      const result = getMarketImpliedProb(oddsArr);
      expect(result).toBeCloseTo(0.5, 2);
    });
  });

  describe('calculateEV', () => {
    it('should calculate positive EV', () => {
      // 60% win probability at +150 odds
      const probability = 0.6;
      const odds = 150;
      const ev = calculateEV(probability, odds);
      // Payout = 2.5, EV = 0.6 * (2.5 - 1) - 0.4 = 0.9 - 0.4 = 0.5
      expect(ev).toBeCloseTo(0.5, 2);
    });

    it('should calculate negative EV', () => {
      // 40% win probability at -110 odds
      const probability = 0.4;
      const odds = -110;
      const ev = calculateEV(probability, odds);
      // Payout ≈ 1.909, EV = 0.4 * (1.909 - 1) - 0.6 ≈ -0.236
      expect(ev).toBeLessThan(0);
    });

    it('should handle break-even scenarios', () => {
      // Model prob matches implied prob
      const odds = -110;
      const impliedProb = americanToImpliedProb(odds);
      const ev = calculateEV(impliedProb, odds);
      expect(ev).toBeCloseTo(0, 2);
    });
  });

  describe('calculateEdge', () => {
    it('should calculate positive edge', () => {
      const edge = calculateEdge(0.6, 0.5);
      expect(edge).toBeCloseTo(0.1, 2);
    });

    it('should calculate negative edge', () => {
      const edge = calculateEdge(0.45, 0.55);
      expect(edge).toBeCloseTo(-0.1, 2);
    });

    it('should calculate zero edge', () => {
      const edge = calculateEdge(0.5, 0.5);
      expect(edge).toBe(0);
    });
  });

  describe('calculateBettingMetrics', () => {
    it('should calculate comprehensive metrics for both sides', () => {
      const probHome = 0.6;
      const oddsHome = -150;
      const oddsAway = 110;

      const metrics = calculateBettingMetrics(probHome, oddsHome, oddsAway);

      expect(metrics.ev_home).not.toBeNull();
      expect(metrics.ev_away).not.toBeNull();
      expect(metrics.edge_home).not.toBeNull();
      expect(metrics.edge_away).not.toBeNull();
      expect(metrics.implied_home).toBeCloseTo(0.6, 1);
      expect(metrics.implied_away).toBeCloseTo(0.476, 2);
    });

    it('should return nulls when odds are missing', () => {
      const probHome = 0.6;
      const oddsHome = null;
      const oddsAway = -110;

      const metrics = calculateBettingMetrics(probHome, oddsHome, oddsAway);

      expect(metrics.ev_home).toBeNull();
      expect(metrics.ev_away).toBeNull();
      expect(metrics.edge_home).toBeNull();
      expect(metrics.edge_away).toBeNull();
    });

    it('should calculate away prob as complement of home prob', () => {
      const probHome = 0.65;
      const oddsHome = -200;
      const oddsAway = 150;

      const metrics = calculateBettingMetrics(probHome, oddsHome, oddsAway);

      // Away prob should be 1 - 0.65 = 0.35
      expect(metrics.ev_away).toBeLessThan(0); // 0.35 prob at +150 odds is negative EV
    });
  });

  describe('getRecommendedSide', () => {
    it('should recommend home when home meets thresholds', () => {
      const side = getRecommendedSide(
        0.08, // ev_home
        0.02, // ev_away
        0.05, // edge_home
        0.01, // edge_away
        0.03, // minEV
        0.04, // minEdge
      );
      expect(side).toBe('home');
    });

    it('should recommend away when only away meets thresholds', () => {
      const side = getRecommendedSide(
        0.02, // ev_home
        0.08, // ev_away
        0.01, // edge_home
        0.05, // edge_away
        0.03, // minEV
        0.04, // minEdge
      );
      expect(side).toBe('away');
    });

    it('should return null when neither side meets thresholds', () => {
      const side = getRecommendedSide(
        0.02, // ev_home
        0.02, // ev_away
        0.01, // edge_home
        0.01, // edge_away
        0.05, // minEV
        0.05, // minEdge
      );
      expect(side).toBeNull();
    });

    it('should filter out bets above maxEV threshold', () => {
      const side = getRecommendedSide(
        0.6, // ev_home (high)
        0.02, // ev_away
        0.1, // edge_home
        0.01, // edge_away
        0.03, // minEV
        0.04, // minEdge
        0.5, // maxEV
      );
      expect(side).toBeNull(); // Home should be filtered out
    });

    it('should recommend home over away when both meet thresholds but home is better', () => {
      const side = getRecommendedSide(
        0.1, // ev_home
        0.06, // ev_away
        0.08, // edge_home
        0.05, // edge_away
        0.03, // minEV
        0.04, // minEdge
      );
      expect(side).toBe('home');
    });

    it('should handle null EV values', () => {
      const side = getRecommendedSide(
        null, // ev_home
        0.08, // ev_away
        null, // edge_home
        0.05, // edge_away
        0.03, // minEV
        0.04, // minEdge
      );
      expect(side).toBe('away');
    });
  });

  describe('formatOdds', () => {
    it('should format positive odds with plus sign', () => {
      expect(formatOdds(150)).toBe('+150');
      expect(formatOdds(200)).toBe('+200');
    });

    it('should format negative odds without modification', () => {
      expect(formatOdds(-150)).toBe('-150');
      expect(formatOdds(-200)).toBe('-200');
    });
  });

  describe('formatPercentage', () => {
    it('should format percentage with default 1 decimal', () => {
      expect(formatPercentage(0.523)).toBe('52.3%');
      expect(formatPercentage(0.08)).toBe('8.0%');
    });

    it('should format percentage with specified decimals', () => {
      expect(formatPercentage(0.52346, 2)).toBe('52.35%');
      expect(formatPercentage(0.08, 0)).toBe('8%');
    });

    it('should handle edge case values', () => {
      expect(formatPercentage(1.0)).toBe('100.0%');
      expect(formatPercentage(0.0)).toBe('0.0%');
    });
  });
});

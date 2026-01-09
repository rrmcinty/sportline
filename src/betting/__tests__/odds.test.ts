import { describe, it, expect } from 'vitest';
import {
  americanToDecimal,
  americanToImpliedProb,
  calculateEV,
  calculateKellyPercentage,
  decimalToAmerican,
} from '../odds.js';

describe('odds', () => {
  describe('americanToDecimal', () => {
    it('converts positive American odds to decimal', () => {
      expect(americanToDecimal(150)).toBeCloseTo(2.5);
      expect(americanToDecimal(100)).toBeCloseTo(2.0);
      expect(americanToDecimal(200)).toBeCloseTo(3.0);
      expect(americanToDecimal(50)).toBeCloseTo(1.5);
    });

    it('converts negative American odds to decimal', () => {
      expect(americanToDecimal(-200)).toBeCloseTo(1.5);
      expect(americanToDecimal(-150)).toBeCloseTo(1.6667, 3);
      expect(americanToDecimal(-100)).toBeCloseTo(2.0);
      expect(americanToDecimal(-300)).toBeCloseTo(1.3333, 3);
    });

    it('handles edge cases', () => {
      // -100 is not an edge case, it's -100 → 2.0
      expect(americanToDecimal(-100)).toBeCloseTo(2.0);
      // 0 odds would be invalid in practice, but mathematically it would be 1.0
      // However, our function divides by 0 which gives Infinity, so we skip that test
      // In practice, valid odds are never 0
    });
  });

  describe('decimalToAmerican', () => {
    it('converts decimal odds >= 2 to positive American odds', () => {
      expect(decimalToAmerican(2.5)).toBe(150);
      expect(decimalToAmerican(2.0)).toBe(100);
      expect(decimalToAmerican(3.0)).toBe(200);
      expect(decimalToAmerican(1.5)).toBe(-200);
    });

    it('converts decimal odds < 2 to negative American odds', () => {
      expect(decimalToAmerican(1.5)).toBe(-200);
      expect(decimalToAmerican(1.6667)).toBeCloseTo(-150, 0);
      expect(decimalToAmerican(1.3333)).toBeCloseTo(-300, 0);
    });
  });

  describe('americanToImpliedProb', () => {
    it('converts positive American odds to implied probability', () => {
      expect(americanToImpliedProb(100)).toBeCloseTo(0.5); // +100 = 50%
      expect(americanToImpliedProb(150)).toBeCloseTo(0.4); // +150 = 40%
      expect(americanToImpliedProb(200)).toBeCloseTo(0.3333, 3); // +200 = 33.33%
      expect(americanToImpliedProb(300)).toBeCloseTo(0.25); // +300 = 25%
    });

    it('converts negative American odds to implied probability', () => {
      expect(americanToImpliedProb(-100)).toBeCloseTo(0.5); // -100 = 50%
      expect(americanToImpliedProb(-200)).toBeCloseTo(0.6667, 3); // -200 = 66.67%
      expect(americanToImpliedProb(-150)).toBeCloseTo(0.6); // -150 = 60%
      expect(americanToImpliedProb(-300)).toBeCloseTo(0.75); // -300 = 75%
    });

    it('returns values between 0 and 1', () => {
      const prob1 = americanToImpliedProb(500);
      const prob2 = americanToImpliedProb(-500);
      expect(prob1).toBeGreaterThan(0);
      expect(prob1).toBeLessThan(1);
      expect(prob2).toBeGreaterThan(0);
      expect(prob2).toBeLessThan(1);
    });
  });

  describe('calculateEV', () => {
    it('calculates positive EV for favorable bets', () => {
      // If we think 60% chance of winning and odds imply 50% (even money +100)
      const ev = calculateEV(0.6, 100);
      expect(ev).toBeGreaterThan(0);
      expect(ev).toBeCloseTo(0.2); // EV = 0.6 * 1.0 - 0.4 = 0.2
    });

    it('calculates negative EV for unfavorable bets', () => {
      // If we think 40% chance but odds imply 50% (+100)
      const ev = calculateEV(0.4, 100);
      expect(ev).toBeLessThan(0);
      expect(ev).toBeCloseTo(-0.2); // EV = 0.4 * 1.0 - 0.6 = -0.2
    });

    it('calculates zero EV for fair bets', () => {
      // 50% win probability with even money (+100)
      const ev = calculateEV(0.5, 100);
      expect(ev).toBeCloseTo(0, 5);
    });

    it('handles negative odds', () => {
      // 70% win probability with -200 odds (implied 66.67%)
      const ev = calculateEV(0.7, -200);
      expect(ev).toBeGreaterThan(0);
    });

    it('handles positive odds', () => {
      // 30% win probability with +200 odds (implied 33.33%)
      const ev = calculateEV(0.3, 200);
      expect(ev).toBeLessThan(0); // Still negative because model thinks less likely
    });

    it('calculates EV correctly for extreme probabilities', () => {
      // Very high confidence
      const ev1 = calculateEV(0.9, 100);
      expect(ev1).toBeCloseTo(0.8); // EV = 0.9 * 1.0 - 0.1 = 0.8

      // Very low confidence
      const ev2 = calculateEV(0.1, 100);
      expect(ev2).toBeCloseTo(-0.8); // EV = 0.1 * 1.0 - 0.9 = -0.8
    });
  });

  describe('calculateKellyPercentage', () => {
    it('calculates positive Kelly for positive EV bets', () => {
      // 60% win prob with +100 odds (decimal 2.0)
      // Kelly = (b*p - q) / b = ((1.0 * 0.6) - 0.4) / 1.0 = 0.2
      const kelly = calculateKellyPercentage(0.6, 100);
      expect(kelly).toBeGreaterThan(0);
      expect(kelly).toBeCloseTo(0.2);
    });

    it('returns 0 for negative EV bets', () => {
      const kelly = calculateKellyPercentage(0.4, 100);
      expect(kelly).toBe(0); // Should not bet on negative EV
    });

    it('caps at 25% maximum', () => {
      // Very high edge - Kelly might suggest > 25%
      const kelly = calculateKellyPercentage(0.95, 100);
      expect(kelly).toBeLessThanOrEqual(0.25);
    });

    it('returns 0 for zero or negative edge', () => {
      expect(calculateKellyPercentage(0.5, 100)).toBe(0); // Even money = no edge
      expect(calculateKellyPercentage(0.4, 100)).toBe(0); // Negative edge
    });

    it('handles negative odds', () => {
      const kelly = calculateKellyPercentage(0.7, -200);
      expect(kelly).toBeGreaterThan(0);
      expect(kelly).toBeLessThanOrEqual(0.25);
    });
  });
});

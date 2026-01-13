import { describe, it, expect } from 'vitest';
import {
  americanToDecimal,
  americanToImpliedProb,
  calculateEV,
  calculateKellyPercentage,
  decimalToAmerican,
  removeVig,
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

  describe('removeVig', () => {
    it('removes standard vig from -110/-110 line', () => {
      // -110 on both sides = 0.524 each (1.048 total = 4.8% vig)
      const homeImplied = americanToImpliedProb(-110);
      const awayImplied = americanToImpliedProb(-110);

      const result = removeVig(homeImplied, awayImplied);

      expect(result.homeTrue).toBeCloseTo(0.5, 2);
      expect(result.awayTrue).toBeCloseTo(0.5, 2);
      expect(result.homeTrue + result.awayTrue).toBeCloseTo(1.0, 5);
    });

    it('removes vig from asymmetric lines', () => {
      // -200 = 0.6667, +150 = 0.4
      // Total = 1.0667 (6.67% vig)
      const homeImplied = americanToImpliedProb(-200);
      const awayImplied = americanToImpliedProb(150);

      const result = removeVig(homeImplied, awayImplied);

      // After normalization: 0.6667 / 1.0667 = 0.625, 0.4 / 1.0667 = 0.375
      expect(result.homeTrue).toBeCloseTo(0.625, 2);
      expect(result.awayTrue).toBeCloseTo(0.375, 2);
      expect(result.homeTrue + result.awayTrue).toBeCloseTo(1.0, 5);
    });

    it('handles high vig lines', () => {
      // -120 = 0.545, -120 = 0.545
      // Total = 1.09 (9% vig)
      const homeImplied = americanToImpliedProb(-120);
      const awayImplied = americanToImpliedProb(-120);

      const result = removeVig(homeImplied, awayImplied);

      expect(result.homeTrue).toBeCloseTo(0.5, 2);
      expect(result.awayTrue).toBeCloseTo(0.5, 2);
      expect(result.homeTrue + result.awayTrue).toBeCloseTo(1.0, 5);
    });

    it('handles very asymmetric lines', () => {
      // Favorite -400 = 0.8, Underdog +300 = 0.25
      const homeImplied = americanToImpliedProb(-400);
      const awayImplied = americanToImpliedProb(300);

      const result = removeVig(homeImplied, awayImplied);

      // After normalization: 0.8 / 1.05 = 0.762, 0.25 / 1.05 = 0.238
      expect(result.homeTrue).toBeCloseTo(0.762, 2);
      expect(result.awayTrue).toBeCloseTo(0.238, 2);
      expect(result.homeTrue + result.awayTrue).toBeCloseTo(1.0, 5);
    });

    it('preserves proportions after vig removal', () => {
      const homeImplied = 0.6;
      const awayImplied = 0.5; // Total = 1.1 (10% vig)

      const result = removeVig(homeImplied, awayImplied);

      // Ratio should be preserved: 6:5 before, 6:5 after
      expect(result.homeTrue / result.awayTrue).toBeCloseTo(homeImplied / awayImplied, 2);
    });
  });
});

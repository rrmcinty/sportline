import { describe, it, expect } from 'vitest';
import { gradeSpreadBet } from '../spreadGrading.js';

describe('spreadGrading', () => {
  describe('gradeSpreadBet', () => {
    describe('home team scenarios', () => {
      it('should return win when home covers negative spread', () => {
        // Home is -7.5 favorite, wins by 10 points
        const actualMargin = 10; // home_score - away_score
        const spread = -7.5;
        const result = gradeSpreadBet(actualMargin, spread, 'home');
        expect(result).toBe('win');
      });

      it('should return loss when home fails to cover negative spread', () => {
        // Home is -7.5 favorite, wins by only 5 points
        const actualMargin = 5;
        const spread = -7.5;
        const result = gradeSpreadBet(actualMargin, spread, 'home');
        expect(result).toBe('loss');
      });

      it('should return push when home exactly hits spread', () => {
        // Home is -7.5 favorite but spread is -5, wins by exactly 5
        const actualMargin = 5;
        const spread = -5;
        const result = gradeSpreadBet(actualMargin, spread, 'home');
        expect(result).toBe('push');
      });

      it('should return win when home wins as positive spread underdog', () => {
        // Home is +5.5 underdog, loses by only 3 points (covers)
        const actualMargin = -3;
        const spread = 5.5;
        const result = gradeSpreadBet(actualMargin, spread, 'home');
        expect(result).toBe('win');
      });

      it('should return loss when home loses worse than positive spread', () => {
        // Home is +5.5 underdog, loses by 8 points
        const actualMargin = -8;
        const spread = 5.5;
        const result = gradeSpreadBet(actualMargin, spread, 'home');
        expect(result).toBe('loss');
      });
    });

    describe('away team scenarios', () => {
      it('should return win when away covers negative spread', () => {
        // Away is -7.5 favorite (home +7.5), away wins by 10
        const actualMargin = -10; // home loses by 10
        const spread = -7.5; // away's spread
        const result = gradeSpreadBet(actualMargin, spread, 'away');
        expect(result).toBe('win');
      });

      it('should return loss when away fails to cover', () => {
        // Away is -7.5 favorite, only wins by 5
        const actualMargin = -5; // home loses by 5
        const spread = -7.5;
        const result = gradeSpreadBet(actualMargin, spread, 'away');
        expect(result).toBe('loss');
      });

      it('should return win when away wins as underdog', () => {
        // Away is +5.5 underdog, home wins by only 3
        const actualMargin = 3; // home wins by 3
        const spread = 5.5; // away's spread
        const result = gradeSpreadBet(actualMargin, spread, 'away');
        expect(result).toBe('win');
      });
    });

    describe('edge cases', () => {
      it('should handle spread of 0 (pick\'em)', () => {
        // Pick'em game, home wins by 1
        const actualMargin = 1;
        const spread = 0;
        const result = gradeSpreadBet(actualMargin, spread, 'home');
        expect(result).toBe('win');
      });

      it('should handle large margin wins', () => {
        // Home blows out away by 30, spread is -10.5
        const actualMargin = 30;
        const spread = -10.5;
        const result = gradeSpreadBet(actualMargin, spread, 'home');
        expect(result).toBe('win');
      });

      it('should handle large margin losses', () => {
        // Home gets blown out by 30, spread is +5.5
        const actualMargin = -30;
        const spread = 5.5;
        const result = gradeSpreadBet(actualMargin, spread, 'home');
        expect(result).toBe('loss');
      });
    });
  });
});

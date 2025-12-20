import { describe, it, expect } from 'vitest';
import { gradeSpreadBet } from '../spreadGrading';

describe('spreadGrading', () => {
  it('home -13.5 winning by 12 should be LOSS (does not cover)', () => {
    const result = gradeSpreadBet({
      homeScore: 84,
      awayScore: 72,
      homeLine: -13.5,
      side: 'home',
    });

    expect(result).toBe('LOSS');
  });

  it('home -13.5 winning by 14 should be WIN (covers)', () => {
    const result = gradeSpreadBet({
      homeScore: 84,
      awayScore: 70,
      homeLine: -13.5,
      side: 'home',
    });

    expect(result).toBe('WIN');
  });

  it('home +13.5 losing by 12 should be WIN (covers)', () => {
    const result = gradeSpreadBet({
      homeScore: 72,
      awayScore: 84,
      homeLine: 13.5,
      side: 'home',
    });

    expect(result).toBe('WIN');
  });

  it('push should be PUSH', () => {
    const result = gradeSpreadBet({
      homeScore: 80,
      awayScore: 70,
      homeLine: -10,
      side: 'home',
    });

    expect(result).toBe('PUSH');
  });

  it('away side should be the opposite of home side (non-push)', () => {
    const homeResult = gradeSpreadBet({
      homeScore: 84,
      awayScore: 72,
      homeLine: -13.5,
      side: 'home',
    });

    const awayResult = gradeSpreadBet({
      homeScore: 84,
      awayScore: 72,
      homeLine: -13.5,
      side: 'away',
    });

    expect(homeResult).not.toBe('PUSH');
    expect(awayResult).not.toBe('PUSH');
    expect(homeResult).not.toBe(awayResult);
  });

  it('away +13.5 losing by 12 should be WIN (covers)', () => {
    // away team is +13.5, so homeLine is -13.5
    const result = gradeSpreadBet({
      homeScore: 84,
      awayScore: 72,
      homeLine: -13.5,
      side: 'away',
    });

    expect(result).toBe('WIN');
  });

  it('home -3 losing by 2 should be LOSS (favorite loses ATS)', () => {
    // Home loses outright by 2; with -3, adjusted = -2 + (-3) = -5
    const result = gradeSpreadBet({
      homeScore: 70,
      awayScore: 72,
      homeLine: -3,
      side: 'home',
    });

    expect(result).toBe('LOSS');
  });

  it('home +3 losing by 2 should be WIN (underdog covers)', () => {
    // Home loses by 2; with +3, adjusted = -2 + 3 = +1
    const result = gradeSpreadBet({
      homeScore: 70,
      awayScore: 72,
      homeLine: 3,
      side: 'home',
    });

    expect(result).toBe('WIN');
  });

  it('home +13.5 losing by 14 should be LOSS (does not cover)', () => {
    // Home loses by 14; with +13.5, adjusted = -14 + 13.5 = -0.5
    const result = gradeSpreadBet({
      homeScore: 70,
      awayScore: 84,
      homeLine: 13.5,
      side: 'home',
    });

    expect(result).toBe('LOSS');
  });

  it('home +13.5 losing by 13 should be WIN (covers)', () => {
    // Home loses by 13; with +13.5, adjusted = -13 + 13.5 = +0.5
    const result = gradeSpreadBet({
      homeScore: 71,
      awayScore: 84,
      homeLine: 13.5,
      side: 'home',
    });

    expect(result).toBe('WIN');
  });

  it('push should be PUSH for either side', () => {
    const homeResult = gradeSpreadBet({
      homeScore: 80,
      awayScore: 70,
      homeLine: -10,
      side: 'home',
    });

    const awayResult = gradeSpreadBet({
      homeScore: 80,
      awayScore: 70,
      homeLine: -10,
      side: 'away',
    });

    expect(homeResult).toBe('PUSH');
    expect(awayResult).toBe('PUSH');
  });
});

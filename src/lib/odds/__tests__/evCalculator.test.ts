import { describe, it, expect } from 'vitest';
import { calculateEV, calculateEdge } from '../evCalculator';

describe('evCalculator', () => {
    describe('calculateEV', () => {
        it('should calculate EV correctly for positive edge', () => {
            const probability = 0.6;
            const odds = 110; // American odds

            const ev = calculateEV(probability, odds);

            expect(ev).toBeCloseTo(0.26, 3); // (0.6 * 2.1) - (0.4 * 1) = 0.26
        });

        it('should calculate EV correctly for negative edge', () => {
            const probability = 0.4;
            const odds = 110; // American odds

            const ev = calculateEV(probability, odds);

            expect(ev).toBeCloseTo(-0.16, 3); // (0.4 * 2.1) - (0.6 * 1) = -0.16
        });

        it('should handle zero probability', () => {
            const probability = 0;
            const odds = 110; // American odds

            const ev = calculateEV(probability, odds);

            expect(ev).toBe(-1); // (0 * 2.1) - (1 * 1) = -1
        });

        it('should handle probability of 1', () => {
            const probability = 1;
            const odds = 110; // American odds

            const ev = calculateEV(probability, odds);

            expect(ev).toBeCloseTo(1.1, 3); // (1 * 2.1) - (0 * 1) = 2.1 - 1 = 1.1
        });

        it('should handle negative American odds', () => {
            const probability = 0.7;
            const odds = -110; // American odds

            const ev = calculateEV(probability, odds);

            expect(ev).toBeCloseTo(0.336, 3); // (0.7 * 1.91) - (0.3 * 1) = 0.336
        });
    });

    describe('calculateEdge', () => {
        it('should calculate edge correctly', () => {
            const modelProb = 0.6;
            const marketProb = 0.5;

            const edge = calculateEdge(modelProb, marketProb);

            expect(edge).toBeCloseTo(0.1, 3); // 0.6 - 0.5 = 0.1
        });

        it('should return negative edge for poor value', () => {
            const modelProb = 0.4;
            const marketProb = 0.5;

            const edge = calculateEdge(modelProb, marketProb);

            expect(edge).toBeCloseTo(-0.1, 3); // 0.4 - 0.5 = -0.1
        });

        it('should handle break-even scenario', () => {
            const modelProb = 0.5;
            const marketProb = 0.5;

            const edge = calculateEdge(modelProb, marketProb);

            expect(edge).toBe(0); // 0.5 - 0.5 = 0
        });
    });
});

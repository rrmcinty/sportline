import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../backtest/profitabilityAnalyzer.js', () => {
    return {
        extractSituationalFeatures: vi.fn(),
    };
});

import { extractSituationalFeatures } from '../../backtest/profitabilityAnalyzer.js';
import { applySituationalFilters, getFilterConfig, printFilterStats } from '../situationalFilter';

type MinimalRec = { game_id: string };

describe('situationalFilter', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('filters out recommendations missing game features', () => {
        (extractSituationalFeatures as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
            oddsRange: 'toss_up',
            modelConfidence: 0.5,
            month: 1,
            dayOfWeek: 1,
            homeWinStreak: 0,
            awayWinStreak: 0,
            homeRestDays: 2,
            awayRestDays: 2,
            impliedProbDiff: 0.1,
            edgeSize: 'medium',
            season: 2024,
        });

        const recs: MinimalRec[] = [{ game_id: 'g1' }];
        const { filteredRecommendations, filterStats } = applySituationalFilters(
            recs as any,
            [],
            getFilterConfig('none'),
        );

        expect(filteredRecommendations).toHaveLength(0);
        expect(filterStats.filterReasons.missing_game_features).toBe(1);
    });

    it('passes a recommendation when all criteria match', () => {
        (extractSituationalFeatures as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
            oddsRange: 'toss_up',
            modelConfidence: 0.5,
            month: 1,
            dayOfWeek: 1,
            homeWinStreak: 0,
            awayWinStreak: 0,
            homeRestDays: 2,
            awayRestDays: 2,
            impliedProbDiff: 0.1,
            edgeSize: 'medium',
            season: 2024,
        });

        const recs: MinimalRec[] = [{ game_id: 'g1' }];
        const gameFeatures = [{ game_id: 'g1' }];

        const { filteredRecommendations, filterStats } = applySituationalFilters(
            recs as any,
            gameFeatures as any,
            getFilterConfig('none'),
        );

        expect(filteredRecommendations).toHaveLength(1);
        expect(filterStats.filteredCount).toBe(1);
        expect(Object.keys(filterStats.filterReasons)).toHaveLength(0);
    });

    it('records the correct filter reason for odds range mismatch', () => {
        (extractSituationalFeatures as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
            oddsRange: 'heavy_favorite',
            modelConfidence: 0.5,
            month: 1,
            dayOfWeek: 1,
            homeWinStreak: 0,
            awayWinStreak: 0,
            homeRestDays: 2,
            awayRestDays: 2,
            impliedProbDiff: 0.1,
            edgeSize: 'medium',
            season: 2024,
        });

        const config = {
            ...getFilterConfig('none'),
            allowedOddsRanges: ['toss_up'],
        };

        const { filteredRecommendations, filterStats } = applySituationalFilters(
            [{ game_id: 'g1' }] as any,
            [{ game_id: 'g1' }] as any,
            config,
        );

        expect(filteredRecommendations).toHaveLength(0);
        expect(filterStats.filterReasons.odds_range_heavy_favorite).toBe(1);
    });

    it('records the correct filter reason for season mismatch', () => {
        (extractSituationalFeatures as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
            oddsRange: 'toss_up',
            modelConfidence: 0.5,
            month: 1,
            dayOfWeek: 1,
            homeWinStreak: 0,
            awayWinStreak: 0,
            homeRestDays: 2,
            awayRestDays: 2,
            impliedProbDiff: 0.1,
            edgeSize: 'medium',
            season: 1999,
        });

        const config = {
            ...getFilterConfig('none'),
            allowedSeasons: [2024],
        };

        const { filteredRecommendations, filterStats } = applySituationalFilters(
            [{ game_id: 'g1' }] as any,
            [{ game_id: 'g1' }] as any,
            config,
        );

        expect(filteredRecommendations).toHaveLength(0);
        expect(filterStats.filterReasons.season_1999).toBe(1);
    });

    it('getFilterConfig supports aliases and defaults', () => {
        expect(getFilterConfig('nba-60-70-bucket').minModelConfidence).toBe(0.6);
        expect(getFilterConfig('off').minModelConfidence).toBe(0);

        const warn = vi.spyOn(console, 'warn').mockImplementation(() => { });
        const cfg = getFilterConfig('unknown-config');
        expect(cfg.allowedOddsRanges).toContain('toss_up');
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('printFilterStats prints a warning when no recommendations pass', () => {
        const log = vi.spyOn(console, 'log').mockImplementation(() => { });

        printFilterStats({
            originalCount: 10,
            filteredCount: 0,
            filterReasons: { a: 10 },
        });

        expect(log).toHaveBeenCalled();

        log.mockRestore();
    });
});

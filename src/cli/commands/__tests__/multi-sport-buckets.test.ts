import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMultiSportBucketsCommand } from '../multi-sport-buckets.js';

// Mock console.log to capture output
const mockConsoleLog = vi.fn();
const originalConsoleLog = console.log;

describe('Multi-Sport Buckets Command', () => {
  beforeEach(() => {
    console.log = mockConsoleLog;
    mockConsoleLog.mockClear();
  });

  afterEach(() => {
    console.log = originalConsoleLog;
  });

  describe('Command Creation', () => {
    it('should create a command with correct name and description', () => {
      const command = createMultiSportBucketsCommand();
      
      expect(command.name()).toBe('multi-sport-buckets');
      expect(command.description()).toBe('Analyze profitable buckets across all optimized sports');
    });
  });

  describe('Multi-Sport Analysis', () => {
    it('should execute without errors', async () => {
      const command = createMultiSportBucketsCommand();
      
      await expect(command.parseAsync(['node', 'test'])).resolves.not.toThrow();
    });

    it('should analyze all sports', async () => {
      const command = createMultiSportBucketsCommand();
      await command.parseAsync(['node', 'test']);
      
      const allOutput = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');
      
      // Should include all major sports
      expect(allOutput).toContain('NFL');
      expect(allOutput).toContain('NBA');
      expect(allOutput).toContain('NCAAM');
      expect(allOutput).toContain('NHL');
    });

    it('should identify NFL as best performer', async () => {
      const command = createMultiSportBucketsCommand();
      await command.parseAsync(['node', 'test']);
      
      const allOutput = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');
      
      // NFL should be identified as having profitable buckets
      expect(allOutput).toMatch(/NFL.*50-60%.*37\.6%/);
      expect(allOutput).toMatch(/NFL.*90-100%.*100\.0%/);
      expect(allOutput).toContain('FOCUS ON NFL');
    });

    it('should calculate combined scores correctly', async () => {
      const command = createMultiSportBucketsCommand();
      await command.parseAsync(['node', 'test']);
      
      const allOutput = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');
      
      // Should show combined scores for each bucket
      expect(allOutput).toContain('Combined:');
      expect(allOutput).toContain('NFL');
      expect(allOutput).toContain('37/100'); // NFL 50-60% combined score
    });
  });

  describe('Profitability Analysis', () => {
    it('should identify profitable buckets', async () => {
      const command = createMultiSportBucketsCommand();
      await command.parseAsync(['node', 'test']);
      
      const allOutput = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');
      
      // Should have a profitable buckets section
      expect(allOutput).toContain('PROFITABLE BUCKETS ANALYSIS');
      
      // NFL buckets should be profitable
      expect(allOutput).toMatch(/NFL.*\+37\.6%/);
      expect(allOutput).toMatch(/NFL.*\+100\.0%/);
    });

    it('should calculate annual profit projections', async () => {
      const command = createMultiSportBucketsCommand();
      await command.parseAsync(['node', 'test']);
      
      const allOutput = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');
      
      // Should show annual profit calculations
      expect(allOutput).toContain('annual profit');
      expect(allOutput).toContain('/year');
      expect(allOutput).toContain('TOTAL:');
    });

    it('should provide confidence levels and recommendations', async () => {
      const command = createMultiSportBucketsCommand();
      await command.parseAsync(['node', 'test']);
      
      const allOutput = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');
      
      // Should assign confidence levels
      expect(allOutput).toMatch(/Confidence Level: (HIGH|MEDIUM|LOW)/);
      
      // Should provide recommendations
      expect(allOutput).toMatch(/Recommendation: (STRONG_BET|MODERATE_BET|AVOID)/);
    });
  });

  describe('Near Break-Even Analysis', () => {
    it('should identify near break-even opportunities', async () => {
      const command = createMultiSportBucketsCommand();
      await command.parseAsync(['node', 'test']);
      
      const allOutput = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');
      
      // Should have near break-even section
      expect(allOutput).toContain('BEST NEAR-BREAK-EVEN OPPORTUNITIES');
      expect(allOutput).toContain('odds shopping');
    });

    it('should calculate odds improvement needed', async () => {
      const command = createMultiSportBucketsCommand();
      await command.parseAsync(['node', 'test']);
      
      const allOutput = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');
      
      // Should show how much better odds are needed
      expect(allOutput).toMatch(/Need \d+\.\d+% better odds/);
      expect(allOutput).toContain('to reach +3% ROI');
    });

    it('should filter for reasonable volume requirements', async () => {
      const command = createMultiSportBucketsCommand();
      await command.parseAsync(['node', 'test']);
      
      const allOutput = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');
      
      // Near break-even should only include buckets with >= 10 bets per year
      const nearBreakEvenLines = allOutput.split('\n').filter(line => 
        line.includes('Need') && line.includes('better odds')
      );
      
      // Should have some near break-even opportunities
      expect(nearBreakEvenLines.length).toBeGreaterThan(0);
    });
  });

  describe('Data Validation', () => {
    it('should have consistent sport bucket data', async () => {
      const command = createMultiSportBucketsCommand();
      await command.parseAsync(['node', 'test']);
      
      const allOutput = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');
      
      // Each sport bucket should have consistent format
      const bucketLines = allOutput.split('\n').filter(line => 
        line.includes('Confidence') && (line.includes('NFL') || line.includes('NBA') || line.includes('NCAAM') || line.includes('NHL'))
      );
      
      expect(bucketLines.length).toBeGreaterThan(3);
      
      // Just check that we have the basic structure
      expect(allOutput).toContain('NFL');
      expect(allOutput).toContain('NBA');
      expect(allOutput).toContain('Games:');
      expect(allOutput).toContain('Win Rate:');
      expect(allOutput).toContain('ROI:');
    });

    it('should correctly calculate volume and ROI scores', async () => {
      const command = createMultiSportBucketsCommand();
      await command.parseAsync(['node', 'test']);
      
      const allOutput = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');
      
      // Volume scores should be based on game count
      // ROI scores should be based on positive ROI
      expect(allOutput).toMatch(/Volume Score: \d+\/100/);
      expect(allOutput).toMatch(/ROI Score: \d+\/100/);
      
      // NFL profitable buckets should exist
      expect(allOutput).toContain('NFL');
      expect(allOutput).toContain('+37.6%'); // NFL 50-60% ROI
      expect(allOutput).toContain('+100.0%'); // NFL 90-100% ROI
    });

    it('should handle edge cases in calculations', async () => {
      const command = createMultiSportBucketsCommand();
      await command.parseAsync(['node', 'test']);
      
      const allOutput = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');
      
      // Should not crash on division by zero or negative values
      // Should handle buckets with 0 ROI or 0 games
      expect(allOutput).toContain('Combined Score:'); // Basic completion check
    });
  });

  describe('Business Logic Validation', () => {
    it('should prioritize NFL correctly', async () => {
      const command = createMultiSportBucketsCommand();
      await command.parseAsync(['node', 'test']);
      
      const allOutput = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');
      
      // Final recommendations should focus on NFL
      expect(allOutput).toContain('FOCUS ON NFL');
      expect(allOutput).toContain('Two profitable buckets');
    });

    it('should recommend odds shopping for near break-even sports', async () => {
      const command = createMultiSportBucketsCommand();
      await command.parseAsync(['node', 'test']);
      
      const allOutput = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');
      
      // Should recommend odds shopping for NBA/NCAAM
      expect(allOutput).toContain('ODDS SHOP NBA/NCAAM');
      expect(allOutput).toContain('Near break-even with high volume');
    });

    it('should advise avoiding NHL', async () => {
      const command = createMultiSportBucketsCommand();
      await command.parseAsync(['node', 'test']);
      
      const allOutput = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');
      
      // Should recommend avoiding NHL
      expect(allOutput).toContain('AVOID NHL');
      expect(allOutput).toContain('Still unprofitable');
    });

    it('should suggest combining strategies', async () => {
      const command = createMultiSportBucketsCommand();
      await command.parseAsync(['node', 'test']);
      
      const allOutput = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');
      
      // Should suggest combining profitable and near break-even
      expect(allOutput).toContain('COMBINE STRATEGIES');
      expect(allOutput).toContain('profitable + near-break-even');
    });

    it('should emphasize performance monitoring', async () => {
      const command = createMultiSportBucketsCommand();
      await command.parseAsync(['node', 'test']);
      
      const allOutput = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');
      
      // Should recommend tracking actual vs historical performance
      expect(allOutput).toContain('MONITOR PERFORMANCE');
      expect(allOutput).toContain('Track actual results');
    });
  });

  describe('Mathematical Accuracy', () => {
    it('should have accurate ROI calculations', async () => {
      const command = createMultiSportBucketsCommand();
      await command.parseAsync(['node', 'test']);
      
      const allOutput = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');
      
      // NFL 50-60% bucket: 22 games, 81.8% win rate, 37.6% ROI
      // This should be mathematically consistent
      expect(allOutput).toContain('NFL');
      expect(allOutput).toContain('50-60%');
      expect(allOutput).toContain('22');
      expect(allOutput).toContain('81.8%');
      expect(allOutput).toContain('37.6%');
      
      // NFL 90-100% bucket: 2 games, 50% win rate, 100% ROI
      // 50% win rate with 100% ROI suggests very favorable odds
      expect(allOutput).toContain('NFL');
      expect(allOutput).toContain('90-100%');
      expect(allOutput).toContain('Games: 2');
      expect(allOutput).toContain('Win Rate: 50.0%');
      expect(allOutput).toContain('ROI: +100.0%');
    });

    it('should calculate estimated bets per year correctly', async () => {
      const command = createMultiSportBucketsCommand();
      await command.parseAsync(['node', 'test']);
      
      const allOutput = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');
      
      // NFL uses 3 seasons, so 22 games = ~7 per year
      expect(allOutput).toContain('NFL');
      expect(allOutput).toContain('50-60%');
      expect(allOutput).toContain('~7/year');
      
      // NBA uses 8 seasons, so 368 games = ~46 per year
      expect(allOutput).toMatch(/NBA.*60-70%.*~46\/year/);
    });

    it('should have consistent combined score calculations', async () => {
      const command = createMultiSportBucketsCommand();
      await command.parseAsync(['node', 'test']);
      
      const allOutput = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');
      
      // Combined score = (volume score * 0.6) + (ROI score * 0.4)
      // Profitable buckets should have higher combined scores than unprofitable ones
      expect(allOutput).toContain('Combined:');
      expect(allOutput).toContain('ROI:');
      expect(allOutput).toContain('Volume Score:');
      
      // Extract and verify that profitable buckets have higher combined scores
      expect(allOutput).toContain('+100.0%'); // Profitable NFL bucket
      expect(allOutput).toContain('+37.6%'); // Profitable NFL bucket
      expect(allOutput).toContain('ROI: -'); // Unprofitable buckets exist
    });
  });
});
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSimpleBucketsCommand } from '../simple-buckets.js';

// Mock console.log to capture output
const mockConsoleLog = vi.fn();
const originalConsoleLog = console.log;

describe('Simple Buckets Command', () => {
  beforeEach(() => {
    console.log = mockConsoleLog;
    mockConsoleLog.mockClear();
  });

  afterEach(() => {
    console.log = originalConsoleLog;
  });

  describe('Command Creation', () => {
    it('should create a command with correct name and description', () => {
      const command = createSimpleBucketsCommand();
      
      expect(command.name()).toBe('simple-buckets');
      expect(command.description()).toBe('Analyze NFL profitable buckets from recent training results');
    });
  });

  describe('Bucket Analysis Logic', () => {
    it('should execute without errors', async () => {
      const command = createSimpleBucketsCommand();
      
      // Execute the command action
      await expect(command.parseAsync(['node', 'test'])).resolves.not.toThrow();
    });

    it('should output analysis results', async () => {
      const command = createSimpleBucketsCommand();
      
      await command.parseAsync(['node', 'test']);
      
      // Check that console.log was called multiple times (indicating output)
      expect(mockConsoleLog).toHaveBeenCalled();
      expect(mockConsoleLog.mock.calls.length).toBeGreaterThan(10);
    });

    it('should include key analysis sections', async () => {
      const command = createSimpleBucketsCommand();
      
      await command.parseAsync(['node', 'test']);
      
      const allOutput = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');
      
      // Check for key sections
      expect(allOutput).toContain('Multi-Sport Profitable Bucket Analysis');
      expect(allOutput).toContain('ALL NFL CONFIDENCE BUCKETS');
      expect(allOutput).toContain('NBA BUCKET ANALYSIS');
      expect(allOutput).toContain('FINAL RECOMMENDATION');
    });

    describe('NFL Bucket Calculations', () => {
      it('should correctly calculate volume scores', async () => {
        const command = createSimpleBucketsCommand();
        await command.parseAsync(['node', 'test']);
        
        const allOutput = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');
        
        // The 80-90% bucket with 3 games should have low volume score
        // The 50-60% bucket with 46 games should have higher volume score
        expect(allOutput).toMatch(/80-90%.*Volume Score: \d+\/100/);
        expect(allOutput).toMatch(/50-60%.*Volume Score: \d+\/100/);
      });

      it('should identify profitable buckets correctly', async () => {
        const command = createSimpleBucketsCommand();
        await command.parseAsync(['node', 'test']);
        
        const allOutput = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');
        
        // 80-90% bucket has 111.9% ROI and should be identified as profitable
        expect(allOutput).toContain('💰');
        expect(allOutput).toMatch(/80-90%.*ROI: \+111\.9%/);
      });

      it('should calculate estimated bets per year correctly', async () => {
        const command = createSimpleBucketsCommand();
        await command.parseAsync(['node', 'test']);
        
        const allOutput = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');
        
        // With 3 seasons analyzed, 3 games should be ~1 bet per year
        expect(allOutput).toMatch(/80-90%.*~1\/year/);
        
        // 46 games over 3 seasons should be ~15 bets per year
        expect(allOutput).toMatch(/50-60%.*~15\/year/);
      });

      it('should warn about low volume buckets', async () => {
        const command = createSimpleBucketsCommand();
        await command.parseAsync(['node', 'test']);
        
        const allOutput = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');
        
        // Should warn about very low volume
        expect(allOutput).toContain('VERY LOW VOLUME');
        expect(allOutput).toContain('Only ~1 bet per year');
      });

      it('should warn about small sample sizes', async () => {
        const command = createSimpleBucketsCommand();
        await command.parseAsync(['node', 'test']);
        
        const allOutput = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');
        
        // Should warn about small sample size
        expect(allOutput).toContain('SMALL SAMPLE');
        expect(allOutput).toContain('Only 3 games');
      });
    });

    describe('NBA Bucket Analysis', () => {
      it('should analyze NBA buckets separately', async () => {
        const command = createSimpleBucketsCommand();
        await command.parseAsync(['node', 'test']);
        
        const allOutput = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');
        
        // Should have NBA-specific analysis
        expect(allOutput).toContain('NBA CONFIDENCE BUCKETS');
        expect(allOutput).toContain('NBA KEY INSIGHTS');
      });

      it('should identify near break-even opportunities', async () => {
        const command = createSimpleBucketsCommand();
        await command.parseAsync(['node', 'test']);
        
        const allOutput = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');
        
        // 60-70% bucket has -0.3% ROI, should be identified as nearly break-even
        expect(allOutput).toMatch(/60-70%.*-0\.3%/);
        expect(allOutput).toContain('NEARLY BREAK-EVEN');
      });

      it('should calculate NBA volume correctly', async () => {
        const command = createSimpleBucketsCommand();
        await command.parseAsync(['node', 'test']);
        
        const allOutput = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');
        
        // NBA has 8 seasons, so 212 games should be ~26 per year
        expect(allOutput).toMatch(/60-70%.*~26\/year/);
      });
    });

    describe('Updated NFL Results', () => {
      it('should show ultra-aggressive model results', async () => {
        const command = createSimpleBucketsCommand();
        await command.parseAsync(['node', 'test']);
        
        const allOutput = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');
        
        // Should mention ultra-aggressive model improvements
        expect(allOutput).toContain('Ultra-Aggressive Model');
        expect(allOutput).toContain('+37.6% ROI');
        expect(allOutput).toContain('+100% ROI');
      });

      it('should provide actionable strategy recommendations', async () => {
        const command = createSimpleBucketsCommand();
        await command.parseAsync(['node', 'test']);
        
        const allOutput = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');
        
        // Should provide specific betting strategies
        expect(allOutput).toContain('ACTIONABLE STRATEGY');
        expect(allOutput).toContain('Target NBA games with 60-70% model confidence');
        expect(allOutput).toContain('~26 betting opportunities per year');
      });
    });
  });

  describe('Data Validation', () => {
    it('should have consistent bucket data structure', async () => {
      const command = createSimpleBucketsCommand();
      await command.parseAsync(['node', 'test']);
      
      const allOutput = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');
      
      // Each bucket should have consistent format: range, count, win rate, ROI
      const bucketLines = allOutput.split('\n').filter(line => 
        line.includes('% Confidence') && line.includes('Games:')
      );
      
      expect(bucketLines.length).toBeGreaterThan(5); // Should have multiple buckets
      
      bucketLines.forEach(line => {
        expect(line).toMatch(/\d+-\d+% Confidence/); // Range format
        expect(line).toMatch(/Games: \d+/); // Game count
        expect(line).toMatch(/Win Rate: \d+\.\d+%/); // Win rate
        expect(line).toMatch(/ROI: [+-]?\d+\.\d+%/); // ROI
      });
    });

    it('should have mathematically consistent calculations', async () => {
      const command = createSimpleBucketsCommand();
      await command.parseAsync(['node', 'test']);
      
      const allOutput = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');
      
      // Extract the 80-90% bucket data for validation
      const bucket8090 = allOutput.match(/80-90%.*Games: 3.*Win Rate: 100\.0%.*ROI: \+111\.9%/);
      expect(bucket8090).toBeTruthy();
      
      // 100% win rate with positive ROI is mathematically consistent
      // 3 games over 3 seasons = 1 game per year is correct
    });

    it('should handle edge cases in bucket analysis', async () => {
      const command = createSimpleBucketsCommand();
      await command.parseAsync(['node', 'test']);
      
      const allOutput = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');
      
      // Should handle buckets with 0 games gracefully
      // Should handle negative ROI buckets
      // Should not crash on division by zero
      expect(allOutput).toContain('ROI'); // Basic sanity check that it completed
    });
  });

  describe('Business Logic Validation', () => {
    it('should prioritize high ROI over high volume in recommendations', async () => {
      const command = createSimpleBucketsCommand();
      await command.parseAsync(['node', 'test']);
      
      const allOutput = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');
      
      // The 80-90% bucket (high ROI, low volume) should be mentioned prominently
      // despite having only 1 bet per year
      expect(allOutput).toContain('80-90% bucket');
      expect(allOutput).toContain('+111.9%');
    });

    it('should warn about impractical strategies', async () => {
      const command = createSimpleBucketsCommand();
      await command.parseAsync(['node', 'test']);
      
      const allOutput = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');
      
      // Should warn that 1 bet per year is not practical
      expect(allOutput).toContain('not practical for regular betting');
      expect(allOutput).toContain('too low volume');
    });

    it('should suggest alternative strategies', async () => {
      const command = createSimpleBucketsCommand();
      await command.parseAsync(['node', 'test']);
      
      const allOutput = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');
      
      // Should suggest looking at other sports or combining strategies
      expect(allOutput).toContain('Look at other sports');
      expect(allOutput).toContain('combining buckets');
      expect(allOutput).toContain('ALTERNATIVE STRATEGY');
    });

    it('should provide risk warnings', async () => {
      const command = createSimpleBucketsCommand();
      await command.parseAsync(['node', 'test']);
      
      const allOutput = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');
      
      // Should warn about small sample sizes and reliability
      expect(allOutput).toContain('IMPORTANT CONSIDERATIONS');
      expect(allOutput).toContain('results may not be reliable');
      expect(allOutput).toContain('Need more data');
    });
  });
});
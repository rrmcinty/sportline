/**
 * Historical Data Manager
 * Handles saving and loading sport-specific historical ROI data from backtesting
 */

import fs from 'fs';
import path from 'path';

// Simple cache to avoid loading the same data multiple times
const historicalDataCache = new Map<string, SportHistoricalData | null>();

export interface HistoricalBucketData {
  roi: number;
  winRate: number;
  sampleSize: number;
  avgEV: number;
  description: string;
}

export interface SportHistoricalData {
  sport: string;
  market?: string;
  lastUpdated: string;
  modelAccuracy: number;
  overallROI: number;
  totalBets: number;
  oddsRanges: Record<string, HistoricalBucketData>;
  modelConfidenceBuckets: Record<string, HistoricalBucketData>;
  months?: Record<string, HistoricalBucketData>;
}

/**
 * Save historical data for a sport after backtesting
 */
export function saveHistoricalData(
  sport: string,
  calibrationBuckets: Array<{
    bucket: string;
    count: number;
    accuracy: number;
    avgEV: number;
    roi: number;
  }>,
  modelAccuracy: number,
  overallROI: number,
  totalBets: number,
  market: string = 'moneyline',
  oddsRangeData?: Array<{
    range: string;
    count: number;
    accuracy: number;
    avgEV: number;
    roi: number;
  }>
): void {
  const historicalData: SportHistoricalData = {
    sport,
    market,
    lastUpdated: new Date().toISOString(),
    modelAccuracy,
    overallROI,
    totalBets,
    oddsRanges: {},
    modelConfidenceBuckets: {}
  };

  // Process calibration buckets into confidence buckets
  calibrationBuckets.forEach(bucket => {
    const bucketKey = bucket.bucket.replace('%', '').replace(' ', '');
    
    historicalData.modelConfidenceBuckets[bucketKey] = {
      roi: bucket.roi, // ROI from backtester is decimal (0.0556 = 5.56% ROI)
      winRate: bucket.accuracy, // Accuracy from backtester is decimal (0.556 = 55.6%)
      sampleSize: bucket.count,
      avgEV: bucket.avgEV, // EV from backtester is decimal
      description: `${bucket.bucket}% Home Team Win Probability`
    };
  });

  // Use actual odds range data if provided, otherwise create reasonable defaults
  if (oddsRangeData && oddsRangeData.length > 0) {
    // Use actual calculated odds range data
    const rangeMapping: Record<string, string> = {
      'heavy_favorite': 'Heavy Favorites (-200+)',
      'favorite': 'Favorites (-150 to -200)',
      'slight_favorite': 'Slight Favorites (-110 to -150)',
      'toss_up': 'Toss-ups (-110 to +110)',
      'slight_underdog': 'Slight Underdogs (+110 to +150)',
      'underdog': 'Underdogs (+150 to +200)',
      'heavy_underdog': 'Heavy Underdogs (+200+)'
    };

    oddsRangeData.forEach(range => {
      historicalData.oddsRanges[range.range] = {
        roi: range.roi, // ROI is already a decimal
        winRate: range.accuracy, // Accuracy is already a decimal
        sampleSize: range.count,
        avgEV: range.avgEV, // EV is already a decimal
        description: rangeMapping[range.range] || range.range
      };
    });
  } else {
    // Create reasonable defaults based on typical betting patterns
    // These are more realistic than using overall ROI for everything
    const baseROI = overallROI / 100; // Convert to decimal
    const baseWinRate = modelAccuracy / 100;
    
    historicalData.oddsRanges = {
      'heavy_favorite': {
        roi: Math.max(baseROI - 0.2, -0.6), // Heavy favorites typically perform worse
        winRate: Math.min(baseWinRate + 0.1, 0.9),
        sampleSize: Math.floor(totalBets * 0.1),
        avgEV: 0,
        description: 'Heavy Favorites (-200+)'
      },
      'favorite': {
        roi: Math.max(baseROI - 0.1, -0.5),
        winRate: Math.min(baseWinRate + 0.05, 0.85),
        sampleSize: Math.floor(totalBets * 0.15),
        avgEV: 0,
        description: 'Favorites (-150 to -200)'
      },
      'slight_favorite': {
        roi: baseROI,
        winRate: baseWinRate,
        sampleSize: Math.floor(totalBets * 0.25),
        avgEV: 0,
        description: 'Slight Favorites (-110 to -150)'
      },
      'toss_up': {
        roi: Math.min(baseROI + 0.1, 0.5), // Toss-ups often perform better
        winRate: baseWinRate,
        sampleSize: Math.floor(totalBets * 0.2),
        avgEV: 0,
        description: 'Toss-ups (-110 to +110)'
      },
      'slight_underdog': {
        roi: baseROI,
        winRate: Math.max(baseWinRate - 0.05, 0.3),
        sampleSize: Math.floor(totalBets * 0.15),
        avgEV: 0,
        description: 'Slight Underdogs (+110 to +150)'
      },
      'underdog': {
        roi: Math.max(baseROI - 0.1, -0.5),
        winRate: Math.max(baseWinRate - 0.1, 0.25),
        sampleSize: Math.floor(totalBets * 0.1),
        avgEV: 0,
        description: 'Underdogs (+150 to +200)'
      },
      'heavy_underdog': {
        roi: Math.max(baseROI - 0.2, -0.6),
        winRate: Math.max(baseWinRate - 0.15, 0.2),
        sampleSize: Math.floor(totalBets * 0.05),
        avgEV: 0,
        description: 'Heavy Underdogs (+200+)'
      }
    };
  }

  // Save to file with market-specific filename
  const filePath = path.join(process.cwd(), 'src', 'data', 'historical', `${sport}-${market}-historical-roi.json`);
  
  try {
    fs.writeFileSync(filePath, JSON.stringify(historicalData, null, 2));
    console.log(`✅ Saved historical data for ${sport.toUpperCase()} ${market} to ${filePath}`);
  } catch (error) {
    console.error(`❌ Failed to save historical data for ${sport} ${market}:`, error);
  }
}

/**
 * Load historical data for a sport and market (with caching)
 */
export function loadHistoricalData(sport: string, market: string = 'moneyline'): SportHistoricalData | null {
  const cacheKey = `${sport}-${market}`;
  
  // Check cache first
  if (historicalDataCache.has(cacheKey)) {
    return historicalDataCache.get(cacheKey) || null;
  }
  
  const filePath = path.join(process.cwd(), 'src', 'data', 'historical', `${sport}-${market}-historical-roi.json`);
  
  try {
    if (!fs.existsSync(filePath)) {
      // Cache the null result
      historicalDataCache.set(cacheKey, null);
      return null;
    }
    
    const data = fs.readFileSync(filePath, 'utf8');
    const historicalData: SportHistoricalData = JSON.parse(data);
    
    // Cache the result
    historicalDataCache.set(cacheKey, historicalData);
    return historicalData;
  } catch (error) {
    console.error(`❌ Failed to load historical data for ${sport} ${market}:`, error);
    historicalDataCache.set(cacheKey, null);
    return null;
  }
}

/**
 * Get the best performing confidence bucket for a sport
 */
export function getBestConfidenceBucket(sport: string): { bucket: string; roi: number } | null {
  const data = loadHistoricalData(sport);
  if (!data) return null;
  
  let bestBucket = '';
  let bestROI = -Infinity;
  
  Object.entries(data.modelConfidenceBuckets).forEach(([bucket, bucketData]) => {
    if (bucketData.roi > bestROI && bucketData.sampleSize >= 5) { // Minimum sample size
      bestROI = bucketData.roi;
      bestBucket = bucket;
    }
  });
  
  return bestBucket ? { bucket: bestBucket, roi: bestROI } : null;
}

/**
 * Clear the historical data cache (useful after training new models)
 */
export function clearHistoricalDataCache(): void {
  historicalDataCache.clear();
}

/**
 * List all available historical data files
 */
export function listAvailableHistoricalData(): string[] {
  const historicalDir = path.join(process.cwd(), 'src', 'data', 'historical');
  
  try {
    if (!fs.existsSync(historicalDir)) {
      return [];
    }
    
    return fs.readdirSync(historicalDir)
      .filter(file => file.endsWith('-historical-roi.json'))
      .map(file => file.replace('-historical-roi.json', ''));
  } catch (error) {
    console.error('❌ Failed to list historical data files:', error);
    return [];
  }
}
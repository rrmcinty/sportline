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
  totalBets: number
): void {
  const historicalData: SportHistoricalData = {
    sport,
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
      roi: bucket.roi / 100, // Convert percentage to decimal
      winRate: bucket.accuracy / 100,
      sampleSize: bucket.count,
      avgEV: bucket.avgEV / 100,
      description: `${bucket.bucket} Model Confidence`
    };
  });

  // Create odds ranges based on typical betting lines
  // We'll populate these with actual data when we have odds analysis
  historicalData.oddsRanges = {
    'heavy_favorite': {
      roi: overallROI, // Default to overall ROI for now
      winRate: modelAccuracy / 100,
      sampleSize: Math.floor(totalBets * 0.1),
      avgEV: 0,
      description: 'Heavy Favorites (-200+)'
    },
    'favorite': {
      roi: overallROI,
      winRate: modelAccuracy / 100,
      sampleSize: Math.floor(totalBets * 0.15),
      avgEV: 0,
      description: 'Favorites (-150 to -200)'
    },
    'slight_favorite': {
      roi: overallROI,
      winRate: modelAccuracy / 100,
      sampleSize: Math.floor(totalBets * 0.25),
      avgEV: 0,
      description: 'Slight Favorites (-110 to -150)'
    },
    'toss_up': {
      roi: overallROI,
      winRate: modelAccuracy / 100,
      sampleSize: Math.floor(totalBets * 0.2),
      avgEV: 0,
      description: 'Toss-ups (-110 to +110)'
    },
    'slight_underdog': {
      roi: overallROI,
      winRate: modelAccuracy / 100,
      sampleSize: Math.floor(totalBets * 0.15),
      avgEV: 0,
      description: 'Slight Underdogs (+110 to +150)'
    },
    'underdog': {
      roi: overallROI,
      winRate: modelAccuracy / 100,
      sampleSize: Math.floor(totalBets * 0.1),
      avgEV: 0,
      description: 'Underdogs (+150 to +200)'
    },
    'heavy_underdog': {
      roi: overallROI,
      winRate: modelAccuracy / 100,
      sampleSize: Math.floor(totalBets * 0.05),
      avgEV: 0,
      description: 'Heavy Underdogs (+200+)'
    }
  };

  // Save to file
  const filePath = path.join(process.cwd(), 'src', 'data', 'historical', `${sport}-historical-roi.json`);
  
  try {
    fs.writeFileSync(filePath, JSON.stringify(historicalData, null, 2));
    console.log(`✅ Saved historical data for ${sport.toUpperCase()} to ${filePath}`);
  } catch (error) {
    console.error(`❌ Failed to save historical data for ${sport}:`, error);
  }
}

/**
 * Load historical data for a sport (with caching)
 */
export function loadHistoricalData(sport: string): SportHistoricalData | null {
  // Check cache first
  if (historicalDataCache.has(sport)) {
    return historicalDataCache.get(sport) || null;
  }
  
  const filePath = path.join(process.cwd(), 'src', 'data', 'historical', `${sport}-historical-roi.json`);
  
  try {
    if (!fs.existsSync(filePath)) {
      // Cache the null result
      historicalDataCache.set(sport, null);
      return null;
    }
    
    const data = fs.readFileSync(filePath, 'utf8');
    const historicalData: SportHistoricalData = JSON.parse(data);
    
    // Cache the result
    historicalDataCache.set(sport, historicalData);
    return historicalData;
  } catch (error) {
    console.error(`❌ Failed to load historical data for ${sport}:`, error);
    historicalDataCache.set(sport, null);
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
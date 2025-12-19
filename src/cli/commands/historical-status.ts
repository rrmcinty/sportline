/**
 * Historical Status Command - Show available historical data and best buckets
 */

import { Command } from 'commander';
import {
  listAvailableHistoricalData,
  loadHistoricalData,
  getBestConfidenceBucket,
} from '../../lib/analysis/historicalDataManager.js';

export function createHistoricalStatusCommand(): Command {
  return new Command('historical-status')
    .description('Show available historical data and best performing buckets')
    .action(async () => {
      console.log('\n📊 Historical Data Status\n');

      const availableSports = listAvailableHistoricalData();

      if (availableSports.length === 0) {
        console.log('❌ No historical data found. Run training commands to generate data.');
        return;
      }

      console.log(
        `✅ Found historical data for ${availableSports.length} sports: ${availableSports.join(', ')}\n`,
      );

      // Show details for each sport
      for (const sport of availableSports) {
        const data = loadHistoricalData(sport);
        if (!data) continue;

        console.log(`🏈 ${sport.toUpperCase()}`);
        console.log(`   Last Updated: ${new Date(data.lastUpdated).toLocaleString()}`);
        console.log(`   Overall ROI: ${data.overallROI.toFixed(2)}%`);
        console.log(`   Model Accuracy: ${data.modelAccuracy.toFixed(2)}%`);
        console.log(`   Total Bets: ${data.totalBets}`);

        // Find best confidence bucket
        const bestBucket = getBestConfidenceBucket(sport);
        if (bestBucket) {
          console.log(
            `   🎯 Best Bucket: ${bestBucket.bucket}% confidence (+${(bestBucket.roi * 100).toFixed(1)}% ROI)`,
          );
        }

        // Show all confidence buckets
        console.log('   📊 Confidence Buckets:');
        Object.entries(data.modelConfidenceBuckets)
          .sort(([a], [b]) => parseInt(a.split('-')[0]) - parseInt(b.split('-')[0]))
          .forEach(([bucket, bucketData]) => {
            const roiColor = bucketData.roi > 0 ? '🟢' : bucketData.roi > -0.1 ? '🟡' : '🔴';
            console.log(
              `     ${roiColor} ${bucket.padEnd(6)}: ${(bucketData.roi * 100).toFixed(1).padStart(6)}% ROI | ${(bucketData.winRate * 100).toFixed(1).padStart(5)}% win | ${bucketData.sampleSize.toString().padStart(3)} bets`,
            );
          });

        console.log('');
      }

      // Summary recommendations
      console.log('🎯 RECOMMENDATIONS:\n');

      for (const sport of availableSports) {
        const bestBucket = getBestConfidenceBucket(sport);
        if (bestBucket && bestBucket.roi > 0) {
          console.log(
            `✅ ${sport.toUpperCase()}: Target ${bestBucket.bucket}% confidence bucket (+${(bestBucket.roi * 100).toFixed(1)}% ROI)`,
          );
        } else {
          console.log(`❌ ${sport.toUpperCase()}: No profitable buckets found`);
        }
      }

      console.log(
        '\n💡 Use "sportline recommend --sport <sport>" to get recommendations with historical context',
      );
    });
}

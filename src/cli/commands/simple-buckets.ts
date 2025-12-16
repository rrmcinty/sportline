import { Command } from 'commander';

interface BucketData {
  range: string;
  count: number;
  accuracy: number;
  avgEV: number;
  roi: number;
  estimatedBetsPerYear: number;
  volumeScore: number;
  roiScore: number;
  combinedScore: number;
}

export function createSimpleBucketsCommand(): Command {
  return new Command('simple-buckets')
    .description('Analyze NFL profitable buckets from recent training results')
    .action(async () => {
      console.log('\n🎯 Multi-Sport Profitable Bucket Analysis\n');
      
      // Data from recent NFL training (80-90% bucket showed 111% ROI with 3 games)
      const nflBuckets: BucketData[] = [
        {
          range: '10-20',
          count: 7,
          accuracy: 28.6,
          avgEV: 0.88,
          roi: -58.0,
          estimatedBetsPerYear: 0,
          volumeScore: 0,
          roiScore: 0,
          combinedScore: 0
        },
        {
          range: '20-30',
          count: 25,
          accuracy: 40.0,
          avgEV: -22.85,
          roi: -0.4,
          estimatedBetsPerYear: 0,
          volumeScore: 0,
          roiScore: 0,
          combinedScore: 0
        },
        {
          range: '30-40',
          count: 32,
          accuracy: 40.6,
          avgEV: 4.47,
          roi: -20.7,
          estimatedBetsPerYear: 0,
          volumeScore: 0,
          roiScore: 0,
          combinedScore: 0
        },
        {
          range: '40-50',
          count: 22,
          accuracy: 31.8,
          avgEV: 56.38,
          roi: -38.1,
          estimatedBetsPerYear: 0,
          volumeScore: 0,
          roiScore: 0,
          combinedScore: 0
        },
        {
          range: '50-60',
          count: 46,
          accuracy: 58.7,
          avgEV: 3.80,
          roi: -10.9,
          estimatedBetsPerYear: 0,
          volumeScore: 0,
          roiScore: 0,
          combinedScore: 0
        },
        {
          range: '60-70',
          count: 43,
          accuracy: 62.8,
          avgEV: 42.31,
          roi: -8.2,
          estimatedBetsPerYear: 0,
          volumeScore: 0,
          roiScore: 0,
          combinedScore: 0
        },
        {
          range: '70-80',
          count: 26,
          accuracy: 57.7,
          avgEV: 19.20,
          roi: -12.2,
          estimatedBetsPerYear: 0,
          volumeScore: 0,
          roiScore: 0,
          combinedScore: 0
        },
        {
          range: '80-90',
          count: 3,
          accuracy: 100.0,
          avgEV: 75.02,
          roi: 111.9,
          estimatedBetsPerYear: 0,
          volumeScore: 0,
          roiScore: 0,
          combinedScore: 0
        }
      ];

      // Calculate scores for each bucket
      const seasonsAnalyzed = 3; // NFL data from 2022-2024
      const maxCount = Math.max(...nflBuckets.map(b => b.count));
      const maxRoi = Math.max(...nflBuckets.filter(b => b.roi > 0).map(b => b.roi));

      nflBuckets.forEach(bucket => {
        bucket.estimatedBetsPerYear = Math.round(bucket.count / seasonsAnalyzed);
        bucket.volumeScore = Math.min(100, (bucket.count / Math.max(maxCount * 0.3, 10)) * 100);
        bucket.roiScore = bucket.roi > 0 ? Math.min(100, (bucket.roi / Math.max(maxRoi * 0.5, 20)) * 100) : 0;
        bucket.combinedScore = (bucket.volumeScore * 0.6) + (bucket.roiScore * 0.4);
      });

      // Sort by combined score
      const sortedBuckets = [...nflBuckets].sort((a, b) => b.combinedScore - a.combinedScore);
      const profitableBuckets = sortedBuckets.filter(b => b.roi > 0);

      console.log('📊 ALL NFL CONFIDENCE BUCKETS (sorted by Combined Score):\n');
      
      sortedBuckets.forEach((bucket, index) => {
        const profitableEmoji = bucket.roi > 0 ? '💰' : '❌';
        const volumeEmoji = bucket.estimatedBetsPerYear >= 20 ? '🔥' : 
                           bucket.estimatedBetsPerYear >= 10 ? '📈' : 
                           bucket.estimatedBetsPerYear >= 5 ? '⚠️' : '🚫';
        
        console.log(`${index + 1}. ${profitableEmoji} ${volumeEmoji} ${bucket.range}% Confidence`);
        console.log(`   Games: ${bucket.count} (~${bucket.estimatedBetsPerYear}/year) | Win Rate: ${bucket.accuracy.toFixed(1)}% | ROI: ${bucket.roi > 0 ? '+' : ''}${bucket.roi.toFixed(1)}%`);
        console.log(`   Volume Score: ${bucket.volumeScore.toFixed(0)}/100 | ROI Score: ${bucket.roiScore.toFixed(0)}/100 | Combined: ${bucket.combinedScore.toFixed(0)}/100`);
        console.log(`   Avg EV: ${bucket.avgEV.toFixed(1)}%`);
        console.log('');
      });

      if (profitableBuckets.length > 0) {
        console.log('🎯 PROFITABLE BUCKETS ANALYSIS:\n');
        
        profitableBuckets.forEach((bucket, index) => {
          const confidenceLevel = bucket.combinedScore >= 70 ? 'HIGH' : 
                                 bucket.combinedScore >= 50 ? 'MEDIUM' : 'LOW';
          const recommendation = bucket.combinedScore >= 70 ? 'STRONG_BET' : 
                               bucket.combinedScore >= 30 ? 'MODERATE_BET' : 'AVOID';
          
          console.log(`${index + 1}. 🎯 ${bucket.range}% Confidence Bucket`);
          console.log(`   📊 Performance: 100% win rate (${bucket.count} games)`);
          console.log(`   💰 ROI: +${bucket.roi.toFixed(1)}% | ROI Score: ${bucket.roiScore.toFixed(0)}/100`);
          console.log(`   📈 Volume: ${bucket.count} games (~${bucket.estimatedBetsPerYear}/year) | Volume Score: ${bucket.volumeScore.toFixed(0)}/100`);
          console.log(`   🎯 Combined Score: ${bucket.combinedScore.toFixed(0)}/100`);
          console.log(`   📅 Confidence Level: ${confidenceLevel}`);
          console.log(`   🎯 Recommendation: ${recommendation}`);
          console.log(`   📝 Strategy: Only bet NFL games with ${bucket.range}% model confidence`);
          console.log('');
        });

        const bestBucket = profitableBuckets[0];
        console.log('🎯 RECOMMENDED NFL BETTING STRATEGY:');
        console.log(`   Target: NFL games with ${bestBucket.range}% model confidence`);
        console.log(`   Expected ROI: +${bestBucket.roi.toFixed(1)}%`);
        console.log(`   Historical Performance: 100% win rate (${bestBucket.count} games)`);
        console.log(`   Volume: ~${bestBucket.estimatedBetsPerYear} bets per year`);
        console.log(`   Combined Score: ${bestBucket.combinedScore.toFixed(0)}/100`);
        
        console.log('\n⚠️  IMPORTANT CONSIDERATIONS:');
        if (bestBucket.estimatedBetsPerYear < 5) {
          console.log('   🚫 VERY LOW VOLUME: Only ~1 bet per year - not practical for regular betting');
        } else if (bestBucket.estimatedBetsPerYear < 10) {
          console.log('   ⚠️  LOW VOLUME: Limited betting opportunities - consider combining strategies');
        }
        
        if (bestBucket.count < 10) {
          console.log('   ⚠️  SMALL SAMPLE: Only 3 games - results may not be reliable');
          console.log('   📊 Need more data to validate this bucket\'s profitability');
        }
        
        console.log('\n💡 PRACTICAL RECOMMENDATIONS:');
        console.log('   1. The 80-90% bucket is too low volume for practical betting');
        console.log('   2. Need to find buckets with at least 10-20 bets per year');
        console.log('   3. Consider expanding confidence ranges or combining buckets');
        console.log('   4. Look at other sports (NBA, NHL) for higher volume opportunities');
        
        console.log('\n🔍 ALTERNATIVE STRATEGY ANALYSIS:');
        console.log('   Looking at higher-volume buckets that might break even or have small losses...\n');
        
        // Find the best volume/ROI compromise
        const practicalBuckets = sortedBuckets.filter(b => b.estimatedBetsPerYear >= 10);
        if (practicalBuckets.length > 0) {
          const bestPractical = practicalBuckets.reduce((best, current) => 
            current.roi > best.roi ? current : best
          );
          
          console.log(`   🎯 MOST PRACTICAL BUCKET: ${bestPractical.range}% confidence`);
          console.log(`      Volume: ~${bestPractical.estimatedBetsPerYear} bets/year`);
          console.log(`      ROI: ${bestPractical.roi > 0 ? '+' : ''}${bestPractical.roi.toFixed(1)}%`);
          console.log(`      Win Rate: ${bestPractical.accuracy.toFixed(1)}%`);
          
          if (bestPractical.roi > -5) {
            console.log('      💡 This bucket is nearly break-even with good volume!');
            console.log('      💡 Small model improvements could make this profitable');
          }
        }
        
      } else {
        console.log('❌ No profitable buckets found in NFL data.');
      }

      // NBA Analysis
      console.log('\n' + '='.repeat(60));
      console.log('🏀 NBA BUCKET ANALYSIS');
      console.log('='.repeat(60) + '\n');

      const nbaBuckets: BucketData[] = [
        {
          range: '20-30',
          count: 3,
          accuracy: 0.0,
          avgEV: 11.47,
          roi: -100.0,
          estimatedBetsPerYear: 0,
          volumeScore: 0,
          roiScore: 0,
          combinedScore: 0
        },
        {
          range: '30-40',
          count: 250,
          accuracy: 55.2,
          avgEV: 8.84,
          roi: -13.2,
          estimatedBetsPerYear: 0,
          volumeScore: 0,
          roiScore: 0,
          combinedScore: 0
        },
        {
          range: '40-50',
          count: 582,
          accuracy: 53.4,
          avgEV: 43.39,
          roi: -14.1,
          estimatedBetsPerYear: 0,
          volumeScore: 0,
          roiScore: 0,
          combinedScore: 0
        },
        {
          range: '50-60',
          count: 623,
          accuracy: 54.1,
          avgEV: 52.65,
          roi: -14.8,
          estimatedBetsPerYear: 0,
          volumeScore: 0,
          roiScore: 0,
          combinedScore: 0
        },
        {
          range: '60-70',
          count: 212,
          accuracy: 56.1,
          avgEV: 122.85,
          roi: -0.3,
          estimatedBetsPerYear: 0,
          volumeScore: 0,
          roiScore: 0,
          combinedScore: 0
        },
        {
          range: '70-80',
          count: 1,
          accuracy: 100.0,
          avgEV: -4.49,
          roi: 35.7,
          estimatedBetsPerYear: 0,
          volumeScore: 0,
          roiScore: 0,
          combinedScore: 0
        }
      ];

      // NBA has 8 seasons of data (2019-2026)
      const nbaSeasonsAnalyzed = 8;
      const nbaMaxCount = Math.max(...nbaBuckets.map(b => b.count));
      const nbaMaxRoi = Math.max(...nbaBuckets.filter(b => b.roi > 0).map(b => b.roi));

      nbaBuckets.forEach(bucket => {
        bucket.estimatedBetsPerYear = Math.round(bucket.count / nbaSeasonsAnalyzed);
        bucket.volumeScore = Math.min(100, (bucket.count / Math.max(nbaMaxCount * 0.3, 10)) * 100);
        bucket.roiScore = bucket.roi > 0 ? Math.min(100, (bucket.roi / Math.max(nbaMaxRoi * 0.5, 20)) * 100) : 0;
        bucket.combinedScore = (bucket.volumeScore * 0.6) + (bucket.roiScore * 0.4);
      });

      const nbaSortedBuckets = [...nbaBuckets].sort((a, b) => b.combinedScore - a.combinedScore);
      const nbaProfitableBuckets = nbaSortedBuckets.filter(b => b.roi > 0);

      console.log('📊 NBA CONFIDENCE BUCKETS (sorted by Combined Score):\n');
      
      nbaSortedBuckets.forEach((bucket, index) => {
        const profitableEmoji = bucket.roi > 0 ? '💰' : bucket.roi > -5 ? '🟡' : '❌';
        const volumeEmoji = bucket.estimatedBetsPerYear >= 50 ? '🔥' : 
                           bucket.estimatedBetsPerYear >= 20 ? '📈' : 
                           bucket.estimatedBetsPerYear >= 10 ? '⚠️' : '🚫';
        
        console.log(`${index + 1}. ${profitableEmoji} ${volumeEmoji} ${bucket.range}% Confidence`);
        console.log(`   Games: ${bucket.count} (~${bucket.estimatedBetsPerYear}/year) | Win Rate: ${bucket.accuracy.toFixed(1)}% | ROI: ${bucket.roi > 0 ? '+' : ''}${bucket.roi.toFixed(1)}%`);
        console.log(`   Volume Score: ${bucket.volumeScore.toFixed(0)}/100 | ROI Score: ${bucket.roiScore.toFixed(0)}/100 | Combined: ${bucket.combinedScore.toFixed(0)}/100`);
        console.log('');
      });

      console.log('🎯 NBA KEY INSIGHTS:');
      const nearBreakEven = nbaSortedBuckets.find(b => b.roi > -5 && b.roi < 5);
      if (nearBreakEven) {
        console.log(`   🟡 NEARLY BREAK-EVEN: ${nearBreakEven.range}% bucket has ${nearBreakEven.roi.toFixed(1)}% ROI with ${nearBreakEven.estimatedBetsPerYear} bets/year`);
        console.log(`   💡 This bucket shows promise - small model improvements could make it profitable!`);
      }

      const highVolume = nbaSortedBuckets.filter(b => b.estimatedBetsPerYear >= 20);
      if (highVolume.length > 0) {
        const bestHighVolume = highVolume.reduce((best, current) => current.roi > best.roi ? current : best);
        console.log(`   📈 BEST HIGH-VOLUME: ${bestHighVolume.range}% bucket has ${bestHighVolume.estimatedBetsPerYear} bets/year with ${bestHighVolume.roi.toFixed(1)}% ROI`);
      }

      console.log('\n🎯 FINAL RECOMMENDATION:');
      console.log('   🏀 NBA 60-70% confidence bucket is the most promising:');
      console.log(`      • Nearly break-even: ${nearBreakEven?.roi.toFixed(1)}% ROI`);
      console.log(`      • High volume: ~${nearBreakEven?.estimatedBetsPerYear} bets per year`);
      console.log(`      • Good sample size: ${nearBreakEven?.count} games`);
      console.log('      • Strategy: Focus model improvements on this bucket');
      console.log('      • Small accuracy improvements could make this profitable');
      
      console.log('\n💡 ACTIONABLE STRATEGY:');
      console.log('   1. Target NBA games with 60-70% model confidence');
      console.log('   2. This provides ~26 betting opportunities per year');
      console.log('   3. Currently breaks even (-0.3% ROI)');
      console.log('   4. Focus on improving model accuracy in this confidence range');
      console.log('   5. Even a 1-2% accuracy improvement could make this profitable');
    });
}
import { Command } from 'commander';

interface SportBucket {
  sport: string;
  bucket: string;
  count: number;
  winRate: number;
  roi: number;
  estimatedBetsPerYear: number;
  volumeScore: number;
  roiScore: number;
  combinedScore: number;
}

export function createMultiSportBucketsCommand(): Command {
  return new Command('multi-sport-buckets')
    .description('Analyze profitable buckets across all optimized sports')
    .action(async () => {
      console.log('\n🎯 Multi-Sport Optimized Bucket Analysis\n');

      // Data from our optimized models
      const allBuckets: SportBucket[] = [
        // NFL (Ultra-Aggressive Model) - BEST PERFORMER
        {
          sport: 'NFL',
          bucket: '50-60%',
          count: 22,
          winRate: 81.8,
          roi: 37.6,
          estimatedBetsPerYear: 7,
          volumeScore: 0,
          roiScore: 0,
          combinedScore: 0,
        },
        {
          sport: 'NFL',
          bucket: '90-100%',
          count: 2,
          winRate: 50.0,
          roi: 100.0,
          estimatedBetsPerYear: 1,
          volumeScore: 0,
          roiScore: 0,
          combinedScore: 0,
        },
        {
          sport: 'NFL',
          bucket: '20-30%',
          count: 29,
          winRate: 48.3,
          roi: -2.0,
          estimatedBetsPerYear: 10,
          volumeScore: 0,
          roiScore: 0,
          combinedScore: 0,
        },

        // NBA (Ultra-Optimized Model) - NEARLY BREAK-EVEN
        {
          sport: 'NBA',
          bucket: '60-70%',
          count: 368,
          winRate: 56.0,
          roi: -3.8,
          estimatedBetsPerYear: 46,
          volumeScore: 0,
          roiScore: 0,
          combinedScore: 0,
        },
        {
          sport: 'NBA',
          bucket: '70-80%',
          count: 66,
          winRate: 50.0,
          roi: -26.6,
          estimatedBetsPerYear: 8,
          volumeScore: 0,
          roiScore: 0,
          combinedScore: 0,
        },

        // NCAAM (Ultra-Optimized Model) - HIGH VOLUME
        {
          sport: 'NCAAM',
          bucket: '80-90%',
          count: 593,
          winRate: 64.8,
          roi: -6.6,
          estimatedBetsPerYear: 74,
          volumeScore: 0,
          roiScore: 0,
          combinedScore: 0,
        },
        {
          sport: 'NCAAM',
          bucket: '50-60%',
          count: 480,
          winRate: 64.0,
          roi: -7.7,
          estimatedBetsPerYear: 60,
          volumeScore: 0,
          roiScore: 0,
          combinedScore: 0,
        },
        {
          sport: 'NCAAM',
          bucket: '0-10%',
          count: 385,
          winRate: 61.6,
          roi: -13.5,
          estimatedBetsPerYear: 48,
          volumeScore: 0,
          roiScore: 0,
          combinedScore: 0,
        },

        // NHL (Ultra-Optimized Model) - STILL STRUGGLING
        {
          sport: 'NHL',
          bucket: '40-50%',
          count: 106,
          winRate: 56.6,
          roi: -7.3,
          estimatedBetsPerYear: 35,
          volumeScore: 0,
          roiScore: 0,
          combinedScore: 0,
        },
        {
          sport: 'NHL',
          bucket: '90-100%',
          count: 5,
          winRate: 60.0,
          roi: -11.1,
          estimatedBetsPerYear: 2,
          volumeScore: 0,
          roiScore: 0,
          combinedScore: 0,
        },
        {
          sport: 'NHL',
          bucket: '60-70%',
          count: 86,
          winRate: 55.8,
          roi: -12.3,
          estimatedBetsPerYear: 29,
          volumeScore: 0,
          roiScore: 0,
          combinedScore: 0,
        },
      ];

      // Calculate scores
      const maxCount = Math.max(...allBuckets.map((b) => b.count));
      const maxRoi = Math.max(...allBuckets.filter((b) => b.roi > 0).map((b) => b.roi));

      allBuckets.forEach((bucket) => {
        bucket.volumeScore = Math.min(100, (bucket.count / Math.max(maxCount * 0.3, 10)) * 100);
        bucket.roiScore =
          bucket.roi > 0 ? Math.min(100, (bucket.roi / Math.max(maxRoi * 0.5, 20)) * 100) : 0;
        bucket.combinedScore = bucket.volumeScore * 0.6 + bucket.roiScore * 0.4;
      });

      // Sort by combined score
      const sortedBuckets = [...allBuckets].sort((a, b) => b.combinedScore - a.combinedScore);
      const profitableBuckets = sortedBuckets.filter((b) => b.roi > 0);

      console.log('🏆 ALL OPTIMIZED SPORT BUCKETS (sorted by Combined Score):\n');

      sortedBuckets.forEach((bucket, index) => {
        const profitableEmoji = bucket.roi > 0 ? '💰' : bucket.roi > -10 ? '🟡' : '❌';
        const volumeEmoji =
          bucket.estimatedBetsPerYear >= 50
            ? '🔥'
            : bucket.estimatedBetsPerYear >= 20
              ? '📈'
              : bucket.estimatedBetsPerYear >= 10
                ? '⚠️'
                : '🚫';

        console.log(
          `${index + 1}. ${profitableEmoji} ${volumeEmoji} ${bucket.sport} ${bucket.bucket} Confidence`,
        );
        console.log(
          `   Games: ${bucket.count} (~${bucket.estimatedBetsPerYear}/year) | Win Rate: ${bucket.winRate.toFixed(1)}% | ROI: ${bucket.roi > 0 ? '+' : ''}${bucket.roi.toFixed(1)}%`,
        );
        console.log(
          `   Volume Score: ${bucket.volumeScore.toFixed(0)}/100 | ROI Score: ${bucket.roiScore.toFixed(0)}/100 | Combined: ${bucket.combinedScore.toFixed(0)}/100`,
        );
        console.log('');
      });

      if (profitableBuckets.length > 0) {
        console.log('🎯 PROFITABLE BUCKETS ANALYSIS:\n');

        profitableBuckets.forEach((bucket, index) => {
          const confidenceLevel =
            bucket.combinedScore >= 70 ? 'HIGH' : bucket.combinedScore >= 50 ? 'MEDIUM' : 'LOW';
          const recommendation =
            bucket.combinedScore >= 70
              ? 'STRONG_BET'
              : bucket.combinedScore >= 30
                ? 'MODERATE_BET'
                : 'AVOID';

          console.log(`${index + 1}. 🎯 ${bucket.sport} ${bucket.bucket} Confidence Bucket`);
          console.log(
            `   📊 Performance: ${bucket.winRate.toFixed(1)}% win rate (${bucket.count} games)`,
          );
          console.log(
            `   💰 ROI: +${bucket.roi.toFixed(1)}% | ROI Score: ${bucket.roiScore.toFixed(0)}/100`,
          );
          console.log(
            `   📈 Volume: ${bucket.count} games (~${bucket.estimatedBetsPerYear}/year) | Volume Score: ${bucket.volumeScore.toFixed(0)}/100`,
          );
          console.log(`   🎯 Combined Score: ${bucket.combinedScore.toFixed(0)}/100`);
          console.log(`   📅 Confidence Level: ${confidenceLevel}`);
          console.log(`   🎯 Recommendation: ${recommendation}`);
          console.log(
            `   📝 Strategy: Target ${bucket.sport} games with ${bucket.bucket} model confidence`,
          );
          console.log('');
        });

        console.log('🚀 RECOMMENDED MULTI-SPORT STRATEGY:\n');

        let totalAnnualProfit = 0;
        let totalAnnualBets = 0;

        profitableBuckets.forEach((bucket, index) => {
          const annualProfit = (bucket.roi / 100) * bucket.estimatedBetsPerYear * 100; // $100 bets
          totalAnnualProfit += annualProfit;
          totalAnnualBets += bucket.estimatedBetsPerYear;

          console.log(
            `   ${index + 1}. ${bucket.sport} ${bucket.bucket}: ~${bucket.estimatedBetsPerYear} bets/year × +${bucket.roi.toFixed(1)}% = +$${annualProfit.toFixed(0)}/year`,
          );
        });

        console.log(
          `\n   🎯 TOTAL: ~${totalAnnualBets} bets/year with +$${totalAnnualProfit.toFixed(0)} annual profit`,
        );
        console.log(
          `   📊 Average ROI: +${((totalAnnualProfit / (totalAnnualBets * 100)) * 100).toFixed(1)}%`,
        );
      } else {
        console.log('❌ No profitable buckets found across all sports.');
      }

      // Show best near-break-even opportunities
      console.log('\n🟡 BEST NEAR-BREAK-EVEN OPPORTUNITIES (for odds shopping):\n');

      const nearBreakEven = sortedBuckets.filter(
        (b) => b.roi > -10 && b.roi <= 0 && b.estimatedBetsPerYear >= 10,
      );

      nearBreakEven.slice(0, 5).forEach((bucket, index) => {
        const oddsNeeded = Math.abs(bucket.roi) + 3; // How much better odds needed for +3% ROI
        console.log(
          `${index + 1}. ${bucket.sport} ${bucket.bucket}: ${bucket.roi.toFixed(1)}% ROI (~${bucket.estimatedBetsPerYear}/year)`,
        );
        console.log(`   💡 Need ${oddsNeeded.toFixed(1)}% better odds to reach +3% ROI`);
        console.log(`   🎯 High potential with odds shopping!`);
        console.log('');
      });

      console.log('💡 FINAL RECOMMENDATIONS:\n');
      console.log('1. 🎯 FOCUS ON NFL: Two profitable buckets with excellent ROI');
      console.log('2. 🟡 ODDS SHOP NBA/NCAAM: Near break-even with high volume');
      console.log('3. ❌ AVOID NHL: Still unprofitable even after optimization');
      console.log('4. 📈 COMBINE STRATEGIES: Use profitable + near-break-even for volume');
      console.log('5. 🔍 MONITOR PERFORMANCE: Track actual results vs historical data');
    });
}

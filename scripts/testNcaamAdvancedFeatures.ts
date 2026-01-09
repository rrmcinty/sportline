/**
 * Quick test of NCAAM training with advanced features (59 total)
 * Uses smaller dataset for faster iteration
 */

import { trainNcaamMoneylineModel } from '../src/models/trainNcaamMoneyline.js';
import path from 'path';
import fs from 'fs';

console.log('=== NCAAM Advanced Features Test ===\n');
console.log('Training with 59 features (includes tempo-adjusted, efficiency, SOS, momentum)');
console.log('Using 2024 season only with 3-fold CV for speed\n');

try {
  const outputPath = path.join(
    process.cwd(),
    'data',
    'models',
    'ncaam',
    'moneyline-2024-advanced.json',
  );

  const config = {
    trainSeasons: [2024], // Single season for speed
    useCrossValidation: true,
    cvFolds: 3, // 3-fold instead of 5-fold
    modelOptions: {
      nEstimators: 100,
      maxDepth: 15,
      minSamplesLeaf: 10,
    },
  };

  console.log('Training configuration:');
  console.log(`  Seasons: ${config.trainSeasons.join(', ')}`);
  console.log(`  CV Folds: ${config.cvFolds}`);
  console.log(`  Trees: ${config.modelOptions.nEstimators}\n`);

  const startTime = Date.now();
  trainNcaamMoneylineModel(config, outputPath);
  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  console.log(`\n✓ Training completed in ${elapsed} minutes!`);
  console.log(`✓ Model saved to: ${outputPath}`);

  // Verify the model
  if (fs.existsSync(outputPath)) {
    const modelData = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    console.log('\n=== Model Info ===');
    console.log(`  Sport: ${modelData.sport}`);
    console.log(`  Season: ${modelData.season}`);
    console.log(`  Training Size: ${modelData.trainingSize} games`);
    console.log(`  Features: ${modelData.featureNames.length}`);
    console.log(`  Has Scaler: ${!!modelData.scaler}`);
    console.log(`  Has Model: ${!!modelData.classifiers[0].modelJSON}`);

    if (modelData.featureNames.length === 59) {
      console.log('\n✓ SUCCESS: Model has 59 features (advanced feature set)');
    } else {
      console.log(`\n⚠️  WARNING: Expected 59 features, got ${modelData.featureNames.length}`);
    }
  }

  console.log('\n=== Test Passed ===');
} catch (error) {
  console.error('\n✗ Test Failed:', error);
  process.exit(1);
}

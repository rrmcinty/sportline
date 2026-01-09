/**
 * Test script for NCAAM training pipeline
 * This validates that the training process works end-to-end
 */

import { trainNcaamModel } from '../src/models/trainNcaamMoneyline.js';
import path from 'path';
import fs from 'fs';

console.log('=== NCAAM Training Pipeline Test ===\n');

try {
  // Train on 2022-2024, with cross-validation
  const seasons = [2022, 2023, 2024];
  const outputPath = path.join(process.cwd(), 'data', 'models', 'ncaam', 'moneyline-test.json');

  console.log(`Training NCAAM model on seasons: ${seasons.join(', ')}`);
  console.log(`Output path: ${outputPath}\n`);

  const modelPath = trainNcaamModel(seasons, outputPath, true);

  console.log(`\n✓ Training completed successfully!`);
  console.log(`✓ Model saved to: ${modelPath}`);

  // Verify the model file exists and has content
  if (fs.existsSync(modelPath)) {
    const modelData = JSON.parse(fs.readFileSync(modelPath, 'utf-8'));
    console.log('\n=== Model Validation ===');
    console.log(`  Sport: ${modelData.sport}`);
    console.log(`  Season: ${modelData.season}`);
    console.log(`  Training Size: ${modelData.trainingSize}`);
    console.log(`  Features: ${modelData.featureNames.length}`);
    console.log(`  Has Scaler: ${!!modelData.scaler}`);
    console.log(`  Has Model: ${!!modelData.classifiers[0].modelJSON}`);

    if (modelData.classifiers[0].modelJSON) {
      console.log('\n✓ Model has valid Random Forest weights');
    } else {
      console.error('\n✗ ERROR: Model missing Random Forest weights');
      process.exit(1);
    }
  } else {
    console.error(`\n✗ ERROR: Model file not found at ${modelPath}`);
    process.exit(1);
  }

  console.log('\n=== Test Passed ===');
  console.log('NCAAM training pipeline is working correctly.');
} catch (error) {
  console.error('\n✗ Test Failed:', error);
  process.exit(1);
}

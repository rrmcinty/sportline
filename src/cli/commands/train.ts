/**
 * CLI command for training models
 */

import { Command } from 'commander';
import { trainModel, type NbaTrainingOptions } from '../../models/trainNbaMoneyline.js';
import {
  trainNcaamModel,
  trainNcaamMoneylineModel,
  type NcaamTrainingConfig,
} from '../../models/trainNcaamMoneyline.js';
import {
  trainGradientBoostingModel,
  type GradientBoostingOptions,
} from '../../models/trainNbaGradientBoosting.js';
import path from 'path';

export function trainCommand(): Command {
  const command = new Command('train');

  command
    .description('Train a machine learning model')
    .argument('<sport>', 'Sport to train model for (supports: nba, ncaam)')
    .option(
      '-s, --seasons <years>',
      'Season years to train on (comma-separated for multiple)',
      '2024',
    )
    .option('-o, --output <path>', 'Output path for trained model')
    .option('--cv', 'Enable cross-validation (recommended for model evaluation)', false)
    .option('--cv-folds <n>', 'Number of CV folds', '5')
    .option('--walk-forward', 'Use walk-forward (time-series) cross-validation (NBA only)', false)
    .option('--analyze-features', 'Analyze feature importance (NBA only)', false)
    .option(
      '--select-features <method:value>',
      'Feature selection (e.g., "top_k:30", "correlation:0.9")',
    )
    .option(
      '--calibrate [method]',
      'Enable probability calibration (NBA: auto-select, NCAAM: specify method)',
    )
    .option(
      '--validation-season <year>',
      'Season to use for calibration (if not provided, uses 20% holdout)',
    )
    .option('--tune [method]', 'Hyperparameter tuning method: "grid" or "random" (NBA only)')
    .option('--tune-iter <n>', 'Number of iterations for random search (default: 10)', '10')
    .option('--quick', 'Quick testing mode (fast training on subset of data)', false)
    .option('--sample-size <n>', 'Number of games to use in quick mode (default: 200)', '200')
    .option(
      '--sample-method <method>',
      'Sampling method: "recent" or "random" (default: recent)',
      'recent',
    )
    .option(
      '--model-type <type>',
      'Model architecture: "random-forest" or "gradient-boosting" (default: random-forest)',
      'random-forest',
    )
    .option('--learning-rate <rate>', 'Learning rate for gradient boosting (default: 0.1)', '0.1')
    .option('--gb-max-depth <depth>', 'Max depth for gradient boosting trees (default: 3)', '3')
    .action(
      (
        sport: string,
        options: {
          seasons?: string;
          output?: string;
          cv?: boolean;
          cvFolds?: string;
          walkForward?: boolean;
          analyzeFeatures?: boolean;
          selectFeatures?: string;
          calibrate?: string;
          validationSeason?: string;
          tune?: string;
          tuneIter?: string;
          quick?: boolean;
          sampleSize?: string;
          sampleMethod?: string;
          modelType?: string;
          learningRate?: string;
          gbMaxDepth?: string;
        },
      ) => {
        const supportedSports = ['nba', 'ncaam'];
        if (!supportedSports.includes(sport)) {
          console.error(
            `Error: Sport '${sport}' not supported. Choose from: ${supportedSports.join(', ')}`,
          );
          process.exit(1);
        }

        // Parse seasons
        const seasonStrs = options.seasons?.split(',') || ['2024'];
        const seasons = seasonStrs.map((s) => parseInt(s.trim(), 10));

        if (seasons.some((s) => isNaN(s))) {
          console.error(`Error: Invalid season(s): ${options.seasons}`);
          process.exit(1);
        }

        console.log(`Training ${sport.toUpperCase()} moneyline model...`);
        console.log(`Seasons: ${seasons.join(', ')}`);
        if (options.cv) {
          console.log(`Cross-validation: ${options.cvFolds} folds`);
        }
        if (options.walkForward) {
          console.log(`Walk-forward CV: enabled`);
        }
        if (options.analyzeFeatures) {
          console.log(`Feature analysis: enabled`);
        }
        if (options.selectFeatures) {
          console.log(`Feature selection: ${options.selectFeatures}`);
        }
        if (options.calibrate) {
          console.log(`Calibration: ${options.calibrate}`);
          if (options.validationSeason) {
            console.log(`Validation season: ${options.validationSeason}`);
          }
        }
        if (options.tune) {
          console.log(`Hyperparameter tuning: ${options.tune}`);
          if (options.tune === 'random') {
            console.log(`Random search iterations: ${options.tuneIter}`);
          }
        }
        if (options.quick) {
          console.log(`Quick mode: enabled`);
          console.log(`Sample size: ${options.sampleSize} games`);
          console.log(`Sample method: ${options.sampleMethod}`);
        }
        if (options.modelType) {
          console.log(`Model architecture: ${options.modelType}`);
        }

        try {
          let modelPath: string;

          if (sport === 'nba') {
            // NBA training (single season for now)
            if (seasons.length > 1) {
              console.warn(
                'Warning: NBA training only supports single season. Using first season.',
              );
            }

            // Check model type
            const modelType = options.modelType || 'random-forest';
            if (!['random-forest', 'gradient-boosting'].includes(modelType)) {
              console.error(
                'Error: Invalid model type. Use "random-forest" or "gradient-boosting"',
              );
              process.exit(1);
            }

            // Handle gradient boosting separately
            if (modelType === 'gradient-boosting') {
              const gbOptions: GradientBoostingOptions = {
                learningRate: parseFloat(options.learningRate || '0.1'),
                nEstimators: 100,
                maxDepth: parseInt(options.gbMaxDepth || '3', 10),
                minSamplesLeaf: 10,
                useWalkForward: options.walkForward,
                calibrate: options.calibrate !== undefined,
              };

              if (options.quick) {
                const sampleSize = parseInt(options.sampleSize || '200', 10);
                const method = options.sampleMethod as 'recent' | 'random';

                if (!['recent', 'random'].includes(method)) {
                  console.error('Error: Invalid sample method. Use "recent" or "random"');
                  process.exit(1);
                }

                gbOptions.quickMode = {
                  enabled: true,
                  sampleSize,
                  method,
                };
              }

              modelPath = trainGradientBoostingModel(seasons[0], options.output, gbOptions);
            } else {
              // Random Forest (default)
              const nbaOptions: NbaTrainingOptions = {
                useWalkForward: options.walkForward,
                analyzeFeatures: options.analyzeFeatures,
                calibrate: options.calibrate !== undefined,
              };

              // Parse quick mode if provided
              if (options.quick) {
                const sampleSize = parseInt(options.sampleSize || '200', 10);
                const method = options.sampleMethod as 'recent' | 'random';

                if (!['recent', 'random'].includes(method)) {
                  console.error('Error: Invalid sample method. Use "recent" or "random"');
                  process.exit(1);
                }

                if (isNaN(sampleSize) || sampleSize < 1) {
                  console.error(`Error: Invalid sample size: ${options.sampleSize}`);
                  process.exit(1);
                }

                nbaOptions.quickMode = {
                  enabled: true,
                  sampleSize,
                  method,
                };
              }

              // Parse hyperparameter tuning if provided
              if (options.tune) {
                const method = options.tune as 'grid' | 'random';
                if (!['grid', 'random'].includes(method)) {
                  console.error('Error: Invalid tuning method. Use "grid" or "random"');
                  process.exit(1);
                }

                nbaOptions.tune = {
                  method,
                  nIter: parseInt(options.tuneIter || '10', 10),
                };
              }

              // Parse feature selection if provided
              if (options.selectFeatures) {
                const parts = options.selectFeatures.split(':');
                if (parts.length !== 2) {
                  console.error(
                    'Error: Invalid feature selection format. Use "method:value" (e.g., "top_k:30")',
                  );
                  process.exit(1);
                }

                const method = parts[0] as 'top_k' | 'threshold' | 'correlation';
                const value = parseFloat(parts[1]);

                if (!['top_k', 'threshold', 'correlation'].includes(method)) {
                  console.error(
                    'Error: Invalid feature selection method. Use "top_k", "threshold", or "correlation"',
                  );
                  process.exit(1);
                }

                if (isNaN(value)) {
                  console.error(`Error: Invalid feature selection value: ${parts[1]}`);
                  process.exit(1);
                }

                nbaOptions.selectFeatures = { method, value };
              }

              modelPath = trainModel(seasons[0], options.output, nbaOptions);
            }
          } else if (sport === 'ncaam') {
            // NCAAM training (supports multi-season + calibration)
            if (options.calibrate || options.validationSeason) {
              // Use full config for calibration support
              const validatedMethod = options.calibrate as
                | 'temperature'
                | 'isotonic'
                | 'beta'
                | undefined;
              if (
                validatedMethod &&
                !['temperature', 'isotonic', 'beta'].includes(validatedMethod)
              ) {
                console.error(
                  `Error: Invalid calibration method '${options.calibrate}'. Choose from: temperature, isotonic, beta`,
                );
                process.exit(1);
              }

              const config: NcaamTrainingConfig = {
                trainSeasons: seasons,
                validationSeason: options.validationSeason
                  ? parseInt(options.validationSeason, 10)
                  : undefined,
                useCrossValidation: options.cv || false,
                cvFolds: parseInt(options.cvFolds || '5', 10),
                calibrationMethod: validatedMethod,
              };

              const outputPath =
                options.output ||
                path.join(
                  process.cwd(),
                  'data',
                  'models',
                  'ncaam',
                  `moneyline-${seasons[seasons.length - 1]}.json`,
                );

              trainNcaamMoneylineModel(config, outputPath);
              modelPath = outputPath;
            } else {
              // Use simplified wrapper for backward compatibility
              modelPath = trainNcaamModel(seasons, options.output, options.cv);
            }
          } else {
            throw new Error(`Unknown sport: ${sport}`);
          }

          console.log(`\n✅ Model training complete!`);
          console.log(`Model saved to: ${modelPath}`);
        } catch (error) {
          console.error(`\n❌ Training failed:`, error);
          process.exit(1);
        }
      },
    );

  return command;
}

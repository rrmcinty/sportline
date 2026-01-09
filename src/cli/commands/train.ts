/**
 * CLI command for training models
 */

import { Command } from 'commander';
import { trainModel } from '../../models/trainNbaMoneyline.js';
import {
  trainNcaamModel,
  trainNcaamMoneylineModel,
  type NcaamTrainingConfig,
} from '../../models/trainNcaamMoneyline.js';
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
    .option('--calibrate <method>', 'Calibration method: temperature, isotonic, or beta')
    .option(
      '--validation-season <year>',
      'Season to use for calibration (if not provided, uses 20% holdout)',
    )
    .action(
      (
        sport: string,
        options: {
          seasons?: string;
          output?: string;
          cv?: boolean;
          cvFolds?: string;
          calibrate?: string;
          validationSeason?: string;
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
        if (options.calibrate) {
          console.log(`Calibration: ${options.calibrate}`);
          if (options.validationSeason) {
            console.log(`Validation season: ${options.validationSeason}`);
          }
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
            modelPath = trainModel(seasons[0], options.output);
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

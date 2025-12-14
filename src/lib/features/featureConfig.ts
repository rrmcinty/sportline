/**
 * Feature configuration loader and validator
 */

import fs from 'fs';
import path from 'path';
import type { FeatureConfig } from '../db/types.js';

/**
 * Load feature configuration from JSON file
 */
export function loadFeatureConfig(configPath: string): FeatureConfig {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Feature config not found: ${configPath}`);
  }

  const configJson = fs.readFileSync(configPath, 'utf8');
  const config = JSON.parse(configJson) as FeatureConfig;

  // Validate required fields
  validateConfig(config);

  return config;
}

/**
 * Validate feature configuration
 */
function validateConfig(config: FeatureConfig): void {
  const required = ['sport', 'model', 'market', 'seasons', 'features', 'rolling_windows'];
  
  for (const field of required) {
    if (!(field in config)) {
      throw new Error(`Missing required field in config: ${field}`);
    }
  }

  if (!Array.isArray(config.seasons) || config.seasons.length === 0) {
    throw new Error('Config must specify at least one season');
  }

  if (!Array.isArray(config.rolling_windows) || config.rolling_windows.length === 0) {
    throw new Error('Config must specify at least one rolling window');
  }

  if (typeof config.features !== 'object' || config.features === null) {
    throw new Error('Config features must be an object');
  }

  // Set defaults for optional fields
  config.allowed_providers = config.allowed_providers || [];
  config.recency_weighting = config.recency_weighting || { enabled: true, decay: 0.7 };
  config.min_edge = config.min_edge ?? 0.03;
  config.min_ev = config.min_ev ?? 0.01;
}

/**
 * Get list of enabled features
 */
export function getEnabledFeatures(config: FeatureConfig): string[] {
  return Object.entries(config.features)
    .filter(([_, enabled]) => enabled)
    .map(([name]) => name);
}

/**
 * Get enabled rolling stat features (excludes fixed features)
 */
export function getEnabledRollingFeatures(config: FeatureConfig): string[] {
  const fixedFeatures = [
    'homeWinRate5',
    'awayWinRate5',
    'homeAvgMargin5',
    'awayAvgMargin5',
    'homeWinRate10',
    'awayWinRate10',
    'homeAdvantage',
    'marketImpliedProb',
  ];

  return getEnabledFeatures(config).filter(
    (name) => !fixedFeatures.includes(name)
  );
}

/**
 * Check if a feature is enabled
 */
export function isFeatureEnabled(config: FeatureConfig, featureName: string): boolean {
  return config.features[featureName] === true;
}

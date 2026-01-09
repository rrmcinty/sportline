/**
 * Temporary stub for feature configuration
 */

export interface FeatureConfig {
  name: string;
  enabled: boolean;
  parameters?: Record<string, unknown>;
}

export const defaultFeatureConfig: FeatureConfig[] = [];

export function getEnabledRollingFeatures(): string[] {
  return [];
}

export function isFeatureEnabled(featureName: string): boolean {
  return false;
}

import type { ProceduralWorldEffectiveConfig } from '@blud/shared';

export type WaterRuntimeConfig = {
  caustics: boolean;
  clipmapDistance: number;
  enabled: boolean;
  foam: boolean;
  reflectionQuality: 'low' | 'high' | 'ultra';
  wetMargins: boolean;
};

export function adaptWaterConfig(config: ProceduralWorldEffectiveConfig): WaterRuntimeConfig {
  return { ...config.water };
}

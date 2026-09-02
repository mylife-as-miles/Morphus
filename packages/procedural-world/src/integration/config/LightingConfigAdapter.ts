import type { ProceduralWorldEffectiveConfig } from '@blud/shared';

export type LightingRuntimeConfig = {
  cascadeCount: number;
  giEnabled: boolean;
  maxShadowDistance: number;
  shadowMapResolution: number;
  sunAzimuth: number;
  sunElevation: number;
  timeOfDay: number;
};

export function adaptLightingConfig(config: ProceduralWorldEffectiveConfig): LightingRuntimeConfig {
  const quality = config.lighting.shadowQuality;
  return {
    cascadeCount: quality === 'low' ? 2 : 4,
    giEnabled: config.lighting.giEnabled,
    maxShadowDistance: Math.min(config.terrain.terrainRange, quality === 'low' ? 1800 : quality === 'high' ? 2800 : 3600),
    shadowMapResolution: quality === 'low' ? 1024 : quality === 'high' ? 2048 : 4096,
    sunAzimuth: config.lighting.sunAzimuth,
    sunElevation: config.lighting.sunElevation,
    timeOfDay: config.timeOfDay,
  };
}

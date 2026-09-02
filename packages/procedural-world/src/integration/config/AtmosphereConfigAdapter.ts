import type { ProceduralWorldEffectiveConfig } from '@blud/shared';

export type AtmosphereRuntimeConfig = {
  cloudCoverage: number;
  cloudSpeed: number;
  fogDensity: number;
  volumetrics: boolean;
};

export function adaptAtmosphereConfig(config: ProceduralWorldEffectiveConfig): AtmosphereRuntimeConfig {
  return {
    cloudCoverage: config.atmosphere.cloudCoverage,
    cloudSpeed: config.atmosphere.cloudSpeed * config.motion.cloudSpeed,
    fogDensity: config.atmosphere.fogDensity,
    volumetrics: config.atmosphere.volumetrics,
  };
}

import type { ProceduralWorldEffectiveConfig } from '@blud/shared';

export type VegetationRuntimeConfig = {
  enabledSpecies: string[];
  grassDensity: number;
  impostorRange: number;
  scatterSeedOffset: number;
  slopeLimit: number;
  treeDensity: number;
  understoryDensity: number;
  windResponse: number;
};

export function adaptVegetationConfig(config: ProceduralWorldEffectiveConfig): VegetationRuntimeConfig {
  return {
    enabledSpecies: [...config.vegetation.enabledSpecies],
    grassDensity: config.vegetation.grassDensity,
    impostorRange: config.vegetation.impostorRange,
    scatterSeedOffset: config.vegetation.scatterSeedOffset,
    slopeLimit: config.vegetation.slopeLimit,
    treeDensity: config.vegetation.treeDensity,
    understoryDensity: config.vegetation.understoryDensity,
    windResponse: config.vegetation.windResponse,
  };
}

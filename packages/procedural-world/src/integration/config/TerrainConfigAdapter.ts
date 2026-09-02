import type { ProceduralWorldEffectiveConfig } from '@blud/shared';

export type TerrainRuntimeConfig = {
  farShell: boolean;
  heightAmplitude: number;
  heightfieldResolution: number;
  hydraulicErosion: number;
  lakeBehavior: 'connected' | 'natural' | 'off';
  moisture: number;
  noiseScale: number;
  riverThreshold: number;
  simulationResolution: number;
  snow: number;
  terrainRange: number;
  thermalErosion: number;
  worldSizeMeters: number;
};

export function adaptTerrainConfig(config: ProceduralWorldEffectiveConfig): TerrainRuntimeConfig {
  return {
    farShell: config.terrain.farShell,
    heightAmplitude: config.terrain.heightAmplitude,
    heightfieldResolution: config.heightfieldResolution,
    hydraulicErosion: config.terrain.hydraulicErosion,
    lakeBehavior: config.terrain.lakeBehavior,
    moisture: config.terrain.moisture,
    noiseScale: config.terrain.noiseScale,
    riverThreshold: config.terrain.riverThreshold,
    simulationResolution: Math.min(2048, Math.max(512, config.heightfieldResolution >> 1)),
    snow: config.terrain.snow,
    terrainRange: config.terrain.terrainRange,
    thermalErosion: config.terrain.thermalErosion,
    worldSizeMeters: config.worldSizeMeters,
  };
}

import type { ProceduralWorldEffectiveConfig } from '@blud/shared';

export type MotionRuntimeConfig = {
  cloudSpeed: number;
  freezeSimulation: boolean;
  particleCount: number;
  particleTypes: Array<'leaves' | 'pollen' | 'snow'>;
  windDirection: number;
  windStrength: number;
};

export function adaptMotionConfig(config: ProceduralWorldEffectiveConfig): MotionRuntimeConfig {
  return {
    cloudSpeed: config.atmosphere.cloudSpeed * config.motion.cloudSpeed,
    freezeSimulation: config.motion.freezeSimulation,
    particleCount: config.motion.particlePreset === 'low' ? 32768 : config.motion.particlePreset === 'high' ? 65536 : 131072,
    particleTypes: [...config.motion.particleTypes],
    windDirection: config.motion.windDirection,
    windStrength: config.motion.windStrength,
  };
}

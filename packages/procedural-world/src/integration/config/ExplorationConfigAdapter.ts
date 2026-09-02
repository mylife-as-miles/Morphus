import type { ProceduralWorldEffectiveConfig } from '@blud/shared';

export type ExplorationRuntimeConfig = ProceduralWorldEffectiveConfig['exploration'];

export function adaptExplorationConfig(config: ProceduralWorldEffectiveConfig): ExplorationRuntimeConfig {
  return { ...config.exploration };
}

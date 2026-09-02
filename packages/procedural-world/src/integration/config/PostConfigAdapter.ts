import type { ProceduralWorldEffectiveConfig } from '@blud/shared';

export type PostRuntimeConfig = ProceduralWorldEffectiveConfig['post'];

export function adaptPostConfig(config: ProceduralWorldEffectiveConfig): PostRuntimeConfig {
  return { ...config.post };
}

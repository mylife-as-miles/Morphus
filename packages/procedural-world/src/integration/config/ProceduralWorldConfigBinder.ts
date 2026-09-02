import {
  classifyProceduralWorldConfigChange,
  diffProceduralWorldConfig,
  normalizeProceduralWorldConfig,
  resolveProceduralWorldPreset,
  type ConfigBindingResult,
  type ProceduralWorldConfig,
  type ProceduralWorldConfigChange,
  type ProceduralWorldEffectiveConfig,
  type ProceduralWorldHardwareLimits,
  type ProceduralWorldPresetResolution,
} from '@blud/shared';
import { adaptAtmosphereConfig, type AtmosphereRuntimeConfig } from './AtmosphereConfigAdapter';
import { adaptExplorationConfig, type ExplorationRuntimeConfig } from './ExplorationConfigAdapter';
import { adaptLightingConfig, type LightingRuntimeConfig } from './LightingConfigAdapter';
import { adaptMotionConfig, type MotionRuntimeConfig } from './MotionConfigAdapter';
import { adaptPostConfig, type PostRuntimeConfig } from './PostConfigAdapter';
import { adaptVegetationConfig, type VegetationRuntimeConfig } from './VegetationConfigAdapter';
import { adaptWaterConfig, type WaterRuntimeConfig } from './WaterConfigAdapter';

export type ProceduralWorldLiveBindingTargets = {
  atmosphere?: (config: AtmosphereRuntimeConfig) => void | Promise<void>;
  exploration?: (config: ExplorationRuntimeConfig) => void | Promise<void>;
  lighting?: (config: LightingRuntimeConfig) => void | Promise<void>;
  motion?: (config: MotionRuntimeConfig) => void | Promise<void>;
  post?: (config: PostRuntimeConfig) => void | Promise<void>;
  vegetation?: (config: VegetationRuntimeConfig) => void | Promise<void>;
  water?: (config: WaterRuntimeConfig) => void | Promise<void>;
};

export type ProceduralWorldBindingPreview = {
  change: ProceduralWorldConfigChange;
  normalized: ProceduralWorldConfig;
  resolution: ProceduralWorldPresetResolution;
};

export class ProceduralWorldConfigBinder {
  private authored: ProceduralWorldConfig;
  private resolution: ProceduralWorldPresetResolution;

  constructor(
    config: unknown,
    private readonly hardware: ProceduralWorldHardwareLimits = {},
  ) {
    this.authored = normalizeProceduralWorldConfig(config);
    this.resolution = resolveProceduralWorldPreset(this.authored, hardware);
  }

  get authoredConfig(): ProceduralWorldConfig {
    return structuredClone(this.authored);
  }

  get effectiveConfig(): ProceduralWorldEffectiveConfig {
    return structuredClone(this.resolution.config);
  }

  get presetResolution(): ProceduralWorldPresetResolution {
    return structuredClone(this.resolution);
  }

  preview(next: unknown): ProceduralWorldBindingPreview {
    const normalized = normalizeProceduralWorldConfig(next);
    return {
      change: classifyProceduralWorldConfigChange(this.authored, normalized, this.hardware),
      normalized,
      resolution: resolveProceduralWorldPreset(normalized, this.hardware),
    };
  }

  async applyLive(next: unknown, targets: ProceduralWorldLiveBindingTargets): Promise<ConfigBindingResult> {
    const preview = this.preview(next);
    const result: ConfigBindingResult = {
      appliedFields: [],
      deferredFields: [],
      regeneratedSystems: [],
      unsupportedFields: [],
      warnings: preview.resolution.overrides.map((override) => `${override.path}: ${override.reason}`),
    };
    const liveFields = preview.change.changedFields.filter(
      (path) => preview.change.fieldActions[path] === 'uniform-update',
    );
    result.deferredFields.push(...preview.change.changedFields.filter((path) => !liveFields.includes(path)));

    await this.applyDomain('lighting', liveFields, ['timeOfDay', 'lighting.'], targets.lighting, adaptLightingConfig(preview.resolution.config), result);
    await this.applyDomain('atmosphere', liveFields, ['atmosphere.'], targets.atmosphere, adaptAtmosphereConfig(preview.resolution.config), result);
    await this.applyDomain('motion', liveFields, ['motion.'], targets.motion, adaptMotionConfig(preview.resolution.config), result);
    await this.applyDomain('vegetation', liveFields, ['vegetation.windResponse'], targets.vegetation, adaptVegetationConfig(preview.resolution.config), result);
    await this.applyDomain('water', liveFields, ['water.foam'], targets.water, adaptWaterConfig(preview.resolution.config), result);
    await this.applyDomain('post', liveFields, ['post.'], targets.post, adaptPostConfig(preview.resolution.config), result);
    await this.applyDomain('exploration', liveFields, ['exploration.', 'bookmarks'], targets.exploration, adaptExplorationConfig(preview.resolution.config), result);

    this.authored = preview.normalized;
    this.resolution = preview.resolution;
    return result;
  }

  commitRegenerated(next: unknown, regeneratedSystems: string[]): ConfigBindingResult {
    const preview = this.preview(next);
    const result: ConfigBindingResult = {
      appliedFields: diffProceduralWorldConfig(this.authored, preview.normalized),
      deferredFields: [],
      regeneratedSystems: [...regeneratedSystems],
      unsupportedFields: [],
      warnings: preview.resolution.overrides.map((override) => `${override.path}: ${override.reason}`),
    };
    this.authored = preview.normalized;
    this.resolution = preview.resolution;
    return result;
  }

  private async applyDomain<T>(
    _domain: string,
    liveFields: string[],
    prefixes: string[],
    target: ((config: T) => void | Promise<void>) | undefined,
    config: T,
    result: ConfigBindingResult,
  ): Promise<void> {
    const matching = liveFields.filter((path) => prefixes.some((prefix) => prefix.endsWith('.') ? path.startsWith(prefix) : path === prefix));
    if (matching.length === 0) return;
    if (!target) {
      result.deferredFields.push(...matching);
      return;
    }
    await target(config);
    result.appliedFields.push(...matching);
    result.deferredFields = result.deferredFields.filter((path) => !matching.includes(path));
  }
}

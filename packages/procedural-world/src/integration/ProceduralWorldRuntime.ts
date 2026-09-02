/**
 * Derived from LAAS/fable5-world-demo.
 * Original copyright (c) 2026 Remi Sebastian Kits.
 * Adapted for Dream Studio under the MIT License.
 */

import { type PerspectiveCamera, type Scene } from 'three';
import { type WebGPURenderer } from 'three/webgpu';
import {
  createDefaultProceduralWorldNodeData,
  normalizeProceduralWorldConfig,
  resolveProceduralWorldPreset,
  type ConfigBindingResult,
  type ProceduralWorldConfig,
  type ProceduralWorldConfigOverride,
  type ProceduralWorldEffectiveConfig,
  type ProceduralWorldHardwareLimits,
  type ProceduralWorldNodeData,
  type ProceduralWorldSystem,
} from '@blud/shared';
import { Engine, type EngineHost } from '../core/Engine';
import { FlyCamera } from '../core/FlyCamera';
import { initHooks, type EngineStats, type GpuDiagnostics, type LaasHooks } from '../core/Hooks';
import type { LaasParams } from '../core/Params';
import { WorldSeed } from '../core/Seed';
import { buildTerrainScene, type ProceduralWorldSceneBindings } from '../debug/TerrainScene';
import { PostStack } from '../render/PostStack';
import { windU } from '../render/Wind';
import { adaptPostConfig } from './config/PostConfigAdapter';
import {
  ProceduralWorldConfigBinder,
  type ProceduralWorldLiveBindingTargets,
} from './config/ProceduralWorldConfigBinder';

export type ProceduralWorldDocument = ProceduralWorldNodeData;

export type ProceduralWorldHost = EngineHost & {
  canvas: HTMLCanvasElement;
  requestRender?: () => void;
};

export type ProceduralWorldSystemStatus =
  | 'disabled'
  | 'uninitialized'
  | 'generating'
  | 'ready'
  | 'degraded'
  | 'error';

export type ProceduralWorldSystemDiagnostic = {
  error?: string;
  status: ProceduralWorldSystemStatus;
};

export type ProceduralWorldRuntimeOptions = {
  onDiagnostic?: (diagnostic: GpuDiagnostics) => void;
  onProgress?: (progress: number, stage: string) => void;
  onStats?: (stats: EngineStats) => void;
  onStatus?: (status: ProceduralWorldStatus) => void;
};

export type ProceduralWorldStatus = {
  activeGpuResources: string[];
  activePasses: string[];
  authoredConfig: ProceduralWorldConfig;
  bindingResult: ConfigBindingResult;
  diagnostic: GpuDiagnostics;
  effectiveRuntimeConfig: ProceduralWorldEffectiveConfig;
  hardwareClamps: ProceduralWorldConfigOverride[];
  lastGenerationDurationMs: number;
  presetOverrides: ProceduralWorldConfigOverride[];
  progress: number;
  stage: string;
  systems: Record<ProceduralWorldSystem, ProceduralWorldSystemDiagnostic>;
  waitingForRegeneration: string[];
};

const SYSTEM_NAMES: ProceduralWorldSystem[] = [
  'terrain', 'hydrology', 'biomes', 'vegetation', 'lighting', 'gi', 'atmosphere',
  'clouds', 'water', 'motion', 'particles', 'post', 'exploration',
];

export class ProceduralWorldRuntime {
  private binder: ProceduralWorldConfigBinder;
  private bindings: ProceduralWorldSceneBindings | null = null;
  private lastBindingResult: ConfigBindingResult = emptyBindingResult();
  private lastGenerationDurationMs = 0;
  private systems = createSystemStatus('uninitialized');

  private constructor(
    private readonly host: ProceduralWorldHost,
    private readonly options: ProceduralWorldRuntimeOptions,
    private document: ProceduralWorldDocument,
    private engine: Engine,
    private hooks: LaasHooks,
    private flyCamera: FlyCamera,
    binder: ProceduralWorldConfigBinder,
  ) {
    this.binder = binder;
  }

  static async create(
    host: ProceduralWorldHost,
    document: ProceduralWorldDocument,
    options: ProceduralWorldRuntimeOptions = {},
  ): Promise<ProceduralWorldRuntime> {
    const diagnostic = inspectWebGpuHost(host.renderer);
    options.onDiagnostic?.(diagnostic);
    if (!diagnostic.ok) throw new Error(diagnostic.reason ?? 'LAAS requires a WebGPU renderer.');

    const normalized = normalizeProceduralWorldConfig(document);
    const hardware = hardwareLimitsFromDiagnostic(diagnostic);
    const binder = new ProceduralWorldConfigBinder(normalized, hardware);
    const hooks = initHooks();
    hooks.diag = diagnostic;
    const engine = Engine.attach(host, toLaasParams(normalized, hardware), hooks);
    const flyCamera = createFlyCamera(host, normalized, engine);
    const runtime = new ProceduralWorldRuntime(
      host,
      options,
      normalized,
      engine,
      hooks,
      flyCamera,
      binder,
    );
    await runtime.build();
    return runtime;
  }

  update(deltaSeconds: number, _elapsedSeconds = 0): void {
    this.engine.update(deltaSeconds);
    this.options.onStats?.(this.engine.stats);
  }

  render(): void {
    this.engine.render();
  }

  resize(_width: number, _height: number, _dpr: number): void {
    this.engine.resize();
  }

  async applyConfig(nextDocument: ProceduralWorldDocument): Promise<ConfigBindingResult> {
    const preview = this.binder.preview(nextDocument);
    if (preview.change.changedFields.length === 0) {
      this.lastBindingResult = { ...emptyBindingResult(), warnings: ['No effective procedural-world fields changed.'] };
      this.emitStatus();
      return structuredClone(this.lastBindingResult);
    }

    const nonLive = preview.change.changedFields.filter(
      (path) => preview.change.fieldActions[path] !== 'uniform-update',
    );
    const postOnly = nonLive.length > 0 && nonLive.every(
      (path) => preview.change.fieldActions[path] === 'post-stack-rebuild',
    );

    if (nonLive.length === 0) {
      this.lastBindingResult = await this.binder.applyLive(nextDocument, this.liveTargets());
      this.document = preview.normalized;
      this.emitStatus();
      this.host.requestRender?.();
      return structuredClone(this.lastBindingResult);
    }

    if (postOnly && this.bindings) {
      const live = await this.binder.applyLive(nextDocument, this.liveTargets());
      this.rebuildPost(preview.resolution.config);
      this.document = preview.normalized;
      this.lastBindingResult = {
        appliedFields: preview.change.changedFields,
        deferredFields: [],
        regeneratedSystems: ['post'],
        unsupportedFields: [],
        warnings: live.warnings,
      };
      this.systems.post = { status: 'ready' };
      this.emitStatus();
      this.host.requestRender?.();
      return structuredClone(this.lastBindingResult);
    }

    await this.rebuildEngine(preview.normalized);
    this.lastBindingResult = {
      appliedFields: preview.change.changedFields,
      deferredFields: [],
      regeneratedSystems: preview.change.affectedSystems,
      unsupportedFields: [],
      warnings: [
        ...preview.resolution.overrides.map((override) => `${override.path}: ${override.reason}`),
        `The current LAAS resource graph rebuilt the complete world for ${preview.change.action}.`,
      ],
    };
    this.emitStatus();
    return structuredClone(this.lastBindingResult);
  }

  async regenerate(nextDocument: ProceduralWorldDocument): Promise<void> {
    await this.rebuildEngine(normalizeProceduralWorldConfig(nextDocument));
  }

  async forceRegenerate(system: ProceduralWorldSystem | 'world'): Promise<ConfigBindingResult> {
    if (system === 'post' && this.bindings) {
      this.rebuildPost(this.binder.effectiveConfig);
      this.lastBindingResult = {
        appliedFields: [],
        deferredFields: [],
        regeneratedSystems: ['post'],
        unsupportedFields: [],
        warnings: [],
      };
    } else {
      await this.rebuildEngine(this.document);
      this.lastBindingResult = {
        appliedFields: [],
        deferredFields: [],
        regeneratedSystems: [...SYSTEM_NAMES],
        unsupportedFields: [],
        warnings: system === 'world'
          ? []
          : [`The current LAAS resource graph rebuilt the complete world for the requested ${system} regeneration.`],
      };
    }
    this.emitStatus();
    return structuredClone(this.lastBindingResult);
  }

  async setTimeOfDay(hours: number): Promise<void> {
    const next = structuredClone(this.document);
    next.timeOfDay = Math.min(24, Math.max(0, hours));
    await this.applyConfig(next);
  }

  setExplorationMode(mode: 'editor' | 'walk' | 'fly'): void {
    const next = structuredClone(this.document);
    next.exploration.mode = mode;
    void this.applyConfig(next);
  }

  async setGroundRelativePose(view: {
    alt: number;
    pitch: number;
    timeOfDay?: number;
    x: number;
    yaw: number;
    z: number;
  }): Promise<void> {
    const hf = this.bindings?.heightfield;
    if (!hf) throw new Error('Terrain is not ready.');
    const y = Math.max(hf.heightAtCpu(view.x, view.z) + view.alt, hf.waterYAtCpu(view.x, view.z) + 0.6);
    this.flyCamera.setPose({ p: [view.x, y, view.z], yaw: view.yaw, pitch: view.pitch });
    if (view.timeOfDay !== undefined) await this.setTimeOfDay(view.timeOfDay);
  }

  getStatus(): ProceduralWorldStatus {
    const resolution = this.binder.presetResolution;
    return {
      activeGpuResources: this.activeResources(),
      activePasses: this.activePasses(),
      authoredConfig: this.binder.authoredConfig,
      bindingResult: structuredClone(this.lastBindingResult),
      diagnostic: this.hooks.diag ?? inspectWebGpuHost(this.host.renderer),
      effectiveRuntimeConfig: this.binder.effectiveConfig,
      hardwareClamps: resolution.hardwareClamps,
      lastGenerationDurationMs: this.lastGenerationDurationMs,
      presetOverrides: resolution.presetOverrides,
      progress: this.hooks.progress,
      stage: this.hooks.progressMsg,
      systems: structuredClone(this.systems),
      waitingForRegeneration: [...this.lastBindingResult.deferredFields],
    };
  }

  getStats(): EngineStats {
    return this.engine.stats;
  }

  async captureDeterminismSignature(): Promise<Record<string, string | number>> {
    if (!this.bindings) throw new Error('The procedural world is not ready.');
    const heightfield = this.bindings.heightfield;
    const flowBuffer = heightfield.flow?.flowStrength.value;
    const treeBuffer = this.bindings.scatter.trees.bufA.value;
    const [flowData, treeData] = await Promise.all([
      flowBuffer ? this.engine.renderer.getArrayBufferAsync(flowBuffer) : Promise.resolve(null),
      this.engine.renderer.getArrayBufferAsync(treeBuffer),
    ]);
    const terrain = hashView(heightfield.cpuHeights);
    const rivers = hashView(flowData ? new Float32Array(flowData) : null);
    const vegetation = hashPlacements(new Float32Array(treeData), this.bindings.scatter.trees.count);
    const authoredConfig = hashText(JSON.stringify(this.binder.authoredConfig));
    const bookmarks = hashText(JSON.stringify(this.binder.authoredConfig.bookmarks));
    const biomeClassification = hashText([
      terrain,
      rivers,
      this.binder.effectiveConfig.terrain.moisture,
      this.binder.effectiveConfig.terrain.snow,
    ].join(':'));
    return {
      authoredConfig,
      biomeClassification,
      bookmarks,
      riverNetwork: rivers,
      terrain,
      treeInstances: this.bindings.scatter.trees.count,
      vegetationPlacement: vegetation,
    };
  }

  dispose(): void {
    this.disposeEngine();
  }

  private async build(): Promise<void> {
    const started = performance.now();
    this.systems = createSystemStatus('generating');
    try {
      this.bindings = await buildTerrainScene({
        engine: this.engine,
        hooks: this.hooks,
        params: toLaasParams(this.document, hardwareLimitsFromDiagnostic(this.hooks.diag)),
        progress: (progress, stage) => {
          this.hooks.progress = progress;
          this.hooks.progressMsg = stage;
          this.options.onProgress?.(progress, stage);
          this.emitStatus();
        },
        seed: new WorldSeed(this.document.seed),
      });
      this.installHostHooks();
      this.markReadySystems();
      this.lastGenerationDurationMs = performance.now() - started;
      this.hooks.ready = true;
      this.host.requestRender?.();
      this.emitStatus();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      for (const system of SYSTEM_NAMES) {
        if (this.systems[system].status === 'generating') this.systems[system] = { error: message, status: 'error' };
      }
      this.hooks.error = message;
      this.emitStatus();
      throw error;
    }
  }

  private installHostHooks(): void {
    this.hooks.setPose = (pose) => this.flyCamera.setPose(pose);
    this.hooks.getPose = () => this.flyCamera.getPose();
    this.hooks.settle = (frames) => this.engine.settle(frames);
    this.hooks.flyCamEnabled = (enabled) => {
      this.flyCamera.enabled = enabled;
    };
    this.flyCamera.groundProbe = this.hooks.groundProbe ?? null;
    this.flyCamera.configureMovement(this.document.exploration);
    if (this.hooks.initialPose) this.flyCamera.setPose(this.hooks.initialPose);
    if (this.document.exploration.mode === 'walk') this.flyCamera.setMode('walk');
  }

  private liveTargets(): ProceduralWorldLiveBindingTargets {
    return {
      atmosphere: async (config) => {
        if (!this.bindings) return;
        this.bindings.clouds.coverage.value = config.cloudCoverage;
        this.bindings.clouds.speed.value = config.cloudSpeed;
        if (this.bindings.froxels) this.bindings.froxels.fogK.value = config.fogDensity;
        await this.bindings.clouds.refreshShadow(this.engine.renderer);
      },
      exploration: (config) => {
        this.flyCamera.configureMovement(config);
        this.flyCamera.enabled = config.mode !== 'editor';
        if (config.mode !== 'editor') this.flyCamera.setMode(config.mode);
      },
      lighting: async (config) => {
        if (!this.bindings) return;
        await this.bindings.sunSky.configure(config);
        await this.bindings.clouds.refreshShadow(this.engine.renderer);
        this.bindings.gi?.invalidate();
        this.bindings.post.setTimeOfDay(config.timeOfDay);
      },
      motion: (config) => {
        this.engine.setFrozen(config.freezeSimulation);
        windU.strength.value = config.windStrength;
        windU.dir.value.set(Math.cos(config.windDirection), Math.sin(config.windDirection));
        if (this.bindings) this.bindings.clouds.speed.value = config.cloudSpeed;
      },
      vegetation: (config) => {
        windU.vegetationResponse.value = config.windResponse;
      },
      water: (config) => {
        this.bindings?.water?.setFoamEnabled(config.foam);
      },
    };
  }

  private rebuildPost(config: ProceduralWorldEffectiveConfig): void {
    if (!this.bindings) return;
    const old = this.bindings.post.post as unknown as { dispose?: () => void };
    old.dispose?.();
    const post = new PostStack(
      this.engine,
      this.bindings.sunSky.atmosphere,
      this.bindings.sunSky.timeOfDay,
      this.bindings.clouds,
      this.bindings.froxels,
      adaptPostConfig(config),
    );
    this.engine.post = post;
    this.bindings.post = post;
  }

  private async rebuildEngine(next: ProceduralWorldDocument): Promise<void> {
    this.disposeEngine();
    this.document = normalizeProceduralWorldConfig(next);
    const diagnostic = inspectWebGpuHost(this.host.renderer);
    this.options.onDiagnostic?.(diagnostic);
    if (!diagnostic.ok) throw new Error(diagnostic.reason ?? 'LAAS requires a WebGPU renderer.');
    const hardware = hardwareLimitsFromDiagnostic(diagnostic);
    this.binder = new ProceduralWorldConfigBinder(this.document, hardware);
    this.hooks = initHooks();
    this.hooks.diag = diagnostic;
    this.engine = Engine.attach(this.host, toLaasParams(this.document, hardware), this.hooks);
    this.flyCamera = createFlyCamera(this.host, this.document, this.engine);
    await this.build();
  }

  private markReadySystems(): void {
    for (const system of SYSTEM_NAMES) this.systems[system] = { status: 'ready' };
    const config = this.binder.effectiveConfig;
    if (!config.lighting.giEnabled) this.systems.gi = { status: 'disabled' };
    if (!config.atmosphere.volumetrics) this.systems.atmosphere = { status: 'degraded' };
    if (!config.water.enabled) this.systems.water = { status: 'disabled' };
    if (config.motion.particleTypes.length === 0) this.systems.particles = { status: 'disabled' };
    const lightingWarning = this.validateLightingState();
    if (lightingWarning) this.systems.lighting = { error: lightingWarning, status: 'degraded' };
  }

  private validateLightingState(): string | null {
    const sunSky = this.bindings?.sunSky;
    if (!sunSky) return 'Sun/sky binding is missing.';
    if (!this.engine.scene.environment) return 'Sky-to-IBL environment is missing.';
    if (!Number.isFinite(this.host.renderer.toneMappingExposure)) return 'Tone-mapping exposure is not finite.';
    if (sunSky.sun.intensity < 0 || !Number.isFinite(sunSky.sun.intensity)) return 'Sun illuminance is invalid.';
    return null;
  }

  private activeResources(): string[] {
    if (!this.bindings) return [];
    const resources = ['heightfield', 'normal-texture', 'hydrology-fields', 'biome-texture', 'cloud-noise', 'cloud-shadow-map', 'environment-ibl'];
    if (this.bindings.gi) resources.push('probe-gi');
    if (this.bindings.water) resources.push('water-clipmap');
    if (this.bindings.froxels) resources.push('froxel-volume');
    return resources;
  }

  private activePasses(): string[] {
    const config = this.binder.effectiveConfig;
    const passes = ['terrain', 'hydrology', 'biomes', 'scatter', 'sun-sky', 'clouds', 'shadows', 'color-grade'];
    if (config.lighting.giEnabled) passes.push('probe-gi');
    if (config.water.enabled) passes.push('water');
    if (config.atmosphere.volumetrics) passes.push('froxels');
    if (config.post.gtao) passes.push('gtao');
    if (config.post.screenSpaceBounce) passes.push('screen-space-bounce');
    if (config.post.taa) passes.push('taa');
    if (config.post.bloom) passes.push('bloom');
    if (config.post.autoExposure) passes.push('auto-exposure');
    return passes;
  }

  private emitStatus(): void {
    this.options.onStatus?.(this.getStatus());
  }

  private disposeEngine(): void {
    this.flyCamera.dispose();
    this.engine.dispose();
    this.bindings = null;
  }
}

export function createProceduralWorldDocument(seed = 1): ProceduralWorldDocument {
  return createDefaultProceduralWorldNodeData(seed);
}

export function toLaasParams(
  document: ProceduralWorldDocument,
  hardware: ProceduralWorldHardwareLimits = {},
): LaasParams {
  const normalized = normalizeProceduralWorldConfig(document);
  const effective = resolveProceduralWorldPreset(normalized, hardware).config;
  return {
    cam: null,
    config: effective,
    dpr: null,
    freeze: effective.motion.freezeSimulation,
    hud: false,
    preset: effective.preset === 'custom' ? 'high' : effective.preset,
    scene: 'world',
    seed: effective.seed,
    shot: null,
    timeOfDay: effective.timeOfDay,
  };
}

export function inspectWebGpuHost(renderer: WebGPURenderer): GpuDiagnostics {
  const rendererShape = renderer as WebGPURenderer & { isWebGPURenderer?: boolean };
  const backend = renderer.backend as unknown as {
    adapter?: { info?: { architecture?: string; description?: string; device?: string; vendor?: string } };
    device?: { features: Iterable<string>; limits: object };
  };
  const adapterInfo = backend.adapter?.info;
  const features = backend.device ? Array.from(backend.device.features) : [];
  const limits: Record<string, number> = {};
  if (backend.device) {
    const supported = backend.device.limits as Record<string, unknown>;
    for (const name of WEBGPU_LIMIT_NAMES) {
      const value = supported[name];
      if (typeof value === 'number') limits[name] = value;
    }
  }
  const ok = rendererShape.isWebGPURenderer === true && Boolean(backend.device);
  return {
    architecture: adapterInfo?.architecture,
    description: adapterInfo?.description,
    device: adapterInfo?.device,
    features,
    limits,
    ok,
    reason: ok
      ? undefined
      : rendererShape.isWebGPURenderer === true
        ? 'The WebGPU renderer is not initialized with a device.'
        : 'This procedural world requires a WebGPU renderer. Switch the viewport or runtime host to WebGPU.',
    vendor: adapterInfo?.vendor,
  };
}

const WEBGPU_LIMIT_NAMES = [
  'maxBindGroups',
  'maxBindingsPerBindGroup',
  'maxBufferSize',
  'maxComputeInvocationsPerWorkgroup',
  'maxComputeWorkgroupSizeX',
  'maxComputeWorkgroupSizeY',
  'maxComputeWorkgroupSizeZ',
  'maxComputeWorkgroupsPerDimension',
  'maxSampledTexturesPerShaderStage',
  'maxSamplersPerShaderStage',
  'maxStorageBufferBindingSize',
  'maxStorageBuffersPerShaderStage',
  'maxStorageTexturesPerShaderStage',
  'maxTextureArrayLayers',
  'maxTextureDimension2D',
  'maxUniformBufferBindingSize',
  'maxUniformBuffersPerShaderStage',
] as const;

function createFlyCamera(
  host: ProceduralWorldHost,
  document: ProceduralWorldDocument,
  engine: Engine,
): FlyCamera {
  const flyCamera = new FlyCamera(host.camera, host.canvas);
  flyCamera.configureMovement(document.exploration);
  flyCamera.enabled = document.exploration.mode !== 'editor';
  flyCamera.setMode(document.exploration.mode === 'walk' ? 'walk' : 'fly');
  engine.onUpdate((deltaSeconds) => flyCamera.update(deltaSeconds));
  return flyCamera;
}

function hardwareLimitsFromDiagnostic(diagnostic: GpuDiagnostics | null | undefined): ProceduralWorldHardwareLimits {
  const limits = diagnostic?.limits ?? {};
  return {
    maxStorageBufferBindingSize: limits.maxStorageBufferBindingSize,
    maxTextureDimension2D: limits.maxTextureDimension2D,
  };
}

function emptyBindingResult(): ConfigBindingResult {
  return { appliedFields: [], deferredFields: [], regeneratedSystems: [], unsupportedFields: [], warnings: [] };
}

function createSystemStatus(status: ProceduralWorldSystemStatus): Record<ProceduralWorldSystem, ProceduralWorldSystemDiagnostic> {
  return Object.fromEntries(SYSTEM_NAMES.map((system) => [system, { status }])) as Record<ProceduralWorldSystem, ProceduralWorldSystemDiagnostic>;
}

function hashView(view: Float32Array | null): string {
  if (!view) return 'unavailable';
  const stride = Math.max(1, Math.floor(view.length / 1_000_000));
  const scratch = new DataView(new ArrayBuffer(4));
  let hash = 0x811c9dc5;
  for (let index = 0; index < view.length; index += stride) {
    const value = Math.fround(view[index] ?? 0);
    scratch.setFloat32(0, value, true);
    const bits = scratch.getUint32(0, true);
    hash ^= bits;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  hash ^= view.length;
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function hashText(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function hashPlacements(view: Float32Array, count: number): string {
  const scratch = new DataView(new ArrayBuffer(4));
  let xor = 0;
  let sum = 0;
  for (let instance = 0; instance < count; instance++) {
    let tuple = 0x811c9dc5;
    for (let component = 0; component < 4; component++) {
      scratch.setFloat32(0, Math.fround(view[instance * 4 + component] ?? 0), true);
      tuple ^= scratch.getUint32(0, true);
      tuple = Math.imul(tuple, 0x01000193) >>> 0;
    }
    xor ^= tuple;
    sum = (sum + tuple) >>> 0;
  }
  return `${(xor >>> 0).toString(16).padStart(8, '0')}:${sum.toString(16).padStart(8, '0')}:${count}`;
}

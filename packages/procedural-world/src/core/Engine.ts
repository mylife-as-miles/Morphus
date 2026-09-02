/**
 * Derived from LAAS/fable5-world-demo.
 * Original copyright (c) 2026 Remi Sebastian Kits.
 * Adapted for Dream Studio under the MIT License.
 *
 * The standalone LAAS engine owned the renderer, canvas, and animation loop.
 * Dream Studio owns all three through React Three Fiber, so this facade keeps
 * the original update/profiling behavior while binding it to a host scene.
 */

import { PerspectiveCamera, Scene } from 'three';
import { TimestampQuery, WebGPURenderer } from 'three/webgpu';
import { installMaterialKeyMemo } from '../render/ThreePatches';
import { installPositionInvariance } from '../render/VegPrepass';
import { GpuProfiler } from './GpuProfiler';
import type { EngineStats, LaasHooks } from './Hooks';
import type { LaasParams } from './Params';

export type UpdateFn = (dt: number, worldTime: number) => void;

export type EngineHost = {
  renderer: WebGPURenderer;
  scene: Scene;
  camera: PerspectiveCamera;
};

type PostRenderer = {
  meter(renderer: WebGPURenderer): void;
  render(): void;
};

type RendererState = {
  shadowMapEnabled: boolean;
  toneMapping: WebGPURenderer['toneMapping'];
  toneMappingExposure: number;
};

const P95_WINDOW = 120;

export class Engine {
  readonly renderer: WebGPURenderer;
  /** LAAS-owned scene root, mounted inside the host scene. */
  readonly scene: Scene;
  /** Full editor/runtime scene used by the final post render. */
  readonly renderScene: Scene;
  readonly camera: PerspectiveCamera;
  readonly params: LaasParams;
  readonly hooks: LaasHooks;
  readonly stats: EngineStats;

  worldTime = 0;
  elapsed = 0;
  post: PostRenderer | null = null;

  private readonly rendererState: RendererState;
  private updateFns: UpdateFn[] = [];
  private frameMsRing: number[] = [];
  private fpsEma = 0;
  private frameCounter = 0;
  private settleWaiters: { frames: number; resolve: () => void }[] = [];
  private readonly timestampsSupported: boolean;
  private timestampPending = false;
  private readonly profiler: GpuProfiler | null;
  private disposed = false;

  private constructor(host: EngineHost, params: LaasParams, hooks: LaasHooks) {
    this.renderer = host.renderer;
    this.renderScene = host.scene;
    this.camera = host.camera;
    this.params = params;
    this.hooks = hooks;
    this.scene = new Scene();
    this.scene.name = 'Dream Studio LAAS world';
    this.renderScene.add(this.scene);
    this.rendererState = {
      shadowMapEnabled: this.renderer.shadowMap.enabled,
      toneMapping: this.renderer.toneMapping,
      toneMappingExposure: this.renderer.toneMappingExposure,
    };
    this.stats = {
      fps: 0,
      frameMs: 0,
      frameMsP95: 0,
      drawCalls: 0,
      triangles: 0,
      frame: 0,
      counters: {},
      gpuPasses: {},
    };
    hooks.stats = this.stats;
    this.timestampsSupported = (hooks.diag?.features ?? []).includes('timestamp-query');
    this.profiler = this.timestampsSupported ? new GpuProfiler(this.renderer) : null;
  }

  static attach(host: EngineHost, params: LaasParams, hooks: LaasHooks): Engine {
    const engine = new Engine(host, params, hooks);
    const device = (engine.renderer.backend as unknown as {
      device?: { onuncapturederror: ((event: { error: { message: string } }) => void) | null };
    }).device;
    if (device) {
      let reported = 0;
      device.onuncapturederror = (event): void => {
        if (reported++ < 8) console.error('[laas] WebGPU uncaptured error:', event.error.message);
        if (!hooks.error) hooks.error = `WebGPU uncaptured error: ${event.error.message}`;
        hooks.ready = false;
      };
    }
    engine.renderer.shadowMap.enabled = true;
    installPositionInvariance(engine.renderer);
    installMaterialKeyMemo(engine.renderer);
    return engine;
  }

  onUpdate(fn: UpdateFn): () => void {
    this.updateFns.push(fn);
    return () => {
      const index = this.updateFns.indexOf(fn);
      if (index >= 0) this.updateFns.splice(index, 1);
    };
  }

  settle(frames = 8): Promise<void> {
    return new Promise((resolve) => this.settleWaiters.push({ frames, resolve }));
  }

  update(deltaSeconds: number): void {
    if (this.disposed) return;
    const rawDt = Math.max(0, deltaSeconds);
    const dt = Math.min(rawDt, 0.1);
    this.elapsed += dt;
    const simulationDt = this.params.freeze ? 0 : dt;
    if (!this.params.freeze) this.worldTime += dt;

    const start = performance.now();
    for (const fn of this.updateFns) fn(simulationDt, this.worldTime);
    const end = performance.now();
    this.stats.counters['cpu.updateMs100'] = Math.round((end - start) * 100);
    this.collectStats(rawDt);
    this.resolveSettles();
  }

  setFrozen(frozen: boolean): void {
    this.params.freeze = frozen;
  }

  get frozen(): boolean {
    return this.params.freeze;
  }

  render(): void {
    if (this.disposed) return;
    const start = performance.now();
    if (this.post) {
      this.post.meter(this.renderer);
      this.post.render();
    } else {
      this.renderer.render(this.renderScene, this.camera);
    }
    this.stats.counters['cpu.submitMs100'] = Math.round((performance.now() - start) * 100);
  }

  resize(): void {
    // R3F owns renderer size, DPR, and camera projection. Post targets listen
    // to the renderer's current drawing buffer through the upstream pipeline.
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.updateFns.length = 0;
    this.settleWaiters.splice(0).forEach(({ resolve }) => resolve());
    this.scene.traverse((object) => {
      const candidate = object as typeof object & {
        geometry?: { dispose?: () => void };
        material?: { dispose?: () => void } | Array<{ dispose?: () => void }>;
      };
      candidate.geometry?.dispose?.();
      if (Array.isArray(candidate.material)) {
        candidate.material.forEach((material) => material.dispose?.());
      } else {
        candidate.material?.dispose?.();
      }
    });
    this.scene.removeFromParent();
    this.renderer.shadowMap.enabled = this.rendererState.shadowMapEnabled;
    this.renderer.toneMapping = this.rendererState.toneMapping;
    this.renderer.toneMappingExposure = this.rendererState.toneMappingExposure;
  }

  private resolveSettles(): void {
    for (const waiter of this.settleWaiters) waiter.frames -= 1;
    const ready = this.settleWaiters.filter((waiter) => waiter.frames <= 0);
    this.settleWaiters = this.settleWaiters.filter((waiter) => waiter.frames > 0);
    ready.forEach(({ resolve }) => resolve());
  }

  private collectStats(rawDt: number): void {
    const ms = rawDt * 1000;
    this.frameMsRing.push(ms);
    if (this.frameMsRing.length > P95_WINDOW) this.frameMsRing.shift();
    const sorted = [...this.frameMsRing].sort((left, right) => left - right);
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? ms;
    const fpsNow = rawDt > 0 ? 1 / rawDt : 0;
    this.fpsEma = this.fpsEma === 0 ? fpsNow : this.fpsEma * 0.95 + fpsNow * 0.05;
    this.stats.fps = this.fpsEma;
    this.stats.frameMs = ms;
    this.stats.frameMsP95 = p95;
    this.stats.drawCalls = this.renderer.info.render.drawCalls;
    this.stats.triangles = this.renderer.info.render.triangles;
    this.stats.frame = this.frameCounter++;

    if (!this.timestampsSupported || this.timestampPending) return;
    this.timestampPending = true;
    Promise.all([
      this.renderer.resolveTimestampsAsync(TimestampQuery.RENDER),
      this.renderer.resolveTimestampsAsync(TimestampQuery.COMPUTE),
    ])
      .then(() => {
        if (this.profiler) this.profiler.collect(this.stats.gpuPasses);
      })
      .catch(() => undefined)
      .finally(() => {
        this.timestampPending = false;
      });
  }
}

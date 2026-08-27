import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  PerspectiveCamera,
  Scene,
} from "three";
import { MeshStandardNodeMaterial, WebGPURenderer } from "three/webgpu";
import {
  ProceduralWorldRuntime,
  createProceduralWorldDocument,
  type ProceduralWorldStatus,
} from "@blud/procedural-world";

type VerificationState = {
  adapter: Record<string, unknown>;
  browser: string;
  configVariant: string;
  heroView: string;
  selectedPose?: Record<string, number>;
  status: ProceduralWorldStatus | null;
  captureDeterminismSignature?: () => Promise<Record<string, string | number>>;
  setView?: (name: string) => Promise<void>;
};

declare global {
  interface Window {
    __dreamWorld: VerificationState;
  }
}

const query = new URLSearchParams(window.location.search);
const canvas = requireElement<HTMLCanvasElement>("#world");
const statusElement = requireElement<HTMLElement>("#status");
const failureElement = requireElement<HTMLElement>("#failure");

const seed = Math.floor(numberParam("seed", 41729)) >>> 0;
const presetValue = query.get("preset");
const preset = presetValue === "low" || presetValue === "ultra" ? presetValue : "high";
const heroView = query.get("shot") ?? "forest-ravine";
const variant = query.get("variant") ?? "after";
const freeze = query.get("freeze") !== "0";
const config = createProceduralWorldDocument(seed);
config.preset = preset;
config.worldSizeMeters = 4096;
config.heightfieldResolution = preset === "low" ? 2048 : 4096;
config.timeOfDay = numberParam("T", heroView === "alpine-vista" ? 18.4 : 15.2);
config.terrain.heightAmplitude = 1;
config.terrain.hydraulicErosion = 1;
config.terrain.thermalErosion = 1;
config.terrain.riverThreshold = 1;
config.terrain.lakeBehavior = "natural";
config.terrain.moisture = 1.1;
config.terrain.snow = 1.2;
config.vegetation.treeDensity = variant === "before" ? 0.72 : 1.12;
config.vegetation.understoryDensity = variant === "before" ? 0.55 : 1.18;
config.vegetation.grassDensity = variant === "before" ? 0.62 : 1.15;
config.vegetation.windResponse = 0.9;
config.atmosphere.cloudCoverage = variant === "before" ? 0.42 : 0.52;
config.atmosphere.cloudSpeed = 0.8;
config.atmosphere.fogDensity = variant === "before" ? 0.3 : 0.46;
config.water.enabled = true;
config.water.caustics = true;
config.water.foam = variant !== "before";
config.water.wetMargins = variant !== "before";
config.motion.freezeSimulation = freeze;
config.motion.windDirection = 0.45;
config.motion.windStrength = 0.72;
config.post.taa = true;
config.post.gtao = true;
config.post.screenSpaceBounce = true;
config.post.bloom = true;
config.post.autoExposure = true;
config.exploration.mode = "fly";
config.bookmarks = [
  { id: "forest-ravine", name: "Forest Ravine Hero", pitch: -0.12, timeOfDay: 15.2, x: 620, y: 180, yaw: 0.5, z: 650 },
  { id: "alpine-vista", name: "Alpine Vista Hero", pitch: -0.18, timeOfDay: 18.4, x: 1500, y: 900, yaw: 0.65, z: 1900 },
  { id: "wetland-lake", name: "Wetland Lake", pitch: -0.08, timeOfDay: 8.1, x: 11, y: 160, yaw: 1.2, z: 1338 },
];

window.__dreamWorld = {
  adapter: {},
  browser: navigator.userAgent,
  configVariant: variant,
  heroView,
  status: null,
};

void boot().catch((error: unknown) => {
  const message = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
  failureElement.textContent = message;
  if (window.__laas) window.__laas.error = message;
  console.error("[laas] verification boot failed", error);
});

async function boot(): Promise<void> {
  const gpu = (navigator as Navigator & { gpu?: BrowserGpu }).gpu;
  if (!gpu) throw new Error("navigator.gpu is unavailable. WebGPU is required and WebGL fallback is disabled.");
  const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) throw new Error("navigator.gpu.requestAdapter() returned null.");
  const adapterInfo = adapter.info ?? {};
  const device = await adapter.requestDevice();
  window.__dreamWorld.adapter = {
    ...adapterInfo,
    features: [...device.features],
    limits: collectNumericLimits(device.limits),
  };

  const requiredLimits = buildRequiredLimits(adapter.limits);
  const renderer = new WebGPURenderer({ antialias: false, canvas, requiredLimits });
  renderer.setPixelRatio(1);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  await renderer.init();

  const scene = new Scene();
  const camera = new PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 30000);
  const runtime = await ProceduralWorldRuntime.create(
    { camera, canvas, renderer, scene },
    config,
    {
      onProgress(progress, stage) {
        failureElement.textContent = `${stage} ${Math.round(progress * 100)}%`;
      },
      onStatus(status) {
        window.__dreamWorld.status = status;
      },
    },
  );

  addAuthoredRuin(scene, window.__laas.groundProbe?.(1150, 1500).ground ?? 380);
  await setHeroPose(runtime, heroView, renderer);
  statusElement.dataset.ready = "true";
  window.__dreamWorld.status = runtime.getStatus();
  window.__dreamWorld.captureDeterminismSignature = () => runtime.captureDeterminismSignature();
  window.__dreamWorld.setView = (name) => setHeroPose(runtime, name, renderer);

  let last = performance.now();
  renderer.setAnimationLoop(() => {
    const now = performance.now();
    runtime.update(Math.min((now - last) / 1000, 0.1));
    runtime.render();
    last = now;
  });
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    runtime.resize(window.innerWidth, window.innerHeight, 1);
  });
}

async function setHeroPose(
  runtime: ProceduralWorldRuntime,
  view: string,
  renderer?: WebGPURenderer,
): Promise<void> {
  const views: Record<string, Parameters<ProceduralWorldRuntime["setGroundRelativePose"]>[0]> = {
    "alpine-vista": { alt: 250, pitch: -0.2, timeOfDay: 17.2, x: 1500, yaw: 0.65, z: 1900 },
    "forest-interior": { alt: 4, pitch: -0.05, timeOfDay: 12.5, x: -850, yaw: -0.785, z: 850 },
    "forest-ravine": findRavinePose(),
    "forest-ravine-reverse": { alt: 3, pitch: -0.08, timeOfDay: 15.2, x: 620, yaw: 0.5 + Math.PI, z: 650 },
    "lakeshore": { alt: 2.5, pitch: -0.12, timeOfDay: 18.5, x: -1400, yaw: Math.PI, z: 1250 },
    "meadow": { alt: 2, pitch: 0.02, timeOfDay: 8.2, x: -870, yaw: -1.45, z: 862 },
    "ravine-mouth": { alt: 5, pitch: -0.06, timeOfDay: 15, x: 650, yaw: 0.6, z: 700 },
    "valley-aerial": { alt: 260, pitch: -0.5, timeOfDay: 17.5, x: -600, yaw: -0.6, z: 700 },
    "wetland-lake": { alt: 9, pitch: -0.06, timeOfDay: 8.1, x: 11, yaw: 1.2, z: 1338 },
  };
  const pose = views[view] ?? views["forest-ravine"]!;
  if (renderer) renderer.toneMappingExposure = view === "alpine-vista" ? 0.45 : 0.7;
  window.__dreamWorld.selectedPose = { alt: pose.alt, pitch: pose.pitch, x: pose.x, yaw: pose.yaw, z: pose.z };
  await runtime.setGroundRelativePose(pose);
}

function findRavinePose(): Parameters<ProceduralWorldRuntime["setGroundRelativePose"]>[0] {
  const probe = window.__laas.groundProbe;
  const fallback = { alt: 3, pitch: -0.08, timeOfDay: 15.2, x: 620, yaw: 0.5 + Math.PI, z: 650 };
  if (!probe) return fallback;
  let best: { score: number; wetX: number; wetZ: number; x: number; z: number } | null = null;
  for (let oz = -220; oz <= 220; oz += 10) {
    for (let ox = -220; ox <= 220; ox += 10) {
      const x = 620 + ox;
      const z = 650 + oz;
      const center = probe(x, z);
      if (center.water > center.ground + 0.02) continue;
      const sx = Math.abs(probe(x + 4, z).ground - probe(x - 4, z).ground) / 8;
      const sz = Math.abs(probe(x, z + 4).ground - probe(x, z - 4).ground) / 8;
      const slope = Math.hypot(sx, sz);
      if (slope > 0.32) continue;
      for (const radius of [8, 14, 20, 28]) {
        for (let index = 0; index < 16; index++) {
          const angle = (index / 16) * Math.PI * 2;
          const wetX = x + Math.cos(angle) * radius;
          const wetZ = z + Math.sin(angle) * radius;
          const wet = probe(wetX, wetZ);
          if (wet.water <= wet.ground + 0.02) continue;
          const score = Math.hypot(ox, oz) * 0.01 + slope * 45 + radius * 0.22;
          if (!best || score < best.score) best = { score, wetX, wetZ, x, z };
        }
        if (best?.x === x && best.z === z) break;
      }
    }
  }
  const selected = best as { score: number; wetX: number; wetZ: number; x: number; z: number } | null;
  if (!selected) return fallback;
  const dx = selected.wetX - selected.x;
  const dz = selected.wetZ - selected.z;
  return {
    alt: 1.75,
    pitch: -0.1,
    timeOfDay: 15.2,
    x: selected.x,
    yaw: Math.atan2(-dx, -dz),
    z: selected.z,
  };
}

function addAuthoredRuin(scene: Scene, groundY: number): void {
  const ruin = new Group();
  ruin.name = "Dream Studio Authored Highland Ruin";
  ruin.position.set(1150, groundY - 1, 1500);
  ruin.scale.setScalar(2.2);
  const stone = new MeshStandardNodeMaterial({ color: 0x6f746e, roughness: 0.94, metalness: 0 });
  const darkStone = new MeshStandardNodeMaterial({ color: 0x444a45, roughness: 1, metalness: 0 });
  const add = (mesh: Mesh) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    ruin.add(mesh);
  };
  const tower = new Mesh(new CylinderGeometry(8, 10, 28, 10, 1, false, 0.16, Math.PI * 1.7), stone);
  tower.position.y = 14;
  add(tower);
  for (let index = 0; index < 6; index++) {
    const merlon = new Mesh(new BoxGeometry(2.2, 3.8, 2.8), darkStone);
    const angle = (index / 6) * Math.PI * 2;
    merlon.position.set(Math.cos(angle) * 7.2, 29, Math.sin(angle) * 7.2);
    merlon.rotation.y = -angle;
    add(merlon);
  }
  const wallA = new Mesh(new BoxGeometry(30, 10, 3.2), stone);
  wallA.position.set(-12, 5, 8);
  wallA.rotation.y = -0.25;
  add(wallA);
  const wallB = new Mesh(new BoxGeometry(22, 7, 3), darkStone);
  wallB.position.set(-5, 3.5, -10);
  wallB.rotation.y = 0.55;
  add(wallB);
  const fallen = new Mesh(new BoxGeometry(13, 2.8, 3.2), stone);
  fallen.position.set(-20, 1.4, -2);
  fallen.rotation.set(0.2, -0.6, 0.13);
  add(fallen);
  scene.add(ruin);
}

function numberParam(name: string, fallback: number): number {
  const raw = query.get(name);
  if (raw === null) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

type BrowserGpu = {
  requestAdapter(options?: { powerPreference?: string }): Promise<{
    info?: Record<string, unknown>;
    limits: Record<string, unknown>;
    requestDevice(): Promise<{ features: Iterable<string>; limits: Record<string, unknown> }>;
  } | null>;
};

function buildRequiredLimits(limits: Record<string, unknown>): Record<string, number> {
  const desired: Record<string, number> = {
    maxBufferSize: 1 << 30,
    maxStorageBufferBindingSize: 1 << 30,
    maxStorageBuffersPerShaderStage: 16,
    maxStorageTexturesPerShaderStage: 8,
  };
  const required: Record<string, number> = {};
  for (const [name, value] of Object.entries(desired)) {
    const supported = limits[name];
    if (typeof supported === "number") required[name] = Math.min(value, supported);
  }
  return required;
}

const WEBGPU_LIMIT_NAMES = [
  "maxBindGroups",
  "maxBindingsPerBindGroup",
  "maxBufferSize",
  "maxComputeInvocationsPerWorkgroup",
  "maxComputeWorkgroupSizeX",
  "maxComputeWorkgroupSizeY",
  "maxComputeWorkgroupSizeZ",
  "maxComputeWorkgroupsPerDimension",
  "maxSampledTexturesPerShaderStage",
  "maxSamplersPerShaderStage",
  "maxStorageBufferBindingSize",
  "maxStorageBuffersPerShaderStage",
  "maxStorageTexturesPerShaderStage",
  "maxTextureArrayLayers",
  "maxTextureDimension2D",
  "maxUniformBufferBindingSize",
  "maxUniformBuffersPerShaderStage",
] as const;

function collectNumericLimits(limits: Record<string, unknown>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const name of WEBGPU_LIMIT_NAMES) {
    const value = limits[name];
    if (typeof value === "number") result[name] = value;
  }
  return result;
}

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required element: ${selector}`);
  return element;
}

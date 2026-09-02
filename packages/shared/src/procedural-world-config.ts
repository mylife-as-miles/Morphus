import type {
  ProceduralWorldBookmark,
  ProceduralWorldConfig,
  ProceduralWorldPreset,
} from "./types";

export const PROCEDURAL_WORLD_CONFIG_VERSION = 2 as const;

export type ProceduralWorldEffectiveConfig = ProceduralWorldConfig;

export type ProceduralWorldConfigIssue = {
  code: string;
  message: string;
  path: string;
  severity: "error" | "warning";
};

export type ProceduralWorldConfigValidation = {
  issues: ProceduralWorldConfigIssue[];
  valid: boolean;
};

export type ProceduralWorldHardwareLimits = {
  maxStorageBufferBindingSize?: number;
  maxTextureDimension2D?: number;
};

export type ProceduralWorldConfigOverride = {
  authored: unknown;
  effective: unknown;
  path: string;
  reason: string;
  source: "hardware" | "preset" | "runtime";
};

export type ProceduralWorldPresetResolution = {
  config: ProceduralWorldEffectiveConfig;
  hardwareClamps: ProceduralWorldConfigOverride[];
  overrides: ProceduralWorldConfigOverride[];
  presetOverrides: ProceduralWorldConfigOverride[];
};

export type ProceduralWorldChangeAction =
  | "none"
  | "uniform-update"
  | "material-rebuild"
  | "vegetation-regeneration"
  | "hydrology-regeneration"
  | "terrain-regeneration"
  | "atmosphere-resource-rebuild"
  | "post-stack-rebuild"
  | "complete-world-regeneration";

export type ProceduralWorldSystem =
  | "terrain"
  | "hydrology"
  | "biomes"
  | "vegetation"
  | "lighting"
  | "gi"
  | "atmosphere"
  | "clouds"
  | "water"
  | "motion"
  | "particles"
  | "post"
  | "exploration";

export type ProceduralWorldConfigChange = {
  action: ProceduralWorldChangeAction;
  actions: ProceduralWorldChangeAction[];
  affectedSystems: ProceduralWorldSystem[];
  changedFields: string[];
  fieldActions: Record<string, ProceduralWorldChangeAction>;
};

export type ConfigBindingResult = {
  appliedFields: string[];
  deferredFields: string[];
  regeneratedSystems: string[];
  unsupportedFields: string[];
  warnings: string[];
};

const SPECIES = ["beech", "birch", "conifer", "oak", "pine", "willow"] as const;
const PARTICLE_TYPES = ["leaves", "pollen", "snow"] as const;

export function createDefaultProceduralWorldConfig(seed = 1): ProceduralWorldConfig {
  return {
    atmosphere: { cloudCoverage: 0.55, cloudSpeed: 1, fogDensity: 0.5, volumetrics: true },
    bookmarks: [],
    enabled: true,
    exploration: { flySpeed: 30, mode: "editor", sprintMultiplier: 1.7, walkSpeed: 5 },
    generator: "laas",
    heightfieldResolution: 4096,
    lighting: { giEnabled: true, shadowQuality: "ultra", sunAzimuth: 0.65, sunElevation: 0.35 },
    motion: {
      cloudSpeed: 1,
      freezeSimulation: false,
      particlePreset: "ultra",
      particleTypes: ["pollen", "leaves", "snow"],
      windDirection: 0,
      windStrength: 1,
    },
    post: {
      autoExposure: true,
      bloom: true,
      debugView: "none",
      gtao: true,
      screenSpaceBounce: true,
      taa: true,
    },
    preset: "ultra",
    seed: Math.floor(seed) >>> 0,
    terrain: {
      farShell: true,
      heightAmplitude: 1,
      hydraulicErosion: 1,
      lakeBehavior: "natural",
      moisture: 1,
      noiseScale: 1,
      riverThreshold: 1,
      snow: 1,
      terrainRange: 4000,
      thermalErosion: 1,
    },
    timeOfDay: 11,
    vegetation: {
      enabledSpecies: [...SPECIES],
      grassDensity: 1,
      impostorRange: 1,
      scatterSeedOffset: 0,
      slopeLimit: 1,
      treeDensity: 1,
      understoryDensity: 1,
      windResponse: 1,
    },
    version: PROCEDURAL_WORLD_CONFIG_VERSION,
    water: {
      caustics: true,
      clipmapDistance: 1000,
      enabled: true,
      foam: true,
      reflectionQuality: "ultra",
      wetMargins: true,
    },
    worldSizeMeters: 4096,
  };
}

export function migrateProceduralWorldConfig(input: unknown): ProceduralWorldConfig {
  const source = isRecord(input) ? input : {};
  const defaults = createDefaultProceduralWorldConfig(numberOr(source.seed, 1));
  const merged = {
    ...defaults,
    ...source,
    atmosphere: { ...defaults.atmosphere, ...recordOr(source.atmosphere) },
    exploration: { ...defaults.exploration, ...recordOr(source.exploration) },
    lighting: { ...defaults.lighting, ...recordOr(source.lighting) },
    motion: { ...defaults.motion, ...recordOr(source.motion) },
    post: { ...defaults.post, ...recordOr(source.post) },
    terrain: { ...defaults.terrain, ...recordOr(source.terrain) },
    vegetation: { ...defaults.vegetation, ...recordOr(source.vegetation) },
    version: PROCEDURAL_WORLD_CONFIG_VERSION,
    water: { ...defaults.water, ...recordOr(source.water) },
  };
  delete (merged as Record<string, unknown>).schemaVersion;
  return merged as ProceduralWorldConfig;
}

export function normalizeProceduralWorldConfig(input: unknown): ProceduralWorldConfig {
  const value = migrateProceduralWorldConfig(input);
  const preset = enumOr(value.preset, ["low", "high", "ultra", "custom"] as const, "ultra");
  const worldSizeMeters = clamp(numberOr(value.worldSizeMeters, 4096), 256, 16384);
  return {
    atmosphere: {
      cloudCoverage: clamp(numberOr(value.atmosphere.cloudCoverage, 0.55), 0, 1),
      cloudSpeed: clamp(numberOr(value.atmosphere.cloudSpeed, 1), 0, 4),
      fogDensity: clamp(numberOr(value.atmosphere.fogDensity, 0.5), 0, 4),
      volumetrics: Boolean(value.atmosphere.volumetrics),
    },
    bookmarks: normalizeBookmarks(value.bookmarks),
    enabled: Boolean(value.enabled),
    exploration: {
      flySpeed: clamp(numberOr(value.exploration.flySpeed, 30), 0.1, 250),
      mode: enumOr(value.exploration.mode, ["editor", "fly", "walk"] as const, "editor"),
      sprintMultiplier: clamp(numberOr(value.exploration.sprintMultiplier, 1.7), 1, 8),
      walkSpeed: clamp(numberOr(value.exploration.walkSpeed, 5), 0.1, 25),
    },
    generator: "laas",
    heightfieldResolution: nearestPowerOfTwo(
      clamp(numberOr(value.heightfieldResolution, 4096), 512, 8192),
    ),
    lighting: {
      giEnabled: Boolean(value.lighting.giEnabled),
      shadowQuality: enumOr(value.lighting.shadowQuality, ["low", "high", "ultra"] as const, "ultra"),
      sunAzimuth: wrapRadians(numberOr(value.lighting.sunAzimuth, 0.65)),
      sunElevation: clamp(numberOr(value.lighting.sunElevation, 0.35), -1.2, 1.2),
    },
    motion: {
      cloudSpeed: clamp(numberOr(value.motion.cloudSpeed, 1), 0, 4),
      freezeSimulation: Boolean(value.motion.freezeSimulation),
      particlePreset: enumOr(value.motion.particlePreset, ["low", "high", "ultra"] as const, "ultra"),
      particleTypes: arrayEnum(value.motion.particleTypes, PARTICLE_TYPES),
      windDirection: wrapRadians(numberOr(value.motion.windDirection, 0)),
      windStrength: clamp(numberOr(value.motion.windStrength, 1), 0, 4),
    },
    post: {
      autoExposure: Boolean(value.post.autoExposure),
      bloom: Boolean(value.post.bloom),
      debugView: enumOr(value.post.debugView, ["none", "ao", "clouds", "velocity"] as const, "none"),
      gtao: Boolean(value.post.gtao),
      screenSpaceBounce: Boolean(value.post.screenSpaceBounce),
      taa: Boolean(value.post.taa),
    },
    preset,
    seed: Math.floor(numberOr(value.seed, 1)) >>> 0,
    terrain: {
      farShell: Boolean(value.terrain.farShell),
      heightAmplitude: clamp(numberOr(value.terrain.heightAmplitude, 1), 0, 4),
      hydraulicErosion: clamp(numberOr(value.terrain.hydraulicErosion, 1), 0, 4),
      lakeBehavior: enumOr(value.terrain.lakeBehavior, ["connected", "natural", "off"] as const, "natural"),
      moisture: clamp(numberOr(value.terrain.moisture, 1), 0, 4),
      noiseScale: clamp(numberOr(value.terrain.noiseScale, 1), 0.1, 4),
      riverThreshold: clamp(numberOr(value.terrain.riverThreshold, 1), 0.1, 4),
      snow: clamp(numberOr(value.terrain.snow, 1), 0, 4),
      terrainRange: clamp(numberOr(value.terrain.terrainRange, 4000), 256, worldSizeMeters * 2),
      thermalErosion: clamp(numberOr(value.terrain.thermalErosion, 1), 0, 4),
    },
    timeOfDay: clamp(numberOr(value.timeOfDay, 11), 0, 24),
    vegetation: {
      enabledSpecies: arrayEnum(value.vegetation.enabledSpecies, SPECIES),
      grassDensity: clamp(numberOr(value.vegetation.grassDensity, 1), 0, 4),
      impostorRange: clamp(numberOr(value.vegetation.impostorRange, 1), 0.25, 3),
      scatterSeedOffset: Math.trunc(clamp(numberOr(value.vegetation.scatterSeedOffset, 0), -2147483648, 2147483647)),
      slopeLimit: clamp(numberOr(value.vegetation.slopeLimit, 1), 0.1, 2),
      treeDensity: clamp(numberOr(value.vegetation.treeDensity, 1), 0, 4),
      understoryDensity: clamp(numberOr(value.vegetation.understoryDensity, 1), 0, 4),
      windResponse: clamp(numberOr(value.vegetation.windResponse, 1), 0, 3),
    },
    version: PROCEDURAL_WORLD_CONFIG_VERSION,
    water: {
      caustics: Boolean(value.water.caustics),
      clipmapDistance: clamp(numberOr(value.water.clipmapDistance, 1000), 128, worldSizeMeters),
      enabled: Boolean(value.water.enabled),
      foam: Boolean(value.water.foam),
      reflectionQuality: enumOr(value.water.reflectionQuality, ["low", "high", "ultra"] as const, "ultra"),
      wetMargins: Boolean(value.water.wetMargins),
    },
    worldSizeMeters,
  };
}

export function validateProceduralWorldConfig(input: unknown): ProceduralWorldConfigValidation {
  const issues: ProceduralWorldConfigIssue[] = [];
  if (!isRecord(input)) {
    return {
      issues: [{ code: "invalid-root", message: "Procedural world config must be an object.", path: "", severity: "error" }],
      valid: false,
    };
  }
  const value = migrateProceduralWorldConfig(input);
  validateNumber(issues, "seed", value.seed, 0, 0xffffffff, true);
  validateNumber(issues, "worldSizeMeters", value.worldSizeMeters, 256, 16384);
  validateNumber(issues, "heightfieldResolution", value.heightfieldResolution, 512, 8192, true);
  validateNumber(issues, "timeOfDay", value.timeOfDay, 0, 24);
  validateNumber(issues, "terrain.heightAmplitude", value.terrain.heightAmplitude, 0, 4);
  validateNumber(issues, "terrain.hydraulicErosion", value.terrain.hydraulicErosion, 0, 4);
  validateNumber(issues, "terrain.thermalErosion", value.terrain.thermalErosion, 0, 4);
  validateNumber(issues, "terrain.noiseScale", value.terrain.noiseScale, 0.1, 4);
  validateNumber(issues, "terrain.riverThreshold", value.terrain.riverThreshold, 0.1, 4);
  validateNumber(issues, "terrain.moisture", value.terrain.moisture, 0, 4);
  validateNumber(issues, "terrain.snow", value.terrain.snow, 0, 4);
  validateNumber(issues, "terrain.terrainRange", value.terrain.terrainRange, 256, 32768);
  validateNumber(issues, "vegetation.treeDensity", value.vegetation.treeDensity, 0, 4);
  validateNumber(issues, "vegetation.understoryDensity", value.vegetation.understoryDensity, 0, 4);
  validateNumber(issues, "vegetation.grassDensity", value.vegetation.grassDensity, 0, 4);
  validateNumber(issues, "vegetation.slopeLimit", value.vegetation.slopeLimit, 0.1, 2);
  validateNumber(issues, "vegetation.windResponse", value.vegetation.windResponse, 0, 3);
  validateNumber(issues, "atmosphere.cloudCoverage", value.atmosphere.cloudCoverage, 0, 1);
  validateNumber(issues, "atmosphere.cloudSpeed", value.atmosphere.cloudSpeed, 0, 4);
  validateNumber(issues, "atmosphere.fogDensity", value.atmosphere.fogDensity, 0, 4);
  validateNumber(issues, "motion.cloudSpeed", value.motion.cloudSpeed, 0, 4);
  validateNumber(issues, "motion.windStrength", value.motion.windStrength, 0, 4);
  validateNumber(issues, "exploration.flySpeed", value.exploration.flySpeed, 0.1, 250);
  validateNumber(issues, "exploration.walkSpeed", value.exploration.walkSpeed, 0.1, 25);
  validateNumber(issues, "exploration.sprintMultiplier", value.exploration.sprintMultiplier, 1, 8);

  if ((value.heightfieldResolution & (value.heightfieldResolution - 1)) !== 0) {
    issues.push({
      code: "not-power-of-two",
      message: "Heightfield resolution must be a power of two.",
      path: "heightfieldResolution",
      severity: "error",
    });
  }
  if (value.generator !== "laas") {
    issues.push({ code: "unsupported-generator", message: "Only the LAAS generator is supported.", path: "generator", severity: "error" });
  }
  if (!(["low", "high", "ultra", "custom"] as unknown[]).includes(value.preset)) {
    issues.push({ code: "invalid-preset", message: "Unknown procedural-world preset.", path: "preset", severity: "error" });
  }
  if (!(["connected", "natural", "off"] as unknown[]).includes(value.terrain.lakeBehavior)) {
    issues.push({ code: "invalid-lake-policy", message: "Unknown lake behavior.", path: "terrain.lakeBehavior", severity: "error" });
  }
  if (value.vegetation.enabledSpecies.length === 0 && value.vegetation.treeDensity > 0) {
    issues.push({
      code: "empty-species-set",
      message: "Tree density is non-zero but no vegetation species are enabled.",
      path: "vegetation.enabledSpecies",
      severity: "warning",
    });
  }
  return { issues, valid: !issues.some((issue) => issue.severity === "error") };
}

export function resolveProceduralWorldPreset(
  input: unknown,
  hardware: ProceduralWorldHardwareLimits = {},
): ProceduralWorldPresetResolution {
  const authored = normalizeProceduralWorldConfig(input);
  const config = clone(authored);
  const overrides: ProceduralWorldConfigOverride[] = [];
  const apply = (
    path: string,
    effective: unknown,
    reason: string,
    source: ProceduralWorldConfigOverride["source"],
  ): void => {
    const current = getPath(config, path);
    if (sameValue(current, effective)) return;
    setPath(config, path, effective);
    overrides.push({ authored: getPath(authored, path), effective, path, reason, source });
  };

  const profiles: Record<Exclude<ProceduralWorldPreset, "custom">, {
    heightfieldResolution: number;
    impostorRange: number;
    particlePreset: "low" | "high" | "ultra";
    reflectionQuality: "low" | "high" | "ultra";
    shadowQuality: "low" | "high" | "ultra";
    terrainRange: number;
    waterRange: number;
  }> = {
    low: { heightfieldResolution: 2048, impostorRange: 0.75, particlePreset: "low", reflectionQuality: "low", shadowQuality: "low", terrainRange: 2600, waterRange: 700 },
    high: { heightfieldResolution: 4096, impostorRange: 1, particlePreset: "high", reflectionQuality: "high", shadowQuality: "high", terrainRange: 3600, waterRange: 1000 },
    ultra: { heightfieldResolution: 4096, impostorRange: 1.2, particlePreset: "ultra", reflectionQuality: "ultra", shadowQuality: "ultra", terrainRange: 4000, waterRange: 1200 },
  };

  if (authored.preset !== "custom") {
    const profile = profiles[authored.preset];
    apply("heightfieldResolution", profile.heightfieldResolution, `${authored.preset} preset terrain resolution`, "preset");
    apply("terrain.terrainRange", Math.min(authored.terrain.terrainRange, profile.terrainRange), `${authored.preset} preset terrain range cap`, "preset");
    apply("vegetation.impostorRange", profile.impostorRange, `${authored.preset} preset vegetation LOD`, "preset");
    apply("lighting.shadowQuality", profile.shadowQuality, `${authored.preset} preset shadow budget`, "preset");
    apply("water.reflectionQuality", profile.reflectionQuality, `${authored.preset} preset reflection budget`, "preset");
    apply("water.clipmapDistance", Math.min(authored.water.clipmapDistance, profile.waterRange), `${authored.preset} preset water range cap`, "preset");
    apply("motion.particlePreset", profile.particlePreset, `${authored.preset} preset particle budget`, "preset");
  }

  apply("worldSizeMeters", 4096, "The adapted LAAS world-space resources currently use a fixed 4096 m span.", "runtime");
  const maxTexture = hardware.maxTextureDimension2D;
  if (typeof maxTexture === "number" && Number.isFinite(maxTexture)) {
    const capped = nearestPowerOfTwo(Math.max(512, Math.min(config.heightfieldResolution, maxTexture)));
    apply("heightfieldResolution", capped, "WebGPU maxTextureDimension2D clamp", "hardware");
  }
  const maxStorage = hardware.maxStorageBufferBindingSize;
  if (typeof maxStorage === "number" && maxStorage < 134_217_728 && config.motion.particlePreset === "ultra") {
    apply("motion.particlePreset", "high", "WebGPU storage-buffer budget clamp", "hardware");
  }

  return {
    config,
    hardwareClamps: overrides.filter((item) => item.source === "hardware"),
    overrides,
    presetOverrides: overrides.filter((item) => item.source === "preset"),
  };
}

export function diffProceduralWorldConfig(before: unknown, after: unknown): string[] {
  const left = normalizeProceduralWorldConfig(before);
  const right = normalizeProceduralWorldConfig(after);
  const paths: string[] = [];
  collectDiff(left, right, "", paths);
  return paths.filter((path) => path !== "version").sort();
}

export function classifyProceduralWorldConfigChange(
  before: unknown,
  after: unknown,
  hardware: ProceduralWorldHardwareLimits = {},
): ProceduralWorldConfigChange {
  const left = resolveProceduralWorldPreset(before, hardware).config;
  const right = resolveProceduralWorldPreset(after, hardware).config;
  const changedFields = diffProceduralWorldConfig(left, right).filter((path) => path !== "preset");
  const fieldActions: Record<string, ProceduralWorldChangeAction> = {};
  const systems = new Set<ProceduralWorldSystem>();
  for (const path of changedFields) {
    const classified = classifyPath(path);
    fieldActions[path] = classified.action;
    classified.systems.forEach((system) => systems.add(system));
  }
  const actions = unique(changedFields.map((path) => fieldActions[path] ?? "none"));
  const action = actions.reduce<ProceduralWorldChangeAction>(
    (current, candidate) => ACTION_RANK[candidate] > ACTION_RANK[current] ? candidate : current,
    "none",
  );
  return {
    action,
    actions: actions.length > 0 ? actions : ["none"],
    affectedSystems: [...systems],
    changedFields,
    fieldActions,
  };
}

const ACTION_RANK: Record<ProceduralWorldChangeAction, number> = {
  "none": 0,
  "uniform-update": 1,
  "material-rebuild": 2,
  "vegetation-regeneration": 3,
  "hydrology-regeneration": 4,
  "atmosphere-resource-rebuild": 5,
  "post-stack-rebuild": 6,
  "terrain-regeneration": 7,
  "complete-world-regeneration": 8,
};

function classifyPath(path: string): { action: ProceduralWorldChangeAction; systems: ProceduralWorldSystem[] } {
  if (path === "enabled" || path === "generator" || path === "seed" || path === "worldSizeMeters") {
    return { action: "complete-world-regeneration", systems: ALL_SYSTEMS };
  }
  if (path === "heightfieldResolution" || path.startsWith("terrain.heightAmplitude") || path.startsWith("terrain.noiseScale") || path.startsWith("terrain.hydraulicErosion") || path.startsWith("terrain.thermalErosion")) {
    return { action: "terrain-regeneration", systems: ["terrain", "hydrology", "biomes", "vegetation", "water", "lighting"] };
  }
  if (path.startsWith("terrain.lakeBehavior") || path.startsWith("terrain.moisture") || path.startsWith("terrain.riverThreshold") || path.startsWith("terrain.snow")) {
    return { action: "hydrology-regeneration", systems: ["hydrology", "biomes", "vegetation", "water"] };
  }
  if (path === "terrain.farShell" || path === "terrain.terrainRange") {
    return { action: "material-rebuild", systems: ["terrain", "lighting"] };
  }
  if (path.startsWith("vegetation.")) {
    if (path === "vegetation.windResponse") return { action: "uniform-update", systems: ["vegetation", "motion"] };
    return { action: "vegetation-regeneration", systems: ["vegetation"] };
  }
  if (path === "timeOfDay" || path === "lighting.sunAzimuth" || path === "lighting.sunElevation") {
    return { action: "uniform-update", systems: ["lighting", "atmosphere", "clouds", "gi", "post"] };
  }
  if (path.startsWith("lighting.")) return { action: "material-rebuild", systems: ["lighting", "gi"] };
  if (path === "atmosphere.volumetrics") return { action: "atmosphere-resource-rebuild", systems: ["atmosphere", "clouds", "post"] };
  if (path.startsWith("atmosphere.")) return { action: "uniform-update", systems: ["atmosphere", "clouds"] };
  if (path === "water.foam") return { action: "uniform-update", systems: ["water"] };
  if (path.startsWith("water.")) return { action: "material-rebuild", systems: ["water"] };
  if (path === "motion.particlePreset" || path === "motion.particleTypes") return { action: "material-rebuild", systems: ["motion", "particles"] };
  if (path.startsWith("motion.")) return { action: "uniform-update", systems: ["motion", "clouds", "water", "particles", "vegetation", "exploration"] };
  if (path.startsWith("post.")) return { action: "post-stack-rebuild", systems: ["post"] };
  if (path.startsWith("exploration.") || path === "bookmarks") return { action: "uniform-update", systems: ["exploration"] };
  return { action: "complete-world-regeneration", systems: ALL_SYSTEMS };
}

const ALL_SYSTEMS: ProceduralWorldSystem[] = [
  "terrain", "hydrology", "biomes", "vegetation", "lighting", "gi", "atmosphere",
  "clouds", "water", "motion", "particles", "post", "exploration",
];

function normalizeBookmarks(value: unknown): ProceduralWorldBookmark[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((bookmark, index) => ({
      id: typeof bookmark.id === "string" && bookmark.id.length > 0 ? bookmark.id : `bookmark-${index + 1}`,
      name: typeof bookmark.name === "string" && bookmark.name.length > 0 ? bookmark.name : `Bookmark ${index + 1}`,
      pitch: clamp(numberOr(bookmark.pitch, 0), -Math.PI / 2, Math.PI / 2),
      timeOfDay: clamp(numberOr(bookmark.timeOfDay, 11), 0, 24),
      x: numberOr(bookmark.x, 0),
      y: numberOr(bookmark.y, 2),
      yaw: wrapRadians(numberOr(bookmark.yaw, 0)),
      z: numberOr(bookmark.z, 0),
    }));
}

function validateNumber(
  issues: ProceduralWorldConfigIssue[],
  path: string,
  value: unknown,
  min: number,
  max: number,
  integer = false,
): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    issues.push({ code: "invalid-number", message: `${path} must be a finite number.`, path, severity: "error" });
    return;
  }
  if (value < min || value > max) {
    issues.push({ code: "out-of-range", message: `${path} must be between ${min} and ${max}.`, path, severity: "error" });
  }
  if (integer && !Number.isInteger(value)) {
    issues.push({ code: "not-integer", message: `${path} must be an integer.`, path, severity: "error" });
  }
}

function collectDiff(left: unknown, right: unknown, prefix: string, output: string[]): void {
  if (sameValue(left, right)) return;
  if (Array.isArray(left) || Array.isArray(right) || !isRecord(left) || !isRecord(right)) {
    output.push(prefix);
    return;
  }
  const keys = unique([...Object.keys(left), ...Object.keys(right)]).sort();
  for (const key of keys) collectDiff(left[key], right[key], prefix ? `${prefix}.${key}` : key, output);
}

function getPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => isRecord(current) ? current[key] : undefined, value);
}

function setPath(value: ProceduralWorldConfig, path: string, next: unknown): void {
  const keys = path.split(".");
  let current = value as unknown as Record<string, unknown>;
  for (const key of keys.slice(0, -1)) current = current[key] as Record<string, unknown>;
  current[keys[keys.length - 1] as string] = next;
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordOr(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function nearestPowerOfTwo(value: number): number {
  return 2 ** Math.round(Math.log2(Math.max(1, value)));
}

function wrapRadians(value: number): number {
  const tau = Math.PI * 2;
  return ((value % tau) + tau) % tau;
}

function enumOr<const T extends readonly string[]>(value: unknown, values: T, fallback: T[number]): T[number] {
  return typeof value === "string" && (values as readonly string[]).includes(value) ? value as T[number] : fallback;
}

function arrayEnum<const T extends readonly string[]>(value: unknown, values: T): T[number][] {
  if (!Array.isArray(value)) return [];
  return unique(value.filter((item): item is T[number] => typeof item === "string" && (values as readonly string[]).includes(item)));
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyProceduralWorldConfigChange,
  createDefaultProceduralWorldConfig,
  createDefaultProceduralWorldNodeData,
  diffProceduralWorldConfig,
  makeTransform,
  migrateProceduralWorldConfig,
  normalizeProceduralWorldConfig,
  resolveProceduralWorldPreset,
  validateProceduralWorldConfig,
  type ProceduralWorldNode,
} from "../../../../../packages/shared/src/index";
import {
  createEditorCore,
  createSceneDocument,
  loadSceneDocumentSnapshot,
  updateProceduralWorldNodeCommand,
} from "../../../../../packages/editor-core/src/index";
import { buildRuntimeSceneFromSnapshot } from "../../../../../packages/runtime-build/src/snapshot-build";
import { WorldSeed } from "../../../../../packages/procedural-world/src/core/Seed";
import { adaptAtmosphereConfig } from "../../../../../packages/procedural-world/src/integration/config/AtmosphereConfigAdapter";
import { adaptLightingConfig } from "../../../../../packages/procedural-world/src/integration/config/LightingConfigAdapter";
import { adaptMotionConfig } from "../../../../../packages/procedural-world/src/integration/config/MotionConfigAdapter";
import { adaptTerrainConfig } from "../../../../../packages/procedural-world/src/integration/config/TerrainConfigAdapter";
import { adaptVegetationConfig } from "../../../../../packages/procedural-world/src/integration/config/VegetationConfigAdapter";
import { adaptWaterConfig } from "../../../../../packages/procedural-world/src/integration/config/WaterConfigAdapter";
import { ProceduralWorldConfigBinder } from "../../../../../packages/procedural-world/src/integration/config/ProceduralWorldConfigBinder";

test("migrates version 1 procedural config and removes the legacy schema field", () => {
  const legacy = { ...createDefaultProceduralWorldConfig(41729), version: undefined, schemaVersion: 1 };
  const migrated = migrateProceduralWorldConfig(legacy);
  assert.equal(migrated.version, 2);
  assert.equal("schemaVersion" in migrated, false);
  assert.equal(migrated.seed, 41729);
});

test("normalization clamps unsafe values while retaining deterministic seed", () => {
  const value = createDefaultProceduralWorldConfig(41729);
  value.atmosphere.cloudCoverage = 3;
  value.heightfieldResolution = 3000;
  value.motion.windStrength = -2;
  const normalized = normalizeProceduralWorldConfig(value);
  assert.equal(normalized.atmosphere.cloudCoverage, 1);
  assert.equal(normalized.heightfieldResolution, 4096);
  assert.equal(normalized.motion.windStrength, 0);
  assert.equal(normalized.seed, 41729);
});

test("validation reports invalid canonical numbers", () => {
  const value = createDefaultProceduralWorldConfig();
  value.timeOfDay = Number.NaN;
  const result = validateProceduralWorldConfig(value);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.path === "timeOfDay"));
});

test("preset resolution records authored and hardware overrides", () => {
  const value = createDefaultProceduralWorldConfig();
  value.preset = "low";
  value.heightfieldResolution = 8192;
  const result = resolveProceduralWorldPreset(value, { maxTextureDimension2D: 1024 });
  assert.equal(result.config.heightfieldResolution, 1024);
  assert.ok(result.presetOverrides.some((override) => override.path === "heightfieldResolution"));
  assert.ok(result.hardwareClamps.some((override) => override.path === "heightfieldResolution"));
});

test("diff and classifier distinguish live, post, vegetation, hydrology, and terrain work", () => {
  const base = createDefaultProceduralWorldConfig();
  const live = structuredClone(base); live.motion.windStrength = 1.5;
  const post = structuredClone(base); post.post.bloom = false;
  const vegetation = structuredClone(base); vegetation.vegetation.treeDensity = 0.6;
  const hydrology = structuredClone(base); hydrology.terrain.riverThreshold = 1.4;
  const terrain = structuredClone(base); terrain.terrain.heightAmplitude = 1.2;
  assert.deepEqual(diffProceduralWorldConfig(base, live), ["motion.windStrength"]);
  assert.equal(classifyProceduralWorldConfigChange(base, live).action, "uniform-update");
  assert.equal(classifyProceduralWorldConfigChange(base, post).action, "post-stack-rebuild");
  assert.equal(classifyProceduralWorldConfigChange(base, vegetation).action, "vegetation-regeneration");
  assert.equal(classifyProceduralWorldConfigChange(base, hydrology).action, "hydrology-regeneration");
  assert.equal(classifyProceduralWorldConfigChange(base, terrain).action, "terrain-regeneration");
});

test("terrain and hydrology adapters carry effective generation controls", () => {
  const value = createDefaultProceduralWorldConfig();
  value.terrain.heightAmplitude = 1.3;
  value.terrain.lakeBehavior = "connected";
  value.terrain.riverThreshold = 0.8;
  const terrain = adaptTerrainConfig(resolveProceduralWorldPreset(value).config);
  assert.equal(terrain.heightAmplitude, 1.3);
  assert.equal(terrain.lakeBehavior, "connected");
  assert.equal(terrain.riverThreshold, 0.8);
  assert.equal(terrain.simulationResolution, 2048);
});

test("vegetation adapter preserves species, densities, seed offset, LOD, and wind response", () => {
  const value = createDefaultProceduralWorldConfig();
  value.vegetation.enabledSpecies = ["beech", "pine"];
  value.vegetation.scatterSeedOffset = 91;
  value.vegetation.treeDensity = 0.7;
  const config = adaptVegetationConfig(resolveProceduralWorldPreset(value).config);
  assert.deepEqual(config.enabledSpecies, ["beech", "pine"]);
  assert.equal(config.scatterSeedOffset, 91);
  assert.equal(config.treeDensity, 0.7);
  assert.ok(config.impostorRange > 0);
});

test("lighting, atmosphere, water, and motion adapters resolve concrete runtime budgets", () => {
  const value = createDefaultProceduralWorldConfig();
  value.preset = "high";
  value.atmosphere.cloudSpeed = 1.5;
  value.motion.cloudSpeed = 0.5;
  const effective = resolveProceduralWorldPreset(value).config;
  assert.equal(adaptLightingConfig(effective).shadowMapResolution, 2048);
  assert.equal(adaptAtmosphereConfig(effective).cloudSpeed, 0.75);
  assert.equal(adaptWaterConfig(effective).reflectionQuality, "high");
  assert.equal(adaptMotionConfig(effective).particleCount, 65536);
});

test("binder applies live targets and reports no unsupported fields", async () => {
  const initial = createDefaultProceduralWorldConfig();
  const next = structuredClone(initial);
  next.motion.windStrength = 1.75;
  let observed = 0;
  const binder = new ProceduralWorldConfigBinder(initial);
  const result = await binder.applyLive(next, { motion(config) { observed = config.windStrength; } });
  assert.equal(observed, 1.75);
  assert.deepEqual(result.appliedFields, ["motion.windStrength"]);
  assert.deepEqual(result.unsupportedFields, []);
});

test("editor command update is undoable and redoable", () => {
  const scene = createSceneDocument();
  const node = worldNode();
  scene.addNode(node);
  const editor = createEditorCore(scene);
  const next = structuredClone(node.data);
  next.terrain.heightAmplitude = 1.4;
  editor.execute(updateProceduralWorldNodeCommand(node.id, node.data, next));
  assert.equal((editor.scene.getNode(node.id) as ProceduralWorldNode).data.terrain.heightAmplitude, 1.4);
  editor.undo();
  assert.equal((editor.scene.getNode(node.id) as ProceduralWorldNode).data.terrain.heightAmplitude, 1);
  editor.redo();
  assert.equal((editor.scene.getNode(node.id) as ProceduralWorldNode).data.terrain.heightAmplitude, 1.4);
});

test("scene save/load migrates procedural config and preserves effective values", () => {
  const scene = createSceneDocument();
  const node = worldNode();
  node.data.vegetation.treeDensity = 0.63;
  scene.addNode(node);
  const snapshot = createEditorCore(scene).exportSnapshot();
  const loaded = createSceneDocument();
  loadSceneDocumentSnapshot(loaded, snapshot);
  const restored = loaded.getNode(node.id) as ProceduralWorldNode;
  assert.equal(restored.data.version, 2);
  assert.equal(restored.data.vegetation.treeDensity, 0.63);
});

test("runtime export contains normalized procedural config", async () => {
  const scene = createSceneDocument();
  const node = worldNode();
  node.data.timeOfDay = 18.5;
  scene.addNode(node);
  const runtime = await buildRuntimeSceneFromSnapshot(createEditorCore(scene).exportSnapshot());
  const exported = runtime.nodes.find((candidate) => candidate.kind === "procedural-world");
  assert.ok(exported && exported.kind === "procedural-world");
  assert.equal(exported.data.version, 2);
  assert.equal(exported.data.timeOfDay, 18.5);
});

test("seed streams and normalized authored config are deterministic", () => {
  const first = new WorldSeed(41729);
  const second = new WorldSeed(41729);
  assert.equal(first.sub("hydrology"), second.sub("hydrology"));
  assert.equal(first.sub("scatter/trees"), second.sub("scatter/trees"));
  assert.deepEqual(normalizeProceduralWorldConfig(createDefaultProceduralWorldConfig(41729)), normalizeProceduralWorldConfig(createDefaultProceduralWorldConfig(41729)));
});

test("freeze and unfreeze are classified as live motion updates", () => {
  const frozen = createDefaultProceduralWorldConfig();
  const running = structuredClone(frozen);
  frozen.motion.freezeSimulation = true;
  assert.equal(classifyProceduralWorldConfigChange(running, frozen).fieldActions["motion.freezeSimulation"], "uniform-update");
});

function worldNode(): ProceduralWorldNode {
  return {
    data: createDefaultProceduralWorldNodeData(41729),
    id: "node:procedural-world:test",
    kind: "procedural-world",
    name: "Test World",
    transform: makeTransform(),
  };
}

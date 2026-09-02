export { WorldRadianceCache, quantizePosition, hashCellKey } from './spatialHash'
export {
  encodeRadiance,
  decodeRadiance,
  evaluateIrradiance,
  convolveIrradiance,
} from './sphericalHarmonics'
export { interleavedUpdateSet, cellCenter, cascadeOrigin } from './cascades'
export { resolveGather, makeScreenCache } from './gatherFallback'
export { IrradianceVolumeField } from './irradianceVolume'
export { VoxelGrid, voxelizeBoxWalls } from './voxelGrid'
export { SousaPipeline, denoiseGatherSH } from './pipeline'
export { renderCpuFrame, regionMean, pixelAt } from './cpuRender'
export {
  createSimpleRoom,
  createSponzaAtrium,
  createForestStand,
  warmPipeline,
  SCENE_BUILDERS,
  type GiScene,
  type SceneName,
} from './scenes'

// GPU-resident id-Tech-style GI. The exports above are the CPU reference model
// the pipeline was derived from; these are what runs in a frame.
export { SousaGI, type SousaGIOptions, type GiStats } from './gpu/SousaGI'
export {
  voxelizeScene,
  createVoxelVolume,
  finaliseVoxels,
  splatSample,
  splatSlab,
  splatTaperedCylinder,
  splatCanopyShell,
  splatTriangle,
  type VoxelScene,
  type VoxelAccumulator,
  type VoxelizeOptions,
} from './gpu/voxelScene'
export {
  applyGiMaterials,
  injectIrradiance,
  createIrradianceInjector,
  GiPhysicalNodeMaterial,
} from './gpu/giMaterial'
export { createProbeField, DEFAULT_PROBES, type ProbeConfig } from './gpu/probeField'
export { createPointLightField, type GiPointLight } from './gpu/pointLights'
export { createDebugMaterial, DEBUG_VIEWS, type DebugView } from './gpu/debugViews'
export type { Node as GiNode } from './gpu/nodes'

import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

type CompressionRenderer = Parameters<KTX2Loader["detectSupport"]>[0];

export type ConfigureGLTFLoaderOptions = {
  /**
   * Base path for static assets (Vite: `import.meta.env.BASE_URL`).
   * Defaults to `/` so Draco resolves to `/draco/` and KTX2 resolves to `/basis/`.
   */
  publicBaseUrl?: string;
  /**
   * Active renderer used by KTX2Loader to pick the best GPU texture format.
   * Omit this in non-rendering contexts where KTX2 textures are not expected.
   */
  renderer?: CompressionRenderer;
  /**
   * KTX2 transcoding is worker-backed. Keep the default small so viewport loads
   * do not steal too much main-scene interactivity on heavy projects.
   */
  ktx2WorkerLimit?: number;
};

type SharedLoaderRecord = {
  ktx2Loader?: KTX2Loader;
  loader: GLTFLoader;
};

const sharedLoaders = new Map<string, SharedLoaderRecord>();

export function resolveDracoDecoderPath(publicBaseUrl = "/"): string {
  const base = publicBaseUrl.endsWith("/") ? publicBaseUrl : `${publicBaseUrl}/`;
  return `${base}draco/`;
}

export function resolveKtx2TranscoderPath(publicBaseUrl = "/"): string {
  const base = publicBaseUrl.endsWith("/") ? publicBaseUrl : `${publicBaseUrl}/`;
  return `${base}basis/`;
}

function createConfiguredKTX2Loader(options: ConfigureGLTFLoaderOptions): KTX2Loader | undefined {
  if (!options.renderer) {
    return undefined;
  }

  return new KTX2Loader()
    .setTranscoderPath(resolveKtx2TranscoderPath(options.publicBaseUrl ?? "/"))
    .setWorkerLimit(options.ktx2WorkerLimit ?? 2)
    .detectSupport(options.renderer);
}

function attachKTX2Loader(record: SharedLoaderRecord, options: ConfigureGLTFLoaderOptions) {
  if (!options.renderer) {
    return;
  }

  if (!record.ktx2Loader) {
    record.ktx2Loader = createConfiguredKTX2Loader(options);
  } else {
    record.ktx2Loader.detectSupport(options.renderer);
  }

  if (record.ktx2Loader) {
    record.loader.setKTX2Loader(record.ktx2Loader);
  }
}

/**
 * GLTFLoader with Draco mesh compression, Meshopt vertex compression, and KTX2
 * GPU texture compression support when a renderer is provided.
 * (same stack as the orchestrator game launcher).
 */
export function createConfiguredGLTFLoader(options: ConfigureGLTFLoaderOptions = {}): GLTFLoader {
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(resolveDracoDecoderPath(options.publicBaseUrl ?? "/"));
  const loader = new GLTFLoader();
  const record: SharedLoaderRecord = { loader };
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.setDRACOLoader(dracoLoader);
  attachKTX2Loader(record, options);
  return loader;
}

/**
 * One configured loader per `publicBaseUrl` so Draco WASM is not re-initialized per load.
 */
export function getSharedGLTFLoader(options: ConfigureGLTFLoaderOptions = {}): GLTFLoader {
  const key = options.publicBaseUrl ?? "/";
  let record = sharedLoaders.get(key);
  if (!record) {
    record = {
      loader: createConfiguredGLTFLoader({ publicBaseUrl: key })
    };
    sharedLoaders.set(key, record);
  }

  attachKTX2Loader(record, options);
  return record.loader;
}

import {
  InstancedBufferGeometry,
  InstancedBufferAttribute,
  BufferAttribute,
  Mesh,
  ShaderMaterial,
  AdditiveBlending,
  NormalBlending,
  Color,
  Vector3,
  Sphere,
  DynamicDrawUsage,
  DoubleSide
} from 'three';
import { noiseGLSL } from '../shaders/lib/noise.glsl';
import { commonGLSL } from '../shaders/lib/common.glsl';
import { sharedUniforms } from '../core/FrameUniforms';
import { LAYER } from '../core/Layers';

/** Fragment silhouettes. Everything is procedural — no sprite textures. */
export const ParticleShape = Object.freeze({
  SOFT: 0, // round, feathered — embers, droplets, dust
  SMOKE: 1, // fbm-eroded puff
  STREAK: 2, // velocity aligned spark
  LEAF: 3, // tapered leaf silhouette
  CHIP: 4, // angular rock fragment
  RING: 5 // thin expanding ring — shockwaves
});

const FLOATS = {
  start: 3,
  origin: 3,
  velocity: 3,
  color: 3,
  spawn: 1,
  life: 1,
  size: 1,
  seed: 1,
  spin: 1
};

type FloatKey = keyof typeof FLOATS;

export type ParticleSystemOptions = {
  name: string;
  /** Max simultaneous particles. */
  capacity?: number;
  shape?: number;
  /** Additive vs normal blending. */
  additive?: boolean;
  /** Curl-noise turbulence. */
  curl?: boolean;
  /** Velocity-aligned stretching. */
  stretch?: boolean;
  /** Orbit around a travelling anchor. */
  swirl?: boolean;
  /** Cheap directional shading, for debris and leaves. */
  lit?: boolean;
  softFade?: number;
};

/**
 * One emission burst.
 *
 * Read, never retained -- callers are expected to reuse one scratch object per
 * emitter to keep the frame allocation-free.
 */
export type ParticleEmitParams = {
  /** Emission point. */
  position: Vector3;
  /** Random offset radius around it. */
  radius?: number;
  /** Base velocity direction, normalised. */
  direction?: Vector3 | null;
  speed?: number;
  /** 0..1 randomisation of speed. */
  speedVariance?: number;
  /** 0..1 cone widening; 1 is a full sphere. */
  spread?: number;
  /** Velocity added to every particle. */
  inherit?: Vector3 | null;
  /** Swirl anchor. Defaults to `position`. */
  anchor?: Vector3 | null;
  size?: number;
  sizeVariance?: number;
  /** Lifetime in seconds. */
  life?: number;
  lifeVariance?: number;
  /** Radians per second. */
  spin?: number;
  /** Per-particle colour multiplier. */
  tint?: Color | null;
  /** Current simulation time. Required -- particles are aged against it. */
  time?: number;
};

const _tmpVec = new Vector3();

/**
 * A pooled, GPU-simulated particle system.
 *
 * Every particle's motion (velocity, gravity, drag, turbulence, swirl), its
 * size curve, colour gradient and alpha fade are evaluated in the vertex/
 * fragment shader from a handful of per-instance attributes. The CPU only ever
 * *writes spawn data*; nothing is simulated per frame on the main thread and no
 * memory is allocated after construction.
 *
 * Particles live in a ring buffer: emitting past the capacity recycles the
 * oldest slots, which is exactly the pooling behaviour we want for a sandbox
 * where the user can spam abilities.
 */
export class ParticleSystem {
  /**
   * @param {object} options
   * @param {string} options.name
   * @param {number} options.capacity              max simultaneous particles
   * @param {number} options.shape                 ParticleShape.*
   * @param {boolean} [options.additive]           additive vs normal blending
   * @param {boolean} [options.curl]               enable curl-noise turbulence
   * @param {boolean} [options.stretch]            velocity-aligned stretching
   * @param {boolean} [options.swirl]              orbit around a travelling anchor
   * @param {boolean} [options.lit]                cheap directional shading (debris/leaves)
   */
  readonly name: string;
  readonly capacity: number;
  cursor: number;

  readonly data: Record<FloatKey, Float32Array>;
  readonly attributes: Record<FloatKey, InstancedBufferAttribute>;
  readonly geometry: InstancedBufferGeometry;
  readonly material: ShaderMaterial;
  readonly mesh: Mesh;

  /** Slots written this frame, as [start, count] pairs, for partial upload. */
  private readonly dirtyRanges: Array<[number, number]> = [];
  private dirty = false;

  constructor({
    name,
    capacity = 2000,
    shape = ParticleShape.SOFT,
    additive = true,
    curl = false,
    stretch = false,
    swirl = false,
    lit = false,
    softFade = 0.6
  }: ParticleSystemOptions) {
    this.name = name;
    this.capacity = capacity;
    this.cursor = 0;

    /* ---------------- geometry ---------------- */
    const geometry = new InstancedBufferGeometry();
    geometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3)
    );
    geometry.setAttribute(
      'uv',
      new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2)
    );
    geometry.setIndex(new BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1));

    const data = {} as Record<FloatKey, Float32Array>;
    const attributes = {} as Record<FloatKey, InstancedBufferAttribute>;
    for (const [key, itemSize] of Object.entries(FLOATS) as Array<[FloatKey, number]>) {
      const array = new Float32Array(capacity * itemSize);
      const attribute = new InstancedBufferAttribute(array, itemSize).setUsage(DynamicDrawUsage);
      data[key] = array;
      attributes[key] = attribute;
      geometry.setAttribute(`a${key[0].toUpperCase()}${key.slice(1)}`, attribute);
    }
    this.data = data;
    this.attributes = attributes;
    // Everything starts dead (spawn time far in the past, zero life).
    this.data.life.fill(0);
    geometry.instanceCount = capacity;
    geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
    this.geometry = geometry;

    /* ---------------- material ---------------- */
    const defines: Record<string, string | number> = { SHAPE: shape };
    if (curl) defines.USE_CURL = '';
    if (stretch) defines.USE_STRETCH = '';
    if (swirl) defines.USE_SWIRL = '';
    if (lit) defines.USE_LIT = '';

    this.material = new ShaderMaterial({
      defines,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: additive ? AdditiveBlending : NormalBlending,
      side: DoubleSide,
      toneMapped: false,
      uniforms: sharedUniforms({
        uGravity: { value: new Vector3(0, -4.5, 0) },
        uDrag: { value: 0.9 },
        uTurbulence: { value: 0.6 },
        uTurbFrequency: { value: 0.45 },
        uTurbSpeed: { value: 0.35 },
        uSwirl: { value: 0 },
        uSwirlExpand: { value: 0.4 },
        uSpeedScale: { value: 1 },
        uSizeScale: { value: 1 },
        uLifeScale: { value: 1 },
        uEndSize: { value: 0.4 },
        uSizeIn: { value: 0.08 },
        uFadeIn: { value: 0.08 },
        uFadeOut: { value: 0.55 },
        uOpacity: { value: 1 },
        uGlow: { value: 1 },
        uStretch: { value: 0.15 },
        uSoftFade: { value: softFade },
        uColor0: { value: new Color(1, 1, 1) },
        uColor1: { value: new Color(1, 0.7, 0.3) },
        uColor2: { value: new Color(0.6, 0.15, 0.05) },
        uColor3: { value: new Color(0.08, 0.06, 0.06) },
        uLightDir: { value: new Vector3(0.4, 0.8, 0.35).normalize() },
        uSoftness: { value: 1 }
      }),
      vertexShader: PARTICLE_VERTEX,
      fragmentShader: PARTICLE_FRAGMENT
    });

    this.mesh = new Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.layers.set(LAYER.VFX);
    this.mesh.renderOrder = additive ? 12 : 10;
    this.mesh.name = `Particles:${name}`;

  }

  get object3D(): Mesh {
    return this.mesh;
  }

  get uniforms(): ShaderMaterial["uniforms"] {
    return this.material.uniforms;
  }

  /**
   * Spawn `count` particles.
   *
   * `params` is read, never retained — callers are expected to reuse one scratch
   * object per emitter to keep the frame allocation-free.
   *
   * @param {number} count
   * @param {object} p
   * @param {Vector3} p.position           emission point
   * @param {number}  [p.radius]           random offset radius around it
   * @param {Vector3} [p.direction]        base velocity direction (normalised)
   * @param {number}  [p.speed]            base speed along `direction`
   * @param {number}  [p.speedVariance]    0..1 randomisation of speed
   * @param {number}  [p.spread]           0..1 cone widening (1 = sphere)
   * @param {Vector3} [p.inherit]          velocity added to every particle
   * @param {Vector3} [p.anchor]           swirl anchor (defaults to `position`)
   * @param {number}  [p.size]             base size
   * @param {number}  [p.sizeVariance]
   * @param {number}  [p.life]             lifetime in seconds
   * @param {number}  [p.lifeVariance]
   * @param {number}  [p.spin]             radians/second
   * @param {Color}   [p.tint]             per-particle multiplier
   * @param {number}  [p.time]             current simulation time (required)
   */
  emit(count: number, p: ParticleEmitParams): void {
    if (count <= 0) return;
    count = Math.min(count, this.capacity);

    const {
      position,
      radius = 0,
      direction = null,
      speed = 1,
      speedVariance = 0.35,
      spread = 0.5,
      inherit = null,
      anchor = null,
      size = 0.2,
      sizeVariance = 0.4,
      life = 1,
      lifeVariance = 0.3,
      spin = 0,
      tint = null,
      time = 0
    } = p;

    const d = this.data;

    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.capacity;
      this.markDirty(i);

      const i3 = i * 3;

      // --- position -------------------------------------------------
      let ox = 0;
      let oy = 0;
      let oz = 0;
      if (radius > 0) {
        // Uniform-ish point in a ball.
        const u = Math.random();
        const r = radius * Math.cbrt(u);
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const s = Math.sin(phi);
        ox = r * s * Math.cos(theta);
        oy = r * Math.cos(phi);
        oz = r * s * Math.sin(theta);
      }
      d.start[i3 + 0] = position.x + ox;
      d.start[i3 + 1] = position.y + oy;
      d.start[i3 + 2] = position.z + oz;

      const a = anchor ?? position;
      d.origin[i3 + 0] = a.x;
      d.origin[i3 + 1] = a.y;
      d.origin[i3 + 2] = a.z;

      // --- velocity -------------------------------------------------
      if (direction) {
        _tmpVec.copy(direction);
      } else {
        _tmpVec.set(0, 1, 0);
      }
      if (spread > 0) {
        _tmpVec.x += (Math.random() - 0.5) * 2 * spread;
        _tmpVec.y += (Math.random() - 0.5) * 2 * spread;
        _tmpVec.z += (Math.random() - 0.5) * 2 * spread;
      }
      _tmpVec.normalize().multiplyScalar(speed * (1 + (Math.random() - 0.5) * 2 * speedVariance));
      if (inherit) _tmpVec.add(inherit);

      d.velocity[i3 + 0] = _tmpVec.x;
      d.velocity[i3 + 1] = _tmpVec.y;
      d.velocity[i3 + 2] = _tmpVec.z;

      // --- scalars --------------------------------------------------
      d.spawn[i] = time;
      d.life[i] = Math.max(0.05, life * (1 + (Math.random() - 0.5) * 2 * lifeVariance));
      d.size[i] = Math.max(0.001, size * (1 + (Math.random() - 0.5) * 2 * sizeVariance));
      d.seed[i] = Math.random();
      d.spin[i] = (Math.random() - 0.5) * 2 * spin;

      // --- tint -----------------------------------------------------
      if (tint) {
        d.color[i3 + 0] = tint.r;
        d.color[i3 + 1] = tint.g;
        d.color[i3 + 2] = tint.b;
      } else {
        d.color[i3 + 0] = 1;
        d.color[i3 + 1] = 1;
        d.color[i3 + 2] = 1;
      }
    }

  }

  /**
   * Exact number of particles still alive.
   *
   * Only used for the HUD readout, so it is called on the stats interval rather
   * than every frame — the simulation itself never needs this.
   */
  countLive(time: number): number {
    const { spawn, life } = this.data;
    const lifeScale = this.uniforms.uLifeScale.value;
    let live = 0;
    for (let i = 0; i < this.capacity; i++) {
      const age = time - spawn[i];
      if (age >= 0 && age <= life[i] * lifeScale) live++;
    }
    return live;
  }

  private markDirty(index: number): void {
    this.dirty = true;
    const ranges = this.dirtyRanges;
    // Emissions are contiguous, so merging into the last range is almost always
    // a single comparison.
    const last = ranges[ranges.length - 1];
    if (last && index === last[0] + last[1]) {
      last[1]++;
    } else {
      ranges.push([index, 1]);
    }
  }

  /** Upload only the slots that changed this frame. */
  flush(): void {
    if (!this.dirty) return;
    for (const [key, itemSize] of Object.entries(FLOATS) as Array<[FloatKey, number]>) {
      const attribute = this.attributes[key];
      attribute.needsUpdate = true;
      attribute.clearUpdateRanges?.();
      for (const [start, count] of this.dirtyRanges) {
        attribute.addUpdateRange?.(start * itemSize, count * itemSize);
      }
    }
    this.dirtyRanges.length = 0;
    this.dirty = false;
  }

  /** Sets the 4-stop lifetime gradient. `c3` defaults to `c2`. */
  setGradient(c0: Color, c1: Color, c2: Color, c3?: Color): void {
    const u = this.uniforms;
    u.uColor0.value.copy(c0);
    u.uColor1.value.copy(c1);
    u.uColor2.value.copy(c2);
    u.uColor3.value.copy(c3 ?? c2);
  }

  reset(): void {
    this.data.life.fill(0);
    this.data.spawn.fill(-1e4);
    for (const key of Object.keys(FLOATS) as FloatKey[]) this.attributes[key].needsUpdate = true;
    this.dirtyRanges.length = 0;
    this.dirty = false;
    this.cursor = 0;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Shaders                                                                 */
/* ---------------------------------------------------------------------- */

const PARTICLE_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform vec3  uGravity;
  uniform float uDrag;
  uniform float uTurbulence;
  uniform float uTurbFrequency;
  uniform float uTurbSpeed;
  uniform float uSwirl;
  uniform float uSwirlExpand;
  uniform float uSpeedScale;
  uniform float uSizeScale;
  uniform float uLifeScale;
  uniform float uEndSize;
  uniform float uSizeIn;
  uniform float uStretch;

  attribute vec3  aStart;
  attribute vec3  aOrigin;
  attribute vec3  aVelocity;
  attribute vec3  aColor;
  attribute float aSpawn;
  attribute float aLife;
  attribute float aSize;
  attribute float aSeed;
  attribute float aSpin;

  varying vec2  vUv;
  varying float vT;
  varying float vSeed;
  varying vec3  vTint;
  varying float vViewZ;
  varying vec3  vNormalish;

  ${noiseGLSL}

  void main() {
    vUv = uv;
    vSeed = aSeed;
    vTint = aColor;

    float life = aLife * uLifeScale;
    float age = uTime - aSpawn;
    float t = age / max(life, 1e-4);
    vT = t;

    // Dead particles are pushed outside the clip volume; the GPU discards the
    // whole triangle before rasterisation.
    if (age < 0.0 || t > 1.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }

    vec3 vel = aVelocity * uSpeedScale;

    // Analytic exponential drag — exact, and independent of frame rate.
    float k = max(uDrag, 1e-3);
    float travel = (1.0 - exp(-k * age)) / k;
    vec3 pos = aStart + vel * travel + 0.5 * uGravity * age * age;

    #ifdef USE_SWIRL
      // Orbit a travelling anchor: the anchor drifts with the emitter velocity
      // while the particle's offset rotates and expands around it.
      vec3 anchor = aOrigin + vel * travel;
      vec3 rel = aStart - aOrigin;
      float ang = uSwirl * age + aSeed * 6.2831;
      float c = cos(ang), s = sin(ang);
      vec3 rotated = vec3(rel.x * c - rel.z * s, rel.y, rel.x * s + rel.z * c);
      rotated *= 1.0 + uSwirlExpand * t;
      pos = anchor + rotated + vec3(0.0, 0.5 * uGravity.y * age * age, 0.0);
    #endif

    // Turbulence: a cheap deterministic wobble, optionally upgraded to real
    // curl noise for the heavier smoke/flame systems.
    #ifdef USE_CURL
      pos += curlNoise(aStart * uTurbFrequency + vec3(0.0, uTime * uTurbSpeed, 0.0) + aSeed * 4.0)
             * uTurbulence * age;
    #else
      vec3 wobble = vec3(
        sin(age * 3.1 + aSeed * 41.0),
        cos(age * 2.3 + aSeed * 17.0),
        sin(age * 2.7 + aSeed * 73.0)
      );
      pos += wobble * uTurbulence * age * 0.55;
    #endif

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    vViewZ = mvPosition.z;

    // Size over lifetime.
    float grow = smoothstep(0.0, max(uSizeIn, 1e-3), t);
    float size = aSize * uSizeScale * mix(1.0, uEndSize, t) * grow;

    vec2 corner = position.xy * size;

    #ifdef USE_STRETCH
      vec3 velView = (modelViewMatrix * vec4(vel, 0.0)).xyz;
      vec2 dir = normalize(velView.xy + vec2(1e-5));
      vec2 perp = vec2(-dir.y, dir.x);
      float stretch = 1.0 + uStretch * length(vel);
      corner = dir * (position.y * size * stretch) + perp * (position.x * size);
      vNormalish = vec3(dir, 0.0);
    #else
      float rot = aSpin * age + aSeed * 6.2831;
      corner = rot2(rot) * corner;
      vNormalish = normalize(vec3(position.xy, 0.75));
    #endif

    mvPosition.xy += corner;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const PARTICLE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  uniform float uGlow;
  uniform float uFadeIn;
  uniform float uFadeOut;
  uniform float uSoftFade;
  uniform float uSoftness;
  uniform vec3  uColor0;
  uniform vec3  uColor1;
  uniform vec3  uColor2;
  uniform vec3  uColor3;
  uniform vec3  uLightDir;
  uniform vec2  uResolution;
  uniform sampler2D uSceneDepth;
  uniform float uCameraNear;
  uniform float uCameraFar;
  uniform float uGlobalGlow;

  varying vec2  vUv;
  varying float vT;
  varying float vSeed;
  varying vec3  vTint;
  varying float vViewZ;
  varying vec3  vNormalish;

  ${noiseGLSL}
  ${commonGLSL}

  float shapeMask(vec2 uv) {
    vec2 c = (uv - 0.5) * 2.0;
    float d = length(c);

    #if SHAPE == 0                       // SOFT
      return smoothstep(1.0, 0.0, d);

    #elif SHAPE == 1                     // SMOKE
      float n = fbm3(vec3(c * 1.6, vSeed * 21.0 + uTime * 0.25));
      return smoothstep(1.0, 0.05, d + n * 0.42) * 0.9;

    #elif SHAPE == 2                     // STREAK
      float core = smoothstep(1.0, 0.0, abs(c.x) * 3.4);
      float len = smoothstep(1.0, 0.0, abs(c.y));
      return core * len;

    #elif SHAPE == 3                     // LEAF
      float w = max(0.0, 1.0 - c.y * c.y);
      float body = smoothstep(w * 0.62, w * 0.30, abs(c.x));
      float vein = smoothstep(0.06, 0.0, abs(c.x)) * 0.35;
      return clamp(body - vein * 0.4, 0.0, 1.0);

    #elif SHAPE == 4                     // CHIP
      float ang = atan(c.y, c.x);
      float r = 0.62 + 0.24 * sin(ang * 5.0 + vSeed * 30.0) + 0.1 * sin(ang * 9.0 - vSeed * 11.0);
      return smoothstep(r, r - 0.14, d);

    #else                                // RING
      return smoothstep(0.14, 0.0, abs(d - 0.82));
    #endif
  }

  void main() {
    if (vT < 0.0 || vT > 1.0) discard;

    float mask = shapeMask(vUv);
    if (mask <= 0.004) discard;

    // Alpha over lifetime.
    float fade = smoothstep(0.0, max(uFadeIn, 1e-3), vT) *
                 (1.0 - smoothstep(clamp(uFadeOut, 0.0, 0.999), 1.0, vT));

    float alpha = mask * fade * uOpacity;

    // Soft particles: fade out where the quad intersects opaque geometry.
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    alpha *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, uSoftFade);
    if (alpha < 0.004) discard;

    vec3 color = gradient4(uColor0, uColor1, uColor2, uColor3, vT) * vTint;

    #ifdef USE_LIT
      // Cheap wrapped diffuse so opaque debris does not read as flat silhouettes.
      float ndl = dot(normalize(vNormalish), uLightDir) * 0.5 + 0.5;
      color *= mix(0.45, 1.25, ndl);
    #endif

    color *= uGlow * uGlobalGlow;

    // Non-premultiplied: three's Additive/Normal blend modes both multiply by
    // the source alpha themselves.
    gl_FragColor = vec4(color, alpha);
  }
`;

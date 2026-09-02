/** Small maths helpers shared across systems. All allocation-free. */

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const saturate = (v: number): number => clamp(v, 0, 1);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number): number => (b - a === 0 ? 0 : (v - a) / (b - a));
export const remap = (v: number, a: number, b: number, c: number, d: number): number =>
  lerp(c, d, saturate(invLerp(a, b, v)));

export const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = saturate((x - e0) / (e1 - e0 || 1e-6));
  return t * t * (3 - 2 * t);
};

/** Frame-rate independent exponential damping. `rate` = fraction remaining after 1s. */
export const damp = (current: number, target: number, rate: number, dt: number): number =>
  lerp(target, current, Math.pow(rate, dt));

export const randRange = (a: number, b: number): number => a + Math.random() * (b - a);
export const randSign = (): number => (Math.random() < 0.5 ? -1 : 1);

/** Deterministic hash into [0,1). Useful for stable per-instance randomness. */
export function hash11(n: number): number {
  const s = Math.sin(n * 127.1) * 43758.5453123;
  return s - Math.floor(s);
}

/* ------------------------------ easing ------------------------------ */

export type EasingFn = (t: number) => number;

export const Easing: Record<string, EasingFn> = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => t * (2 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  inCubic: (t: number) => t * t * t,
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outQuint: (t: number) => 1 - Math.pow(1 - t, 5),
  outExpo: (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outElastic: (t: number) => {
    if (t === 0 || t === 1) return t;
    const c4 = (2 * Math.PI) / 3;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
  /** Fast rise, slow decay -- the classic VFX "pop" curve. */
  pop: (t: number) => Math.sin(Math.min(1, t) * Math.PI) ** 0.6
};

/** 0 to 1 to 0 envelope with configurable attack. */
export function envelope(t: number, attack = 0.15): number {
  if (t <= 0 || t >= 1) return 0;
  return t < attack
    ? Easing.outCubic(t / attack)
    : Easing.inOutCubic(1 - (t - attack) / (1 - attack));
}

// W0 SPIKE (throwaway, dev-only): pure helpers for the World measuring test. Nothing here is used by the game.
// Seeded, chunked scenery placement, the size/option parsing, and the production guard. No three.js, no clock.

export const SIZES = [240, 480, 720] as const;
export type Opts = { size: number; chunk: number; fogFar: number; stream: boolean; horizon: boolean; bench: boolean; budget: number; seed: number };

// ?worldtest=480&chunk=64&fog=220&stream=1&horizon=1&bench=1&budget=2 . Ignored (null) in production.
export function parseWorldTest(search: string, isProduction: boolean): Opts | null {
  if (isProduction) return null;
  const q = new URLSearchParams(search);
  const size = Number(q.get("worldtest") ?? "");
  if (!Number.isFinite(size) || size < 60 || size > 2000) return null;
  const num = (k: string, d: number, lo: number, hi: number) => { const v = Number(q.get(k) ?? ""); return Number.isFinite(v) && q.has(k) ? Math.min(hi, Math.max(lo, v)) : d; };
  return {
    size, chunk: num("chunk", 64, 16, 256), fogFar: num("fog", 220, 60, 600), stream: q.get("stream") !== "0",
    horizon: q.get("horizon") === "1", bench: q.get("bench") === "1", budget: Math.round(num("budget", 2, 1, 64)), seed: Math.round(num("seed", 7, 0, 99999)),
  };
}

export function mulberry32(a: number): () => number {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hash = (cx: number, cz: number, seed: number) => (Math.imul(cx + 4096, 73856093) ^ Math.imul(cz + 4096, 19349663) ^ Math.imul(seed + 1, 83492791)) | 0;

export type Item = { x: number; z: number; s: number; r: number };
export type Contents = { trees: Item[]; rocks: Item[]; hedges: Item[]; landmarks: Item[] };
// Per-square-metre densities. Landmarks are rare tall things you can see through fog.
export const DENSITY = { tree: 1 / 60, rock: 1 / 150, hedge: 1 / 400, landmark: 1 / 14400 };
export const CLEAR_RADIUS = 14; // an empty spawn area at the centre

export const chunksPerSide = (size: number, chunk: number) => Math.ceil(size / chunk);
// The same chunk always gives the same scenery, whatever order or how often it is built.
export function chunkContents(ix: number, iz: number, o: Pick<Opts, "size" | "chunk" | "seed">): Contents {
  const rnd = mulberry32(hash(ix, iz, o.seed));
  const n = chunksPerSide(o.size, o.chunk), half = o.size / 2;
  const x0 = -half + ix * o.chunk, z0 = -half + iz * o.chunk;
  const w = Math.min(o.chunk, half - x0), d = Math.min(o.chunk, half - z0);
  const out: Contents = { trees: [], rocks: [], hedges: [], landmarks: [] };
  if (ix < 0 || iz < 0 || ix >= n || iz >= n || w <= 0 || d <= 0) return out;
  const area = w * d;
  const count = (p: number) => { const e = area * p; return Math.floor(e) + (rnd() < e - Math.floor(e) ? 1 : 0); };
  const put = (list: Item[], c: number, sMin: number, sMax: number) => {
    for (let i = 0; i < c; i++) {
      const x = x0 + rnd() * w, z = z0 + rnd() * d, s = sMin + rnd() * (sMax - sMin), r = rnd() * Math.PI * 2;
      if (Math.hypot(x, z) < CLEAR_RADIUS) continue;
      list.push({ x, z, s, r });
    }
  };
  put(out.trees, count(DENSITY.tree), 0.8, 1.5);
  put(out.rocks, count(DENSITY.rock), 0.6, 1.6);
  put(out.hedges, count(DENSITY.hedge), 0.9, 1.4);
  put(out.landmarks, count(DENSITY.landmark), 1, 1.6);
  return out;
}
export const instanceCount = (c: Contents) => c.trees.length * 2 + c.rocks.length + c.hedges.length + c.landmarks.length * 3;

// Which chunk indexes are within `radius` metres of a point (the streaming window), nearest first.
export function chunksAround(x: number, z: number, radius: number, o: Pick<Opts, "size" | "chunk">): [number, number][] {
  const n = chunksPerSide(o.size, o.chunk), half = o.size / 2, out: { k: [number, number]; d: number }[] = [];
  const lo = (v: number) => Math.max(0, Math.floor((v - radius + half) / o.chunk)), hi = (v: number) => Math.min(n - 1, Math.floor((v + radius + half) / o.chunk));
  for (let ix = lo(x); ix <= hi(x); ix++) for (let iz = lo(z); iz <= hi(z); iz++) {
    const cx = -half + (ix + 0.5) * o.chunk, cz = -half + (iz + 0.5) * o.chunk, d = Math.hypot(cx - x, cz - z);
    if (d <= radius + o.chunk * 0.7071) out.push({ k: [ix, iz], d });
  }
  return out.sort((a, b) => a.d - b.d).map((e) => e.k);
}

export const percentile = (xs: number[], p: number): number => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

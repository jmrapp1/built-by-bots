// E6: ground patterns as ground colour only. Pure: no three.js, clock or storage; nothing is saved, nothing collides, nothing is placed.
// Meadow field patches first: a quilt of irregular fields (the cells of a jittered grid), each mixing a little of one tint into the ground colour.
// Used by worldShell.ts while it paints the ground vertex colours, only when features.enabled is on; off = today's colours byte for byte.
import raw from "@/data/groundPatterns.json";
import { HOME_FLAT } from "@/lib/ground";
import { regionWeights } from "@/lib/regionFog";
import type { RegionId } from "@/lib/worldMap";

export const PATTERNS = raw.groundPatterns;
export type PatternData = typeof PATTERNS;

const fin = (v: number) => (Number.isFinite(v) ? v : 0);
const clamp01 = (v: number) => (v > 0 ? (v < 1 ? v : 1) : 0);
const soft = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a || 1e-9)); return t * t * (3 - 2 * t); };
const hash = (i: number, j: number, s: number, k: number) => { let h = (Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(s + k * 977, 2147483647)) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/** The field a point belongs to: the nearest jittered grid site (3x3 cells searched). Returns the site's grid cell, so the tint is a pure function of it. */
export function fieldAt(x: number, z: number, d: PatternData = PATTERNS): { i: number; j: number } {
  const c = d.cell, ci = Math.floor(x / c), cj = Math.floor(z / c);
  let best = Infinity, bi = ci, bj = cj;
  for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
    const sx = (i + 0.5 + (hash(i, j, d.seed, 1) - 0.5) * 2 * d.jitter) * c, sz = (j + 0.5 + (hash(i, j, d.seed, 2) - 0.5) * 2 * d.jitter) * c, q = (x - sx) ** 2 + (z - sz) ** 2;
    if (q < best) { best = q; bi = i; bj = j; }
  }
  return { i: bi, j: bj };
}
/** Which tint (index into d.tints) the field at x, z wears. */
export function fieldTint(x: number, z: number, d: PatternData = PATTERNS): number { const f = fieldAt(x, z, d); return Math.min(d.tints.length - 1, Math.floor(hash(f.i, f.j, d.seed, 3) * d.tints.length)); }
/** 0 at and inside the Home square, easing to 1 `homeEase` metres out, so the quilt never meets the garden floor. */
export const patchEase = (x: number, z: number, d: PatternData = PATTERNS): number => soft(0, d.homeEase, Math.max(Math.abs(x), Math.abs(z)) - HOME_FLAT);
/** Pattern strength 0..1 at x, z: the regions' table blended with the same weights as the ground colour, times the Home ease. Finite always. */
export function patternStrength(x: number, z: number, d: PatternData = PATTERNS): number {
  const w = regionWeights(x, z); let s = 0;
  for (const r of Object.keys(w) as RegionId[]) s += w[r] * (d.regions[r] ?? 0);
  return clamp01(fin(s)) * patchEase(x, z, d);
}
/** How much of the field's tint (index, amount 0..1) goes into the ground colour at x, z. */
export const patchMix = (x: number, z: number, d: PatternData = PATTERNS): { tint: number; amount: number } => ({ tint: fieldTint(x, z, d), amount: clamp01(fin(d.strength)) * patternStrength(x, z, d) });

// ---- Paper Downs fold creases: the second pattern kind. Same rules: pure, finite, ground colour only.
export const CREASES = raw.creases;
export type CreaseData = typeof CREASES;
/** Fold crease at x, z: how much (amount 0..1) of the shade or ridge colour to mix in. Lines run along `angle`; every line is a valley or a ridge from its own hash. */
export function creaseMix(x: number, z: number, d: CreaseData = CREASES, pd: PatternData = PATTERNS): { ridge: boolean; amount: number } {
  const str = clamp01(fin(d.strength)); if (!(str > 0) || !Number.isFinite(x) || !Number.isFinite(z)) return { ridge: false, amount: 0 };
  const w = regionWeights(x, z); let rs = 0;
  for (const r of Object.keys(w) as RegionId[]) rs += w[r] * (d.regions[r] ?? 0);
  rs = clamp01(fin(rs)) * patchEase(x, z, pd); if (rs <= 0) return { ridge: false, amount: 0 };
  const a = (d.angle * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
  const u = x * ca + z * sa + Math.sin(((-x * sa + z * ca) / d.wobbleLength) * Math.PI * 2) * d.wobble, k0 = Math.floor(u / d.spacing);
  let best = Infinity, bk = k0;
  for (let k = k0 - 1; k <= k0 + 1; k++) { const dist = Math.abs(u - (k + 0.5 + (hash(k, 0, d.seed, 1) - 0.5) * 2 * d.jitter) * d.spacing); if (dist < best) { best = dist; bk = k; } }
  const line = 1 - soft(0, d.width, best);
  return { ridge: hash(bk, 0, d.seed, 2) < 0.5, amount: str * rs * line };
}

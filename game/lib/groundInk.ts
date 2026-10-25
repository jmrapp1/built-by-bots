// Ink on the land: the settings, the on/off rule, and a plain-TS reference of the per-pixel maths (the shader in worldShell.ts does the same
// sums on the GPU; the tests pin this version). Pure: no three.js, clock or storage. Nothing is saved.
// Fog note: the marks fade between fade.near and fade.far metres from the camera. With the region fog on, its shortest far is 70 m (Inkwood), so
// there fog hides the land before the marks have fully faded; that is fine (fog is applied to the final colour). Retune both together.
import raw from "@/data/groundInk.json";
import { HOME_FLAT } from "@/lib/ground";
import { regionWeights } from "@/lib/regionFog";
import type { RegionId } from "@/lib/worldMap";

export const INK = raw.groundInk;
export type InkData = typeof INK;

/** Anything but a plain true is off; never throws. */
export const groundInkFlag = (d: unknown): boolean => { try { return (d as { groundInk?: { enabled?: unknown } })?.groundInk?.enabled === true; } catch { return false; } };
/** Is the ink on? The data file decides; in dev builds ?groundink=1 or ?groundink=0 overrides it (inert in production). */
export function groundInkOn(search: string, production: boolean, data: unknown = raw): boolean {
  if (!production) {
    try {
      const v = new URLSearchParams(search).get("groundink");
      if (v === "1") return true;
      if (v === "0") return false;
    } catch { /* fall through to the file */ }
  }
  return groundInkFlag(data);
}

const clamp01 = (v: number) => (v > 0 ? (v < 1 ? v : 1) : 0); // NaN becomes 0
const soft = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a || 1e-9)); return t * t * (3 - 2 * t); };
const fin = (v: number) => (Number.isFinite(v) ? v : 0);
const fract = (v: number) => v - Math.floor(v);

/** Ink strength at x, z: the regions' multipliers blended with the same weights as the ground colour. */
export function regionInk(x: number, z: number, d: InkData = INK): number {
  const w = regionWeights(x, z); let s = 0;
  for (const r of Object.keys(w) as RegionId[]) s += w[r] * d.regions[r];
  return fin(s);
}
/** 1 well outside Home, easing to 0 at the edge of the Home square (so the grain has no seam against the garden floor). */
export const homeEase = (x: number, z: number, d: InkData = INK): number => soft(0, d.homeEase, Math.max(Math.abs(x), Math.abs(z)) - HOME_FLAT);
/** 1 near, 0 at and past `far`; smooth. */
export const distFade = (dist: number, d: InkData = INK): number => 1 - soft(d.fade.near, d.fade.far, fin(dist));

/** Contour line weight 0..1 at world height h. `px` = contour periods per screen pixel (fwidth of h / step); a line is about `width` pixels wide. Zero below minHeight. */
export function contour(h: number, px: number, d: InkData = INK): number {
  if (!(h > d.contour.minHeight)) return 0;
  const phase = h / d.contour.step, dist = Math.abs(fract(phase) - 0.5), pw = Math.max(px, 1e-6); // dist 0.5 at a line centre
  const line = soft(0.5 - pw * d.contour.width, 0.5, dist);
  return clamp01(line * (1 - soft(0.25, 0.5, pw))); // a period under ~4 px turns to mush: fade it out, gone at 2 px
}
/** Steepness 0..1 from the up part of the surface normal: the slope is rise over run (tan of the angle), 0 on the flat, 1 at fullSteep and beyond. The land is capped at slope 0.2, so these are slopes, not 1 - cos. */
export const steepness = (up: number, d: InkData = INK): number => { const u = clamp01(fin(up)), s = Math.sqrt(Math.max(0, 1 - u * u)) / Math.max(u, 1e-3); return soft(d.hatch.minSteep, d.hatch.fullSteep, s); };
/** 1 when a slope faces directly away from the light, 0 facing it. (nx, nz) is the horizontal part of the normal. */
export function shadedSide(nx: number, nz: number, d: InkData = INK): number {
  const l = Math.hypot(d.light[0], d.light[1]) || 1, h = Math.hypot(nx, nz);
  if (!(h > 1e-9)) return 0;
  return clamp01(-((nx * d.light[0] + nz * d.light[1]) / (l * h)));
}
/** Hatch stroke weight 0..1 at world x, z. `px` = stroke periods per screen pixel. Zero on flat ground and on the lit side. */
export function hatch(x: number, z: number, up: number, nx: number, nz: number, px: number, d: InkData = INK): number {
  const steep = steepness(up, d), side = shadedSide(nx, nz, d);
  if (steep <= 0 || side <= 0) return 0;
  const a = (d.hatch.angleDeg * Math.PI) / 180, phase = (x * Math.cos(a) + z * Math.sin(a)) / d.hatch.spacing, dist = Math.abs(fract(phase) - 0.5) * 2; // 1 at a stroke centre... 0 at the gap
  const pw = Math.max(px, 1e-6), stroke = soft(1 - d.hatch.width - pw, 1 - d.hatch.width + 0.05, dist);
  return clamp01(stroke * (1 - soft(0.25, 0.5, pw)) * steep * side);
}
const hash2 = (x: number, y: number) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
function vnoise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), e = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + e) * ux * uy;
}
/** Brightness change (fraction, within +-(grain+wash)) from the paper grain and the slow wash at x, z. Eases to 0 into Home; the grain also fades with distance. */
export function paper(x: number, z: number, dist: number, d: InkData = INK): number {
  const g = (hash2(Math.floor(x / d.grain.cell), Math.floor(z / d.grain.cell)) - 0.5) * 2 * d.grain.amount * (1 - soft(d.grain.far * 0.6, d.grain.far, dist));
  const w = (vnoise(x / d.wash.cell, z / d.wash.cell) - 0.5) * 2 * d.wash.amount;
  return fin((g + w) * homeEase(x, z, d));
}
/** Broad shade as a brightness fraction: darker downhill on the shaded side, a little lighter on crests, a little deeper in hollows. */
export function shade(h: number, up: number, nx: number, nz: number, d: InkData = INK): number {
  const hr = clamp01(h / d.shade.heightRef);
  return fin(-d.shade.downhill * steepness(up, d) * shadedSide(nx, nz, d) + d.shade.crest * hr - d.shade.hollow * (1 - hr) * clamp01(h / 0.5));
}
/** The line marks together as a 0..1 ink amount at one pixel (contours or hatch, whichever is stronger), faded by distance and scaled by the region. */
export function inkAmount(p: { x: number; z: number; h: number; up: number; nx: number; nz: number; dist: number; pxH: number; pxX: number }, d: InkData = INK): number {
  const c = contour(p.h, p.pxH, d) * d.contour.strength, k = hatch(p.x, p.z, p.up, p.nx, p.nz, p.pxX, d) * d.hatch.strength;
  return clamp01(fin(Math.max(c, k) * distFade(p.dist, d) * regionInk(p.x, p.z, d)));
}

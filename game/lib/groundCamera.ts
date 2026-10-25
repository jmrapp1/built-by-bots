// H3: the follow camera on rises. Pure (no three.js, clock or storage). Used only when the ground flag is on; flag off never calls this.
import { SUN_SHADOW } from "@/lib/sunShadow";
import { GARDEN } from "@/lib/world";
import { cameraHeights } from "@/lib/follow";

type Ground = (x: number, z: number) => number;
export type CamSpot = { x: number; y: number; z: number; dist: number; look: number };

/**
 * Pull-in: the camera sits `dist` behind (x, z) along the flat unit direction `dir`. If the land at that spot rises above the camera, shorten
 * the distance (never under `minDist`) until it clears ground + minHeight; if even then it would be under, lift it. So y >= groundY there, always.
 * `pivot` is the (smoothed) ground height under the player used for the look-at height.
 */
export function cameraOnGround(x: number, z: number, dir: { x: number; z: number }, pitch: number, dist: number, pivot: number, gy: Ground, minDist: number = GARDEN.camera.minDistance): CamSpot {
  const c = GARDEN.camera, cp = Math.cos(pitch);
  const at = (d: number) => { const h = cameraHeights(pivot, pitch, d), px = x + dir.x * d * cp, pz = z + dir.z * d * cp; return { h, px, pz, floor: gy(px, pz) + c.minHeight }; };
  let d = dist, s = at(d);
  while (s.h.cam < s.floor && d > minDist) { d = Math.max(minDist, d - 0.25); s = at(d); }
  const lift = Math.max(0, s.floor - s.h.cam);
  return { x: s.px, y: s.h.cam + lift, z: s.pz, dist: d, look: s.h.look + lift };
}

/** The smoothed camera must also stay above the land at its own spot (a lerp can dip under a crest). */
export const keepAbove = (x: number, y: number, z: number, gy: Ground): number => Math.max(y, gy(x, z) + GARDEN.camera.minHeight);

/** Ease the pivot ground height toward the real one: quick enough to follow, slow enough that a jog over a crest does not flick the view. */
export const smoothPivot = (cur: number, target: number, dt: number, rate = 5): number => cur + (target - cur) * (1 - Math.exp(-rate * Math.max(0, dt)));

/** Shadow lift: a little extra normal bias where the land tilts, so shadows do not stripe or float on a rise. 0 on flat ground. Capped. */
export function shadowLift(gy: Ground, x: number, z: number): number {
  const e = 0.5, s = Math.hypot(gy(x + e, z) - gy(x - e, z), gy(x, z + e) - gy(x, z - e)) / (2 * e);
  return Math.min(SUN_SHADOW.liftCap, s * 0.2 * (SUN_SHADOW.liftCap / 0.05));
}

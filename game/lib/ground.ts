// H1: ground height in the larger World, as one pure function of x and z. No three.js, clock or storage; nothing is saved (saves hold x/z only).
// height = (sum of cosine rises) x scale x mask, and the mask is a smoothstep of the distance to the nearest flat zone, so one function owns "flat here".
import raw from "@/data/ground.json";
import map from "@/data/map.json";
import worldRaw from "@/data/world.json";
import { GARDEN } from "@/lib/world";
import { HALF, WORLD, distToPath } from "@/lib/worldMap";

export const GROUND = raw.ground;
type Rise = { x: number; z: number; r: number; h: number };

/** Anything but a plain true is off; never throws. */
export const groundFlag = (d: unknown): boolean => { try { return (d as { ground?: { enabled?: unknown } })?.ground?.enabled === true; } catch { return false; } };
export const GROUND_ENABLED: boolean = groundFlag(raw);
/** Is ground height on? The data file decides; in dev builds ?ground=1 or ?ground=0 overrides it (inert in production). */
export function groundOn(search: string, production: boolean, data: unknown = raw): boolean {
  if (!production) {
    try {
      const v = new URLSearchParams(search).get("ground");
      if (v === "1") return true;
      if (v === "0") return false;
    } catch { /* fall through to the file */ }
  }
  return groundFlag(data);
}

const soft = (t: number) => { const u = Math.min(1, Math.max(0, t)); return u * u * (3 - 2 * u); };
// Flat zones (exactly 0 inside). Each returns the distance in metres from that zone (<= 0 inside it).
export const HOME_FLAT = GARDEN.size / 2 + worldRaw.gardenKeepOut; /* from the data, not WORLD: worldMap -> clusters -> ground is a load-order cycle */ // Home, the gate and the garden door all lie inside this square
const SIGN_FLAT = 3, GATE_FLAT = 14; // metres round the gate (its approach on both sides)
/** Metres outside the nearest flat zone; 0 or less means flat. */
export function flatDistance(x: number, z: number): number {
  let d = Math.max(Math.abs(x), Math.abs(z)) - HOME_FLAT;
  d = Math.min(d, distToPath(x, z) - WORLD.path.keepOut);
  for (const p of GARDEN.places) if (p.kind === "gate") d = Math.min(d, Math.hypot(p.x - x, p.z - z) - GATE_FLAT);
  for (const l of WORLD.landmarks) d = Math.min(d, Math.hypot(l.x - x, l.z - z) - (l.r + 5));
  for (const p of map.signposts) d = Math.min(d, Math.hypot(p.x - x, p.z - z) - SIGN_FLAT);
  return d;
}

/** The ground's own "land rises here" mask: 0 in every flat zone and at the World edge, easing to 1. The ink uses the same rule for "flat here". */
export const flatMask = (x: number, z: number, feather: number = GROUND.feather, edgeF: number = GROUND.edgeFeather): number => soft(flatDistance(x, z) / feather) * soft((HALF - Math.max(Math.abs(x), Math.abs(z))) / edgeF);

export type GroundOpts = { scale?: number; rises?: Rise[]; feather?: number; edgeFeather?: number };
/** Ground height in metres at x, z. Finite, never negative, 0 in every flat zone and at the World edge. Pure. */
export function groundY(x: number, z: number, o: GroundOpts = {}): number {
  const scale = o.scale ?? GROUND.scale, rises = o.rises ?? GROUND.rises, feather = o.feather ?? GROUND.feather, edgeF = o.edgeFeather ?? GROUND.edgeFeather;
  if (!(scale > 0) || !Number.isFinite(x) || !Number.isFinite(z)) return 0;
  const edge = HALF - Math.max(Math.abs(x), Math.abs(z));
  if (edge <= 0) return 0;
  const m = soft(flatDistance(x, z) / feather) * soft(edge / edgeF);
  if (m <= 0) return 0;
  let h = 0;
  for (const r of rises) { const d = Math.hypot(x - r.x, z - r.z); if (d < r.r) h += r.h * 0.5 * (1 + Math.cos((Math.PI * d) / r.r)); }
  return h * scale * m;
}

/** H4: how far a Print stands above y 0 at x, z. Exactly 0 with the switch off. Reach checks never use it (x/z only). */
export const groundLift = (on: boolean, x: number, z: number, g: (x: number, z: number) => number = groundY): number => (on ? g(x, z) : 0);

/** A text height map for checking by eye: one character per `step` metres, blank = flat, digits = 0.1 m of height at that scale. */
export function asciiMap(step = 8, o: GroundOpts = {}, x0 = -HALF, x1 = HALF, z0 = -HALF, z1 = HALF): string {
  const rows: string[] = [];
  for (let z = z0; z <= z1; z += step) {
    let row = "";
    for (let x = x0; x <= x1; x += step) { const y = groundY(x, z, o); row += y < 0.005 ? " " : String(Math.min(9, Math.floor(y * 10))) ; }
    rows.push(row);
  }
  return rows.join("\n");
}

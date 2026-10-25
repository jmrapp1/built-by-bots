// S23: glyph scraps. Loose flat bits of paper, each with one ink glyph, lying in the Garden. Scenery only:
// not food, not collectable, no collision, nothing saved or sent. No three.js, no clock and no randomness here;
// positions are fixed in data/scraps.json so a screenshot repeats. These are a look only and have nothing to do
// with the Margins finds.
import raw from "@/data/scraps.json";
import { GARDEN, colliders, insideAny, type Vec } from "@/lib/world";
import { doorFrame } from "@/lib/home";
import forage from "@/data/forage.json";

export const GLYPH_BITS = raw;
export const GLYPH_IDS = raw.glyphs as readonly string[];
export type GlyphMode = "near" | "many" | "off";
export type GlyphBit = { x: number; z: number; glyph: number; yaw: number; phase: number; y?: number }; // y: ground height under it (World rises); 0 when absent

// Dev-only preview: ?scraps=near|many|off. Ignored (null) in production builds. Nothing is saved.
export const scrapOverride = (search: string, isProduction: boolean): GlyphMode | null => {
  if (isProduction) return null;
  const v = new URLSearchParams(search).get("scraps");
  return v === "near" || v === "many" || v === "off" ? v : null;
};

const cols = colliders();
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.z - b.z);

// True when a scrap may lie here: inside the garden, off trees, hedges, props, the pond, the gate, the Home door,
// the forage spots, and the nest and egg spot.
export function clearOfZones(p: Vec, c = raw.clear): boolean {
  const half = GARDEN.size / 2 - c.edge;
  if (Math.abs(p.x) > half || Math.abs(p.z) > half) return false;
  if (insideAny(p, c.solid, cols)) return false;
  for (const pl of GARDEN.places) {
    const r = pl.kind === "gate" ? c.gate : pl.kind === "pond" ? (pl.solid ?? 3) + c.solid : (pl.solid ?? 0.6) + c.place;
    if (dist(p, pl) < r) return false;
  }
  if (dist(p, doorFrame("garden").g) < c.door) return false;
  for (const f of forage.spots) if (dist(p, f) < c.forage) return false;
  return true;
}

const toBit = (q: { x: number; z: number; glyph: number }, i: number): GlyphBit => ({
  x: q.x, z: q.z, glyph: q.glyph,
  yaw: ((i * 2.399963) % (Math.PI * 2)), // a fixed spread of angles from the index, no random
  phase: ((i * 0.618034) % 1) * Math.PI * 2,
});

// The fixed scraps for a mode. null (no preview) and "many" use the whole list; "off" none; "near" a ring in front of the start.
export function scrapsFor(mode: GlyphMode | null): { bits: GlyphBit[]; scale: number } {
  if (mode === "off") return { bits: [], scale: 1 };
  if (mode === "near") {
    const [sx, sz] = GARDEN.player.start;
    // at yaw 0 the camera looks along -z; "right" is +x
    const bits = raw.near.map((n, i) => toBit({ x: sx + n.right, z: sz - n.ahead, glyph: n.glyph }, i));
    return { bits, scale: 1 };
  }
  return { bits: raw.points.map(toBit), scale: mode === "many" ? raw.manyScale : 1 };
}

// Slow lift and settle (height above the ground) and a light tilt; reduced motion lies flat and still.
export function liftAt(t: number, phase: number, reduced: boolean): number {
  if (reduced) return raw.motion.rest;
  return raw.motion.rest + raw.motion.lift * (0.5 + 0.5 * Math.sin((t / raw.motion.period) * Math.PI * 2 + phase));
}
export function tiltAt(t: number, phase: number, reduced: boolean): { x: number; z: number } {
  if (reduced) return { x: 0, z: 0 };
  const w = (t / raw.motion.period) * Math.PI * 2 + phase;
  return { x: raw.motion.tilt * Math.sin(w + 1.3), z: raw.motion.tilt * Math.sin(w * 0.7) };
}

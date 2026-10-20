// Keepsakes worn on the Print (slice 6d-1). Pure rules: the data, where each one sits on each species, the
// put-on motion and the dev-only preview switch. No three.js, clock or server here. See lib/cosmeticsBuild.ts
// for the shapes. Nothing is saved or sent in this slice.
import data from "@/data/cosmetics.json";
import { SPECIES } from "@/lib/species";

export type Shape = "round" | "tall" | "wide";
export type Anchor = { x: number; y: number; z: number; rotY: number; scale: number; spread?: number; flat?: number };
export type Cosmetic = { id: string; name: string };
export const COSMETIC_DATA = data;
export const COSMETICS = data.cosmetics as Cosmetic[];
export const COSMETIC_IDS = COSMETICS.map((c) => c.id);
export const ANCHOR_NAMES = ["headTop", "headCrown", "headSide", "face", "neck", "hang"] as const;
export const isCosmetic = (id: unknown): id is string => typeof id === "string" && COSMETIC_IDS.includes(id);

const AXES: Record<Shape, [number, number, number]> = { round: [1, 1, 1], tall: [0.85, 1.3, 0.85], wide: [1.25, 0.85, 1.1] }; // the same stretch lib/creature.ts gives each shape
const smooth = (n: number) => { const t = Math.min(1, Math.max(0, n)); return t * t * (3 - 2 * t); };
const easeOut = (n: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, n)), 3);
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

// Where a keepsake sits on this species and shape, or null when it is unknown (then nothing is shown, never a crash).
export function placementFor(id: string | null | undefined, species: string | null | undefined, shape: string | null | undefined):
  { pos: [number, number, number]; rotY: number; scale: number; spread: number; flat: number } | null {
  if (!isCosmetic(id)) return null;
  const place = (data.placement as Record<string, { anchor: string; scale: number }>)[id];
  const block = (data.anchors as Record<string, Record<string, Anchor>>)[species ?? "blotling"] ?? (data.anchors as Record<string, Record<string, Anchor>>).blotling;
  const a = place && block ? block[place.anchor] : undefined;
  if (!a) return null;
  const s: Shape = shape === "tall" || shape === "wide" ? shape : "round";
  const ax = AXES[s], ss = (data.shapeScale as Record<string, number>)[s] ?? 1;
  return { pos: [a.x * ax[0], a.y * ax[1], a.z * ax[2]], rotY: a.rotY, scale: a.scale * place.scale * ss, spread: a.spread ?? 1, flat: a.flat ?? 1 };
}

// The newest found keepsake is the one worn (one slot). Rows are what the server will give later: { id, found_at }.
export function newestWorn(owned: { id: string; found_at: string }[]): string | null {
  let best: { id: string; t: number } | null = null;
  for (const o of owned) {
    const t = Date.parse(o.found_at);
    if (!isCosmetic(o.id) || !Number.isFinite(t)) continue;
    if (!best || t >= best.t) best = { id: o.id, t };
  }
  return best?.id ?? null;
}

// --- The dev-only preview switch ---------------------------------------------------------------
// ?cosmetic=ribbon wears one; ?cosmetic=all cycles through all six. Ignored in production. Never touches the server.
export type Preview = { kind: "one"; id: string } | { kind: "all" } | null;
export function cosmeticOverride(search: string, isProduction: boolean): Preview {
  if (isProduction) return null;
  const v = new URLSearchParams(search).get("cosmetic");
  if (v === "all") return { kind: "all" };
  return isCosmetic(v) ? { kind: "one", id: v } : null;
}
// Which keepsake the cycle shows after `seconds` of preview.
export function cycleAt(seconds: number, every: number = data.preview.cycleSeconds): string {
  return COSMETIC_IDS[Math.floor(Math.max(0, seconds) / every) % COSMETIC_IDS.length];
}

// --- The put-on motion ------------------------------------------------------------------------------
// About 1.1 s: a hop (the old keepsake shrinks away), a settle (the new one scales on), then a squash with one
// small wobble. Everything is eased. Asleep: only the settle. Reduced motion: no hop or squash, only a fade.
export type PutOn = {
  hop: number;        // fraction of the Print's height, lifted off the ground
  bodyY: number;      // body squash in height (1 = none)
  bodyXZ: number;     // and in width (volume roughly kept)
  newScale: number;   // the new keepsake, 0 -> overshoot -> 1
  oldScale: number;   // the old keepsake leaving, 1 -> 0
  newFade: number;    // reduced motion: opacity of the new one
  oldFade: number;    // reduced motion: opacity of the old one
  done: boolean;
};
export function putOnSeconds(reduced = false, resting = false): number {
  const P = data.putOn;
  return reduced ? P.fadeSeconds : resting ? P.restingSettleSeconds : P.hopSeconds + P.settleSeconds + P.squashSeconds;
}
export function putOnFrame(t: number, reduced = false, resting = false): PutOn {
  const P = data.putOn, total = putOnSeconds(reduced, resting);
  const calm: PutOn = { hop: 0, bodyY: 1, bodyXZ: 1, newScale: 1, oldScale: 0, newFade: 1, oldFade: 0, done: t >= total };
  if (reduced) { const f = smooth(t / P.fadeSeconds); return { ...calm, newScale: 1, newFade: f, oldFade: 1 - f, oldScale: 1 - f > 0 ? 1 : 0 }; }
  if (resting) { const f = smooth(t / P.restingSettleSeconds); return { ...calm, newScale: f, oldScale: 1 - smooth(t / (P.restingSettleSeconds * 0.5)), newFade: 1, oldFade: 0 }; }
  const hopEnd = P.hopSeconds, settleEnd = hopEnd + P.settleSeconds;
  let hop = 0, newScale = 0, bodyY = 1, bodyXZ = 1;
  const oldScale = 1 - smooth(t / hopEnd);
  if (t < hopEnd) hop = easeOut(t / hopEnd) * P.hopHeight;
  else if (t < settleEnd) {
    const u = (t - hopEnd) / P.settleSeconds;
    hop = (1 - smooth(u)) * P.hopHeight; // ease in then out, back to the ground
    newScale = smooth(u) * P.overshoot;
  } else {
    const u = clamp01((t - settleEnd) / P.squashSeconds);
    newScale = P.overshoot + (1 - P.overshoot) * smooth(u);
    bodyY = 1 - P.squashY * (1 - u) * Math.exp(-2 * u) * Math.cos(2 * Math.PI * u); // lands squashed, springs back with one wobble
    bodyXZ = 1 + (P.squashXZ / P.squashY) * (1 - bodyY);
  }
  return { hop, bodyY, bodyXZ, newScale, oldScale, newFade: 1, oldFade: 0, done: t >= total };
}

// The lantern's glow: only in the dark, a slow gentle pulse, and steady when motion is reduced.
export function lanternGlow(night: number, t: number, reduced: boolean): number {
  const lit = data.glow.nightOnly ? clamp01(night) : 1;
  const pulse = reduced ? 0 : data.glow.pulse * Math.sin((t / data.glow.pulseSeconds) * Math.PI * 2);
  return lit * (0.55 + pulse);
}

// For the data test: the first problem in the data, or null.
export function cosmeticsProblem(): string | null {
  const ids = COSMETICS.map((c) => c.id);
  if (new Set(ids).size !== ids.length) return "duplicate keepsake id";
  const placement = data.placement as Record<string, { anchor: string; scale: number }>;
  for (const id of ids) {
    const p = placement[id];
    if (!p) return `no placement for ${id}`;
    if (!ANCHOR_NAMES.includes(p.anchor as (typeof ANCHOR_NAMES)[number])) return `${id} uses an unknown anchor ${p.anchor}`;
  }
  for (const k of Object.keys(placement)) if (!ids.includes(k)) return `placement for unknown keepsake ${k}`;
  for (const sp of SPECIES) {
    const block = (data.anchors as Record<string, Record<string, Anchor>>)[sp.id];
    if (!block) return `no anchors for ${sp.id}`;
    for (const id of ids) {
      const a = block[placement[id].anchor];
      if (!a) return `${sp.id} lacks anchor ${placement[id].anchor} needed by ${id}`;
      if (![a.x, a.y, a.z, a.rotY, a.scale].every(Number.isFinite) || a.scale <= 0) return `${sp.id} ${placement[id].anchor} has bad numbers`;
    }
  }
  for (const s of ["round", "tall", "wide"]) if (!((data.shapeScale as Record<string, number>)[s] > 0)) return `no shape scale for ${s}`;
  return null;
}

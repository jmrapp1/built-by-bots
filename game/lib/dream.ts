// S24: dream glyph. While the Print sleeps, one small ink glyph rises from it, fades, and the next follows.
// A look only: no sound, no text, not clickable, nothing saved or sent. No three.js, no clock and no randomness here;
// the order is fixed by index so a screenshot repeats. Every number is in data/dream.json.
import raw from "@/data/dream.json";
import { GLYPH_IDS } from "@/lib/scraps";

export const DREAM = raw;
export type DreamMode = "on" | "off";
export type Dream = { glyph: number; x: number; y: number; opacity: number };

// Dev-only preview: ?dream=1 holds one glyph at its fullest while the Print sleeps; ?dream=off sleeps with none.
// Ignored (null) in production builds. Nothing is saved.
export const dreamOverride = (search: string, isProduction: boolean): DreamMode | null => {
  if (isProduction) return null;
  const v = new URLSearchParams(search).get("dream");
  return v === "1" ? "on" : v === "off" ? "off" : null;
};

const NONE: Dream = { glyph: 0, x: 0, y: raw.startY, opacity: 0 };

// The glyph for time t (seconds). Opacity is 0 when not asleep and at both ends of each cycle. `hold` (the dev preview)
// shows one glyph at its fullest. Reduced motion: one still, soft glyph, no drift and no cycling.
export function dreamAt(t: number, asleep: boolean, reduced: boolean, hold = false): Dream {
  if (!asleep) return NONE;
  if (hold) return { glyph: raw.preview.glyph, x: raw.driftX / 2, y: raw.startY + raw.riseBy / 2, opacity: raw.maxOpacity };
  if (reduced) return { glyph: raw.reduced.glyph, x: 0, y: raw.reduced.y, opacity: raw.reduced.opacity };
  const cycle = raw.rise + raw.rest;
  const k = Math.max(0, Math.floor(t / cycle));
  const age = t - k * cycle;
  if (age >= raw.rise) return { ...NONE, glyph: raw.order[k % raw.order.length] };
  const u = age / raw.rise;
  return { glyph: raw.order[k % raw.order.length], x: raw.driftX * u, y: raw.startY + raw.riseBy * u, opacity: raw.maxOpacity * Math.sin(Math.PI * u) };
}

// A level that follows the sleep state over fadeSeconds, so waking fades the glyph and never pops it.
export function dreamLevel(cur: number, asleep: boolean, dt: number): number {
  const step = dt / raw.fadeSeconds;
  return asleep ? Math.min(1, cur + step) : Math.max(0, cur - step);
}

export const validGlyphs = (): boolean =>
  [...raw.order, raw.reduced.glyph, raw.preview.glyph].every((g) => Number.isInteger(g) && g >= 0 && g < GLYPH_IDS.length);

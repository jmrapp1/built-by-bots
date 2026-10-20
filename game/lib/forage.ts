// Pure helpers for gathering snacks. Layout and timings live in data/forage.json.
// Nothing here talks to the server, three.js or the clock; the page and world pass those in.
import forage from "@/data/forage.json";
import { colliders, GARDEN, HOME } from "@/lib/world";

export const FORAGE = forage;
export type Spot = (typeof forage.spots)[number];
export type Pouch = string[]; // food ids, one entry per item carried

// Adds one item, or returns null when the pouch is full (the item stays where it is).
export function pouchAdd(pouch: Pouch, kind: string, size: number = FORAGE.pouchSize): Pouch | null {
  return pouch.length >= size ? null : [...pouch, kind];
}
// Spends one item of this kind. An empty or wrong request changes nothing.
export function pouchSpend(pouch: Pouch, kind: string): Pouch {
  const i = pouch.indexOf(kind);
  return i < 0 ? pouch : [...pouch.slice(0, i), ...pouch.slice(i + 1)];
}
// The kinds actually carried, in the order of `order` (the foods list).
export function carried(pouch: Pouch, order: string[]): string[] {
  return order.filter((id) => pouch.includes(id));
}
// The food that would be offered: the wanted one if carried, else the first carried, else none.
export function inHand(pouch: Pouch, wanted: string, order: string[]): string | null {
  const c = carried(pouch, order);
  return c.includes(wanted) ? wanted : c[0] ?? null;
}

// A spot is ready at the start after its stagger, and again a while after it was taken.
export function spotReady(takenAt: number | null, now: number, readyAfter: number, respawn: number = FORAGE.respawnSeconds): boolean {
  return takenAt === null ? now >= readyAfter : now >= takenAt + respawn;
}
// Seconds since the spot became ready (used for the drop-in), or -1 when it is not ready.
export function sinceReady(takenAt: number | null, now: number, readyAfter: number, respawn: number = FORAGE.respawnSeconds): number {
  if (!spotReady(takenAt, now, readyAfter, respawn)) return -1;
  return now - (takenAt === null ? readyAfter : takenAt + respawn);
}
export function inReach(player: { x: number; z: number }, spot: { x: number; z: number }, reach: number = FORAGE.reach): boolean {
  return Math.hypot(player.x - spot.x, player.z - spot.z) <= reach;
}
// Height of a freshly appeared item: it falls in, then rests at 0.
export function dropOffset(since: number, reduced = false): number {
  if (reduced || since >= FORAGE.dropSeconds) return 0;
  const u = Math.max(0, since) / FORAGE.dropSeconds;
  return FORAGE.dropHeight * (1 - u * u);
}
// Soft shimmer: scale and opacity wobble gently. Calmer when reduced motion is on.
export function shimmer(t: number, phase: number, reduced = false): { scale: number; glow: number } {
  const w = Math.sin((t / FORAGE.shimmerSeconds) * Math.PI * 2 + phase);
  const c = reduced ? FORAGE.calmFactor : 1;
  return { scale: 1 + 0.06 * w * c, glow: 0.7 + 0.25 * w * c };
}
// Spots must sit inside the garden, clear of anything solid, and never overlap each other.
export function spotsAreClear(spots: Spot[] = FORAGE.spots, pad = 0.5): boolean {
  const { circles, boxes } = colliders();
  const lim = HOME.half - 1;
  return spots.every((s, i) =>
    Math.abs(s.x) <= lim && Math.abs(s.z) <= lim &&
    circles.every((c) => Math.hypot(s.x - c.x, s.z - c.z) > c.r + pad) &&
    boxes.every((b) => Math.abs(s.x - b.x) > b.w / 2 + pad || Math.abs(s.z - b.z) > b.d / 2 + pad) &&
    spots.every((o, j) => j === i || Math.hypot(s.x - o.x, s.z - o.z) > FORAGE.reach * 1.5));
}

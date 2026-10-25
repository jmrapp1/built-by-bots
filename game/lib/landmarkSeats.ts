// Landmark seats: one place to sit beside each landmark in the open World. Rest only: nothing is given, saved or sent.
// The sitting itself is the Garden bench's (lib/sit.ts); this file only says where the seats are and which one is in reach.
// Pure: no three.js, clock, storage or randomness. Numbers are in data/landmarkSeats.json.
import raw from "@/data/landmarkSeats.json";
import { WORLD, type Landmark } from "@/lib/worldMap";

export const LANDMARK_SEATS = raw;
export type Seat = { id: string; landmark: string; x: number; z: number; face: number };

/** Anything but a plain true is off; never throws. */
export const seatsFlag = (d: unknown): boolean => { try { return (d as { enabled?: unknown })?.enabled === true; } catch { return false; } };
/** Are the seats on? The data file decides; in dev builds ?seats=off turns them off. Inert in production. */
export function seatsOn(search: string, production: boolean, data: unknown = raw): boolean {
  if (!production) { try { if (new URLSearchParams(search).get("seats") === "off") return false; } catch { /* use the file */ } }
  return seatsFlag(data);
}

/** The seats, each facing its landmark. An entry whose landmark is unknown or whose numbers are bad is skipped; the rest stay. */
export function checkSeats(d: { seats?: unknown } = raw, landmarks: Landmark[] = WORLD.landmarks as Landmark[]): Seat[] {
  const out: Seat[] = [];
  try {
    if (!Array.isArray(d.seats)) return out;
    for (const s of d.seats as Record<string, unknown>[]) {
      const lm = landmarks.find((l) => l.id === s?.landmark);
      if (!lm || typeof s.x !== "number" || typeof s.z !== "number" || !Number.isFinite(s.x) || !Number.isFinite(s.z)) continue;
      if (out.some((o) => o.landmark === lm.id)) continue; // one seat per landmark
      out.push({ id: `seat-${lm.id}`, landmark: lm.id, x: s.x, z: s.z, face: Math.atan2(lm.x - s.x, lm.z - s.z) });
    }
  } catch { /* none */ }
  return out;
}
export const SEATS: Seat[] = checkSeats();

/** The nearest seat within reach of the player, or null. */
export function nearestSeat(p: { x: number; z: number }, seats: Seat[] = SEATS, reach: number = raw.reach): Seat | null {
  let best: Seat | null = null, bd = Infinity;
  for (const s of seats) { const d = Math.hypot(p.x - s.x, p.z - s.z); if (d <= reach && d < bd) { best = s; bd = d; } }
  return best;
}

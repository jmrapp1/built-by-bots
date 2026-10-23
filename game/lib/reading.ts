// S34: the Reading Room, as pure functions: the data checks, the door frames and walks, the walls and furniture as colliders,
// the dusk gate, the spot list and the look of a find. No three.js, clock or server here, so it is all unit-tested.
// Numbers live in data/reading.json. The server picks every find (world_unfold, region reading_room); the client only shows it.
import raw from "@/data/reading.json";
import { insideAny, type Box, type Circle, type Colliders, type Vec } from "@/lib/world";
import type { Outcome } from "@/lib/margins-server";

export const READING = raw;
export const isEnabled = (d: unknown): boolean => { try { return (d as { readingRoom?: { enabled?: unknown } })?.readingRoom?.enabled === true; } catch { return false; } }; // anything but a plain true is off; never throws
export const READING_ENABLED: boolean = isEnabled(raw); // the kill switch: false builds nothing
export const READING_REGION = raw.region; // must match game_spot_regions.reading_room (6 spots)
export const READING_OFF = raw.offset; // the room sits this far along x; positions inside are local
export type DoorSide = "margins" | "room";

const dot = (a: Vec, b: Vec) => a.x * b.x + a.z * b.z;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const ease = (n: number) => { const t = clamp01(n); return t * t * (3 - 2 * t); };
const WALK_IN: Vec = { x: raw.door.walkIn[0], z: raw.door.walkIn[1] }; // in the Margins: the way you walk through the door
const ROOM_IN: Vec = { x: 0, z: -1 }; // in the room: the way you walk after arriving (north, away from the door)

/** g is the middle of the opening and d the direction you walk through it. */
export function doorFrame(side: DoorSide): { g: Vec; d: Vec } {
  return side === "margins"
    ? { g: { x: raw.door.margins.x, z: raw.door.margins.z }, d: WALK_IN }
    : { g: { x: 0, z: raw.room.depth / 2 }, d: { x: -ROOM_IN.x, z: -ROOM_IN.z } };
}
export function inDoorZone(p: Vec, side: DoorSide): boolean {
  const { g, d } = doorFrame(side), rel = { x: p.x - g.x, z: p.z - g.z };
  const axial = dot(rel, d), lateral = Math.abs(rel.x * d.z - rel.z * d.x);
  return axial >= -raw.door.zoneBack && axial <= raw.door.zoneFront && lateral <= raw.door.zoneLateral;
}
export function doorPosts(side: DoorSide): Circle[] {
  const { g, d } = doorFrame(side), s = raw.door.postOffset;
  return [1, -1].map((k) => ({ x: g.x + -d.z * s * k, z: g.z + d.x * s * k, r: raw.door.postR }));
}
/** The picture signpost beside the Margins door (a pole with a small board). Local Margins coordinates. */
export function signPost(): Circle {
  const { g, d } = doorFrame("margins"), s = raw.door.postOffset + raw.door.signOffset[0], b = raw.door.signOffset[1];
  return { x: g.x + -d.z * s - d.x * b, z: g.z + d.x * s - d.z * b, r: 0.15 };
}
/** What the Margins must treat as solid for the door: the two posts and the sign pole. */
export const marginsDoorCircles = (): Circle[] => [...doorPosts("margins"), signPost()];
/** The walk through a door: a point on the near side if needed, then well beyond it. */
export function doorPath(p: Vec, side: DoorSide): Vec[] {
  const { g, d } = doorFrame(side), D = raw.door;
  const A = { x: g.x - d.x * D.approach, z: g.z - d.z * D.approach }, B = { x: g.x + d.x * D.threshold, z: g.z + d.z * D.threshold };
  return dot({ x: p.x - g.x, z: p.z - g.z }, d) > -0.5 ? [p, B] : [p, A, B];
}
/** Where you appear after the wipe and how you walk on (local coordinates of the zone you arrive in). */
export function doorArrival(into: "reading" | "margins"): Vec[] {
  const dir = into === "reading" ? ROOM_IN : { x: -WALK_IN.x, z: -WALK_IN.z };
  const { g } = doorFrame(into === "reading" ? "room" : "margins"), s = raw.door.emerge, a = raw.door.arrive;
  const start = { x: g.x - dir.x * s, z: g.z - dir.z * s };
  return [start, { x: start.x + dir.x * a, z: start.z + dir.z * a }];
}
export const doorYaw = (into: "reading" | "margins"): number => {
  const dir = into === "reading" ? ROOM_IN : { x: -WALK_IN.x, z: -WALK_IN.z };
  return Math.atan2(-dir.x, -dir.z); // the camera looks along the way you are walking
};

// --- The room: walls and furniture -----------------------------------------------------------
export const shelfBoxes = (): Box[] => raw.furniture.shelves.map((s) => ({ ...s }));
export const deskBoxes = (): Box[] => raw.furniture.desks.map((s) => ({ ...s }));
/** The four walls as boxes (a gap for the door on the south wall), just outside the walkable floor, plus the shelves and desks. */
export function roomColliders(): Colliders {
  const { width: w, depth: d, wallThickness: t } = raw.room, gap = raw.door.postOffset;
  const walls: Box[] = [
    { x: 0, z: -d / 2 - t / 2, w: w + 2 * t, d: t },
    { x: -w / 2 - t / 2, z: 0, w: t, d },
    { x: w / 2 + t / 2, z: 0, w: t, d },
    { x: (-w / 2 - gap) / 2, z: d / 2 + t / 2, w: w / 2 - gap, d: t },
    { x: (w / 2 + gap) / 2, z: d / 2 + t / 2, w: w / 2 - gap, d: t },
  ];
  return { circles: [], boxes: [...walls, ...shelfBoxes(), ...deskBoxes()] };
}
export const insideRoom = (p: Vec, margin = 0): boolean => Math.abs(p.x) <= raw.room.width / 2 - margin && Math.abs(p.z) <= raw.room.depth / 2 - margin;
export const roomWalkEnd = (): number => raw.room.depth / 2 + 0.6; // the doorway is the way out; no further

// --- Dusk (the existing dusk key hour; no new clock) -----------------------------------------
export type DuskWindow = { inFrom: number; inTo: number; outFrom: number; outTo: number };
/** 0 by day and deep in the night; eases in over inFrom..inTo, holds, and eases out over outFrom..outTo. */
export function duskLevel(hour: number, w: DuskWindow = raw.dusk): number {
  const h = ((hour % 24) + 24) % 24;
  if (h < w.inFrom || h >= w.outTo) return 0;
  if (h < w.inTo) return ease((h - w.inFrom) / (w.inTo - w.inFrom));
  if (h < w.outFrom) return 1;
  return 1 - ease((h - w.outFrom) / (w.outTo - w.outFrom));
}
/** `?reading=1` forces dusk (dev builds only). */
export const levelFor = (hour: number, forced: boolean): number => (forced ? 1 : duskLevel(hour));
/** A short step toward the target level (about 2 s; 0.15 s with reduced motion), so a moving clock fades and never pops. */
export function levelStep(cur: number, target: number, dt: number, reduced: boolean): number {
  const rate = dt / (reduced ? 0.15 : 2);
  return cur < target ? Math.min(target, cur + rate) : Math.max(target, cur - rate);
}

// --- The spots -----------------------------------------------------------------------------------
export type ReadingSpot = { id: number; x: number; z: number; dusk: boolean };
/** Day spots first (ids 0..3), then dusk spots (ids 4..5). The ids are the spot numbers sent to world_unfold. */
export const READING_SPOTS: ReadingSpot[] = [
  ...raw.spots.day.map((p, i) => ({ id: i, x: p.x, z: p.z, dusk: false })),
  ...raw.spots.dusk.map((p, i) => ({ id: raw.spots.day.length + i, x: p.x, z: p.z, dusk: true })),
];
export const spotKey = (id: number): string => `${READING_REGION}:${id}`;
/** Today's opened reading-room spots, from the keys the page already reads ("region:spot"). */
export function openedFromKeys(keys: readonly string[] | null): Set<number> {
  const out = new Set<number>();
  for (const k of keys ?? []) { const m = /^reading_room:(\d+)$/.exec(k); if (m) out.add(Number(m[1])); }
  return out;
}
/** The closest unopened spot within reach. A dusk spot is only there once the dusk has eased in past `openAt`. */
export function nearestReadingSpot(p: Vec, opened: ReadonlySet<number>, level: number, reach: number = raw.spots.reach): ReadingSpot | null {
  let best: ReadingSpot | null = null, bd = reach;
  for (const s of READING_SPOTS) {
    if (opened.has(s.id) || (s.dusk && level < raw.dusk.openAt)) continue;
    const d = Math.hypot(s.x - p.x, s.z - p.z);
    if (d <= bd) { bd = d; best = s; }
  }
  return best;
}

// --- The look of a find ---------------------------------------------------------------------------
// A dusk spot is a LOOK, not a new kind: the drawn find is chosen after the server's answer, from the kind it returned.
// Only scrap and ink get a dusk look; glyph, egg and keepsake are drawn as the Margins draws them (a keepsake rises as a scrap,
// and the page counts it as a keepsake). Any other value falls back to the plain look, never an error.
export type Look = "ink" | "glyph" | "scrap" | "egg" | "moth" | "lantern" | "plain";
export const LOOKS: readonly Look[] = ["ink", "glyph", "scrap", "egg", "moth", "lantern", "plain"];
export function findLook(kind: unknown, dusk: boolean): Look {
  switch (kind) {
    case "scrap": return dusk ? "moth" : "scrap";
    case "ink": return dusk ? "lantern" : "ink";
    case "glyph": return "glyph";
    case "egg": return "egg";
    case "keepsake": return "scrap";
    default: return "plain";
  }
}
/** A refused or unknown region is the quiet answer, never an error: "no such page" becomes the ceiling's quiet line. */
export const quietIfUnknown = (o: Outcome): Outcome => (!o.ok && o.reason === "bad-page" ? { ok: false, reason: "ceiling" } : o);

// --- Dev preview (dev builds only) ----------------------------------------------------------------
export type ReadingPreview = { reduced: boolean } | null;
/** ?reading=1 enters the room directly and forces dusk; ?reading=reduced also forces reduced motion. Ignored in production. */
export function readingOverride(search: string, isProduction: boolean): ReadingPreview {
  if (isProduction) return null;
  const v = new URLSearchParams(search).get("reading");
  return v === "1" ? { reduced: false } : v === "reduced" ? { reduced: true } : null;
}
/** The dev preview never calls the server: it cycles through these kinds in order. */
export const previewKind = (n: number): string => raw.preview.kinds[((n % raw.preview.kinds.length) + raw.preview.kinds.length) % raw.preview.kinds.length];

// --- The data check (runs in tests; the kill switch is the only thing the game reads at runtime) ------
export function checkReading(d: typeof raw = raw): string[] {
  const bad: string[] = [];
  const cols = roomColliders();
  const all = [...d.spots.day, ...d.spots.dusk];
  if (all.length !== 6) bad.push("spot count");
  for (const p of all) if (!insideRoom(p, 0.8) || insideAny(p, d.spots.clear, cols)) bad.push(`spot ${p.x},${p.z}`);
  return bad;
}

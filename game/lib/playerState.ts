// S36: saving where the player and their Prints stand, as pure functions: validate, convert between a zone's own frame and the scene,
// pick the source (browser copy first), walk the safety ladder, decide when to save. No three.js, clock, storage or network here.
// Numbers live in data/playerState.json. The server (save_state) checks only finite / in bounds / known zone; the real "is this spot ok" check is here, on load.
import raw from "@/data/playerState.json";
import { clampToBounds, insideAny, pushOut, HOME, type Colliders, type Vec } from "@/lib/world";
import type { ZoneId } from "@/lib/zones";

export const PS = raw.playerState;
export const isEnabled = (d: unknown): boolean => { try { return (d as { playerState?: { enabled?: unknown } })?.playerState?.enabled === true; } catch { return false; } }; // anything but a plain true is off; never throws
export const PS_ENABLED: boolean = isEnabled(raw);
export const ZONES: readonly ZoneId[] = PS.zones as ZoneId[];
export type Mode = "rest" | "wander";
export type PrintSnap = { id: string; x: number; z: number; h: number; m: Mode };
/** x and z are in the zone's own frame (scene position minus that zone's scene offset). */
export type Snap = { zone: ZoneId; x: number; z: number; heading: number; yaw: number; prints: PrintSnap[] };
export type Saved = Snap & { at: number }; // at = ms since the epoch when it was saved
export type Offsets = Record<ZoneId, number>; // where each zone sits along scene x (the garden is 0)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TURNS = 32; // the server accepts headings within this many radians
const num = (v: unknown, lim: number): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= lim;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
/** Keep an angle small (the server takes at most +-32 rad); the same direction. */
export const normAngle = (a: number): number => (Number.isFinite(a) ? Math.atan2(Math.sin(a), Math.cos(a)) : 0);

// --- Frames ------------------------------------------------------------------------------------
export const toLocal = (zone: ZoneId, p: Vec, offs: Offsets): Vec => ({ x: p.x - offs[zone], z: p.z });
export const toScene = (zone: ZoneId, p: Vec, offs: Offsets): Vec => ({ x: p.x + offs[zone], z: p.z });

// --- Validation --------------------------------------------------------------------------------
function validPrint(p: unknown): PrintSnap | null {
  const o = p as Partial<PrintSnap> | null;
  if (!o || typeof o !== "object" || typeof o.id !== "string" || !UUID.test(o.id)) return null;
  if (!num(o.x, PS.bound) || !num(o.z, PS.bound) || !num(o.h, TURNS) || (o.m !== "rest" && o.m !== "wander")) return null;
  return { id: o.id, x: o.x, z: o.z, h: o.h, m: o.m };
}
/** A record from the browser copy or the server, or null if anything is off (NaN, infinity, out of bounds, unknown zone or mode). Prints that fail are dropped, not the player. */
export function validateState(v: unknown): Snap | null {
  const o = v as Partial<Snap> | null;
  if (!o || typeof o !== "object") return null;
  if (typeof o.zone !== "string" || !ZONES.includes(o.zone as ZoneId)) return null;
  if (!num(o.x, PS.bound) || !num(o.z, PS.bound) || !num(o.heading, TURNS) || !num(o.yaw, TURNS)) return null;
  const list = Array.isArray(o.prints) ? o.prints.slice(0, PS.maxPrints) : [];
  const prints: PrintSnap[] = [];
  for (const p of list) { const q = validPrint(p); if (q && !prints.some((x) => x.id === q.id)) prints.push(q); }
  return { zone: o.zone as ZoneId, x: o.x, z: o.z, heading: o.heading, yaw: o.yaw, prints };
}
/** Rows from the two selects (player_state, print_state) into one record. Null when there is no player row or it is not valid. */
export function fromRows(player: unknown, prints: unknown): Saved | null {
  const p = player as { zone?: unknown; x?: unknown; z?: unknown; heading?: unknown; yaw?: unknown; updated_at?: unknown } | null;
  if (!p || typeof p !== "object") return null;
  const rows = Array.isArray(prints) ? prints : [];
  const snap = validateState({ zone: p.zone, x: p.x, z: p.z, heading: p.heading, yaw: p.yaw, prints: rows.map((r) => ({ id: r?.creature_id, x: r?.x, z: r?.z, h: r?.heading, m: r?.mode })) });
  const at = typeof p.updated_at === "string" ? Date.parse(p.updated_at) : NaN;
  return snap && Number.isFinite(at) ? { ...snap, at } : null;
}

// --- The browser copy --------------------------------------------------------------------------
export const mirrorKey = (who: string): string => `${PS.storageKey}.${who}`;
export const serializeMirror = (s: Saved): string => JSON.stringify({ v: 1, at: s.at, s: { zone: s.zone, x: s.x, z: s.z, heading: s.heading, yaw: s.yaw, prints: s.prints } });
/** A stored copy back into a record; null if it is missing, too big, corrupt or invalid. Never throws. */
export function parseMirror(text: unknown): Saved | null {
  if (typeof text !== "string" || text.length > 8000) return null;
  try {
    const j = JSON.parse(text) as { v?: unknown; at?: unknown; s?: unknown };
    if (j?.v !== 1 || typeof j.at !== "number" || !Number.isFinite(j.at)) return null;
    const s = validateState(j.s);
    return s ? { ...s, at: j.at } : null;
  } catch { return null; }
}
export const isStale = (at: number, now: number): boolean => !(now - at <= PS.staleDays * 86_400_000) || at > now + 86_400_000;
/** Which record to start from: the browser copy if it is usable, else the server's. A stale or corrupt copy counts as missing. Null = start as today. */
export function pickSource(mirror: Saved | null, server: Saved | null, now: number): { from: "mirror" | "server"; state: Saved } | null {
  if (mirror && !isStale(mirror.at, now)) return { from: "mirror", state: mirror };
  if (server && !isStale(server.at, now)) return { from: "server", state: server };
  return null;
}

// --- Safety ladder (spec section 6) ------------------------------------------------------------
export type ZoneInfo = { halfW: number; halfD: number; cols: () => Colliders; spawn: Vec; spawnYaw: number };
export type Ladder = { reading: boolean; radius: number; zones: Record<ZoneId, ZoneInfo> };
const clampRect = (p: Vec, hw: number, hd: number, r: number): Vec => ({ x: Math.min(hw - r, Math.max(-(hw - r), p.x)), z: Math.min(hd - r, Math.max(-(hd - r), p.z)) });
/** Where the player starts, in the zone's own frame: the saved spot if it is good, else a quiet fallback. Always a valid, reachable point. */
export function fallbackSpot(s: Pick<Snap, "zone" | "x" | "z" | "heading" | "yaw">, L: Ladder): { zone: ZoneId; x: number; z: number; heading: number; yaw: number; moved: boolean } {
  let zone = s.zone;
  if (zone === "reading" && !L.reading) zone = "margins"; // step 2: a closed zone sends you to the Margins arrival
  const info = L.zones[zone];
  const spawn = () => ({ zone, x: info.spawn.x, z: info.spawn.z, heading: s.heading, yaw: info.spawnYaw, moved: true });
  if (zone !== s.zone) return spawn();
  const c = clampRect({ x: s.x, z: s.z }, info.halfW, info.halfD, L.radius); // step 3
  const cols = info.cols();
  const p = pushOut(c, L.radius, cols); // step 4
  const q = clampRect(p, info.halfW, info.halfD, L.radius);
  if (insideAny(q, L.radius * 0.9, cols)) return spawn(); // still stuck: the arrival spawn
  return { zone, x: q.x, z: q.z, heading: s.heading, yaw: s.yaw, moved: Math.hypot(q.x - s.x, q.z - s.z) > 0.01 };
}
/** A saved Print point: inside Home, out of colliders, or null (the usual spawn). Garden frame. */
export function printSpot(p: Vec, cols: Colliders, radius: number): Vec | null {
  const c = clampToBounds(p, radius, HOME.size);
  const q = clampToBounds(pushOut(c, radius, cols), radius, HOME.size);
  return insideAny(q, radius * 0.9, cols) ? null : q;
}

// --- When to save (spec section 5) -------------------------------------------------------------
export type Trigger = "timer" | "zone" | "hide" | "signout";
export type SaveCheck = { enabled: boolean; travelling: boolean; hidden: boolean; trigger: Trigger; now: number; lastAt: number; last: Snap | null; cur: Snap };
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.z - b.z);
/** What changed since the last save. Print positions and modes alone are only "printsChanged": they never start a timer save, so a still player makes no calls. */
export function changes(last: Snap | null, cur: Snap): { zone: boolean; moved: number; yawed: boolean; printsChanged: boolean } {
  if (!last) return { zone: false, moved: 0, yawed: false, printsChanged: false }; // the first report is the baseline
  const byId = new Map(last.prints.map((p) => [p.id, p] as const));
  const printsChanged = cur.prints.length !== last.prints.length || cur.prints.some((p) => { const o = byId.get(p.id); return !o || o.m !== p.m || dist(o, p) > PS.minMoveM; });
  return { zone: last.zone !== cur.zone, moved: last.zone === cur.zone ? dist(last, cur) : 1e9, yawed: Math.abs(normAngle(cur.yaw - last.yaw)) > 0.35, printsChanged };
}
export function shouldSave(c: SaveCheck): boolean {
  if (!c.enabled || c.travelling || !c.last) return false;
  const d = changes(c.last, c.cur);
  if (c.trigger === "zone") return d.zone;
  if (c.trigger === "timer") return !c.hidden && c.now - c.lastAt >= PS.saveEveryS * 1000 && (d.zone || d.moved > PS.minMoveM);
  return d.zone || d.moved > 0.01 || d.yawed || d.printsChanged; // leaving (hide, sign-out): anything that differs
}

// --- The payload -------------------------------------------------------------------------------
/** The argument for save_state. Only Prints you own, each once, at most maxPrints, finite numbers only, small angles. */
export function printsPayload(prints: PrintSnap[], ownIds: Iterable<string>): PrintSnap[] {
  const own = new Set(ownIds), seen = new Set<string>(), out: PrintSnap[] = [];
  for (const p of prints) {
    if (out.length >= PS.maxPrints) break;
    if (!own.has(p.id) || seen.has(p.id) || !Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
    seen.add(p.id);
    out.push({ id: p.id, x: r3(Math.max(-PS.bound, Math.min(PS.bound, p.x))), z: r3(Math.max(-PS.bound, Math.min(PS.bound, p.z))), h: r3(normAngle(p.h)), m: p.m === "rest" ? "rest" : "wander" });
  }
  return out;
}
export function savePayload(s: Snap, ownIds: Iterable<string>) {
  return { p_zone: s.zone, p_x: r3(s.x), p_z: r3(s.z), p_heading: r3(normAngle(s.heading)), p_yaw: r3(normAngle(s.yaw)), p_prints: printsPayload(s.prints, ownIds) };
}
/** ?nosave=1 turns reading and writing off for the session. Ignored in production. */
export const nosaveOverride = (search: string, isProduction: boolean): boolean => !isProduction && /(?:^|[?&])nosave=1(?:&|$)/.test(search);

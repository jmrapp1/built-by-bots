// Neighbours in the world (slice N1): the data check, the notice range with slack, the turn and bubble
// timings and the hint cycle. No three.js, clock or server here. Lines live in data/npcs.json.
// Missing or malformed data skips the neighbour; it never throws.
import npcData from "@/data/npcs.json";
import { gateFrame } from "@/lib/margins";
import type { Vec } from "@/lib/world";

// Icons are drawn from these paths (24 x 24, stroked) both in the page (SVG) and in the world (canvas).
export const ICON_PATHS = {
  leaf: "M5 19C5 10 11 5 19 5c0 8-5 14-14 14zM5 19l8-8",
  moon: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z",
  drop: "M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z",
  question: "M9 9a3 3 0 1 1 4.5 2.6C12.5 12.2 12 13 12 14.5M12 18.5v.5",
  book: "M4 5h7a2 2 0 0 1 1 1 2 2 0 0 1 1-1h7v13h-7a2 2 0 0 0-1 1 2 2 0 0 0-1-1H4zM12 6v12",
  crumb: "M8 10l3-3 4 2 2 4-3 4-4-1z",
  house: "M4 11l8-7 8 7M6 10v9h12v-9M10 19v-5h4v5",
  trail: "M4 19c4 0 3-6 8-6s4-7 8-7M5 5h.01M9 5h.01",
} as const;
export type IconName = keyof typeof ICON_PATHS;
export const ICON_NAMES = Object.keys(ICON_PATHS) as IconName[];
export const MAX_LINE = 90;
export const MAX_ICONS = 3;

export type Hint = { text: string; icons: IconName[] };
export type Npc = {
  id: string; name: string; area: "margins"; prompt: string; radius: number;
  spot: { out: number; side: number };
  noticeEnter: number; noticeLeave: number; talkEnter: number; talkLeave: number;
  timeIcons: { from: number; to: number; icon: IconName }[]; otherwise: IconName; extra: IconName[];
  hints: Hint[];
};
export const TIMES = { turn: 0.4, bloom: 0.3, fade: 0.25, reducedFade: 0.15, bloomAfter: 0.15, stripFade: 0.2 };

const isNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const isIcon = (s: unknown): s is IconName => typeof s === "string" && Object.prototype.hasOwnProperty.call(ICON_PATHS, s);
const iconList = (a: unknown, min: number): IconName[] | null =>
  Array.isArray(a) && a.length >= min && a.length <= MAX_ICONS && a.every(isIcon) ? (a as IconName[]) : null;

// One neighbour from raw data, or null when anything is wrong with it.
export function checkNpc(raw: unknown): Npc | null {
  try {
    const r = raw as Record<string, any>;
    if (!r || typeof r !== "object") return null;
    if (typeof r.id !== "string" || !r.id || typeof r.name !== "string" || typeof r.prompt !== "string" || !r.prompt) return null;
    if (r.area !== "margins" || !r.spot || r.spot.from !== "gate" || !isNum(r.spot.out) || !isNum(r.spot.side)) return null;
    for (const k of ["radius", "noticeEnter", "noticeLeave", "talkEnter", "talkLeave"]) if (!isNum(r[k]) || r[k] <= 0) return null;
    if (r.noticeLeave <= r.noticeEnter || r.talkLeave <= r.talkEnter || r.talkEnter > r.noticeEnter) return null; // slack must be real
    const g = r.greeting;
    if (!g || !isIcon(g.otherwise) || !Array.isArray(g.timeIcons)) return null;
    const timeIcons: Npc["timeIcons"] = [];
    for (const t of g.timeIcons) {
      if (!t || !isNum(t.from) || !isNum(t.to) || t.from < 0 || t.to > 24 || t.from >= t.to || !isIcon(t.icon)) return null;
      timeIcons.push({ from: t.from, to: t.to, icon: t.icon });
    }
    const extra = g.extra === undefined ? [] : iconList(g.extra, 0);
    if (!extra || extra.length + 1 > MAX_ICONS) return null;
    if (!Array.isArray(r.hints) || r.hints.length < 1) return null;
    const hints: Hint[] = [];
    for (const h of r.hints) {
      const icons = h ? iconList(h.icons, 1) : null;
      if (!icons || typeof h.text !== "string" || !h.text.trim() || h.text.length > MAX_LINE) return null;
      hints.push({ text: h.text, icons });
    }
    return { id: r.id, name: r.name, area: "margins", prompt: r.prompt, radius: r.radius, spot: { out: r.spot.out, side: r.spot.side },
      noticeEnter: r.noticeEnter, noticeLeave: r.noticeLeave, talkEnter: r.talkEnter, talkLeave: r.talkLeave, timeIcons, otherwise: g.otherwise, extra, hints };
  } catch { return null; }
}

// All neighbours that pass; ids must be unique (a repeat is skipped). Never throws.
export function checkNpcs(raw: unknown): Npc[] {
  try {
    const list = (raw as { npcs?: unknown })?.npcs;
    if (!Array.isArray(list)) return [];
    const seen = new Set<string>(), out: Npc[] = [];
    for (const item of list) { const n = checkNpc(item); if (n && !seen.has(n.id)) { seen.add(n.id); out.push(n); } }
    return out;
  } catch { return []; }
}
export const NPCS: Npc[] = checkNpcs(npcData);
export const npcById = (id: string, list: Npc[] = NPCS): Npc | null => list.find((n) => n.id === id) ?? null;

// Where she stands (local to the Margins): beside the walkway, a little way out from the Margins gate.
export function npcSpot(n: Npc): Vec & { face: number } {
  const { g, d } = gateFrame("home"), out = { x: -d.x, z: -d.z }, side = { x: -out.z, z: out.x };
  const x = g.x + out.x * n.spot.out + side.x * n.spot.side, z = g.z + out.z * n.spot.out + side.z * n.spot.side;
  const walk = { x: g.x + out.x * n.spot.out, z: g.z + out.z * n.spot.out }; // she rests facing the walkway
  return { x, z, face: Math.atan2(walk.x - x, walk.z - z) };
}

// Notice with slack: in at `enter`, out only past `leave`, so she does not flicker at the edge.
export const withinSlack = (dist: number, was: boolean, enter: number, leave: number): boolean => (was ? dist <= leave : dist <= enter);

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
export const ease = (n: number) => { const t = clamp01(n); return t * t * (3 - 2 * t); };
export const lerpAngle = (a: number, b: number, k: number): number => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
};

// The turn and the bubble, advanced by dt. `turn` runs 0 (rest) to 1 (facing you); `bubble` 0 to 1.
export type Notice = { near: boolean; turn: number; bubble: number };
export const NOTICE0: Notice = { near: false, turn: 0, bubble: 0 };
export function noticeStep(s: Notice, dist: number, enter: number, leave: number, dt: number, reduced: boolean): Notice {
  const near = withinSlack(dist, s.near, enter, leave);
  const move = (v: number, to: number, secs: number) => (v < to ? Math.min(to, v + dt / secs) : Math.max(to, v - dt / secs));
  if (reduced) { // she snaps to face you; the bubble only fades, quickly
    const turn = near ? 1 : 0;
    return { near, turn, bubble: move(s.bubble, near ? 1 : 0, TIMES.reducedFade) };
  }
  const turn = move(s.turn, near ? 1 : 0, TIMES.turn);
  const ready = near && turn >= TIMES.bloomAfter / TIMES.turn; // the bubble blooms after the turn has begun
  return { near, turn, bubble: move(s.bubble, ready ? 1 : 0, ready ? TIMES.bloom : TIMES.fade) };
}
// How the bubble is drawn: scale blooms in; with reduced motion it is only opacity.
export const bubbleLook = (bubble: number, reduced: boolean): { scale: number; opacity: number } =>
  reduced ? { scale: 1, opacity: clamp01(bubble) } : { scale: 0.3 + 0.7 * ease(bubble), opacity: clamp01(bubble * 1.6) };
// Her small breathing sway; none with reduced motion.
export const sway = (t: number, reduced: boolean): number => (reduced ? 0 : Math.sin(t * 1.6) * 0.035);

// The bubble's icons by the hour: a leaf by day, a drop at dawn and dusk, a moon in the dark, then the extras.
export function greetingIcons(n: Npc, hour: number): IconName[] {
  const h = ((hour % 24) + 24) % 24;
  const hit = n.timeIcons.find((t) => h >= t.from && h < t.to);
  return [hit ? hit.icon : n.otherwise, ...n.extra];
}

// Talking: each talk shows the next hint, looping; walking away closes the strip. Nothing is stored.
export type Talk = { open: boolean; next: number; shown: number };
export const TALK0: Talk = { open: false, next: 0, shown: -1 };
export function talk(s: Talk, hintCount: number): Talk {
  if (hintCount < 1) return s;
  const i = ((s.next % hintCount) + hintCount) % hintCount;
  return { open: true, next: (i + 1) % hintCount, shown: i };
}
export const closeTalk = (s: Talk): Talk => (s.open ? { ...s, open: false } : s);
// Keep the strip open only while the player stays within the slack range.
export const talkStillNear = (s: Talk, dist: number, n: Npc): Talk => (s.open && dist > n.talkLeave ? closeTalk(s) : s);

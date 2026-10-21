// Slice 2 (client only): test decorations on the fixed plots of the Home room. Pure rules and motion, no three.js, no network.
// The stub state is a plain object (plot id -> decoration id) kept in memory by the page; nothing is saved.
import decor from "@/data/decor.json";
import { HOME_ROOM } from "@/lib/home";
import type { Place } from "@/lib/world";
import { nearestPlace } from "@/lib/world";
import type { StripView } from "@/lib/picker";

export type PlotKind = "floor" | "wall";
export type Part = { t: "box" | "cyl" | "sphere" | "disc"; s: number[]; p: number[]; c: string; ry?: number; glow?: number };
export type Decoration = { id: string; name: string; fits: PlotKind; footprint: [number, number]; parts: Part[] };
export type Plot = { id: string; kind: PlotKind; starter: string };
export type Placed = Record<string, string>;

export const DECOR = decor as unknown as typeof decor & { plots: Plot[]; decorations: Decoration[] };
export const M = DECOR.motion;
export const PLOTS: Plot[] = DECOR.plots;
export const DECORATIONS: Decoration[] = DECOR.decorations;
export const DECOR_TITLE = "Decorations";
export const DECOR_EMPTY = "Nothing fits this spot yet.";
export const CLEAR = "Clear";
export const DECOR_PROMPT = "Decorate";

const decById = new Map(DECORATIONS.map((d) => [d.id, d]));
const plotById = new Map(PLOTS.map((p) => [p.id, p]));
export const isDecoration = (id: unknown): id is string => typeof id === "string" && decById.has(id);
export const decorationOf = (id: string): Decoration | undefined => decById.get(id);
export const plotOf = (id: string): Plot | undefined => plotById.get(id);

// ?decor=stub (dev only): plots, prompt and strip in the Home room, all in memory. Ignored in production.
export const decorPreview = (search: string, isProduction: boolean): boolean => !isProduction && new URLSearchParams(search).get("decor") === "stub";

// ---- plots: where they are and which way they face
const FACE_YAW: Record<string, number> = { south: 0, east: Math.PI / 2, west: -Math.PI / 2, north: Math.PI };
export type PlotPose = { id: string; kind: PlotKind; x: number; z: number; yaw: number; reachX: number; reachZ: number };
export function plotPose(plot: Plot): PlotPose {
  const a = HOME_ROOM.anchors.find((q) => q.id === plot.id);
  if (!a) throw new Error(`no anchor for plot ${plot.id}`);
  const R = HOME_ROOM.room, yaw = FACE_YAW[a.face] ?? 0;
  if (plot.kind === "floor") return { id: plot.id, kind: "floor", x: a.x, z: a.z, yaw, reachX: a.x, reachZ: a.z };
  // a wall plot sits on the wall it faces away from; you stand near the anchor
  const x = a.face === "east" ? -R.width / 2 : a.face === "west" ? R.width / 2 : a.x;
  const z = a.face === "south" ? -R.depth / 2 : a.face === "north" ? R.depth / 2 : a.z;
  return { id: plot.id, kind: "wall", x, z, yaw, reachX: a.x, reachZ: a.z };
}
export const PLOT_POSES: PlotPose[] = PLOTS.map(plotPose);

/** The plot within reach of a room-local position, as a Place for the usual prompt (null when none). */
export function nearestPlot(local: { x: number; z: number }): Place | null {
  const places: Place[] = PLOT_POSES.map((p) => ({ id: p.id, kind: "decor", x: p.reachX, z: p.reachZ, label: DECOR_TITLE, prompt: DECOR_PROMPT }));
  return nearestPlace(local, places, DECOR.reach);
}

// ---- what fits, what is listed
export const fitting = (plotId: string): Decoration[] => { const k = plotOf(plotId)?.kind; return k ? DECORATIONS.filter((d) => d.fits === k) : []; };
export type DecorChoice = { id: string | null; label: string; current: boolean; disabled?: boolean };
/** "Clear" first (disabled while nothing is placed), then each decoration that fits, the placed one marked. */
export function decorChoicesFor(plotId: string, placed: Placed): DecorChoice[] {
  const here = isDecoration(placed[plotId]) ? placed[plotId] : null;
  return [{ id: null, label: CLEAR, current: false, disabled: here === null }, ...fitting(plotId).map((d) => ({ id: d.id, label: d.name, current: d.id === here }))];
}
export function canPlace(plotId: string, placed: Placed, choice: string | null): boolean {
  const here = isDecoration(placed[plotId]) ? placed[plotId] : null;
  if (choice === here) return false;
  return choice === null || fitting(plotId).some((d) => d.id === choice);
}
export function withChoice(plotId: string, placed: Placed, choice: string | null): Placed {
  if (!canPlace(plotId, placed, choice)) return placed;
  const next = { ...placed };
  if (choice === null) delete next[plotId]; else next[plotId] = choice;
  return next;
}
export function decorStrip(plotId: string, placed: Placed): StripView {
  const choices = decorChoicesFor(plotId, placed);
  return { title: DECOR_TITLE, emptyText: fitting(plotId).length === 0 ? DECOR_EMPTY : null, choices, currentSuffix: "placed" };
}

/** Extent of a decoration's parts (half-widths in x and z, top height, lowest point), to check it stays on its footprint. */
export function partsExtent(d: Decoration): { hx: number; hz: number; top: number; low: number } {
  let hx = 0, hz = 0, top = 0, low = Infinity;
  for (const q of d.parts) {
    const [x, y, z] = q.p; let ex = 0, ey = 0, ez = 0;
    if (q.t === "box") { const [w, h, dd] = q.s; const r = q.ry ?? 0, c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r)); ex = (w * c + dd * s) / 2; ez = (w * s + dd * c) / 2; ey = h / 2; }
    else if (q.t === "cyl") { ex = ez = Math.max(q.s[0], q.s[1]); ey = q.s[2] / 2; }
    else if (q.t === "sphere") { ex = ey = ez = q.s[0]; }
    else { ex = ez = q.s[0]; ey = 0.002; }
    hx = Math.max(hx, Math.abs(x) + ex); hz = Math.max(hz, Math.abs(z) + ez); top = Math.max(top, y + ey); low = Math.min(low, y - ey);
  }
  return { hx, hz, top, low };
}

// ---- motion: one slot per plot. Times are seconds on the frame clock; nothing here reads a clock or sets a timer.
export type Slot = { id: string | null; phase: "idle" | "placing" | "clearing"; since: number; next?: string | null; markerSince: number };
export const newSlot = (id: string | null = null): Slot => ({ id, phase: "idle", since: -1e9, markerSince: -1e9 });
export const placeSeconds = (reduced: boolean): number => (reduced ? M.reducedFade : M.fall + M.dropsLife);
export const clearSeconds = (reduced: boolean): number => (reduced ? M.reducedFade : M.clear);

/** Ask a slot to show `want` (a decoration id, or null for empty). An old one leaves first, then the new one drops: no overlap. */
export function setSlot(s: Slot, want: string | null, now: number): Slot {
  if (s.phase === "clearing") return { ...s, next: want };
  if (want === s.id) return s;
  if (s.id === null) return { ...s, id: want, phase: "placing", since: now };
  return { ...s, phase: "clearing", since: now, next: want };
}
/** Move a slot on to `now`: a finished clear starts the next drop right where it ended. */
export function advanceSlot(s: Slot, now: number, reduced: boolean): Slot {
  let o = s;
  if (o.phase === "clearing" && now - o.since >= clearSeconds(reduced)) {
    const end = o.since + clearSeconds(reduced);
    o = o.next == null ? { id: null, phase: "idle", since: end, markerSince: end } : { id: o.next, phase: "placing", since: end, markerSince: o.markerSince };
  }
  if (o.phase === "placing" && now - o.since >= placeSeconds(reduced)) o = { ...o, phase: "idle" };
  return o;
}

export type Pose = { visible: boolean; x: number; y: number; sx: number; sy: number; sz: number; opacity: number };
const REST: Pose = { visible: true, x: 0, y: 0, sx: 1, sy: 1, sz: 1, opacity: 1 };
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export function placePose(t: number, reduced: boolean): Pose {
  if (t < 0) return { ...REST, visible: false };
  if (reduced) return { ...REST, opacity: clamp01(t / M.reducedFade) };
  if (t < M.fall) { const p = t / M.fall; return { ...REST, y: M.dropHeight * (1 - p * p) }; }
  const q = (t - M.fall) / M.settle;
  if (q >= 1) return REST;
  const w = Math.sin(Math.PI * q);
  return { ...REST, sy: 1 - M.squash * w, sx: 1 + M.squash * 0.5 * w, sz: 1 + M.squash * 0.5 * w };
}
export function clearPose(t: number, reduced: boolean): Pose {
  if (reduced) return { ...REST, opacity: clamp01(1 - t / M.reducedFade), visible: t < M.reducedFade };
  const p = clamp01(t / M.clear), s = 1 - M.clearShrink * p;
  return { visible: p < 1, x: M.clearArc * p, y: M.clearLift * (1 - (1 - p) * (1 - p)), sx: s, sy: s, sz: s, opacity: 1 - p };
}
export function slotPose(s: Slot, now: number, reduced: boolean): Pose {
  if (s.id === null) return { ...REST, visible: false };
  if (s.phase === "placing") return placePose(now - s.since, reduced);
  if (s.phase === "clearing") return clearPose(now - s.since, reduced);
  return REST;
}
/** The two small ink drops that puff out after landing; t is seconds since landing. None when reduced. */
export function inkDrops(t: number, reduced: boolean): { x: number; y: number; scale: number; opacity: number }[] {
  if (reduced || t < 0 || t > M.dropsLife) return [];
  const p = t / M.dropsLife, e = 1 - (1 - p) * (1 - p);
  return [-1, 1].map((d) => ({ x: d * M.dropsSpread * e, y: M.dropSize + M.dropsRise * Math.sin(Math.PI * p) * (d > 0 ? 1 : 0.7), scale: M.dropSize * (1 - 0.5 * p), opacity: 1 - p }));
}
/** The page-corner marker: faint, pulsing gently while you are in reach, steady when reduced; hidden while something stands there. */
export function markerPose(s: Slot, now: number, reduced: boolean, near: boolean): { opacity: number; scale: number } {
  const shown = s.id === null && s.phase === "idle" ? clamp01((now - s.markerSince) / M.markerIn) : 0;
  if (reduced) return { opacity: M.markerSteady * shown, scale: 1 };
  const w = near ? 0.5 - 0.5 * Math.cos((2 * Math.PI * now) / M.pulsePeriod) : 0;
  return { opacity: (M.markerRest + (M.markerPeak - M.markerRest) * w) * shown, scale: 1 + M.pulseScale * w };
}

// W4: the map page, as pure functions. No three.js, no React, no clock, no network: which cells the player has walked,
// what the paper map shows of them, and where things land on the page. Walked cells are kept in this browser only
// (nothing is sent to the server, and nothing here decides an outcome). No text anywhere on the map.
import map from "@/data/map.json";
import { HALF, WORLD, pathPoints, regionAt, type Landmark, type RegionId } from "./worldMap";
import { GARDEN, type Vec } from "./world";

export const MAP = map;
export type Icon = "leaf" | "book" | "moon" | "kite";
export type Signpost = { id: string; icon: Icon; x: number; z: number; yaw: number };
export const SIGNPOSTS = map.signposts as Signpost[];

export const CELLS = Math.ceil(WORLD.size / map.cell);
const inGrid = (ix: number, iz: number) => ix >= 0 && iz >= 0 && ix < CELLS && iz < CELLS;
export const cellIndex = (ix: number, iz: number) => iz * CELLS + ix;
export const cellOf = (v: number) => Math.min(CELLS - 1, Math.max(0, Math.floor((v + HALF) / map.cell)));
export const cellCentre = (i: number): Vec => ({ x: -HALF + ((i % CELLS) + 0.5) * map.cell, z: -HALF + (Math.floor(i / CELLS) + 0.5) * map.cell });

export type Walked = Set<number>;
export const newWalked = (): Walked => new Set<number>();

/** Mark every cell whose centre is within `reveal` metres of the player. Returns true when something new was revealed. */
export function reveal(w: Walked, x: number, z: number, radius: number = map.reveal): boolean {
  let added = false;
  const lo = (v: number) => cellOf(v - radius), hi = (v: number) => cellOf(v + radius);
  for (let ix = lo(x); ix <= hi(x); ix++) for (let iz = lo(z); iz <= hi(z); iz++) {
    const c = cellCentre(cellIndex(ix, iz));
    if (Math.hypot(c.x - x, c.z - z) <= radius + 1e-9 && !w.has(cellIndex(ix, iz))) { w.add(cellIndex(ix, iz)); added = true; }
  }
  return added;
}
export const isWalked = (w: Walked, x: number, z: number) => w.has(cellIndex(cellOf(x), cellOf(z)));

// ---- saving: a sorted list of cell numbers as JSON; anything unreadable is "nothing walked yet" ----
export const storageKey = (who?: string | null) => (who ? `${map.storageKey}.${who}` : map.storageKey);
export function serialize(w: Walked): string { return JSON.stringify([...w].sort((a, b) => a - b)); }
export function parseWalked(raw: unknown): Walked {
  const out = newWalked();
  if (typeof raw !== "string" || raw.length > 20000) return out;
  let v: unknown; try { v = JSON.parse(raw); } catch { return out; }
  if (!Array.isArray(v)) return out;
  for (const n of v) if (Number.isInteger(n) && n >= 0 && n < CELLS * CELLS) out.add(n as number);
  return out;
}

// ---- where things land on a square page of `px` pixels. North (negative z) is up. ----
export const toPage = (x: number, z: number, px: number): Vec => ({ x: ((x + HALF) / WORLD.size) * px, z: ((z + HALF) / WORLD.size) * px });
export const pageScale = (px: number) => px / WORLD.size;

/** The map starts with the garden drawn in (you know where you live) but nothing else. */
export const HOME_BOX = { x0: -GARDEN.size / 2, z0: -GARDEN.size / 2, x1: GARDEN.size / 2, z1: GARDEN.size / 2 };

/** Runs of the inked path whose cells have been walked (a gap is left where you have not been). */
export function pathRuns(w: Walked): Vec[][] {
  const runs: Vec[][] = []; let cur: Vec[] = [];
  for (const p of pathPoints(6)) {
    if (isWalked(w, p.x, p.z)) cur.push(p); else if (cur.length) { runs.push(cur); cur = []; }
  }
  if (cur.length) runs.push(cur);
  return runs.filter((r) => r.length > 1);
}
export const seenLandmarks = (w: Walked): Landmark[] => (WORLD.landmarks as Landmark[]).filter((l) => isWalked(w, l.x, l.z));
export const seenSignposts = (w: Walked): Signpost[] => SIGNPOSTS.filter((s) => isWalked(w, s.x, s.z));
export const regionOfCell = (i: number): RegionId => regionAt(cellCentre(i).z, cellCentre(i).x);

/** The pin: where the player stands on the page and which way they face (yaw as the game keeps it: at 0 the player faces -z, up the page). */
export function pin(x: number, z: number, yaw: number, px: number) {
  const p = toPage(x, z, px);
  // the camera sits at (sin yaw, cos yaw) from the player and looks back at them, so the player faces (-sin yaw, -cos yaw)
  return { x: p.x, z: p.z, angle: Math.atan2(-Math.cos(yaw), -Math.sin(yaw)) };
}

/** Only keys that are not being typed into open the map. */
export const opensMap = (code: string, target: { tagName?: string } | null): boolean => code === map.key && target?.tagName !== "INPUT";

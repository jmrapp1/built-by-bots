// C1: seeded clusters. Most scenery lives in groups with a centre, a shape and bare ground round them; the old uniform scatter keeps only a thin 'stray' share.
// Pure and seeded, the buildFeature pattern: every cluster builds its whole item list from its own seed, independent of chunk edges, and a chunk takes the items inside it.
// The build is global and cached, so the result never depends on which chunk is asked for first. No Math.random, no clock, no three.js.
// C2: the land rule. A cell site is accepted only if the land gives its kind a reason to be there (slope, dips, path edges, landmark feet). Authored anchors are placed by hand and skip it. Caps are slice C3: here they are unchanged.
import raw from "@/data/clusters.json";
import shore from "@/data/shoreSights.json";
import { mulberry32 } from "./margins";
import { HALF, WORLD, chunkBounds, regionAt, CHUNKS, distToPath } from "./worldMap";
import { groundY } from "./ground";
import map from "@/data/map.json";
import worldRaw from "@/data/world.json";
import type { Item, RegionId } from "./worldMap";
import { FEATURES, PROP_LIMITS, buildAll, buildHedges, featureCircles, hedgeTouches, itemRadius, keepClear, propRadius, propSolid } from "./features";
import type { PropItem, PropKind } from "./features";

export type ClusterKind = "grove" | "lone" | "cairn" | "thicket" | "pool" | "line";
type Pt = [number, number];
type MemberDef = { k: string; n: [number, number]; zone: "center" | "core" | "skirt" | "edge" | "line"; s: [number, number]; first?: number };
type KindDef = { gap?: number; rc: number; rs: number; members: MemberDef[]; line?: { len: [number, number]; width: number } };
type CellDef = { cell: number; chance: number; gap: number; size: number; stray: number; treeScale: number; mix: Partial<Record<ClusterKind, number>>; props: { pool?: string[]; extra?: string; line?: string }; overrides?: Partial<Record<ClusterKind, Partial<KindDef>>> };
export type Anchor = { id: string; region: RegionId; kind: ClusterKind; at: Pt; seed: number };
export type ClustersData = { enabled: boolean; anchors: Anchor[]; kinds: Record<ClusterKind, KindDef>; cells: Record<RegionId, CellDef> };
export type ScatterKind = "tree" | "rock" | "bush";
export type ClusterScatter = Item & { k: ScatterKind; f: string };
export type Centre = { id: string; region: RegionId; kind: ClusterKind; x: number; z: number; reach: number };
export type Built = { centres: Centre[]; scatter: ClusterScatter[]; props: PropItem[] };

export const CLUSTERS = raw.clusters as unknown as ClustersData;
/** Anything but a plain true is off; never throws. */
export const clustersFlag = (d: unknown): boolean => { try { return (d as { clusters?: { enabled?: unknown } })?.clusters?.enabled === true; } catch { return false; } };
export const clustersOn = (): boolean => clustersFlag(raw);

const round = (v: number) => Math.round(v * 1000) / 1000;
const h3 = (a: number, b: number, c: number) => (Math.imul(a + 4096, 73856093) ^ Math.imul(b + 4096, 19349663) ^ Math.imul(c + 1, 83492791)) | 0;
const REGIONS: RegionId[] = ["meadow", "inkwood", "paper_downs", "glyph_quarter", "pressmark_shore"];
// authored places where something is meant to be found: members keep this clear (the shore sights use the same distance for scenery)
const SIGHTS = (shore as { points: { x: number; z: number }[]; clear: { scenery: number } }), SIGHT_CLEAR = SIGHTS.clear.scenery;
const SOLID_PROP = new Set(["haystack", "pagestone"]);
const LAND = worldRaw.landmarks as { x: number; z: number; r: number }[];
const SIGNS = (map as { signposts: { x: number; z: number }[] }).signposts;
const LAND_CLEAR = 5; // members keep each landmark's radius + this clear (the ground's flat zone uses the same distance)
const LONE_GAP = 14, FLAT = 0.08, SHORE_EDGE = 110, FLAT_SHARE = 0.6;

/** The land under a site, from the pure ground height. slope = gradient from +-1.5 m; hollow = mean height 10 m away minus the centre (positive = a dip or slope base). */
export function landAt(x: number, z: number): { slope: number; hollow: number; y: number; path: number } {
  const y = groundY(x, z), e = 1.5, gx = (groundY(x + e, z) - groundY(x - e, z)) / (2 * e), gz = (groundY(x, z + e) - groundY(x, z - e)) / (2 * e);
  const ring = (groundY(x + 10, z) + groundY(x - 10, z) + groundY(x, z + 10) + groundY(x, z - 10)) / 4;
  return { slope: Math.hypot(gx, gz), hollow: ring - y, y, path: distToPath(x, z) };
}
const landmarkGap = (x: number, z: number): number => LAND.reduce((m, l) => Math.min(m, Math.hypot(l.x - x, l.z - z) - l.r), Infinity);
const signGap = (x: number, z: number): number => SIGNS.reduce((m, s) => Math.min(m, Math.hypot(s.x - x, s.z - z)), Infinity);
/** Does the land give this kind a reason to be here? `others` = the centres already accepted. Cell sites only. */
export function landAccepts(kind: ClusterKind, region: RegionId, x: number, z: number, seed: number, others: Centre[]): boolean {
  const L = landAt(x, z), flat = L.slope < FLAT, shore = region === "pressmark_shore" && x > SHORE_EDGE, base = L.hollow > 0.08;
  const nearPath = L.path >= 4 && L.path <= 12;
  // dead-flat ground (the Glyph Quarter is one) has no dip or crest to give a reason: there the land rule falls back to a seeded share, so a flat region still gets clusters
  const dead = L.slope < 0.005 && Math.abs(L.hollow) < 0.02 && (seed % 100) / 100 < FLAT_SHARE;
  switch (kind) {
    case "grove": return flat && ((L.y > 0.15 && L.y < 1.5) || (seed % 100) / 100 < 0.6); // flat or gentle; hill shoulders always, other flat ground most of the time
    case "pool": return dead || L.hollow > 0.12 || (L.path >= 5 && L.path <= 10) || shore;
    case "cairn": { const lg = landmarkGap(x, z), sg = signGap(x, z); return dead || L.hollow < -0.1 || (lg >= 6 && lg <= 12) || (sg >= 3 && sg <= 8); }
    case "thicket": return dead || base || others.some((c) => c.kind === "grove" && c.region === region && Math.hypot(c.x - x, c.z - z) >= c.reach - 2 && Math.hypot(c.x - x, c.z - z) <= c.reach + 6);
    case "lone": return flat && others.every((c) => Math.hypot(c.x - x, c.z - z) >= LONE_GAP);
    case "line": return dead || nearPath || base || shore || (region === "paper_downs" && L.hollow < -0.1);
  }
}

type Site = { id: string; region: RegionId; kind: ClusterKind; at: Pt; seed: number; hv: number };

function pickWeighted<T extends string>(w: Partial<Record<T, number>>, u: number): T {
  const keys = Object.keys(w).sort() as T[]; let tot = 0; for (const k of keys) tot += w[k] ?? 0;
  let t = u * tot; for (const k of keys) { t -= w[k] ?? 0; if (t < 0) return k; }
  return keys[keys.length - 1];
}

/** Every cluster site in a fixed order: authored anchors first (list order), then the cell sites by hash. */
export function clusterSites(d: ClustersData = CLUSTERS): Site[] {
  const out: Site[] = d.anchors.map((a, i) => ({ ...a, hv: -1 + i * 1e-9 }));
  const cells: Site[] = [];
  REGIONS.forEach((region, ri) => {
    const c = d.cells[region]; if (!c) return;
    const n = Math.ceil(WORLD.size / c.cell);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const rnd = mulberry32(h3(i, j, ri * 977 + WORLD.seed * 31 + 5));
      const has = rnd() < c.chance, jx = (rnd() * 2 - 1) * 0.35, jz = (rnd() * 2 - 1) * 0.35, kind = pickWeighted<ClusterKind>(c.mix, rnd()), hv = rnd(), seed = Math.floor(rnd() * 2147483647);
      if (!has) continue;
      const x = round(-HALF + (i + 0.5 + jx) * c.cell), z = round(-HALF + (j + 0.5 + jz) * c.cell);
      if (regionAt(z, x) !== region) continue;
      cells.push({ id: `cell-${region}-${i}-${j}`, region, kind, at: [x, z], seed, hv });
    }
  });
  cells.sort((a, b) => a.hv - b.hv || (a.id < b.id ? -1 : 1));
  return [...out, ...cells];
}

const B = 6; // bucket size for the spacing check; larger than any pair reach
class Index<T extends { x: number; z: number }> {
  private m = new Map<string, T[]>();
  private key = (a: number, b: number) => `${a},${b}`;
  add(it: T) { const k = this.key(Math.floor(it.x / B), Math.floor(it.z / B)); const l = this.m.get(k); if (l) l.push(it); else this.m.set(k, [it]); }
  near(x: number, z: number): T[] { const a = Math.floor(x / B), b = Math.floor(z / B), out: T[] = []; for (let i = a - 1; i <= a + 1; i++) for (let j = b - 1; j <= b + 1; j++) { const l = this.m.get(this.key(i, j)); if (l) out.push(...l); } return out; }
}

type Member = { x: number; z: number; s: number; r: number; k: string; f: string; rad: number; solid: boolean };
const memberRadius = (k: string, s: number): number => (k === "tree" || k === "rock" || k === "bush" ? itemRadius({ k, s }) : propRadius({ k: k as PropKind, s }));

/** Build every cluster. Pure; the result for the shipped data is cached. */
export function buildClusters(d: ClustersData = CLUSTERS): Built {
  const empty: Built = { centres: [], scatter: [], props: [] };
  if (d.enabled !== true) return empty;
  const feats = featureCircles(buildAll()), hp = buildHedges(), idx = new Index<Member>();
  const centres: Centre[] = [], scatter: ClusterScatter[] = [], props: PropItem[] = [];
  const minGap = FEATURES.limits.minGap, softGap = PROP_LIMITS.minGap * 0.3;
  for (const site of clusterSites(d)) {
    const cell = d.cells[site.region], base = d.kinds[site.kind]; if (!cell || !base) continue;
    if (site.hv >= 0 && centres.some((c) => Math.hypot(c.x - site.at[0], c.z - site.at[1]) < (c.kind === "lone" ? Math.max(cell.gap, LONE_GAP) : cell.gap))) continue; // older anchors win, then the lower hash; a lone one keeps a wider berth
    if (site.hv >= 0 && !landAccepts(site.kind, site.region, site.at[0], site.at[1], site.seed, centres)) continue; // the land rule (cell sites only)
    const kd: KindDef = { ...base, ...(cell.overrides?.[site.kind] ?? {}) };
    const rnd = mulberry32(site.seed), size = cell.size * (0.85 + rnd() * 0.3), facing = rnd() * Math.PI * 2, squash = 0.7 + rnd() * 0.3;
    const rc = kd.rc * size, rs = kd.rs * size, cx = site.at[0], cz = site.at[1], cf = Math.cos(facing), sf = Math.sin(facing);
    const L = kd.line ? (kd.line.len[0] + rnd() * (kd.line.len[1] - kd.line.len[0])) * size : 0, bend = (rnd() - 0.5) * L * 0.5;
    const mine: Member[] = []; let reach = 3;
    const oval = (r: number, a: number): Pt => { const lx = Math.cos(a) * r * squash, lz = Math.sin(a) * r; return [cx + lx * cf - lz * sf, cz + lx * sf + lz * cf]; };
    for (const m of kd.members) {
      const n = Math.max(m.n[0] > 0 ? 1 : 0, Math.round((m.n[0] + rnd() * (m.n[1] - m.n[0])) * (m.k === "$extra" ? 1 : size)));
      for (let i = 0; i < n; i++) {
        const u1 = rnd(), u2 = rnd(), us = rnd(), pick = rnd(), jit = rnd();
        let k = m.k; if (k === "$pool") { const l = cell.props.pool ?? []; k = l[Math.floor(pick * l.length) % Math.max(1, l.length)] ?? ""; } else if (k === "$extra") k = cell.props.extra ?? ""; else if (k === "$line") k = cell.props.line ?? "";
        if (!k) continue;
        let p: Pt;
        if (m.zone === "center") p = [cx, cz];
        else if (m.zone === "core") p = oval(rc * Math.sqrt(u1), u2 * Math.PI * 2);
        else if (m.zone === "skirt") p = oval(rc + (rs - rc) * u1 * u1 + 0.001, u2 * Math.PI * 2);
        else if (m.zone === "edge") p = oval(rc * (0.85 + u1 * 0.4), (u2 - 0.5) * 1.2);
        else { const t = (i + 0.5 + (jit - 0.5) * 0.5) / n, along = (t - 0.5) * L, side = bend * Math.sin(Math.PI * t) + (u1 - 0.5) * (kd.line?.width ?? 1.5); p = [cx + along * cf - side * sf, cz + along * sf + side * cf]; }
        let s = m.s[0] + us * (m.s[1] - m.s[0]); if (m.first && i === 0) s *= m.first; if (k === "tree") s *= cell.treeScale;
        const x = round(p[0]), z = round(p[1]), rad = memberRadius(k, s), solid = k === "tree" || k === "rock" || k === "bush" || SOLID_PROP.has(k);
        if (Math.abs(x) > HALF - rad - 0.5 || Math.abs(z) > HALF - rad - 0.5) continue;
        if (regionAt(z, x) !== site.region) continue;
        if (keepClear(x, z, rad)) continue;
        if (hedgeTouches(x, z, rad, hp, 0.5)) continue;
        if (feats.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + rad + 0.3)) continue;
        if (LAND.some((l) => Math.hypot(l.x - x, l.z - z) < l.r + LAND_CLEAR + rad)) continue;
        if (SIGHTS.points.some((p) => Math.hypot(p.x - x, p.z - z) < rad + SIGHT_CLEAR + 0.3)) continue;
        if (idx.near(x, z).some((o) => Math.hypot(o.x - x, o.z - z) < rad + o.rad + (solid && o.solid ? kd.gap ?? minGap : softGap))) continue;
        const mem: Member = { x, z, s: round(s), r: round(jit * Math.PI * 2), k, f: site.id, rad, solid };
        idx.add(mem); mine.push(mem); reach = Math.max(reach, Math.hypot(x - cx, z - cz) + rad + 1.5);
      }
    }
    centres.push({ id: site.id, region: site.region, kind: site.kind, x: cx, z: cz, reach: round(reach) });
    for (const m of mine) { const it = { x: m.x, z: m.z, s: m.s, r: m.r, k: m.k, f: m.f }; if (m.k === "tree" || m.k === "rock" || m.k === "bush") scatter.push(it as ClusterScatter); else props.push(it as PropItem); }
  }
  return { centres, scatter, props };
}

let cached: Built | null = null;
/** The shipped clusters, built once. Empty when `enabled` is not a plain true. */
export const shippedClusters = (): Built => (cached ??= buildClusters());

/** The cluster trees, rocks and bushes inside one chunk (same half-open bounds as chunkContents). */
export function clusterScatterIn(ix: number, iz: number, items: ClusterScatter[] = shippedClusters().scatter): ClusterScatter[] {
  if (ix < 0 || iz < 0 || ix >= CHUNKS || iz >= CHUNKS) return [];
  const { x0, z0, x1, z1 } = chunkBounds(ix, iz);
  return items.filter((i) => i.x >= x0 && i.x < x1 + (ix === CHUNKS - 1 ? 1 : 0) && i.z >= z0 && i.z < z1 + (iz === CHUNKS - 1 ? 1 : 0));
}
/** Does a stray item at (x, z) sit inside a cluster's bare-ground reach? Strays give way to clusters. */
export const insideClusterReach = (x: number, z: number, rad = 0, b: Built = shippedClusters()): boolean => b.centres.some((c) => Math.hypot(c.x - x, c.z - z) < c.reach + rad);
/** Cluster props (tufts, ferns, drips, haystacks, pinwheels, page-stones), in build order. */
export const clusterProps = (): PropItem[] => shippedClusters().props;
export { propSolid };

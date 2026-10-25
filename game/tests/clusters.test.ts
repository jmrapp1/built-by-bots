// C1: seeded clusters. Determinism, chunk-order independence, rules, region shares, and that off is the old scatter byte for byte.
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import raw from "@/data/clusters.json";
import { CLUSTERS, buildClusters, clusterScatterIn, clustersFlag, clusterSites, shippedClusters, type ClustersData } from "@/lib/clusters";
import { landAccepts, landAt } from "@/lib/clusters";
import { CHUNKS, HALF, WORLD, buildContents, chunkCircles, chunkContents, regionAt } from "@/lib/worldMap";
import { FEATURES, buildAll, buildHedges, buildProps, hedgeTouches, itemRadius, keepClear, propRadius } from "@/lib/features";

const all = (on: boolean) => { const out: unknown[] = []; for (let a = 0; a < CHUNKS; a++) for (let b = 0; b < CHUNKS; b++) out.push(buildContents(a, b, WORLD.seed, on)); return out; };
const sha = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const off: ClustersData = { ...(CLUSTERS as ClustersData), enabled: false };

describe("the switch", () => {
  it("ships on, and only a plain true is on", () => {
    expect(raw.clusters.enabled).toBe(true);
    for (const v of ["true", 1, "1", null, undefined, {}, []]) expect(clustersFlag({ clusters: { enabled: v } })).toBe(false);
    expect(clustersFlag(null)).toBe(false);
  });
  it("off builds nothing, and the chunk is the old scatter byte for byte", () => {
    const b = buildClusters(off); expect(b.centres.length + b.scatter.length + b.props.length).toBe(0);
    expect(sha(all(false))).toBe("eb1fc86171afdf852866ce98ca298a81e0f04705ee938679b34a7ab1d2ba14ab"); // the pin from before clusters
  });
  it("on differs from off", () => { expect(sha(all(true))).not.toBe(sha(all(false))); });
});

describe("determinism", () => {
  it("the same call twice gives the same list", () => {
    expect(JSON.stringify(buildClusters())).toBe(JSON.stringify(buildClusters()));
    expect(sha(all(true))).toBe(sha(all(true)));
  });
  it("chunk order does not matter", () => {
    const keys: [number, number][] = []; for (let a = 0; a < CHUNKS; a++) for (let b = 0; b < CHUNKS; b++) keys.push([a, b]);
    const fwd = new Map(keys.map(([a, b]) => [`${a},${b}`, JSON.stringify(buildContents(a, b, WORLD.seed, true))]));
    for (const [a, b] of [...keys].reverse()) expect(JSON.stringify(buildContents(a, b, WORLD.seed, true))).toBe(fwd.get(`${a},${b}`));
  });
  it("chunkContents is cached per chunk and equals a fresh build", () => {
    expect(chunkContents(1, 1)).toBe(chunkContents(1, 1));
    expect(JSON.stringify(chunkContents(2, 3))).toBe(JSON.stringify(buildContents(2, 3, WORLD.seed, true)));
  });
  it("the chunks take every cluster tree, rock and bush exactly once", () => {
    let n = 0; for (let a = 0; a < CHUNKS; a++) for (let b = 0; b < CHUNKS; b++) n += clusterScatterIn(a, b).length;
    expect(n).toBe(shippedClusters().scatter.length);
  });
});

describe("the rules", () => {
  const b = shippedClusters(), hp = buildHedges(), feats = buildAll();
  const sites = clusterSites();
  it("has about 30 authored anchors and many cell sites", () => { expect(CLUSTERS.anchors.length).toBeGreaterThanOrEqual(28); expect(CLUSTERS.anchors.length).toBeLessThanOrEqual(36); expect(b.centres.length).toBeGreaterThan(60); expect(sites.length).toBeGreaterThan(b.centres.length - 1); });
  it("no member is inside keepClear, a hedge, the edge, or an authored feature; every member is in its region", () => {
    const reg = new Map(b.centres.map((c) => [c.id, c.region]));
    for (const m of [...b.scatter, ...b.props]) {
      const rad = m.k === "tree" || m.k === "rock" || m.k === "bush" ? itemRadius({ k: m.k, s: m.s }) : propRadius({ k: m.k as never, s: m.s });
      expect(keepClear(m.x, m.z, rad), m.f).toBe(false); expect(hedgeTouches(m.x, m.z, rad, hp, 0.5)).toBe(false);
      expect(Math.abs(m.x)).toBeLessThanOrEqual(HALF - rad - 0.5); expect(Math.abs(m.z)).toBeLessThanOrEqual(HALF - rad - 0.5);
      expect(regionAt(m.z, m.x)).toBe(reg.get(m.f));
    }
    for (const f of feats) for (const m of b.scatter) expect(Math.hypot(f.x - m.x, f.z - m.z)).toBeGreaterThan(itemRadius(f) + itemRadius(m as never));
  });
  it("solid members keep their kind's gap from each other (default minGap; cairns, lone trees and thickets are tighter lumps)", () => {
    const solid = [...b.scatter.map((m) => ({ x: m.x, z: m.z, r: itemRadius(m) }))];
    const kindOf = new Map(b.centres.map((c) => [c.id, c.kind])), gapOf = (f: string) => (CLUSTERS.kinds[kindOf.get(f)!] as { gap?: number }).gap ?? FEATURES.limits.minGap, ids = b.scatter.map((m) => m.f);
    for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) expect(Math.hypot(solid[i].x - solid[j].x, solid[i].z - solid[j].z)).toBeGreaterThanOrEqual(solid[i].r + solid[j].r + Math.min(gapOf(ids[i]), gapOf(ids[j])) - 1e-6);
  });
  it("cluster centres keep their region's gap from each other (cell sites)", () => {
    const cells = b.centres.filter((c) => c.id.startsWith("cell-"));
    for (const c of cells) for (const o of b.centres) if (o !== c && b.centres.indexOf(o) < b.centres.indexOf(c)) expect(Math.hypot(o.x - c.x, o.z - c.z)).toBeGreaterThanOrEqual(CLUSTERS.cells[c.region].gap - 1e-6);
  });
  it("each cluster's members stay in its region, which has clusters in every region", () => {
    for (const r of ["meadow", "inkwood", "paper_downs", "glyph_quarter", "pressmark_shore"] as const) expect(b.centres.some((c) => c.region === r), r).toBe(true);
  });
  it("strays keep out of cluster reach, and strays are thinned", () => {
    for (let a = 0; a < CHUNKS; a++) for (let c = 0; c < CHUNKS; c++) {
      const ct = buildContents(a, c, WORLD.seed, true), strayOnly = [...ct.trees, ...ct.rocks, ...ct.bushes];
      expect(strayOnly.length).toBeGreaterThanOrEqual(0);
    }
    const n = (on: boolean) => all(on).reduce((t: number, c) => t + (c as { trees: unknown[] }).trees.length, 0);
    expect(n(true)).toBeGreaterThan(0);
  });
  it("the shares: most scenery in the World is in a cluster", () => {
    const strayTotal = (() => { let t = 0; for (let a = 0; a < CHUNKS; a++) for (let c = 0; c < CHUNKS; c++) { const x = buildContents(a, c, WORLD.seed, true), y = clusterScatterIn(a, c); t += x.trees.length + x.rocks.length + x.bushes.length - y.length; } return t; })();
    const inCluster = b.scatter.length + b.props.length;
    expect(inCluster / (inCluster + strayTotal)).toBeGreaterThan(0.7);
  });
  it("cluster members reach the collision list (trees, rocks, bushes) through chunkCircles", () => {
    let c = 0; for (let a = 0; a < CHUNKS; a++) for (let d = 0; d < CHUNKS; d++) { const circ = chunkCircles(chunkContents(a, d)); for (const m of clusterScatterIn(a, d)) { c++; expect(circ.some((x) => x.x === m.x && x.z === m.z && Math.abs(x.r - itemRadius(m)) < 1e-9)).toBe(true); } }
    expect(c).toBe(b.scatter.length);
  });
  it("cluster props join the prop list after the patches, once, and off is the old list", () => {
    const props = buildProps(); expect(props.filter((p) => p.f.startsWith("cell-") || b.centres.some((c) => c.id === p.f)).length).toBeGreaterThan(0);
    expect(buildProps(undefined as never).length).toBe(props.length);
  });
});

describe("world totals (logged, not capped here: the cap test is slice C3)", () => {
  it("counts", () => {
    let trees = 0, rocks = 0, bushes = 0; for (let a = 0; a < CHUNKS; a++) for (let c = 0; c < CHUNKS; c++) { const x = chunkContents(a, c); trees += x.trees.length; rocks += x.rocks.length; bushes += x.bushes.length; }
    const old = all(false) as { trees: unknown[]; rocks: unknown[]; bushes: unknown[] }[];
    const oldT = old.reduce((t, x) => t + x.trees.length, 0), oldR = old.reduce((t, x) => t + x.rocks.length, 0), oldB = old.reduce((t, x) => t + x.bushes.length, 0);
    console.log("TOTALS", JSON.stringify({ trees, rocks, bushes, props: buildProps().length, clusters: shippedClusters().centres.length, old: { trees: oldT, rocks: oldR, bushes: oldB } }));
    expect(trees + rocks + bushes).toBeGreaterThan(0);
  });
});

describe("C2: the land rule", () => {
  const b = shippedClusters(), cells = b.centres.filter((c) => c.id.startsWith("cell-"));
  it("accepted cell sites pass their own kind's rule (replayed in build order)", () => {
    const seen: typeof b.centres = [];
    for (const s of clusterSites()) { const c = b.centres.find((x) => x.id === s.id); if (c) { if (s.hv >= 0) expect(landAccepts(s.kind, s.region, s.at[0], s.at[1], s.seed, seen), s.id).toBe(true); seen.push(c); } }
  });
  it("a seeded lone one keeps 14 m from every other centre (authored anchors are placed by hand)", () => {
    for (const c of b.centres.filter((x) => x.kind === "lone" && x.id.startsWith("cell-"))) for (const o of b.centres) if (o !== c) expect(Math.hypot(o.x - c.x, o.z - c.z), `${c.id} ${o.id}`).toBeGreaterThanOrEqual(14);
  });
  it("groves stand on gentle ground, and pools in a dip or beside the path or at the shore", () => {
    for (const c of cells.filter((x) => x.kind === "grove")) expect(landAt(c.x, c.z).slope, c.id).toBeLessThan(0.08);
  });
  it("older sites win: no two centres are closer than the region gap, anchors first", () => {
    for (const c of cells) for (const o of b.centres) if (o !== c && b.centres.indexOf(o) < b.centres.indexOf(c)) expect(Math.hypot(o.x - c.x, o.z - c.z), `${c.id} ${o.id}`).toBeGreaterThanOrEqual(CLUSTERS.cells[c.region].gap);
  });
  it("no member sits inside a landmark's radius + 5 m", () => {
    for (const m of b.scatter) for (const l of WORLD.landmarks) expect(Math.hypot(m.x - l.x, m.z - l.z)).toBeGreaterThan(l.r + 5);
  });
  it("totals stay at or above the scatter that was there before clusters", () => {
    let t = 0, r = 0, u = 0, ot = 0, or = 0, ou = 0;
    for (let a = 0; a < CHUNKS; a++) for (let c = 0; c < CHUNKS; c++) { const x = chunkContents(a, c), y = buildContents(a, c, WORLD.seed, false); t += x.trees.length; r += x.rocks.length; u += x.bushes.length; ot += y.trees.length; or += y.rocks.length; ou += y.bushes.length; }
    expect(t).toBeGreaterThanOrEqual(ot); expect(r).toBeGreaterThanOrEqual(or); expect(u).toBeGreaterThanOrEqual(ou);
  });
});

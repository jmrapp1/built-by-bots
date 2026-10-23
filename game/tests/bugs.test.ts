import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { BUGS, NOTICEIDLE, applyAway, bugConfig, bugHash, bugPreview, createBugSim, dayLevel, insectPose, isWatching, newPose, noticeTick, selectSpots, stepSpot, stepStill, type BugCfg, type BugKind } from "@/lib/bugs";
import { seeded } from "@/lib/fidget";
import { POND } from "@/lib/pond";
import { GARDEN, HOME } from "@/lib/world";
import { WORLD, blocked } from "@/lib/worldMap";
import { buildBugScene } from "@/components/bugScene";

const cfg = bugConfig();
const off: BugCfg = { ...cfg, enabled: false };

describe("bug watching data (S32)", () => {
  it("has every required field with valid ranges", () => {
    expect(typeof BUGS.enabled).toBe("boolean");
    expect(BUGS.stillSeconds).toBeGreaterThan(0);
    expect(BUGS.noticeChance).toBeGreaterThanOrEqual(0); expect(BUGS.noticeChance).toBeLessThanOrEqual(1);
    for (const k of ["driftAwaySpeed", "returnDelaySeconds", "fadeSeconds", "noticeCheckSeconds", "noticeHoldSeconds", "noticeCooldownSeconds", "activationRadius", "maxActiveInsects", "maxPerSpot"] as const) expect(BUGS[k]).toBeGreaterThan(0);
    expect(BUGS.maxActiveInsects).toBeLessThanOrEqual(12);
  });
  it("4 to 6 spots, 2 or 3 in the garden, ids unique, counts 1..maxPerSpot, total within the cap", () => {
    const s = cfg.spots;
    expect(s.length).toBeGreaterThanOrEqual(4); expect(s.length).toBeLessThanOrEqual(6);
    const g = s.filter((q) => q.zone === "garden").length;
    expect(g).toBeGreaterThanOrEqual(2); expect(g).toBeLessThanOrEqual(3);
    expect(s.every((q) => q.zone === "garden" || q.zone === "world")).toBe(true);
    expect(new Set(s.map((q) => q.id)).size).toBe(s.length);
    for (const q of s) { expect(q.count).toBeGreaterThanOrEqual(1); expect(q.count).toBeLessThanOrEqual(BUGS.maxPerSpot); expect(q.radius).toBeGreaterThan(0); expect(Object.keys(BUGS.kinds)).toContain(q.kind); }
    expect(s.reduce((n, q) => n + q.count, 0)).toBeLessThanOrEqual(BUGS.maxActiveInsects);
  });
  it("kinds have the numbers the code reads", () => {
    for (const k of Object.values(BUGS.kinds)) { for (const f of ["size", "wingBeatHz", "wanderRadius", "speed", "height"] as const) expect(k[f]).toBeGreaterThan(0); expect(k.paper).toMatch(/^#[0-9a-f]{6}$/i); expect(k.ink).toMatch(/^#[0-9a-f]{6}$/i); }
  });
  it("garden spots sit inside Home clear of trees, hedges and places; world spots are outside Home and not blocked", () => {
    for (const q of cfg.spots) {
      if (q.zone === "garden") {
        expect(Math.abs(q.x)).toBeLessThan(HOME.half - 1); expect(Math.abs(q.z)).toBeLessThan(HOME.half - 1);
        for (const t of GARDEN.trees) expect(Math.hypot(t.x - q.x, t.z - q.z)).toBeGreaterThan(t.r + 0.5);
        for (const h of GARDEN.hedges) expect(Math.abs(h.x - q.x) > h.w / 2 + 0.5 || Math.abs(h.z - q.z) > h.d / 2 + 0.5).toBe(true);
        for (const p of GARDEN.places) if (!(p.kind === "pond" && q.kind === "dragonfly")) expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeGreaterThan((p.solid ?? 0.5) + 0.5); // a dragonfly hovers over the pond on purpose
        expect(Math.hypot(GARDEN.places.find((p) => p.kind === "gate")!.x - q.x, GARDEN.places.find((p) => p.kind === "gate")!.z - q.z)).toBeGreaterThan(q.radius);
      } else {
        expect(Math.max(Math.abs(q.x), Math.abs(q.z))).toBeGreaterThan(HOME.half + 3); expect(Math.max(Math.abs(q.x), Math.abs(q.z))).toBeLessThan(WORLD.size / 2 - 5);
        expect(blocked(q.x, q.z)).toBe(false);
      }
    }
  });
  it("the World spots are out of reach of the garden spots, so each area loads on its own", () => {
    for (const a of cfg.spots.filter((q) => q.zone === "garden")) for (const b of cfg.spots.filter((q) => q.zone === "world")) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(BUGS.activationRadius);
  });
});

describe("bug watching rules", () => {
  it("day gate: full by day, faded at dusk and dawn, none at night", () => {
    expect(dayLevel(12, BUGS.fadeSeconds)).toBe(1);
    expect(dayLevel(2, BUGS.fadeSeconds)).toBe(0); expect(dayLevel(23, BUGS.fadeSeconds)).toBe(0);
    expect(dayLevel(POND.dayTo, BUGS.fadeSeconds)).toBe(0);
    const mid = dayLevel(POND.dayTo - 0.5 * BUGS.fadeSeconds / 3600, BUGS.fadeSeconds);
    expect(mid).toBeGreaterThan(0.2); expect(mid).toBeLessThan(0.8);
    expect(dayLevel(POND.dayFrom + BUGS.fadeSeconds / 3600 * 2, BUGS.fadeSeconds)).toBe(1);
    expect(dayLevel(3, BUGS.fadeSeconds, true)).toBe(1);
  });
  it("still detector: input resets it; watching needs stillSeconds and the spot radius", () => {
    let s = 0; for (let i = 0; i < 30; i++) s = stepStill(s, 0.1, false);
    expect(s).toBeCloseTo(3);
    expect(stepStill(s, 0.1, true)).toBe(0);
    const sp = cfg.spots[0];
    expect(isWatching(BUGS.stillSeconds, 1, sp, cfg)).toBe(true);
    expect(isWatching(BUGS.stillSeconds - 0.1, 1, sp, cfg)).toBe(false);
    expect(isWatching(99, sp.radius + 1, sp, cfg)).toBe(false);
  });
  it("activation radius: only spots within it are chosen, nearest first; none outside the garden zone", () => {
    const a = cfg.spots.find((q) => q.zone === "garden")!;
    const sel = selectSpots({ x: a.x, z: a.z }, true, cfg);
    expect(sel.length).toBeGreaterThan(0);
    for (const q of sel) expect(Math.hypot(cfg.spots[q.idx].x - a.x, cfg.spots[q.idx].z - a.z)).toBeLessThanOrEqual(cfg.activationRadius);
    expect(selectSpots({ x: a.x, z: a.z }, false, cfg)).toEqual([]);
    expect(selectSpots({ x: 0, z: 0 }, true, { ...cfg, activationRadius: 1 })).toEqual([]);
    expect(selectSpots({ x: 120, z: 120 }, true, cfg)).toEqual([]);
  });
  it("cap: total insects never exceed maxActiveInsects, and each spot maxPerSpot", () => {
    const many: BugCfg = { ...cfg, maxActiveInsects: 4, activationRadius: 500, spots: cfg.spots.map((s) => ({ ...s, count: 3 })) };
    const sel = selectSpots({ x: 0, z: 0 }, true, many);
    expect(sel.reduce((n, q) => n + q.count, 0)).toBe(4);
    for (const q of sel) expect(q.count).toBeLessThanOrEqual(many.maxPerSpot);
    const pv = bugConfig("1");
    expect(selectSpots({ x: 0, z: 0 }, true, pv).reduce((n, q) => n + q.count, 0)).toBeLessThanOrEqual(pv.maxActiveInsects);
  });
  it("calm: moving inside drifts away slowly and capped; stopping brings them back after the delay", () => {
    const s = { away: 0, quiet: 0, watch: 0 };
    for (let i = 0; i < 20; i++) stepSpot(s, 0.1, true, true, false, cfg);
    expect(s.away).toBeCloseTo(cfg.driftAwaySpeed * 2); // 0.6 m/s, no snap
    for (let i = 0; i < 1000; i++) stepSpot(s, 0.1, true, true, false, cfg);
    expect(s.away).toBe(cfg.awayMax);
    for (let i = 0; i < (cfg.returnDelaySeconds - 0.2) * 10; i++) stepSpot(s, 0.1, true, false, false, cfg);
    expect(s.away).toBe(cfg.awayMax); // still waiting
    for (let i = 0; i < 400; i++) stepSpot(s, 0.1, true, false, false, cfg);
    expect(s.away).toBe(0);
  });
  it("watching eases in after a still player and out again on movement; not while still drifting", () => {
    const s = { away: 0, quiet: 0, watch: 0 };
    for (let i = 0; i < 5; i++) stepSpot(s, 0.1, true, false, true, cfg);
    expect(s.watch).toBeGreaterThan(0); expect(s.watch).toBeLessThan(1);
    for (let i = 0; i < 30; i++) stepSpot(s, 0.1, true, false, true, cfg);
    expect(s.watch).toBe(1);
    stepSpot(s, 0.1, true, true, false, cfg);
    expect(s.watch).toBeLessThan(1);
    const d = { away: 2, quiet: 0, watch: 0 };
    for (let i = 0; i < 30; i++) stepSpot(d, 0.01, true, false, true, cfg);
    expect(d.watch).toBe(0);
  });
  it("the sim: night means no level, a still player starts watching, movement resets it", () => {
    const a = cfg.spots[0], sim = createBugSim(cfg)!;
    sim.step(0.1, { x: a.x, z: a.z }, true, false, 2);
    expect(sim.level).toBe(0); expect(sim.spotAt(a.x, a.z)).toBe(-1);
    for (let i = 0; i < 100; i++) sim.step(0.1, { x: a.x, z: a.z }, true, false, 12);
    expect(sim.level).toBe(1); expect(sim.spotAt(a.x, a.z)).toBe(0); expect(sim.spots[0].watch).toBe(1);
    sim.step(0.1, { x: a.x, z: a.z }, true, true, 12);
    expect(sim.still).toBe(0);
    sim.step(0.1, { x: a.x, z: a.z }, false, false, 12);
    expect(sim.active).toEqual([]);
  });
});

describe("the Print's glance", () => {
  const run = (cfgN: BugCfg, ok: (t: number) => boolean, seconds: number, seed = 1) => {
    const roll = seeded(seed); let s = NOTICEIDLE; const starts: number[] = []; let was = false;
    for (let t = 0; t < seconds; t += 0.25) { const r = noticeTick(s, t, ok(t), roll, cfgN); s = r.state; if (r.active && !was) starts.push(t); was = r.active; }
    return starts;
  };
  const sure: BugCfg = { ...cfg, noticeChance: 1 };
  it("holds about noticeHoldSeconds then stops, and does not repeat inside the cooldown", () => {
    const starts = run(sure, () => true, 600);
    expect(starts.length).toBeGreaterThan(2);
    for (let i = 1; i < starts.length; i++) expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(cfg.noticeHoldSeconds + cfg.noticeCooldownSeconds - 0.01);
    let s = NOTICEIDLE; const roll = seeded(3); let on = 0;
    for (let t = 0; t < 30; t += 0.25) { const r = noticeTick(s, t, true, roll, sure); s = r.state; if (r.active) on += 0.25; }
    expect(on).toBeCloseTo(cfg.noticeHoldSeconds, 0);
  });
  it("never fires while the Print is busy (feeding, Come along, ...) and a glance in progress ends at once", () => {
    expect(run(sure, () => false, 600)).toEqual([]);
    const roll = seeded(5); let s = NOTICEIDLE, active = false;
    for (let t = 0; t < 10 && !active; t += 0.25) { const r = noticeTick(s, t, true, roll, sure); s = r.state; active = r.active; }
    expect(active).toBe(true);
    const r = noticeTick(s, 20 > s.until ? s.until - 1 : 0, false, roll, sure);
    expect(r.active).toBe(false);
  });
  it("the check runs on a timer, not every call, and the chance is respected", () => {
    let rolls = 0; const roll = () => { rolls++; return 0.99; };
    let s = NOTICEIDLE;
    for (let t = 0; t < 60; t += 1 / 60) s = noticeTick(s, t, true, roll, cfg).state;
    expect(rolls).toBeLessThanOrEqual(60 / cfg.noticeCheckSeconds + 1);
    expect(run({ ...cfg, noticeChance: 0 }, () => true, 600)).toEqual([]);
  });
  it("is deterministic for a seed", () => expect(run(cfg, () => true, 900, 9)).toEqual(run(cfg, () => true, 900, 9)));
});

describe("insect motion and look", () => {
  const kinds = Object.keys(BUGS.kinds) as BugKind[];
  it("pure and bounded near the spot; watching settles them closer", () => {
    for (const kind of kinds) for (const reduced of [false, true]) for (let t = 0; t < 600; t += 7.3) {
      const a = insectPose(newPose(), kind, { x: 10, z: 10 }, 2, 1, t, 0, reduced, cfg), b = insectPose(newPose(), kind, { x: 10, z: 10 }, 2, 1, t, 0, reduced, cfg);
      expect(a).toEqual(b);
      expect(Math.hypot(a.x - 10, a.z - 10)).toBeLessThanOrEqual(cfg.kinds[kind].wanderRadius * 1.01);
      expect(a.y).toBeGreaterThanOrEqual(0); expect(a.open).toBeGreaterThanOrEqual(0); expect(a.open).toBeLessThanOrEqual(1);
      const w = insectPose(newPose(), kind, { x: 10, z: 10 }, 2, 1, t, 1, reduced, cfg);
      if (!reduced) expect(Math.hypot(w.x - 10, w.z - 10)).toBeLessThanOrEqual(Math.hypot(a.x - 10, a.z - 10) + 0.5);
    }
  });
  it("reduced motion: wings do not flap, and motion is hops between anchors (long stillness between moves)", () => {
    const opens = new Set<number>();
    for (let t = 0; t < 120; t += 0.5) opens.add(insectPose(newPose(), "flutterer", { x: 0, z: 0 }, 0, 0, t, 0, true, cfg).open);
    expect(opens.size).toBe(1);
    const flap = new Set<number>();
    for (let t = 0; t < 5; t += 0.0137) flap.add(+insectPose(newPose(), "flutterer", { x: 0, z: 0 }, 0, 0, t, 0, false, cfg).open.toFixed(3));
    expect(flap.size).toBeGreaterThan(10);
    let still = 0, total = 0;
    let prev = insectPose(newPose(), "dragonfly", { x: 0, z: 0 }, 0, 0, 0, 0, true, cfg);
    for (let t = 0.1; t < 100; t += 0.1) { const p = insectPose(newPose(), "dragonfly", { x: 0, z: 0 }, 0, 0, t, 0, true, cfg); total++; if (Math.hypot(p.x - prev.x, p.z - prev.z) < 1e-9) still++; prev = p; }
    expect(still / total).toBeGreaterThan(0.6);
  });
  it("the hash and poses are deterministic and never use chance", () => {
    expect(bugHash(5)).toBe(bugHash(5));
    const src = readFileSync("lib/bugs.ts", "utf8") + readFileSync("components/bugScene.ts", "utf8");
    expect(src).not.toMatch(/Math\.random/);
  });
  it("away push is straight from the player and zero when away is 0", () => {
    const p = { ...newPose(), x: 5, z: 0 }; applyAway(p, { x: 0, z: 0 }, 0); expect(p.x).toBe(5);
    applyAway(p, { x: 0, z: 0 }, 2); expect(p.x).toBeCloseTo(7); expect(p.z).toBeCloseTo(0);
  });
});

describe("kill switch, preview and the scene", () => {
  it("enabled false: no sim at all", () => expect(createBugSim(off)).toBeNull());
  it("the scene is small: at most 9 draw calls, no transparency, nothing raycasts, and it frees what it made", () => {
    const sc = buildBugScene(cfg);
    const meshes: any[] = []; sc.group.traverse((o: any) => { if (o.isMesh) meshes.push(o); });
    expect(meshes.length).toBeLessThanOrEqual(9); expect(meshes.length).toBeGreaterThan(0);
    for (const m of meshes) { expect(m.material.transparent).toBe(false); expect(m.geometry.attributes.position.count).toBeLessThan(60); }
    const sim = createBugSim(cfg)!;
    for (let i = 0; i < 40; i++) sim.step(0.1, { x: cfg.spots[0].x, z: cfg.spots[0].z }, true, false, 12);
    sc.update(sim, 1, false, { x: cfg.spots[0].x, z: cfg.spots[0].z }, () => 0);
    expect(sc.group.visible).toBe(true);
    sim.step(0.1, { x: 0, z: 0 }, true, false, 2);
    sc.update(sim, 1, false, { x: 0, z: 0 }, () => 0);
    expect(sc.group.visible).toBe(false);
    sc.dispose();
  });
  it("preview: only outside production; 1 and reduced; forces day, wide radius, short still-time, sure glance", () => {
    expect(bugPreview("?bugpreview=1", true)).toBeNull(); expect(bugPreview("?bugpreview=reduced", true)).toBeNull();
    expect(bugPreview("?bugpreview=1", false)).toBe("1"); expect(bugPreview("?bugpreview=reduced", false)).toBe("reduced"); expect(bugPreview("?bugpreview=2", false)).toBeNull(); expect(bugPreview("", false)).toBeNull();
    const p = bugConfig("1");
    expect(p.forceDay).toBe(true); expect(p.activationRadius).toBe(200); expect(p.stillSeconds).toBe(0.5); expect(p.noticeChance).toBe(1);
    expect(bugConfig(null).forceDay).toBe(false);
    expect(dayLevel(2, 20, p.forceDay)).toBe(1);
  });
  it("source guards: no network, no Supabase, no env beyond the NODE_ENV the page passes in", () => {
    for (const f of ["lib/bugs.ts", "components/bugScene.ts"]) { const s = readFileSync(f, "utf8"); expect(s).not.toMatch(/fetch\(|supabase|XMLHttp|localStorage|process\.env/i); }
    const w = readFileSync("components/World.tsx", "utf8");
    expect(w).toContain('bugPreview(window.location.search, process.env.NODE_ENV === "production")');
  });
});

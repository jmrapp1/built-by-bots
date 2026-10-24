// S36 step 2: saving where the player and Prints stand. Pure logic and wiring text; the feel (no jump, the cover, Print placement) needs a human in a browser.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import raw from "@/data/playerState.json";
import {
  PS, PS_ENABLED, fromRows, restoreFrom, restorePlayer, restorePrints, restoreWander, restoreZone, isEnabled, isStale, fallbackSpot, mirrorKey, nosaveOverride, parseMirror, pickSource, printSpot, printsPayload, savePayload,
  serializeMirror, shouldSave, toLocal, toScene, validateState, type Ladder, type Offsets, type Saved, type Snap,
} from "@/lib/playerState";
import { createSaver, keepaliveRequest, loadStart } from "@/lib/playerStateClient";
import { OFF } from "@/components/marginsScene";
import { ROOM_OFF, HOME_ROOM, roomColliders } from "@/lib/home";
import { READING, READING_OFF, roomColliders as readingCols, doorArrival as readingArrival, doorYaw as readingYaw } from "@/lib/reading";
import { MARGINS } from "@/lib/margins";
import { GARDEN, colliders, insideAny } from "@/lib/world";
import { WORLD } from "@/lib/worldMap";

const src = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
const ID = "11111111-1111-4111-8111-111111111111", ID2 = "22222222-2222-4222-8222-222222222222";
const OFFS: Offsets = { garden: 0, margins: OFF, home: ROOM_OFF, reading: READING_OFF };
const snap = (o: Partial<Snap> = {}): Snap => ({ zone: "garden", x: 3, z: 4, heading: 1, yaw: 0.5, prints: [{ id: ID, x: 1, z: 2, h: 0.3, m: "wander" }], ...o });
const NOW = 1_800_000_000_000;

describe("data and kill switch", () => {
  it("matches the migration and the spec", () => {
    expect(PS.bound).toBe(140); expect(PS.maxPrints).toBe(24); expect(PS.zones).toEqual(["garden", "margins", "home", "reading"]);
    expect(PS.serverMinGapS).toBe(5); expect(PS.saveEveryS).toBeGreaterThanOrEqual(PS.serverMinGapS);
    const sql = src("../supabase/migrations/20261023000001_player_state.sql");
    expect(sql).toContain("abs(x) <= 140"); expect(sql).toMatch(/v_max_prints[^;]*24/);
  });
  it("only a plain true is on", () => {
    expect(isEnabled(raw)).toBe(true); expect(PS_ENABLED).toBe(true);
    for (const v of [undefined, null, "true", 1, {}, { playerState: {} }, { playerState: { enabled: "yes" } }]) expect(isEnabled(v)).toBe(false);
  });
  it("?nosave=1 is dev only", () => { expect(nosaveOverride("?nosave=1", false)).toBe(true); expect(nosaveOverride("?nosave=1", true)).toBe(false); expect(nosaveOverride("?x=1", false)).toBe(false); });
});

describe("zone frames round trip", () => {
  it("each zone converts to its own frame and back", () => {
    for (const z of ["garden", "margins", "home", "reading"] as const) {
      const scene = { x: OFFS[z] + 3.25, z: -4.5 };
      const l = toLocal(z, scene, OFFS);
      expect(l).toEqual({ x: 3.25, z: -4.5 });
      expect(toScene(z, l, OFFS)).toEqual(scene);
      expect(Math.abs(l.x)).toBeLessThan(PS.bound); // a saved number is never a far-away scene number
    }
  });
  it("offsets are the ones World.tsx uses", () => {
    expect(OFFS).toEqual({ garden: 0, margins: 400, home: 800, reading: 1200 });
    const w = src("../components/World.tsx");
    expect(w).toContain("margins: OFF, home: ROOM_OFF, reading: READING_OFF");
  });
  it("a scene position far along x is inside the server bound once local", () => {
    for (const z of ["margins", "home", "reading"] as const) expect(Math.abs(toLocal(z, { x: OFFS[z] + 5, z: 0 }, OFFS).x)).toBeLessThanOrEqual(PS.bound);
  });
});

describe("validateState", () => {
  it("accepts a good record and drops bad Prints without losing the player", () => {
    const v = validateState({ ...snap(), prints: [snap().prints[0], { id: "nope", x: 0, z: 0, h: 0, m: "rest" }, { id: ID2, x: 1, z: 1, h: 0, m: "fly" }, { id: ID2, x: NaN, z: 1, h: 0, m: "rest" }] });
    expect(v?.prints.map((p) => p.id)).toEqual([ID]);
  });
  it("rejects NaN, infinity, out of bound, unknown zone, wrong types", () => {
    for (const bad of [{ x: NaN }, { x: Infinity }, { z: -Infinity }, { x: 141 }, { z: 1e9 }, { heading: 33 }, { yaw: NaN }, { zone: "moon" }, { zone: 3 }, { x: "3" }]) expect(validateState({ ...snap(), ...bad })).toBeNull();
    for (const bad of [null, undefined, 5, "x", []]) expect(validateState(bad)).toBeNull();
  });
  it("caps Prints and drops duplicates", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, x: 0, z: 0, h: 0, m: "rest" }));
    expect(validateState({ ...snap(), prints: many })!.prints.length).toBe(PS.maxPrints);
    expect(validateState({ ...snap(), prints: [snap().prints[0], snap().prints[0]] })!.prints.length).toBe(1);
  });
  it("reads server rows", () => {
    const s = fromRows({ zone: "margins", x: 1, z: 2, heading: 0, yaw: 1, updated_at: new Date(NOW).toISOString() }, [{ creature_id: ID, x: 1, z: 1, heading: 0, mode: "rest" }]);
    expect(s?.zone).toBe("margins"); expect(s?.prints[0]).toEqual({ id: ID, x: 1, z: 1, h: 0, m: "rest" }); expect(s?.at).toBe(NOW);
    expect(fromRows(null, [])).toBeNull(); expect(fromRows({ zone: "garden", x: 1, z: 2, heading: 0, yaw: 1, updated_at: "garbage" }, [])).toBeNull();
    expect(fromRows({ zone: "garden", x: NaN, z: 2, heading: 0, yaw: 1, updated_at: new Date(NOW).toISOString() }, [])).toBeNull();
  });
});

describe("browser copy and source", () => {
  const saved: Saved = { ...snap(), at: NOW - 1000 };
  it("round trips and survives corrupt text", () => {
    expect(parseMirror(serializeMirror(saved))).toEqual(saved);
    for (const t of [null, undefined, "", "{", "[]", '{"v":2}', '{"v":1,"at":"x","s":{}}', "x".repeat(9000), JSON.stringify({ v: 1, at: NOW, s: { ...snap(), x: NaN } })]) expect(parseMirror(t)).toBeNull();
  });
  it("is per user", () => { expect(mirrorKey("a")).not.toBe(mirrorKey("b")); expect(mirrorKey("a")).toContain("a"); });
  it("mirror first, server only if there is none; stale and corrupt count as missing", () => {
    const server: Saved = { ...snap({ zone: "home" }), at: NOW - 5000 };
    expect(pickSource(saved, server, NOW)?.from).toBe("mirror");
    expect(pickSource(null, server, NOW)?.from).toBe("server");
    expect(pickSource({ ...saved, at: NOW - 31 * 86_400_000 }, server, NOW)?.from).toBe("server");
    expect(pickSource({ ...saved, at: NOW - 31 * 86_400_000 }, { ...server, at: NOW - 40 * 86_400_000 }, NOW)).toBeNull();
    expect(pickSource(null, null, NOW)).toBeNull();
    expect(isStale(NOW + 10 * 86_400_000, NOW)).toBe(true); // a clock far in the future is not trusted
  });
});

describe("loadStart", () => {
  const store = (init: Record<string, string> = {}) => { const m = new Map(Object.entries(init)); return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v) }; };
  it("kill switch or no user: nothing is read", async () => {
    const f = vi.fn();
    expect(await loadStart({ enabled: false, userId: "u", store: store(), now: NOW, fetchServer: f })).toBeNull();
    expect(await loadStart({ enabled: true, userId: null, store: store(), now: NOW, fetchServer: f })).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
  it("a browser copy needs no network", async () => {
    const f = vi.fn();
    const r = await loadStart({ enabled: true, userId: "u", store: store({ [mirrorKey("u")]: serializeMirror({ ...snap(), at: NOW }) }), now: NOW, fetchServer: f });
    expect(r?.from).toBe("mirror"); expect(f).not.toHaveBeenCalled();
  });
  it("another account never sees this one's copy", async () => {
    const r = await loadStart({ enabled: true, userId: "v", store: store({ [mirrorKey("u")]: serializeMirror({ ...snap(), at: NOW }) }), now: NOW, fetchServer: async () => null });
    expect(r).toBeNull();
  });
  it("a fresh device uses the server rows; a failed or slow fetch starts as today", async () => {
    const row = { player: { zone: "home", x: 1, z: 1, heading: 0, yaw: 0, updated_at: new Date(NOW).toISOString() }, prints: [] };
    expect((await loadStart({ enabled: true, userId: "u", store: store(), now: NOW, fetchServer: async () => row }))?.state.zone).toBe("home");
    expect(await loadStart({ enabled: true, userId: "u", store: store(), now: NOW, fetchServer: async () => { throw new Error("offline"); } })).toBeNull();
    expect(await loadStart({ enabled: true, userId: "u", store: store(), now: NOW, giveUpMs: 20, fetchServer: () => new Promise((r) => setTimeout(() => r(row), 200)) })).toBeNull();
  });
  it("a corrupt copy falls back to the server", async () => {
    const row = { player: { zone: "margins", x: 1, z: 1, heading: 0, yaw: 0, updated_at: new Date(NOW).toISOString() }, prints: [] };
    expect((await loadStart({ enabled: true, userId: "u", store: store({ [mirrorKey("u")]: "{oops" }), now: NOW, fetchServer: async () => row }))?.from).toBe("server");
  });
});

// The safety ladder, per zone, with the real colliders.
const ladder = (reading = true): Ladder => ({
  reading, radius: GARDEN.player.radius,
  zones: {
    garden: { halfW: WORLD.size / 2, halfD: WORLD.size / 2, cols: () => colliders(), spawn: { x: GARDEN.player.start[0], z: GARDEN.player.start[1] }, spawnYaw: 0 },
    margins: { halfW: MARGINS.size / 2, halfD: MARGINS.size / 2, cols: () => ({ circles: [], boxes: [] }), spawn: { x: 0, z: 0 }, spawnYaw: 1 },
    home: { halfW: HOME_ROOM.room.width / 2, halfD: HOME_ROOM.room.depth / 2 + 0.6, cols: () => roomColliders(), spawn: { x: 0, z: 2 }, spawnYaw: 2 },
    reading: { halfW: READING.room.width / 2, halfD: READING.room.depth / 2 + 0.6, cols: () => readingCols(), spawn: { x: readingArrival("reading")[1].x, z: readingArrival("reading")[1].z }, spawnYaw: readingYaw("reading") },
  },
});
describe("fallbackSpot", () => {
  it("keeps a good spot in every zone", () => {
    const L = ladder();
    for (const [zone, x, z] of [["garden", 5, 12], ["margins", 1, 1], ["home", 0, 0.5], ["reading", 0, 0]] as const) {
      const r = fallbackSpot({ zone, x, z, heading: 1, yaw: 2 }, L);
      expect(r.zone).toBe(zone);
      if (!insideAny({ x, z }, L.radius, L.zones[zone].cols())) { expect(r).toMatchObject({ x, z, yaw: 2, moved: false }); }
    }
  });
  it("a point outside the bounds is clamped inside", () => {
    const L = ladder();
    for (const zone of ["margins", "home", "reading"] as const) {
      const r = fallbackSpot({ zone, x: 100, z: -100, heading: 0, yaw: 0 }, L), i = L.zones[zone];
      expect(Math.abs(r.x)).toBeLessThanOrEqual(i.halfW); expect(Math.abs(r.z)).toBeLessThanOrEqual(i.halfD);
      expect(insideAny(r, L.radius * 0.9, i.cols())).toBe(false);
    }
  });
  it("a point inside a collider ends somewhere free, in every zone", () => {
    const L = ladder();
    for (const zone of ["garden", "home", "reading"] as const) {
      const c = L.zones[zone].cols();
      const target = c.circles[0] ? { x: c.circles[0].x, z: c.circles[0].z } : { x: c.boxes[0].x, z: c.boxes[0].z };
      const r = fallbackSpot({ zone, ...target, heading: 0, yaw: 0 }, L);
      expect(insideAny(r, L.radius * 0.9, c)).toBe(false);
    }
  });
  it("a closed Reading Room sends you to the Margins arrival", () => {
    const r = fallbackSpot({ zone: "reading", x: 1, z: 1, heading: 0, yaw: 0 }, ladder(false));
    expect(r.zone).toBe("margins"); expect(r).toMatchObject({ x: 0, z: 0, yaw: 1, moved: true });
  });
  it("a Print point is clamped to Home and pushed out of colliders", () => {
    const cols = colliders();
    const far = printSpot({ x: 99, z: 99 }, cols, GARDEN.print.radius)!;
    expect(Math.abs(far.x)).toBeLessThanOrEqual(GARDEN.size / 2); expect(Math.abs(far.z)).toBeLessThanOrEqual(GARDEN.size / 2);
    const t = GARDEN.trees[0], p = printSpot({ x: t.x, z: t.z }, cols, GARDEN.print.radius);
    if (p) expect(insideAny(p, GARDEN.print.radius * 0.9, cols)).toBe(false);
  });
});

describe("shouldSave", () => {
  const base = { enabled: true, travelling: false, hidden: false, trigger: "timer" as const, now: NOW, lastAt: NOW - 20_000, last: snap(), cur: snap() };
  it("a still player makes no call, even with Prints wandering", () => {
    expect(shouldSave(base)).toBe(false);
    expect(shouldSave({ ...base, cur: snap({ prints: [{ id: ID, x: 9, z: 9, h: 2, m: "rest" }] }) })).toBe(false);
  });
  it("moving past the threshold saves, once the interval has passed", () => {
    expect(shouldSave({ ...base, cur: snap({ x: 3 + PS.minMoveM + 0.1 }) })).toBe(true);
    expect(shouldSave({ ...base, cur: snap({ x: 3 + PS.minMoveM - 0.1 }) })).toBe(false);
    expect(shouldSave({ ...base, lastAt: NOW - 1000, cur: snap({ x: 30 }) })).toBe(false);
  });
  it("never while travelling, hidden (timer), off, or before a baseline", () => {
    const moved = snap({ x: 30 });
    expect(shouldSave({ ...base, cur: moved, travelling: true })).toBe(false);
    expect(shouldSave({ ...base, cur: moved, hidden: true })).toBe(false);
    expect(shouldSave({ ...base, cur: moved, enabled: false })).toBe(false);
    expect(shouldSave({ ...base, cur: moved, last: null })).toBe(false);
  });
  it("a zone change saves at once; leaving saves anything different but not nothing", () => {
    expect(shouldSave({ ...base, trigger: "zone", lastAt: NOW, cur: snap({ zone: "margins" }) })).toBe(true);
    expect(shouldSave({ ...base, trigger: "zone", cur: snap() })).toBe(false);
    expect(shouldSave({ ...base, trigger: "hide", hidden: true, cur: snap({ yaw: 2 }) })).toBe(true);
    expect(shouldSave({ ...base, trigger: "hide", hidden: true, cur: snap() })).toBe(false);
    expect(shouldSave({ ...base, trigger: "signout", cur: snap({ prints: [{ id: ID, x: 1, z: 2, h: 0.3, m: "rest" }] }) })).toBe(true);
  });
});

describe("payload", () => {
  it("only own Prints, once each, capped, finite, small angles", () => {
    const p = printsPayload([{ id: ID, x: 1.23456, z: 2, h: 7, m: "rest" }, { id: ID2, x: 0, z: 0, h: 0, m: "rest" }, { id: ID, x: 5, z: 5, h: 0, m: "rest" }, { id: ID, x: NaN, z: 0, h: 0, m: "rest" }], [ID]);
    expect(p).toHaveLength(1); expect(p[0].x).toBe(1.235); expect(Math.abs(p[0].h)).toBeLessThanOrEqual(Math.PI);
    const ids = Array.from({ length: 40 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    expect(printsPayload(ids.map((id) => ({ id, x: 0, z: 0, h: 0, m: "wander" as const })), ids)).toHaveLength(PS.maxPrints);
  });
  it("matches save_state's argument names and stays small", () => {
    const a = savePayload(snap({ heading: 100, yaw: -100 }), [ID]);
    expect(Object.keys(a).sort()).toEqual(["p_heading", "p_prints", "p_x", "p_yaw", "p_z", "p_zone"]);
    expect(Math.abs(a.p_heading)).toBeLessThanOrEqual(Math.PI);
    const sql = src("../supabase/migrations/20261023000001_player_state.sql");
    for (const k of Object.keys(a)) expect(sql).toContain(k);
    expect(JSON.stringify(a).length).toBeLessThan(2000);
  });
});

describe("saver", () => {
  const mem = () => { const m = new Map<string, string>(); return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v), m }; };
  const make = (over: Partial<Parameters<typeof createSaver>[0]> = {}) => {
    let now = NOW; const store = mem(), send = vi.fn(async () => "saved" as const), kv = vi.fn(() => true);
    const s = createSaver({ enabled: true, userId: "u", store, now: () => now, ownIds: () => [ID], send, sendKeepalive: kv, ...over });
    return { s, store, send, kv, adv: (ms: number) => { now += ms; } };
  };
  it("a still player makes no call, however long they stand", async () => {
    const t = make();
    t.s.report(snap(), false);
    for (let i = 0; i < 50; i++) { t.adv(13_000); t.s.report(snap(), false); t.s.tick(false); }
    expect(t.send).not.toHaveBeenCalled();
  });
  it("walking saves on the timer, not more than once per interval", async () => {
    const t = make();
    t.s.report(snap(), false);
    t.adv(13_000); t.s.report(snap({ x: 10 }), false); t.s.tick(false); await Promise.resolve();
    expect(t.send).toHaveBeenCalledTimes(1);
    t.s.report(snap({ x: 20 }), false); t.adv(2_000); t.s.tick(false);
    expect(t.send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(t.store.m.get(mirrorKey("u"))!).s.x).toBe(10);
  });
  it("a failed save is quiet, stays dirty and retries once on the next due tick", async () => {
    const send = vi.fn(async () => "failed" as const), t = make({ send });
    t.s.report(snap(), false);
    t.adv(13_000); t.s.report(snap({ x: 10 }), false); t.s.tick(false); await new Promise((r) => setTimeout(r, 0));
    t.s.tick(false); expect(send).toHaveBeenCalledTimes(1); // not due again yet
    t.adv(13_000); t.s.tick(false); await new Promise((r) => setTimeout(r, 0));
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("a throwing send is swallowed", async () => {
    const t = make({ send: vi.fn(async () => { throw new Error("offline"); }) });
    t.s.report(snap(), false); t.adv(13_000); t.s.report(snap({ x: 10 }), false);
    expect(() => t.s.tick(false)).not.toThrow(); await new Promise((r) => setTimeout(r, 0));
  });
  it("a zone change saves once, never while travelling; walk reports are ignored", async () => {
    const t = make();
    t.s.report(snap(), false);
    t.s.report(snap({ zone: "margins", x: 400 }), true); await Promise.resolve();
    expect(t.send).not.toHaveBeenCalled();
    t.s.report(snap({ zone: "margins", x: 1 }), false); await Promise.resolve();
    expect(t.send).toHaveBeenCalledTimes(1);
    expect((t.send.mock.calls[0] as unknown as [{ p_zone: string }])[0].p_zone).toBe("margins");
  });
  it("leaving writes the browser copy and one keepalive call, only if something differs", () => {
    const t = make();
    t.s.report(snap(), false); t.s.leave();
    expect(t.kv).not.toHaveBeenCalled();
    t.s.report(snap({ x: 8 }), false); t.s.leave();
    expect(t.kv).toHaveBeenCalledTimes(1); expect(JSON.parse(t.store.m.get(mirrorKey("u"))!).s.x).toBe(8);
  });
  it("if keepalive is not available only the browser copy is written", () => {
    const t = make({ sendKeepalive: () => false });
    t.s.report(snap(), false); t.s.report(snap({ x: 8 }), false);
    expect(() => t.s.leave()).not.toThrow(); expect(t.store.m.size).toBe(1);
  });
  it("sign-out waits at most the cap", async () => {
    const t = make({ send: () => new Promise(() => undefined) });
    t.s.report(snap(), false); t.s.report(snap({ x: 8 }), false);
    const t0 = Date.now(); await t.s.flush(30); expect(Date.now() - t0).toBeLessThan(500);
  });
  it("the kill switch means no writes at all", async () => {
    const t = make({ enabled: false });
    t.s.report(snap(), false); t.adv(13_000); t.s.report(snap({ x: 10 }), false); t.s.tick(false); t.s.leave(); await t.s.flush(10);
    expect(t.send).not.toHaveBeenCalled(); expect(t.kv).not.toHaveBeenCalled(); expect(t.store.m.size).toBe(0);
  });
  it("a late server answer after the first frame changes nothing: the start is fixed once settled", async () => {
    const row = { player: { zone: "home", x: 1, z: 1, heading: 0, yaw: 0, updated_at: new Date(NOW).toISOString() }, prints: [] };
    const first = await loadStart({ enabled: true, userId: "u", store: mem(), now: NOW, giveUpMs: 10, fetchServer: () => new Promise((r) => setTimeout(() => r(row), 100)) });
    expect(first).toBeNull();
    await new Promise((r) => setTimeout(r, 150)); // the answer lands; nothing was waiting for it
    expect(first).toBeNull();
  });
});

describe("wiring", () => {
  const ps = ["../lib/playerState.ts", "../lib/playerStateClient.ts"].map(src).join("\n");
  it("no randomness, no new network host, no secret", () => {
    expect(ps).not.toContain("Math.random");
    expect(ps).not.toMatch(/https?:\/\//);
    expect(ps).not.toMatch(/service_role|SERVICE/i);
  });
  it("page.tsx: kill switch gate, the two selects, the one rpc, listeners, sign-out save", () => {
    const p = src("../lib/usePlayerState.ts");
    expect(p).toContain("PS_ENABLED"); expect(p).toContain('.from("player_state")'); expect(p).toContain('.from("print_state")'); expect(p).toContain('rpc("save_state"');
    expect(p).toContain('"pagehide"'); expect(p).toContain("visibilitychange"); expect(p).toContain("flush(PS.signOutCapMs)");
    expect(src("../app/page.tsx")).toContain("reportState={saveOn ? reportState : undefined}");
    expect(src("../app/page.tsx")).toContain("await flush(); await supabase().auth.signOut()");
    expect(p).not.toMatch(/\.from\("(player_state|print_state)"\)\.(insert|update|upsert|delete)/);
  });
  it("World reports, and restores once at boot behind the kill switch", () => {
    const w = src("../components/World.tsx");
    expect(w).toContain("cb.current.reportState"); expect(w).toMatch(/if \(cb\.current\.reportState && t - stateAt > 250\)/);
    expect(w).toContain("restoreFrom(PS_ENABLED, initialState, devStart)"); // read once, in the mount effect: a later answer never moves anything
    expect(w).toMatch(/\}, \[\]\);\n\n  return <div ref=\{mount\}/);
    expect(w).toContain("zones.enterZone(r.zone)"); // the one enter path; no startTravel, so no door or gate walk
    const boot = w.slice(w.indexOf("if (restore) {\n      try {"), w.indexOf("const atWorld ="));
    expect(boot).not.toContain("startTravel");
    expect(w).toContain("restorePrints(restore.prints");
    expect(w).not.toMatch(/useEffect\([^)]*initialState/); // no effect watches it
  });
});

// Restore at boot (spec sections 3, 5, 6): the zone-frame round trip for all four zones, the kill switch, no record, and the Print rules.
describe("restore", () => {
  const L = ladder();
  const ZS = ["garden", "margins", "home", "reading"] as const;
  it("a good spot in each zone comes back as the same scene spot (frame round trip)", () => {
    for (const [zone, x, z] of [["garden", 5, 12], ["margins", 1, 1], ["home", 0, 0.5], ["reading", 0, 0]] as const) {
      const scene = toScene(zone, { x, z }, OFFS), saved = toLocal(zone, scene, OFFS);
      const r = restorePlayer({ zone, x: saved.x, z: saved.z, heading: 1.2, yaw: 2.5 }, L, OFFS);
      expect(r.zone).toBe(zone); expect(r.heading).toBe(1.2); expect(r.yaw).toBe(2.5);
      expect(r.x).toBeCloseTo(scene.x, 9); expect(r.z).toBeCloseTo(scene.z, 9);
      expect(r.x - OFFS[zone]).toBeCloseTo(x, 9); // the scene x is the zone offset plus the local x
    }
  });
  it("every zone and every saved point ends in a free spot of its own zone", () => {
    for (const zone of ZS) {
      const i = L.zones[zone];
      for (const [x, z] of [[0, 0], [100, 100], [-100, -100], [1e-3, 0], [i.halfW, i.halfD]] as const) {
        const r = restorePlayer({ zone, x, z, heading: 0, yaw: 0 }, L, OFFS), loc = toLocal(r.zone, r, OFFS);
        expect(r.zone).toBe(zone);
        expect(Math.abs(loc.x)).toBeLessThanOrEqual(i.halfW + 1e-9); expect(Math.abs(loc.z)).toBeLessThanOrEqual(i.halfD + 1e-9);
        expect(insideAny(loc, L.radius * 0.9, i.cols())).toBe(false);
      }
    }
  });
  it("a point on a collider is moved out, in every zone", () => {
    for (const zone of ZS) {
      const c = L.zones[zone].cols();
      if (!c.circles.length && !c.boxes.length) continue; // the test ladder gives the Margins none
      const t = c.circles[0] ? { x: c.circles[0].x, z: c.circles[0].z } : { x: c.boxes[0].x, z: c.boxes[0].z };
      const r = restorePlayer({ zone, ...t, heading: 0, yaw: 0 }, L, OFFS), loc = toLocal(r.zone, r, OFFS);
      expect(insideAny(loc, L.radius * 0.9, L.zones[r.zone].cols())).toBe(false);
    }
  });
  it("a closed Reading Room is the Margins arrival, in the Margins frame", () => {
    expect(restoreZone("reading", false)).toBe("margins"); expect(restoreZone("reading", true)).toBe("reading");
    for (const z of ["garden", "margins", "home"] as const) expect(restoreZone(z, false)).toBe(z);
    const r = restorePlayer({ zone: "reading", x: 1, z: 1, heading: 0, yaw: 0 }, ladder(false), OFFS);
    expect(r.zone).toBe("margins"); expect(r.x).toBeCloseTo(OFFS.margins + 0, 9); expect(r.yaw).toBe(1);
  });
  const saved: Saved = { ...snap({ zone: "margins" }), at: NOW };
  it("kill switch off, no record, or a dev preview start: nothing is restored", () => {
    expect(restoreFrom(false, saved, false)).toBeNull();
    expect(restoreFrom(true, null, false)).toBeNull();
    expect(restoreFrom(true, undefined, false)).toBeNull();
    expect(restoreFrom(true, saved, true)).toBeNull();
    expect(restoreFrom(true, saved, false)).toBe(saved);
  });
  it("Prints resume wandering from their spot after a short wait, with the saved heading", () => {
    const cols = colliders(), R = GARDEN.print.radius;
    const w = restoreWander({ id: ID, x: 1, z: 2, h: 0.3, m: "rest" }, cols, R)!;
    expect(w).toMatchObject({ x: 1, z: 2, tx: 1, tz: 2 }); expect(w.heading).toBeCloseTo(0.3, 9); expect(w.wait).toBeGreaterThan(0);
    expect(restoreWander({ id: ID, x: 1, z: 2, h: 0.3, m: "wander" }, cols, R)).toEqual(w); // resting and wandering both start the same: never seated, hiding or walking along
  });
  it("a Print saved outside Home or on a collider ends inside Home and clear; an unplaceable one gets the usual start", () => {
    const cols = colliders(), R = GARDEN.print.radius;
    const far = restoreWander({ id: ID, x: 99, z: -99, h: 0, m: "wander" }, cols, R)!;
    expect(Math.abs(far.x)).toBeLessThanOrEqual(GARDEN.size / 2); expect(Math.abs(far.z)).toBeLessThanOrEqual(GARDEN.size / 2);
    const t = GARDEN.trees[0], on = restoreWander({ id: ID, x: t.x, z: t.z, h: 0, m: "rest" }, cols, R);
    if (on) expect(insideAny(on, R * 0.9, cols)).toBe(false);
    const walled = { circles: [{ x: 0, z: 0, r: 1000 }], boxes: [] };
    expect(restoreWander({ id: ID, x: 0, z: 0, h: 0, m: "rest" }, walled, R)).toBeNull();
    const m = restorePrints([{ id: ID, x: 1, z: 1, h: 0, m: "rest" }, { id: ID2, x: 0, z: 0, h: 0, m: "wander" }], (p) => (p.x === 0 ? walled : cols), R);
    expect([...m.keys()]).toEqual([ID]);
  });
  it("no randomness is used to place anything", () => { expect(src("../lib/playerState.ts")).not.toContain("Math.random"); });
});

// The closing-page request (spec section 5): the public key and the user's own token, never a service key.
describe("keepalive headers", () => {
  const args = savePayload(snap(), [ID]);
  it("apikey is the anon key and authorization is Bearer plus the user's own access token", () => {
    const r = keepaliveRequest("https://x.example", "ANON-KEY", "USER-TOKEN", args)!;
    expect(r.url).toBe("https://x.example/rest/v1/rpc/save_state");
    expect(r.init).toMatchObject({ method: "POST", keepalive: true });
    expect(r.init.headers).toEqual({ "content-type": "application/json", apikey: "ANON-KEY", authorization: "Bearer USER-TOKEN" });
    expect(JSON.parse(r.init.body)).toEqual(JSON.parse(JSON.stringify(args)));
  });
  it("no token, key or url means no request (only the browser copy is written)", () => {
    expect(keepaliveRequest("https://x.example", "K", null, args)).toBeNull();
    expect(keepaliveRequest("https://x.example", undefined, "T", args)).toBeNull();
    expect(keepaliveRequest(undefined, "K", "T", args)).toBeNull();
  });
  it("the hook builds it from the public env names and the session token only", () => {
    const h = src("../lib/usePlayerState.ts");
    expect(h).toContain("keepaliveRequest(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, token.current, a)");
    expect(h).toContain("access_token"); expect(h).not.toMatch(/service_role|SERVICE/i);
    expect(src("../lib/playerStateClient.ts")).toContain("authorization: `Bearer ${token}`");
  });
});

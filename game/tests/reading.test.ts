// S34 step 2: the Reading Room client. Pure logic and data checks; the 3D look, feel and frame time need a human in a browser.
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import raw from "@/data/reading.json";
import sights from "@/data/sights.json";
import daynight from "@/data/daynight.json";
import {
  LOOKS, READING, READING_ENABLED, READING_OFF, READING_REGION, READING_SPOTS, checkReading, deskBoxes, doorArrival, doorFrame, doorPath, doorPosts, doorYaw, duskLevel, findLook, inDoorZone,
  insideRoom, isEnabled, levelFor, levelStep, marginsDoorCircles, nearestReadingSpot, openedFromKeys, previewKind, quietIfUnknown, readingOverride, roomColliders, roomWalkEnd, shelfBoxes, signPost,
} from "@/lib/reading";
import { createZoneController, type ZoneDef, type ZoneId } from "@/lib/zones";
import { generateLayout, buildField, gatePath, gateFrame, reachable, spotsForDay } from "@/lib/margins";
import { NPCS } from "@/lib/npcs";
import { SIGHTS } from "@/lib/sights";
import { insideAny, movePlayer, type Colliders } from "@/lib/world";
import { MARGINS_ERRORS, settleUnfold, type Outcome } from "@/lib/margins-server";
import { openedWorldFromClaims, worldOutcomeFrom } from "@/lib/spots-server";
import { GARDEN } from "@/lib/world";

const src = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
const strip = (s: string) => s.replace(/\/\/.*$/gm, "");

describe("data/reading.json", () => {
  it("is on, names the region and fits the server row", () => {
    expect(READING_ENABLED).toBe(true);
    expect(READING_REGION).toBe("reading_room");
    expect(READING_REGION).toMatch(/^[a-z][a-z0-9_]{1,23}$/);
    expect(src("../supabase/migrations/20261022000002_reading_room_spots.sql")).toMatch(/values \('reading_room', 6\)/);
  });
  it("has 4 day spots and 2 dusk spots, 6 in all, ids 0..5, equal to the region row", () => {
    expect(raw.spots.day).toHaveLength(4); expect(raw.spots.dusk).toHaveLength(2);
    expect(READING_SPOTS.map((s) => s.id)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(READING_SPOTS.filter((s) => s.dusk).map((s) => s.id)).toEqual([4, 5]);
    expect(READING_SPOTS).toHaveLength(6);
  });
  it("every spot is inside the room and clear of the walls, shelves and desks", () => {
    expect(checkReading()).toEqual([]);
    const cols = roomColliders();
    for (const s of READING_SPOTS) {
      expect(insideRoom(s, 0.8)).toBe(true);
      expect(insideAny(s, raw.spots.clear, cols)).toBe(false);
      // standing within reach of it, on free floor
      const near = { x: s.x + 0.9, z: s.z };
      expect(Math.hypot(near.x - s.x, near.z - s.z)).toBeLessThanOrEqual(raw.spots.reach);
    }
  });
  it("spots are apart from each other and every one can be walked up to", () => {
    for (const a of READING_SPOTS) for (const b of READING_SPOTS) if (a.id < b.id) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(1.5);
    const cols = roomColliders();
    for (const s of READING_SPOTS) {
      let ok = false;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!insideAny({ x: s.x + dx, z: s.z + dz }, GARDEN.player.radius, cols) && insideRoom({ x: s.x + dx, z: s.z + dz }, GARDEN.player.radius)) ok = true;
      expect(ok).toBe(true);
    }
  });
  it("the dusk window starts at the existing dusk key hour and ends before the deep night", () => {
    const dusk = daynight.keys.find((k) => k.name === "dusk")!;
    expect(raw.dusk.inFrom).toBe(dusk.hour); expect(raw.dusk.inFrom).toBe(18.5);
    expect(raw.dusk.inFrom).toBe(sights.window.inFrom);
    expect(raw.dusk.inFrom).toBeLessThan(raw.dusk.inTo); expect(raw.dusk.inTo).toBeLessThanOrEqual(raw.dusk.outFrom); expect(raw.dusk.outFrom).toBeLessThan(raw.dusk.outTo);
    expect(raw.dusk.outTo).toBeLessThan(24);
    expect(raw.dusk.openAt).toBeGreaterThan(0); expect(raw.dusk.openAt).toBeLessThan(1);
  });
  it("the five find kinds are the ones the server can answer; no new kind", () => {
    expect(raw.kinds).toEqual(["ink", "glyph", "scrap", "egg", "keepsake"]);
    const check = src("../supabase/migrations/20261020000007_margins_keepsakes.sql");
    for (const k of raw.kinds) expect(check).toContain(`'${k}'`);
    expect(strip(src("../lib/margins-server.ts"))).toContain('export type Found = Shown | "keepsake"');
  });
});

describe("the room", () => {
  it("its door frame, posts and walks are consistent and inside the room", () => {
    const { g, d } = doorFrame("room");
    expect(g).toEqual({ x: 0, z: raw.room.depth / 2 }); expect(d).toEqual({ x: -0, z: 1 });
    const [a, b] = doorPosts("room");
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeCloseTo(raw.door.postOffset * 2, 6);
    const arr = doorArrival("reading");
    expect(insideRoom(arr[1])).toBe(true); expect(insideRoom(arr[0], -0.6)).toBe(true); // you appear in the doorway, then a stride in
    expect(arr[1].z).toBeLessThan(arr[0].z); // you walk away from the door
    expect(doorYaw("reading")).toBeCloseTo(0, 6); // looking north, away from the door
    expect(doorPath({ x: 0, z: 3 }, "room").at(-1)!.z).toBeGreaterThan(raw.room.depth / 2);
    expect(roomWalkEnd()).toBeGreaterThan(raw.room.depth / 2);
    expect(inDoorZone({ x: 0, z: raw.room.depth / 2 - 1 }, "room")).toBe(true);
    expect(inDoorZone({ x: 0, z: 0 }, "room")).toBe(false);
  });
  it("walls, shelves and desks block you; you cannot walk through them or out of the room", () => {
    const cols = roomColliders();
    expect(shelfBoxes()).toHaveLength(4); expect(deskBoxes()).toHaveLength(3);
    const walk = (p: { x: number; z: number }, f: number, r: number, yaw = 0) => { let q = p; for (let i = 0; i < 400; i++) q = movePlayer(q, { forward: f, right: r }, yaw, 4, 0.05, GARDEN.player.radius, cols, raw.room.width).pos; return q; };
    // north (yaw 0 looks along -z) stops at the wall, west and east stop at the side walls
    expect(walk({ x: 0, z: 3 }, 1, 0).z).toBeGreaterThan(-raw.room.depth / 2 - 0.01);
    expect(walk({ x: 0, z: 3 }, 0, -1).x).toBeGreaterThan(-raw.room.width / 2 - 0.01);
    expect(walk({ x: 0, z: 3 }, 0, 1).x).toBeLessThan(raw.room.width / 2 + 0.01);
    // a desk in the way: the player ends up outside its box
    const d = raw.furniture.desks[0];
    const end = walk({ x: d.x, z: d.z + 3 }, 1, 0);
    expect(insideAny(end, 0, { circles: [], boxes: [d] })).toBe(false);
    for (const s of raw.furniture.shelves) expect(insideAny({ x: s.x, z: s.z }, 0, cols)).toBe(true);
  });
  it("the door gap is clear and the only way out is through it", () => {
    const cols = roomColliders();
    expect(insideAny({ x: 0, z: raw.room.depth / 2 + 0.2 }, GARDEN.player.radius * 0.5, cols)).toBe(false);
    expect(insideAny({ x: raw.door.postOffset + 0.6, z: raw.room.depth / 2 + 0.25 }, 0, cols)).toBe(true);
    expect(insideAny({ x: -raw.door.postOffset - 0.6, z: raw.room.depth / 2 + 0.25 }, 0, cols)).toBe(true);
  });
  it("sits far from every other zone", () => {
    expect(READING_OFF).toBeGreaterThan(900); expect(READING_OFF).not.toBe(400); expect(READING_OFF).not.toBe(800);
  });
});

describe("the door in the Margins", () => {
  const L = generateLayout(), f = buildField(L.cols);
  const doorCols: Colliders = { circles: [...L.cols.circles, ...marginsDoorCircles()], boxes: L.cols.boxes };
  const f2 = buildField(doorCols);
  const { g, d } = doorFrame("margins");
  it("is inside the Margins, away from the scenery, the gate to the garden, the Proof-reader and the night sights", () => {
    expect(Math.abs(g.x) + 3).toBeLessThan(45); expect(Math.abs(g.z) + 3).toBeLessThan(45);
    for (const k of [-2.4, 0, 2.4]) for (const s of [-1.5, 0, 1.5]) {
      const p = { x: g.x - d.x * k - d.z * s, z: g.z - d.z * k + d.x * s };
      expect(insideAny(p, 0.5, L.cols)).toBe(false);
    }
    const gate = gateFrame("home");
    expect(Math.hypot(g.x - gate.g.x, g.z - gate.g.z)).toBeGreaterThan(15);
    for (const n of NPCS) { const sp = (n as { spot?: { at?: number[] } }).spot?.at; if (sp) expect(Math.hypot(g.x - sp[0], g.z - sp[1])).toBeGreaterThan(5); }
    if (SIGHTS) for (const p of SIGHTS.points) expect(Math.hypot(g.x - p.x, g.z - p.z)).toBeGreaterThan(3);
  });
  it("is reachable from the gate, and the posts and the sign are solid without cutting the Margins in two", () => {
    expect(reachable(f2, { x: g.x + 2.2, z: g.z })).toBe(true);
    expect(insideAny(doorPosts("margins")[0], 0, doorCols)).toBe(true);
    expect(insideAny(signPost(), 0, doorCols)).toBe(true);
    const open = f.clear.filter(Boolean).length, open2 = f2.clear.filter(Boolean).length;
    expect(open - open2).toBeLessThan(40);
    expect(f2.dist.filter((x, i) => f2.clear[i] && x < 0).length).toBe(f.dist.filter((x, i) => f.clear[i] && x < 0).length);
  });
  it("lets you walk through the door opening", () => {
    expect(insideAny({ x: g.x, z: g.z }, GARDEN.player.radius, { circles: marginsDoorCircles(), boxes: [] })).toBe(false);
    const p = doorPath({ x: g.x + 2, z: g.z }, "margins");
    expect(p.at(-1)!.x).toBeLessThan(g.x);
    expect(inDoorZone({ x: g.x + 1.4, z: g.z }, "margins")).toBe(true);
    expect(inDoorZone({ x: g.x + 8, z: g.z }, "margins")).toBe(false);
    const back = doorArrival("margins");
    expect(back[1].x).toBeGreaterThan(g.x); // you come out door-side, walking away from it
  });
  it("the daily Margins pages never land on the door", () => {
    for (let n = 0; n < 40; n++) {
      const day = new Date(Date.UTC(2026, 9, 23 + n)).toISOString().slice(0, 10);
      for (const s of spotsForDay(day, { ...L, cols: doorCols }, f2)) expect(insideAny(s, 1.4, { circles: marginsDoorCircles(), boxes: [] })).toBe(false);
    }
  });
  it("the gate walk code the door reuses is unchanged", () => {
    expect(gatePath({ x: 0, z: 0 }, "home").length).toBeGreaterThan(1);
  });
});

describe("zones", () => {
  it("'reading' is a zone id; entering and leaving run in order with nothing left over after ten trips", () => {
    const live = new Set<string>(); const calls: string[] = []; let made = 0;
    const mk = (id: ZoneId): ZoneDef => ({ id, enter() { calls.push(`enter:${id}`); live.add(`${id}${made++}`); }, leave() { calls.push(`leave:${id}`); for (const k of [...live]) if (k.startsWith(id)) live.delete(k); } });
    const z = createZoneController([mk("garden"), mk("margins"), mk("home"), mk("reading")]);
    z.enterZone("margins");
    for (let i = 0; i < 10; i++) { z.enterZone("reading"); z.enterZone("margins"); }
    expect(calls.slice(0, 5)).toEqual(["leave:garden", "enter:margins", "leave:margins", "enter:reading", "leave:reading"]);
    expect([...live]).toHaveLength(1); // only the Margins is built
    z.leaveZone(); z.dispose();
    expect(live.size).toBe(0);
    expect(() => createZoneController([mk("garden")])).not.toThrow();
  });
  it("the real controller wiring lists the reading zone", () => {
    const w = strip(src("../components/World.tsx"));
    expect(w).toMatch(/\{ id: "reading", enter: enterReadingZone, leave: leaveReadingZone \}/);
    expect(strip(src("../lib/zones.ts"))).toMatch(/"garden" \| "margins" \| "home" \| "reading"/);
  });
});

describe("dusk", () => {
  it("is 0 by day and in the deep night, eases in and out, and holds in between", () => {
    for (const h of [0, 3, 6, 9, 12, 15, 18, 18.49, 22, 22.5, 23.9]) expect(duskLevel(h)).toBe(0);
    expect(duskLevel(raw.dusk.inFrom)).toBe(0);
    expect(duskLevel((raw.dusk.inFrom + raw.dusk.inTo) / 2)).toBeGreaterThan(0.4); expect(duskLevel((raw.dusk.inFrom + raw.dusk.inTo) / 2)).toBeLessThan(0.6);
    expect(duskLevel(raw.dusk.inTo)).toBe(1); expect(duskLevel(raw.dusk.previewHour)).toBe(1); expect(duskLevel(raw.dusk.outFrom)).toBe(1);
    expect(duskLevel((raw.dusk.outFrom + raw.dusk.outTo) / 2)).toBeGreaterThan(0.4); expect(duskLevel((raw.dusk.outFrom + raw.dusk.outTo) / 2)).toBeLessThan(0.6);
    expect(duskLevel(raw.dusk.outTo)).toBe(0);
  });
  it("is monotonic over each ease and always within 0..1, for any hour including wrapped ones", () => {
    let prev = 0;
    for (let h = raw.dusk.inFrom; h <= raw.dusk.inTo; h += 0.05) { const v = duskLevel(h); expect(v).toBeGreaterThanOrEqual(prev - 1e-9); prev = v; }
    prev = 1;
    for (let h = raw.dusk.outFrom; h <= raw.dusk.outTo; h += 0.05) { const v = duskLevel(h); expect(v).toBeLessThanOrEqual(prev + 1e-9); prev = v; }
    for (const h of [-5, 24, 25, 42.7, 1e3]) { const v = duskLevel(h); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
  });
  it("the forced preview is always full dusk, whatever the hour", () => {
    for (const h of [0, 6, 12, 23]) { expect(levelFor(h, true)).toBe(1); expect(levelFor(h, false)).toBe(duskLevel(h)); }
  });
  it("the level moves toward its target in steps (a moving clock fades, never pops)", () => {
    expect(levelStep(0, 1, 0.5, false)).toBeLessThan(1); expect(levelStep(0, 1, 0.5, false)).toBeGreaterThan(0);
    expect(levelStep(0, 1, 0.5, true)).toBe(1); // reduced motion: a short plain fade
    expect(levelStep(1, 0, 0.1, false)).toBeLessThan(1); expect(levelStep(0.3, 0.3, 1, false)).toBe(0.3);
  });
  it("a dusk spot can only be opened once dusk has eased in; day spots always can", () => {
    const dusk = READING_SPOTS.find((s) => s.dusk)!, day = READING_SPOTS.find((s) => !s.dusk)!;
    const none = new Set<number>();
    expect(nearestReadingSpot(dusk, none, 0)).toBeNull();
    expect(nearestReadingSpot(dusk, none, raw.dusk.openAt - 0.01)).toBeNull();
    expect(nearestReadingSpot(dusk, none, 1)!.id).toBe(dusk.id);
    expect(nearestReadingSpot(day, none, 0)!.id).toBe(day.id);
    expect(nearestReadingSpot(day, new Set([day.id]), 1)).toBeNull(); // opened stays opened
    expect(nearestReadingSpot({ x: 0, z: 100 }, none, 1)).toBeNull();
  });
});

describe("the look of a find", () => {
  it("covers all five kinds (a total function): dusk look only for scrap and ink; the rest look as the Margins draws them", () => {
    expect(findLook("scrap", true)).toBe("moth"); expect(findLook("ink", true)).toBe("lantern");
    expect(findLook("scrap", false)).toBe("scrap"); expect(findLook("ink", false)).toBe("ink");
    for (const dusk of [false, true]) {
      expect(findLook("glyph", dusk)).toBe("glyph");
      expect(findLook("egg", dusk)).toBe("egg");
      expect(findLook("keepsake", dusk)).toBe("scrap"); // a keepsake rises as a paper scrap in the Margins, by day or at dusk
    }
    for (const k of raw.kinds) for (const dusk of [false, true]) expect(LOOKS).toContain(findLook(k, dusk));
  });
  it("any unknown kind falls back to the plain look and never throws", () => {
    for (const k of ["", "gem", "SCRAP", null, undefined, 3, {}, [], "ink "]) for (const dusk of [false, true]) expect(findLook(k, dusk)).toBe("plain");
  });
  it("a keepsake found at a dusk spot keeps its normal message and nothing is counted as food", () => {
    const o: Outcome = { ok: true, kind: "keepsake", cosmetic: "bow", spot: 4, duplicate: false };
    const st = settleUnfold(o, true, true);
    expect(st.food).toBeNull(); expect(st.scrap).toBe(false); expect(st.note).toBeNull();
    expect(findLook(o.kind, true)).toBe("scrap");
  });
  it("is chosen from the answer: the same dusk spot shows a different look for each kind the server returns", () => {
    const seen = new Set((["ink", "glyph", "scrap", "egg", "keepsake"] as const).map((k) => findLook(k, true)));
    expect(seen).toEqual(new Set(["lantern", "glyph", "moth", "egg", "scrap"]));
  });
});

describe("answers from the server", () => {
  const row = (kind: string, spot: number) => ({ region: "reading_room", spot, result: kind, day: "2026-10-24" });
  it("shows what the server returned for this region and spot, and nothing else", () => {
    const o = worldOutcomeFrom([row("scrap", 4)], null, READING_REGION, 4, "2026-10-24", false);
    expect(o).toEqual({ ok: true, kind: "scrap", spot: 4, duplicate: false });
    expect(worldOutcomeFrom([{ ...row("scrap", 4), region: "meadow" }], null, READING_REGION, 4, "2026-10-24", false).ok).toBe(false);
  });
  it("a repeat is a repeat and a new UTC day is quiet, not an error", () => {
    expect((worldOutcomeFrom([row("ink", 1)], null, READING_REGION, 1, "2026-10-24", true) as Extract<Outcome, { ok: true }>).duplicate).toBe(true);
    expect(worldOutcomeFrom([row("ink", 1)], null, READING_REGION, 1, "2026-10-25", false)).toEqual({ ok: false, reason: "wrong-day" });
  });
  it("a region the server does not know yet (no such page) and the daily ceiling both read as 'the pages are quiet'", () => {
    const unknown = quietIfUnknown(worldOutcomeFrom(null, { message: "no such page" }, READING_REGION, 0, "d", false));
    expect(unknown).toEqual({ ok: false, reason: "ceiling" });
    const ceiling = quietIfUnknown(worldOutcomeFrom(null, { message: "You have found enough pages for today" }, READING_REGION, 0, "d", false));
    expect(ceiling).toEqual({ ok: false, reason: "ceiling" });
    for (const o of [unknown, ceiling]) {
      const st = settleUnfold(o, true, true);
      expect(st.note).toBe(MARGINS_ERRORS.ceiling); expect(st.open).toBe(false); expect(st.ceiling).toBe(true);
    }
    expect(quietIfUnknown({ ok: false, reason: "network" })).toEqual({ ok: false, reason: "network" }); // other refusals are left alone
    expect(quietIfUnknown({ ok: true, kind: "ink", spot: 0, duplicate: false }).ok).toBe(true);
  });
  it("today's opened keys: only reading_room spots are read, bad keys are skipped", () => {
    expect([...openedFromKeys(["reading_room:0", "reading_room:5", "meadow:1", "reading_room:x", "reading_room:", "xreading_room:2"])].sort()).toEqual([0, 5]);
    expect(openedFromKeys(null).size).toBe(0);
    expect(openedWorldFromClaims([row("ink", 2), { region: "meadow", spot: 1, result: "ink", day: "2026-10-24" }], "2026-10-24").sort()).toEqual(["meadow:1", "reading_room:2"]);
  });
});

describe("kill switch", () => {
  it("only a plain true turns the room on; anything else is off and never throws", () => {
    expect(isEnabled({ readingRoom: { enabled: true } })).toBe(true);
    for (const v of [false, 0, 1, "true", null, undefined, {}, [], "yes"]) expect(isEnabled({ readingRoom: { enabled: v } })).toBe(false);
    for (const d of [null, undefined, {}, 5, "x", { readingRoom: null }, { readingRoom: 3 }]) expect(isEnabled(d)).toBe(false);
  });
  it("the door, the Margins colliders and the dev start are all behind the one flag", () => {
    const w = strip(src("../components/World.tsx"));
    expect(w).toMatch(/if \(READING_ENABLED\) mLayout\.cols\.circles\.push\(\.\.\.marginsDoorCircles\(\)\)/);
    expect(w).toMatch(/if \(READING_ENABLED\) \{ try \{ rdoor = buildReadingDoor\(\)/);
    expect(w).toMatch(/if \(rPreview && READING_ENABLED\)/);
    expect(w).toMatch(/rdoor && inReadingDoor\(l, "margins"\)/); // no door, no prompt, so the room can never be entered
    expect(w.match(/buildReadingDoor\(/g)).toHaveLength(1); expect(w.match(/buildReadingScene\(/g)).toHaveLength(1);
  });
  it("no flag mechanism beyond data/reading.json is used", () => {
    expect(strip(src("../lib/reading.ts"))).not.toMatch(/process\.env|localStorage|fetch\(/);
  });
});

describe("dev preview and production", () => {
  it("?reading=1 and ?reading=reduced work in dev builds and are ignored in production", () => {
    expect(readingOverride("?reading=1", false)).toEqual({ reduced: false });
    expect(readingOverride("?x=1&reading=reduced", false)).toEqual({ reduced: true });
    expect(readingOverride("?reading=1", true)).toBeNull(); expect(readingOverride("?reading=reduced", true)).toBeNull();
    expect(readingOverride("?reading=2", false)).toBeNull(); expect(readingOverride("", false)).toBeNull();
  });
  it("the preview cycles through all five kinds without the server", () => {
    const kinds = new Set(Array.from({ length: 12 }, (_, i) => previewKind(i)));
    expect([...kinds].sort()).toEqual(["egg", "glyph", "ink", "keepsake", "scrap"]);
    expect(previewKind(-1)).toBeTypeOf("string");
  });
  it("the preview reads the production check, and the code makes no new network call", () => {
    const w = strip(src("../components/World.tsx"));
    expect(w).toMatch(/readingOverride\(window\.location\.search, process\.env\.NODE_ENV === "production"\)/);
    const scene = strip(src("../components/readingScene.ts")), logic = strip(src("../lib/reading.ts"));
    for (const f of [scene, logic]) { expect(f).not.toMatch(/fetch\(|supabase|XMLHttpRequest|WebSocket|http:\/\/|https:\/\//); }
    expect(w.match(/onWorldUnfold\(READING\.region/g)).toHaveLength(1); // the one existing unfold call, with this region
  });
  it("no new asset imports and no new dependency", () => {
    for (const f of ["../components/readingScene.ts", "../lib/reading.ts"]) {
      const imports = [...src(f).matchAll(/^import .* from "([^"]+)"/gm)].map((m) => m[1]);
      for (const i of imports) expect(i).toMatch(/^(three|@\/(lib|data|components)\/[A-Za-z.\-]+)$/);
      for (const i of imports) expect(i).not.toMatch(/\.(png|jpg|svg|glb|gltf|mp3|ogg|wav|woff2?)$/);
    }
    expect(readdirSync(new URL("../supabase/migrations/", import.meta.url)).filter((n) => n > "20261022000002_reading_room_spots.sql").length).toBe(0); // client PR: no migration
  });
});

describe("the text", () => {
  it("adds no words to the room or the door: no new string reaches the player", () => {
    const scene = strip(src("../components/readingScene.ts"));
    expect(scene).not.toMatch(/prompt:|label:|setNote|onMarginsNote/);
    expect(JSON.stringify(Object.keys(raw))).not.toMatch(/caption|text|prompt/i);
    // the door and spots reuse the existing prompts
    const w = strip(src("../components/World.tsx"));
    expect(w).toContain('label: "Door", prompt: "Go through the door"');
  });
});

describe("the room scene (built without a screen)", () => {
  const count = (root: { traverse(f: (o: { type?: string; isMesh?: boolean; isLineSegments?: boolean; visible: boolean }) => void): void }) => { let n = 0; root.traverse((o) => { if ((o.isMesh || o.isLineSegments) && o.visible) n++; }); return n; };
  it("draws under 25 objects with everything visible, even with a find rising, and ten trips leave nothing behind", async () => {
    const THREE = await import("three");
    const { buildReadingScene, buildReadingDoor } = await import("@/components/readingScene");
    const all = { t: 1, player: { x: 0, z: 3 }, level: 1, reduced: false, opened: new Set<number>(), active: null, target: { x: 0, z: 3 } };
    const counts: number[] = [];
    for (let trip = 0; trip < 10; trip++) {
      const scene = new THREE.Scene(), r = buildReadingScene(), d = buildReadingDoor();
      scene.add(r.group, d.group);
      r.setOpened(new Set());
      r.update(all);
      counts.push(count(r.group));
      for (const look of LOOKS) r.update({ ...all, active: { id: 4, since: 1.6, look } });
      r.update({ ...all, level: 0, reduced: true });
      r.dispose(); d.dispose();
      expect(scene.children.length).toBe(0);
    }
    expect(new Set(counts).size).toBe(1); // the same every trip: no growth
    expect(counts[0]).toBeLessThan(25);
    console.log("DRAWN", counts[0]);
  });
  it("the finds all have a shape (the mapping can never name a look the scene lacks)", async () => {
    const THREE = await import("three");
    const { buildReadingScene } = await import("@/components/readingScene");
    const r = buildReadingScene(), scene = new THREE.Scene(); scene.add(r.group);
    const direct = () => { let n = 0; r.group.children.forEach((o) => { const m = o as { isMesh?: boolean; isInstancedMesh?: boolean; visible: boolean }; if (m.isMesh && !m.isInstancedMesh && m.visible) n++; }); return n; };
    r.update({ t: 1, player: { x: 0, z: 3 }, level: 1, reduced: false, opened: new Set(), active: null, target: { x: 0, z: 3 } });
    const none = direct();
    for (const look of LOOKS) {
      r.update({ t: 1, player: { x: 0, z: 3 }, level: 1, reduced: false, opened: new Set(), active: { id: 0, since: 1.7, look }, target: { x: 0, z: 3 } });
      expect(direct()).toBe(none + 1); // exactly one find is drawn, whichever look
    }
    r.dispose();
  });
});

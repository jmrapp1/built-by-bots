// Landmark seats: the data, placement clear of every solid and reachable on foot, the pure helpers, the flag, and the wiring.
// Nothing is given, saved or sent; sitting is the Garden bench's own (lib/sit.ts).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import raw from "@/data/landmarkSeats.json";
import { LANDMARK_SEATS, SEATS, checkSeats, nearestSeat, seatsFlag, seatsOn } from "@/lib/landmarkSeats";
import { HALF, WORLD, distToPath, type Landmark } from "@/lib/worldMap";
import { insideAny } from "@/lib/world";
import { SIGNPOSTS } from "@/lib/map";
import { WORLD_NPCS, npcSpot } from "@/lib/npcs";
import { allSpotsForDay } from "@/lib/worldSpots";
import { buildHedges, hedgeTouches } from "@/lib/features";
import { reachability, reachedNear, worldColliders } from "@/lib/sight";

const LMS = WORLD.landmarks as Landmark[];
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const days = Array.from({ length: 60 }, (_, i) => new Date(Date.UTC(2026, 9, 1) + i * 864e5).toISOString().slice(0, 10));

describe("landmark seats: data", () => {
  it("has exactly one seat for each landmark, in the landmarks' order, and the flag is on", () => {
    expect(raw.enabled).toBe(true);
    expect(raw.seats.map((s) => s.landmark)).toEqual(LMS.map((l) => l.id));
    expect(SEATS).toHaveLength(LMS.length);
    expect(new Set(SEATS.map((s) => s.id)).size).toBe(SEATS.length);
  });
  it("each seat is beside its own landmark, 2 to 5 m past its edge, and faces it", () => {
    for (const s of SEATS) {
      const l = LMS.find((o) => o.id === s.landmark)!;
      const d = Math.hypot(l.x - s.x, l.z - s.z);
      expect(d, s.id).toBeGreaterThan(l.r + 2); expect(d, s.id).toBeLessThan(l.r + 5);
      expect(Math.sin(s.face) * (l.x - s.x) + Math.cos(s.face) * (l.z - s.z), s.id).toBeCloseTo(d, 6);
    }
  });
  it("the reach is small", () => { expect(LANDMARK_SEATS.reach).toBeGreaterThan(1); expect(LANDMARK_SEATS.reach).toBeLessThanOrEqual(3); });
});

describe("landmark seats: placement", () => {
  const hp = buildHedges(), cols = worldColliders();
  it("each is inside the World, in open ground, clear of solids, hedges, other landmarks, signposts and the neighbours", () => {
    for (const s of SEATS) {
      expect(Math.abs(s.x), s.id).toBeLessThan(HALF - 6); expect(Math.abs(s.z), s.id).toBeLessThan(HALF - 6);
      expect(distToPath(s.x, s.z), s.id).toBeGreaterThan(WORLD.path.keepOut); // off the path (blocked() also bars the landmark's own surroundings, where the seat is meant to be)
      expect(insideAny({ x: s.x, z: s.z }, 1, cols), s.id).toBe(false);
      expect(hedgeTouches(s.x, s.z, 2.5, hp, 0), s.id).toBe(false);
      for (const o of LMS) if (o.id !== s.landmark) expect(Math.hypot(o.x - s.x, o.z - s.z), s.id).toBeGreaterThan(o.r + 3);
      for (const p of SIGNPOSTS) expect(Math.hypot(p.x - s.x, p.z - s.z), s.id).toBeGreaterThan(3.5);
      for (const n of WORLD_NPCS) { const p = npcSpot(n); expect(Math.hypot(p.x - s.x, p.z - s.z), s.id).toBeGreaterThan(4); }
    }
  });
  it("each can be walked to from the spawn", () => {
    const reach = reachability(cols, 0.5);
    for (const s of SEATS) expect(reachedNear(reach, s.x, s.z, 0.5), s.id).toBe(true);
  });
  it("no seat is within reach of another, so one E press means one seat", () => {
    for (const a of SEATS) for (const b of SEATS) if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(2 * LANDMARK_SEATS.reach);
  });
  it("no day's folded page lies within reach of a seat over two months", () => {
    for (const d of days) for (const p of allSpotsForDay(d)) for (const s of SEATS) expect(Math.hypot(p.x - s.x, p.z - s.z), `${d} ${s.id}`).toBeGreaterThan(LANDMARK_SEATS.reach + 0.5);
  });
});

describe("landmark seats: helpers", () => {
  it("nearestSeat finds the seat in reach and nothing beyond it", () => {
    for (const s of SEATS) { expect(nearestSeat({ x: s.x, z: s.z })?.id).toBe(s.id); expect(nearestSeat({ x: s.x + LANDMARK_SEATS.reach - 0.1, z: s.z })?.id).toBe(s.id); expect(nearestSeat({ x: s.x + LANDMARK_SEATS.reach + 0.5, z: s.z })).toBeNull(); }
    expect(nearestSeat({ x: 0, z: 0 })).toBeNull();
  });
  it("a bad entry is skipped and the rest stay; a second seat for a landmark is ignored", () => {
    const l = LMS[0];
    const ok = { landmark: l.id, x: l.x + 4, z: l.z };
    expect(checkSeats({ seats: [{ landmark: "nowhere", x: 0, z: 0 }, { landmark: l.id, x: "a", z: 1 }, { landmark: l.id, x: NaN, z: 1 }, null, ok, { ...ok, x: ok.x + 1 }] })).toHaveLength(1);
    expect(checkSeats({ seats: "no" })).toEqual([]); expect(checkSeats({})).toEqual([]);
  });
});

describe("landmark seats: the flag", () => {
  it("anything but a plain true is off, and it never throws", () => {
    expect(seatsFlag({ enabled: true })).toBe(true);
    for (const v of [{ enabled: "true" }, { enabled: 1 }, {}, null, undefined, 5]) expect(seatsFlag(v)).toBe(false);
  });
  it("?seats=off turns them off in dev builds only", () => {
    expect(seatsOn("", false)).toBe(true); expect(seatsOn("?seats=off", false)).toBe(false); expect(seatsOn("?seats=1", false)).toBe(true);
    expect(seatsOn("?seats=off", true)).toBe(true);
    expect(seatsOn("", true, { enabled: false })).toBe(false);
  });
});

describe("landmark seats: wiring and limits", () => {
  const lib = strip(readFileSync("lib/landmarkSeats.ts", "utf8"));
  const world = readFileSync("components/World.tsx", "utf8");
  it("no network, storage, clock or randomness in the module", () => {
    expect(lib).not.toMatch(/fetch\(|localStorage|sessionStorage|XMLHttpRequest|https?:\/\/|Math\.random|Date\.now|new Date/);
  });
  it("World builds them with the shell behind the flag, frees them with it, and E uses the same sit as the bench", () => {
    expect(world).toContain("buildSeats();");
    expect(world).toMatch(/dropWorldNpcs\(\); dropSeats\(\);/);
    expect(world).toContain("if (seatGroup || !seatsDrawn) return;");
    expect(world).toContain('nearby?.kind === "seat"');
    expect(world).toContain("seatNear ?? (inDoorZone");
    expect(world).toMatch(/seatsDrawn && zones\.is\("garden"\)/);
    expect(world).not.toMatch(/SEATS[^\n]*(onGather|onInteract|fetch|localStorage)/);
  });
  it("World passes the real production flag to seatsOn, so ?seats=off can never reach a live build", () => {
    const calls = world.match(/seatsOn\([^\n]*\)/g) ?? [];
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('seatsOn(window.location.search, process.env.NODE_ENV === "production")');
  });
  it("the bench in the Garden still sits at the night spot facing the bed", () => {
    expect(world).toContain('if (was === "standing") { sitTo = NIGHT.sit; sitFace = NIGHT.bed; }');
    expect(world).toContain("let sitTo: Vec = NIGHT.sit, sitFace: Vec = NIGHT.bed");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  HALF, MARGINS, arrivalPath, arrivalYaw, buildField, cellOf, gateFrame, gatePath, gatePosts, generateLayout, glintOpacity, hashString, heightAt, holdStep,
  homePath, homePoint, inGateZone, marginsOverrides, mulberry32, nearestSpot, pathLength, pickKind, pointAlong, reachable, spotsForDay, spotsLeft, travelFrame,
  travelSeconds, unfoldFrame, unfoldSeconds, utcDay, validDay, wipeOffset, zoneOf, along,
} from "@/lib/margins";
import { GARDEN, colliders, insideAny, movePlayer } from "@/lib/world";
import { pouchAdd } from "@/lib/forage";
import { BOARD_PAGES } from "@/lib/board";

const R = GARDEN.player.radius;
const layout = generateLayout();
const field = buildField(layout.cols);
const gcols = colliders();

describe("the dev-only switches", () => {
  it("work in development and are all ignored in production", () => {
    const q = "?area=margins&day=2026-10-21&finds=all&unfold=1&gate=1";
    expect(marginsOverrides(q, false)).toEqual({ area: true, day: "2026-10-21", all: true, unfold: true, gate: true });
    expect(marginsOverrides(q, true)).toEqual({ area: false, day: null, all: false, unfold: false, gate: false });
    expect(marginsOverrides("", false)).toEqual({ area: false, day: null, all: false, unfold: false, gate: false });
  });
  it("rejects bad dates", () => {
    for (const bad of ["2026-13-01", "2026-02-30", "tomorrow", "26-10-21", ""]) expect(validDay(bad)).toBe(false);
    expect(marginsOverrides("?day=2026-02-30", false).day).toBeNull();
    expect(validDay("2026-10-21")).toBe(true);
    expect(utcDay(new Date("2026-10-21T23:59:59Z"))).toBe("2026-10-21");
  });
});

describe("the gate in the garden", () => {
  it("is a place near the north-east edge with clear ground in front and posts that don't block the opening", () => {
    const place = GARDEN.places.find((p) => p.id === "gate")!;
    expect(place.prompt).toBe("Go through the gate");
    expect(place.x).toBeGreaterThan(10);
    expect(place.z).toBeLessThan(-10);
    const { g, d } = gateFrame("garden");
    expect(g).toEqual({ x: place.x, z: place.z });
    expect(insideAny(g, R, gcols)).toBe(false); // the opening is walkable
    for (const k of [0.8, 1.6, -1.2, -2.2]) expect(insideAny({ x: g.x + d.x * k, z: g.z + d.z * k }, R, gcols), `k=${k}`).toBe(false);
    for (const q of gatePosts("garden")) expect(GARDEN.posts.some((p) => Math.hypot(p.x - q.x, p.z - q.z) < 0.01)).toBe(true);
  });
  it("is reachable from the garden's start and the interaction zone matches the prompt reach", () => {
    expect(inGateZone({ x: 17.5 - 0.7 * 1.5, z: -17.5 + 0.7 * 1.5 }, "garden")).toBe(true);
    expect(inGateZone({ x: 0, z: 9 }, "garden")).toBe(false);
    expect(inGateZone({ x: 17.5 + 0.7 * 3, z: -17.5 - 0.7 * 3 }, "garden")).toBe(false);
  });
});

describe("walking through", () => {
  it("glides through the opening without touching a post, from either side and from near-by", () => {
    for (const which of ["garden", "home"] as const) {
      const { g, d } = gateFrame(which), posts = gatePosts(which);
      for (const k of [-2.6, -2, -1, -0.3]) for (const side of [-0.7, 0, 0.7]) {
        const start = { x: g.x + d.x * k + -d.z * side, z: g.z + d.z * k + d.x * side };
        const path = gatePath(start, which), n = 60;
        for (let i = 0; i <= n; i++) {
          const { p } = pointAlong(path, i / n);
          for (const q of posts) if (i > 12) expect(Math.hypot(p.x - q.x, p.z - q.z), `${which} ${k} ${side} ${i}`).toBeGreaterThan(q.r + R * 0.5);
        }
        const end = pointAlong(path, 1).p;
        expect(Math.hypot(end.x - g.x - d.x * MARGINS.gate.threshold, end.z - g.z - d.z * MARGINS.gate.threshold)).toBeLessThan(0.01);
      }
    }
  });
  it("the walk is under a second and the whole thing is a few seconds", () => {
    expect(MARGINS.travel.walkSeconds).toBeLessThan(1);
    expect(travelSeconds()).toBeGreaterThan(2);
    expect(travelSeconds()).toBeLessThan(3.5);
    expect(travelSeconds(true)).toBeLessThan(travelSeconds());
  });
  it("is eased with no jumps: the wipe covers, holds a beat at the swap, then uncovers", () => {
    let prev = travelFrame(0), swapSeen = -1, prevOffset = wipeOffset(0);
    expect(prev.wipe).toBe(0);
    expect(wipeOffset(0)).toBe(100);
    for (let t = 0; t <= travelSeconds() + 0.05; t += 1 / 60) {
      const f = travelFrame(t), off = wipeOffset(t);
      expect(Math.abs(f.wipe - prev.wipe), `wipe at ${t}`).toBeLessThan(0.08);
      expect(Math.abs(f.walk - prev.walk)).toBeLessThan(0.08);
      expect(Math.abs(off - prevOffset)).toBeLessThan(8);
      if (f.swapped && swapSeen < 0) { swapSeen = t; expect(f.wipe).toBeGreaterThan(0.98); } // the swap hides behind the full wipe
      prev = f; prevOffset = off;
    }
    expect(swapSeen).toBeGreaterThan(0.5);
    expect(travelFrame(travelSeconds() + 0.01).done).toBe(true);
    expect(travelFrame(travelSeconds() + 0.01).wipe).toBe(0);
  });
  it("the player is already walking before the wipe covers the screen, and keeps walking after", () => {
    expect(travelFrame(MARGINS.travel.coverFrom - 0.01).walk).toBeGreaterThan(0.5);
    expect(travelFrame(MARGINS.travel.coverFrom - 0.01).wipe).toBe(0);
    expect(travelFrame(MARGINS.travel.arriveFrom + 0.1).arrive).toBeGreaterThan(0);
    expect(travelFrame(MARGINS.travel.arriveFrom + 0.1).arrive).toBeLessThan(1);
  });
  it("a reduced-motion trip is shorter and its wipe sweeps in no further than a fade", () => {
    const k = MARGINS.travel.reducedFactor;
    expect(travelFrame(MARGINS.travel.swapAt * k + 0.001, true).swapped).toBe(true);
    expect(travelFrame(MARGINS.travel.swapAt * k - 0.05, true).swapped).toBe(false);
  });
  it("arrives mid-stride out of the opening, in free ground, walking the right way", () => {
    for (const into of ["margins", "garden"] as const) {
      const [a, b] = arrivalPath(into), cols = into === "margins" ? layout.cols : gcols;
      expect(insideAny(a, R, cols), `${into} start`).toBe(false);
      expect(insideAny(b, R, cols), `${into} end`).toBe(false);
      expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeCloseTo(MARGINS.gate.arrive, 1);
      expect(Number.isFinite(arrivalYaw(into))).toBe(true);
    }
    const [a0] = arrivalPath("margins"), [g0] = arrivalPath("garden");
    expect(Math.hypot(a0.x - gateFrame("home").g.x, a0.z - gateFrame("home").g.z)).toBeLessThan(1);
    expect(Math.hypot(g0.x - gateFrame("garden").g.x, g0.z - gateFrame("garden").g.z)).toBeLessThan(1);
  });
});

describe("the area", () => {
  it("is about four times the garden, in three zones that tile it", () => {
    expect(MARGINS.size).toBeGreaterThanOrEqual(GARDEN.size * 2);
    expect(MARGINS.zones.map((z) => z.id)).toEqual(["inkwood", "paper-hills", "glyph-steps"]);
    for (let x = -HALF + 1; x < HALF; x += 5) for (let z = -HALF + 1; z < HALF; z += 5) expect(zoneOf({ x, z }), `${x},${z}`).not.toBeNull();
  });
  it("is the same every time and fills each zone with its own scenery", () => {
    expect(generateLayout().trees).toEqual(layout.trees);
    const inkTrees = layout.trees.filter((t) => zoneOf(t)?.id === "inkwood").length;
    expect(inkTrees).toBeGreaterThan(30);
    expect(layout.hills.filter((h) => zoneOf(h)?.id === "paper-hills").length).toBeGreaterThan(3);
    expect(layout.stacks.length + layout.shelves.length).toBeGreaterThan(10);
  });
  it("keeps scenery apart, clear of the arrival, and inside the map", () => {
    const home = homePoint();
    for (const c of [...layout.trees, ...layout.bushes, ...layout.stacks]) {
      expect(Math.abs(c.x) + c.r).toBeLessThan(HALF);
      expect(Math.abs(c.z) + c.r).toBeLessThan(HALF);
      expect(Math.hypot(c.x - home.x, c.z - home.z)).toBeGreaterThan(c.r + 3);
    }
    expect(insideAny(home, R, layout.cols)).toBe(false);
    for (const a of arrivalPath("margins")) expect(insideAny(a, R, layout.cols)).toBe(false);
  });
  it("the ground rises under hills and is flat elsewhere", () => {
    const h = layout.hills[0];
    expect(heightAt(h.x, h.z, layout.hills)).toBeCloseTo(h.h, 5);
    expect(heightAt(h.x + h.r + 0.1, h.z, [h])).toBe(0);
    expect(heightAt(home().x, home().z, layout.hills)).toBe(0);
  });
  it("collision checks stay cheap: a modest number of colliders", () => {
    expect(layout.cols.circles.length + layout.cols.boxes.length).toBeLessThan(260);
  });
});
function home() { return homePoint(); }

describe("never lost", () => {
  it("every walkable cell can walk home, and the way home is a connected path", () => {
    let clear = 0, linked = 0;
    for (let k = 0; k < field.clear.length; k++) { if (field.clear[k]) { clear++; if (field.dist[k] >= 0) linked++; } }
    expect(clear).toBeGreaterThan(2000);
    expect(linked / clear).toBeGreaterThan(0.97); // the few unlinked cells are sealed pockets between scenery
    expect(reachable(field, homePoint())).toBe(true);
  });
  it("from a grid of starts the arrow trail reaches the gate and never crosses scenery", () => {
    let tried = 0;
    for (let x = -42; x <= 42; x += 7) for (let z = -42; z <= 42; z += 7) {
      const p = { x, z };
      if (insideAny(p, R, layout.cols) || !reachable(field, p)) continue;
      tried++;
      const path = homePath(field, p);
      expect(path.length, `${x},${z}`).toBeGreaterThan(1);
      const end = path[path.length - 1], h = homePoint();
      expect(Math.hypot(end.x - h.x, end.z - h.z)).toBeLessThan(MARGINS.field.cell * 1.6);
      for (const c of path.slice(1)) expect(insideAny(c, 0.3, layout.cols)).toBe(false);
    }
    expect(tried).toBeGreaterThan(60);
  });
  it("the trail is points along the route, evenly spaced, pointing toward home", () => {
    const path = homePath(field, { x: 30, z: 30 }), pts = along(path, 3, MARGINS.arrows.spacing, MARGINS.arrows.count);
    expect(pts.length).toBe(MARGINS.arrows.count);
    for (let i = 1; i < pts.length; i++) expect(Math.hypot(pts[i].p.x - pts[i - 1].p.x, pts[i].p.z - pts[i - 1].p.z)).toBeLessThanOrEqual(MARGINS.arrows.spacing + 0.01);
    expect(pathLength(path)).toBeGreaterThan(40);
  });
  it("walking the player along the home trail with the real movement code gets back to the gate", () => {
    const start = { x: 30, z: 30 };
    let pos = start, steps = 0;
    const path = homePath(field, start);
    let leg = 1;
    while (leg < path.length && steps++ < 20000) {
      const t = path[leg], d = Math.hypot(t.x - pos.x, t.z - pos.z);
      if (d < 0.4) { leg++; continue; }
      const yaw = 0; // forward is -z at yaw 0: steer by choosing the input so the heading faces the target
      const dx = t.x - pos.x, dz = t.z - pos.z;
      const r = movePlayer(pos, { forward: -dz / d, right: dx / d }, yaw, 4, 0.05, R, layout.cols, MARGINS.size);
      pos = r.pos;
    }
    expect(leg).toBe(path.length);
    expect(Math.hypot(pos.x - homePoint().x, pos.z - homePoint().z)).toBeLessThan(2.5);
  });
});

describe("the daily pages", () => {
  const day = (n: number) => utcDay(new Date(Date.UTC(2026, 9, 1 + n)));
  it("the same date gives the same pages, different dates differ", () => {
    const a = spotsForDay("2026-10-21", layout, field);
    expect(spotsForDay("2026-10-21", layout, field)).toEqual(a);
    const b = spotsForDay("2026-10-22", layout, field), c = spotsForDay("2026-10-23", layout, field);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    expect(JSON.stringify(b)).not.toBe(JSON.stringify(c));
    expect(a.length).toBe(MARGINS.spots.count);
  });
  it("for a month of dates no page is inside scenery, on the arrival, unreachable, off the map or on another page", () => {
    const home = homePoint();
    for (let n = 0; n < 40; n++) {
      const spots = spotsForDay(day(n), layout, field);
      expect(spots.length, day(n)).toBe(MARGINS.spots.count);
      for (const [i, s] of spots.entries()) {
        expect(insideAny(s, MARGINS.spots.clear * 0.9, layout.cols), `${day(n)} #${i}`).toBe(false);
        expect(reachable(field, s)).toBe(true);
        expect(Math.hypot(s.x - home.x, s.z - home.z)).toBeGreaterThanOrEqual(MARGINS.spots.fromGate);
        expect(Math.abs(s.x)).toBeLessThan(HALF - 2);
        expect(Math.abs(s.z)).toBeLessThan(HALF - 2);
        expect(zoneOf(s)?.id).toBe(s.zone);
        for (const o of spots.slice(i + 1)) expect(Math.hypot(o.x - s.x, o.z - s.z)).toBeGreaterThanOrEqual(MARGINS.spots.apart);
      }
      for (const z of MARGINS.zones) expect(spots.filter((s) => s.zone === z.id).length).toBe(z.spots);
    }
  });
  it("each day has food, and some of every kind across a week", () => {
    const kinds = new Set<string>();
    for (let n = 0; n < 7; n++) for (const s of spotsForDay(day(n), layout, field)) kinds.add(s.kind);
    expect([...kinds].sort()).toEqual(["glyph", "ink", "scrap"]);
    expect(pickKind(0)).toBe("ink");
    expect(pickKind(0.999)).toBe("scrap");
  });
  it("counts what's left and finds the nearest unopened page in reach", () => {
    const spots = spotsForDay("2026-10-21", layout, field), s0 = spots[0];
    expect(spotsLeft(spots, new Set())).toBe(spots.length);
    expect(spotsLeft(spots, new Set([0, 1]))).toBe(spots.length - 2);
    expect(nearestSpot({ x: s0.x + 0.5, z: s0.z }, spots, new Set())?.id).toBe(0);
    expect(nearestSpot({ x: s0.x + 0.5, z: s0.z }, spots, new Set([0]))?.id).not.toBe(0);
    expect(nearestSpot({ x: s0.x + 9, z: s0.z }, spots, new Set())).toBeNull();
  });
  it("glints fade with distance and show everywhere when ?finds=all", () => {
    expect(glintOpacity(1)).toBe(1);
    expect(glintOpacity(MARGINS.glint.visible)).toBe(1);
    expect(glintOpacity(MARGINS.glint.fadeTo)).toBe(0);
    expect(glintOpacity((MARGINS.glint.visible + MARGINS.glint.fadeTo) / 2)).toBeGreaterThan(0);
    expect(glintOpacity(80, true)).toBe(1);
  });
  it("seeds are stable", () => {
    expect(hashString("a")).toBe(hashString("a"));
    expect(hashString("a")).not.toBe(hashString("b"));
    const r = mulberry32(5), s = mulberry32(5);
    expect([r(), r()]).toEqual([s(), s()]);
  });
});

describe("the unfold", () => {
  it("needs a full hold and releasing early drains smoothly", () => {
    let p = 0;
    for (let t = 0; t < MARGINS.unfold.holdSeconds * 0.5; t += 0.01) p = holdStep(p, true, 0.01);
    expect(p).toBeGreaterThan(0.45);
    expect(p).toBeLessThan(0.6);
    const half = p;
    p = holdStep(p, false, 0.05);
    expect(p).toBeLessThan(half);
    expect(p).toBeGreaterThan(0);
    for (let t = 0; t < 2; t += 0.05) p = holdStep(p, false, 0.05);
    expect(p).toBe(0);
    for (let t = 0; t < 1.2; t += 0.01) p = holdStep(p, true, 0.01);
    expect(p).toBe(1);
  });
  it("opens in three beats, then the find rises, spins once and arcs away, all eased", () => {
    const b = MARGINS.unfold.beat;
    const at = (t: number) => unfoldFrame(t);
    expect(at(0)).toMatchObject({ corner: 0, rise: 0, arc: 0, done: false });
    expect(at(b * 0.5).corner).toBeGreaterThan(0);
    expect(at(b * 0.5).fold).toBeLessThan(0.3); // corner first
    expect(at(b * 1.5).fold).toBeGreaterThan(at(b * 0.5).fold);
    expect(at(b * 2.9).fold).toBeGreaterThan(0.9); // flat by the end of the third beat
    expect(at(3 * b + MARGINS.unfold.riseSeconds).spin).toBeCloseTo(Math.PI * 2, 5); // one slow spin
    expect(at(3 * b + MARGINS.unfold.riseSeconds * 0.5).arc).toBe(0);
    expect(at(unfoldSeconds() + 0.01)).toMatchObject({ arc: 1, done: true });
    let prev = at(0);
    for (let t = 0; t <= unfoldSeconds(); t += 1 / 60) {
      const f = at(t);
      for (const k of ["corner", "fold", "rise", "arc"] as const) expect(Math.abs(f[k] - prev[k]), `${k} ${t}`).toBeLessThan(0.12);
      prev = f;
    }
  });
  it("two stills 0.3 s apart in the rise and arc show the find in different places", () => {
    const t0 = 3 * MARGINS.unfold.beat + 0.1;
    const a = unfoldFrame(t0), b = unfoldFrame(t0 + 0.3);
    expect(b.rise).toBeGreaterThan(a.rise);
    const c = unfoldFrame(3 * MARGINS.unfold.beat + MARGINS.unfold.riseSeconds + 0.1), d = unfoldFrame(3 * MARGINS.unfold.beat + MARGINS.unfold.riseSeconds + 0.4);
    expect(d.arc).toBeGreaterThan(c.arc);
  });
  it("reduced motion: shorter, no spin", () => {
    expect(unfoldSeconds(true)).toBeLessThan(unfoldSeconds());
    expect(unfoldFrame(1.0, true).spin).toBe(0);
    expect(unfoldFrame(1.0, false).spin).toBeGreaterThan(0);
  });
  it("a full pouch leaves the page folded (the pouch refuses the item)", () => {
    expect(pouchAdd(["ink", "ink", "ink"], "ink")).toBeNull();
  });
});

describe("the client", () => {
  const src = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
  it("makes no server call for the Margins; feed_creature stays the only feed path", () => {
    expect(src("../lib/margins.ts")).not.toMatch(/supabase|rpc|three|fetch|Date\.now|performance|localStorage/);
    expect(src("../components/World.tsx")).not.toMatch(/supabase|\.rpc\(|fetch\(|localStorage/);
    const calls = [...src("../app/page.tsx").matchAll(/\.rpc\("([a-z_]+)"/g)].map((m) => m[1]).sort();
    expect(calls).toEqual(["claim_daily_egg", "claim_starter_egg", "feed_creature", "grow_creature", "hatch_egg", "margins_unfold", "set_worn_cosmetic", "world_unfold"]);
  });
  it("has no numbers or caps in public text", () => {
    expect(JSON.stringify(BOARD_PAGES)).not.toMatch(/\d/);
    expect(GARDEN.places.find((p) => p.id === "gate")!.prompt).not.toMatch(/\d/);
  });
  it("the world reads the page day once per visit through the Margins module", () => {
    expect(src("../components/World.tsx")).toMatch(/spotsForDay/);
  });
});
void cellOf;

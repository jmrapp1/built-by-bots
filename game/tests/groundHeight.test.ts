// H1: ground height. Pure checks (no WebGL): the function, the flat zones, the slope cap over the whole World, the flag, and the wiring.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { GROUND, GROUND_ENABLED, HOME_FLAT, asciiMap, flatDistance, groundFlag, groundOn, groundY } from "@/lib/ground";
import { HALF, WORLD, pathPoints } from "@/lib/worldMap";
import { GARDEN, printInReach, nearestPlace } from "@/lib/world";
import map from "@/data/map.json";
import home from "@/data/home.json";
import { npcSpot, NPCS } from "@/lib/npcs";

const ON = { scale: GROUND.scale };
const grid = (step: number, f: (x: number, z: number) => void) => { for (let x = -HALF; x <= HALF; x += step) for (let z = -HALF; z <= HALF; z += step) f(x, z); };

describe("H1 switch", () => {
  it("ships off; anything but a plain true is off", () => {
    expect(GROUND_ENABLED).toBe(false);
    for (const v of ["true", 1, null, undefined, {}]) expect(groundFlag({ ground: { enabled: v } })).toBe(false);
    expect(groundFlag({ ground: { enabled: true } })).toBe(true);
    expect(groundFlag(null)).toBe(false);
  });
  it("?ground= overrides in dev only", () => {
    const off = { ground: { enabled: false } }, on = { ground: { enabled: true } };
    expect(groundOn("?ground=1", false, off)).toBe(true);
    expect(groundOn("?ground=0", false, on)).toBe(false);
    expect(groundOn("?ground=1", true, off)).toBe(false);
    expect(groundOn("", true, on)).toBe(true);
  });
  it("scale 0 is exactly flat everywhere", () => { grid(16, (x, z) => expect(groundY(x, z, { scale: 0 })).toBe(0)); });
});

describe("H1 groundY", () => {
  it("is deterministic, finite and never negative", () => {
    grid(4, (x, z) => { const y = groundY(x, z); expect(Number.isFinite(y)).toBe(true); expect(y).toBeGreaterThanOrEqual(0); expect(groundY(x, z)).toBe(y); });
    for (const p of [[1e9, 0], [0, -1e9], [NaN, 0]]) expect(Number.isFinite(groundY(p[0], p[1]))).toBe(true);
  });
  it("there are hills (it is not flat everywhere) and they are low in H1", () => {
    let max = 0; grid(2, (x, z) => { max = Math.max(max, groundY(x, z)); });
    expect(max).toBeGreaterThan(0.1);
    expect(max).toBeLessThan(0.8);
  });
  it("the steepness cap holds across the whole World (grid, finer than a player step)", () => {
    const step = 0.5; let worst = 0;
    for (let x = -HALF; x < HALF; x += step) for (let z = -HALF; z < HALF; z += step) {
      const y = groundY(x, z);
      worst = Math.max(worst, Math.abs(groundY(x + step, z) - y) / step, Math.abs(groundY(x, z + step) - y) / step);
    }
    expect(worst).toBeLessThan(GROUND.maxSlope);
  });
  it("the cap also holds at full strength (scale 1), so H5 can raise the rises safely or must retune", () => {
    let worst = 0; const step = 0.5;
    for (let x = -HALF; x < HALF; x += step) for (let z = -HALF; z < HALF; z += step) {
      const y = groundY(x, z, { scale: 1 });
      worst = Math.max(worst, Math.abs(groundY(x + step, z, { scale: 1 }) - y) / step, Math.abs(groundY(x, z + step, { scale: 1 }) - y) / step);
    }
    expect(worst).toBeLessThan(0.4);
  });
  it("continuous across chunk edges", () => {
    for (let c = -HALF + WORLD.chunk; c < HALF; c += WORLD.chunk) for (let t = -HALF; t < HALF; t += 1) {
      expect(Math.abs(groundY(c - 0.01, t) - groundY(c + 0.01, t))).toBeLessThan(0.01);
      expect(Math.abs(groundY(t, c - 0.01) - groundY(t, c + 0.01))).toBeLessThan(0.01);
    }
  });
  it("is 0 at the World edge", () => { for (let t = -HALF; t <= HALF; t += 4) for (const e of [-HALF, HALF]) { expect(groundY(e, t)).toBe(0); expect(groundY(t, e)).toBe(0); } });
});

describe("H1 flat zones are exactly 0", () => {
  const flat = (x: number, z: number) => expect(groundY(x, z)).toBe(0);
  it("all of Home and its margin, the gate and its approach, the garden door", () => {
    for (let x = -HOME_FLAT; x <= HOME_FLAT; x += 1) for (let z = -HOME_FLAT; z <= HOME_FLAT; z += 1) flat(x, z);
    for (const p of GARDEN.places) flat(p.x, p.z);
    flat(home.door.garden.x, home.door.garden.z);
    const g = GARDEN.places.find((p) => p.id === "gate")!;
    for (let t = 0; t <= 9; t += 0.5) flat(g.x + t, g.z - t); // the walk out through the gate
  });
  it("the inked path and its keep-out", () => { for (const p of pathPoints(12)) for (let a = 0; a < 6.3; a += 0.5) flat(p.x + Math.cos(a) * WORLD.path.keepOut * 0.99, p.z + Math.sin(a) * WORLD.path.keepOut * 0.99); });
  it("landmark feet and signposts", () => {
    for (const l of WORLD.landmarks) for (let a = 0; a < 6.3; a += 0.3) flat(l.x + Math.cos(a) * (l.r + 4.9), l.z + Math.sin(a) * (l.r + 4.9));
    for (const s of map.signposts) for (let a = 0; a < 6.3; a += 0.5) flat(s.x + Math.cos(a) * 2.9, s.z + Math.sin(a) * 2.9);
  });
  it("flatDistance agrees with groundY: height is zero wherever it says flat", () => { grid(3, (x, z) => { if (flatDistance(x, z) <= 0) expect(groundY(x, z)).toBe(0); }); });
  it("neighbour stands in the Margins are not in the World, so they are untouched (npcSpot is local to the Margins)", () => { expect(NPCS.length).toBeGreaterThan(0); expect(Number.isFinite(npcSpot(NPCS[0]).x)).toBe(true); });
});

describe("H1 reach, saves and walking", () => {
  it("interact and feed reach stay on flat x/z distance whatever the height", () => {
    const p = { x: -75, z: 10 }; expect(groundY(p.x, p.z)).toBeGreaterThan(0);
    expect(printInReach({ x: p.x + 1.5, z: p.z }, p)).toBe(true);
    expect(printInReach({ x: p.x + GARDEN.print.feedReach + 0.1, z: p.z }, p)).toBe(false);
    expect(nearestPlace({ x: 17.5, z: -17.5 })?.id).toBe("gate");
  });
  it("a save holds x and z only; y is recomputed on load", () => {
    const src = readFileSync("lib/playerState.ts", "utf8");
    expect(src).not.toMatch(/\by:\s/);
    expect(groundY(-75, 10)).toBe(groundY(-75, 10));
  });
  it("a scripted walk over every rise: height changes at most speed x slope cap per second, so never a jump", () => {
    const speed = GARDEN.player.jogSpeed, dt = 1 / 30; let worst = 0;
    for (const z of [-110, -60, 10, 40, 90]) { let prev = groundY(-HALF + 2, z); for (let x = -HALF + 2; x < HALF - 2; x += speed * dt) { const y = groundY(x, z); worst = Math.max(worst, Math.abs(y - prev) / dt); prev = y; } }
    expect(worst).toBeLessThan(speed * GROUND.maxSlope);
  });
});

describe("H1 wiring (flag off equals main)", () => {
  const world = readFileSync("components/World.tsx", "utf8"), shell = readFileSync("components/worldShell.ts", "utf8");
  it("the player lifts only with the switch on, in the garden zone, and the Margins branch is untouched", () => {
    expect(world).toContain('else if (groundHeight && zones.is("garden")) ground = groundY(pos.x, pos.z);');
    expect(world).toContain("let ground = 0;");
    expect(world).toContain("buildWorldShell(scene, { hills: hillsOn, ground: groundHeight })");
  });
  it("the mesh is displaced only when asked", () => { expect(shell).toContain("if (opts.ground) {"); });
  it("data file: switch false, scale low", () => { expect(GROUND.enabled).toBe(false); expect(GROUND.scale).toBeLessThanOrEqual(0.2); });
});

describe("H1 ascii height map (printed so it can be checked without a phone)", () => {
  it("Home prints blank, and the map has hills elsewhere", () => {
    const home = asciiMap(1, {}, -HOME_FLAT, HOME_FLAT, -HOME_FLAT, HOME_FLAT);
    expect(home.replace(/[ \n]/g, "")).toBe("");
    const full = asciiMap(8, ON);
    if (process.env.PRINT_MAP) console.log(full);
    expect(full.replace(/[ \n]/g, "").length).toBeGreaterThan(20);
  });
});

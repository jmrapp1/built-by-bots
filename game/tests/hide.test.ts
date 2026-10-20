import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  HIDE, HIDEIDLE, canFind, canStartGame, hideAdvance, hideAnchor, hideArrived, hideBusy, hideFound, hideOverride, hidePose, hidePuffs, hideStart,
  maxGameSeconds, peekAmount, pickSpot, previewSpot, spotBehind, spotValid, withSpot, type HideState,
} from "@/lib/hide";
import { canPlayerSplash, POND } from "@/lib/pond";
import { routeTo, walkRoute } from "@/lib/night";
import { promptFor, FOUND_PROMPT } from "@/lib/ui";
import { GARDEN, colliders, insideAny } from "@/lib/world";

const cols = colliders();
const R = GARDEN.print.radius;
const player = { x: 0, z: 9 };

describe("night E-splash gate", () => {
  it("allows the splash by day and not at night, on the Print's own window", () => {
    expect(canPlayerSplash(12)).toBe(true);
    expect(canPlayerSplash(18.4)).toBe(true);
    expect(canPlayerSplash(18.6)).toBe(false);
    expect(canPlayerSplash(22)).toBe(false);
    expect(canPlayerSplash(POND.dayFrom)).toBe(true);
    expect(canPlayerSplash(POND.dayFrom - 0.1)).toBe(false);
  });
  it("the pond prompt says nothing at night and the place label by day", () => {
    const pond = GARDEN.places.find((p) => p.kind === "pond")!;
    const s = { hasEgg: true, hasCreature: true, hatchWait: 0 };
    expect(promptFor(pond, { ...s, canSplash: false })).toBeNull();
    expect(promptFor(pond, { ...s, canSplash: true })).toBe(pond.label);
    expect(promptFor(pond, s)).toBe(pond.label);
  });
  it("World uses the gate for the E handler", () => {
    expect(readFileSync("components/World.tsx", "utf8")).toMatch(/pgStart < 0 && canPlayerSplash\(hourNow\)/);
  });
});

describe("hiding spots", () => {
  it("put the tree between the player and the Print", () => {
    GARDEN.trees.forEach((t, i) => {
      const sp = spotBehind(i, player)!;
      const d = Math.hypot(t.x - player.x, t.z - player.z), dp = Math.hypot(sp.spot.x - player.x, sp.spot.z - player.z);
      expect(dp).toBeGreaterThan(d);
      const back = Math.hypot(sp.spot.x - t.x, sp.spot.z - t.z);
      expect(back).toBeGreaterThanOrEqual(t.r + HIDE.behind[0] - 1e-6);
      expect(back).toBeLessThanOrEqual(t.r + HIDE.behind[1] + 1e-6);
      // on the line player -> tree
      const cross = (t.x - player.x) * (sp.spot.z - player.z) - (t.z - player.z) * (sp.spot.x - player.x);
      expect(Math.abs(cross)).toBeLessThan(1e-6);
    });
  });
  it("a picked spot is clear of every collider, inside the map, far from the player and away from places", () => {
    for (const from of [player, { x: 0, z: -9 }, { x: 12, z: 0 }, { x: -10, z: 12 }, { x: 0, z: 0 }]) {
      for (let k = 0; k < 40; k++) {
        const pick = pickSpot(from, { x: from.x + 2, z: from.z }, k % 9, cols, Math.random(), Math.random(), Math.random());
        if (!pick) continue;
        expect(insideAny(pick.spot, R, cols)).toBe(false);
        expect(Math.abs(pick.spot.x)).toBeLessThan(GARDEN.size / 2 - R);
        expect(Math.abs(pick.spot.z)).toBeLessThan(GARDEN.size / 2 - R);
        const t = GARDEN.trees[pick.tree];
        expect(Math.hypot(t.x - from.x, t.z - from.z)).toBeGreaterThanOrEqual(HIDE.minTreeDistance);
        for (const q of GARDEN.places) expect(Math.hypot(q.x - pick.spot.x, q.z - pick.spot.z)).toBeGreaterThan(HIDE.placeClearance - 1e-6);
      }
    }
  });
  it("is never the same tree twice in a row", () => {
    for (let last = 0; last < GARDEN.trees.length; last++) for (let k = 0; k < 20; k++) {
      const pick = pickSpot(player, { x: 2, z: 9 }, last, cols, Math.random(), Math.random(), Math.random());
      if (pick) expect(pick.tree).not.toBe(last);
    }
  });
  it("finds at least one valid game from the default spawn", () => {
    expect(pickSpot(player, { x: 2, z: 9 }, -1, cols, 0, 0.5, 0)).not.toBeNull();
  });
  it("gives no game when nothing is valid", () => {
    expect(pickSpot(player, { x: 2, z: 9 }, -1, { circles: [...cols.circles, ...GARDEN.trees.map((t) => ({ x: t.x, z: t.z, r: 60 }))], boxes: [] }, 0, 0.5, 0)).toBeNull();
    expect(spotValid({ tree: 0, spot: { x: 99, z: 99 }, perp: { x: 1, z: 0 } }, player, player, cols)).toBe(false);
  });
});

const step = (s: HideState, secs: number, dt = 0.02) => { for (let t = 0; t < secs; t += dt) s = hideAdvance(s, dt); return s; };
describe("the game's states", () => {
  const spot = pickSpot(player, { x: 2, z: 9 }, -1, cols, 0, 0.5, 0)!;
  it("starts only by day, awake, with the pond idle and the player close", () => {
    const at = { x: 2, z: 9 };
    expect(canStartGame(12, true, true, at, player)).toBe(true);
    expect(canStartGame(22, true, true, at, player)).toBe(false);
    expect(canStartGame(12, false, true, at, player)).toBe(false);
    expect(canStartGame(12, true, false, at, player)).toBe(false);
    expect(canStartGame(12, true, true, { x: 30, z: 0 }, player)).toBe(false);
  });
  it("every state ends within the max time, so the Print is never lost", () => {
    expect(hideBusy(step(withSpot(hideStart(), spot), maxGameSeconds() + 0.5))).toBe(false); // hiding times out
    expect(step(withSpot(hideStart(), spot), maxGameSeconds() + 0.5)).toEqual(HIDEIDLE);
    const found = hideFound({ ...withSpot(hideStart(), spot), phase: "hiding" });
    expect(found.phase).toBe("found");
    expect(step(found, HIDE.foundSeconds + 0.1)).toEqual(HIDEIDLE);
  });
  it("goes inviting, dashing, hiding, leaving in order and gives up by itself", () => {
    let s = hideStart();
    expect(s.phase).toBe("inviting");
    s = step(s, HIDE.inviteSeconds + 0.05);
    expect(s.phase).toBe("dashing");
    s = hideArrived(withSpot(s, spot));
    expect(s.phase).toBe("hiding");
    s = step(s, HIDE.hideSeconds + 0.05);
    expect(s.phase).toBe("leaving");
    expect(step(s, HIDE.leaveSeconds + 0.05)).toEqual(HIDEIDLE);
  });
  it("found only works while hiding and within reach", () => {
    const hiding: HideState = { ...withSpot(hideStart(), spot), phase: "hiding" };
    const near = { x: spot.spot.x + 1, z: spot.spot.z };
    expect(canFind(hiding, near, spot.spot)).toBe(true);
    expect(canFind(hiding, { x: spot.spot.x + HIDE.reach + 1, z: spot.spot.z }, spot.spot)).toBe(false);
    expect(canFind({ ...hiding, phase: "dashing" }, near, spot.spot)).toBe(false);
    expect(canFind(HIDEIDLE, near, spot.spot)).toBe(false);
    expect(hideFound({ ...hiding, phase: "inviting" }).phase).toBe("inviting");
  });
  it("peeks about every 10 s, never at the start, and ducks back", () => {
    expect(peekAmount(0)).toBe(0);
    expect(peekAmount(5)).toBe(0);
    expect(peekAmount(HIDE.peekEvery + HIDE.peekSeconds / 2)).toBeCloseTo(1);
    expect(peekAmount(HIDE.peekEvery + HIDE.peekSeconds + 0.1)).toBe(0);
  });
  it("the Print steps out smoothly (no snap) when found or leaving", () => {
    let prev = hideAnchor({ ...withSpot(hideStart(), spot), phase: "found", t: 0 })!;
    for (let t = 0.02; t <= HIDE.foundSeconds; t += 0.02) {
      const a = hideAnchor({ ...withSpot(hideStart(), spot), phase: "found", t })!;
      expect(Math.hypot(a.x - prev.x, a.z - prev.z)).toBeLessThan(0.1);
      prev = a;
    }
  });
  it("poses and puffs are finite; reduced motion drops the hop and spin and uses fewer puffs", () => {
    for (const phase of ["inviting", "dashing", "hiding", "found", "leaving"] as const) for (let t = 0; t < 3; t += 0.1) {
      const s = { ...withSpot(hideStart(), spot), phase, t };
      for (const r of [false, true]) {
        const p = hidePose(s, r);
        for (const v of Object.values(p)) expect(Number.isFinite(v)).toBe(true);
        expect(p.squash).toBeGreaterThan(0.5);
        for (const pf of hidePuffs(s, r)) expect(Number.isFinite(pf.dx + pf.dy + pf.scale + pf.opacity)).toBe(true);
      }
    }
    const f = { ...withSpot(hideStart(), spot), phase: "found" as const, t: 0.5 };
    expect(hidePose(f, true).spin).toBe(0);
    expect(hidePose(f, true).hop).toBe(0);
    expect(hidePose(f, false).spin).toBeGreaterThan(0);
    expect(hidePuffs({ ...f, t: 1.2 }, true).length).toBeLessThanOrEqual(hidePuffs({ ...f, t: 1.2 }, false).length);
    expect(hidePuffs({ ...f, t: 1.2 }, false).every((p) => p.tone === "gold")).toBe(true);
  });
  it("hiding is never still: it sways and sends up a wisp", () => {
    const s: HideState = { ...withSpot(hideStart(), spot), phase: "hiding", t: 0.3 };
    expect(hidePose(s).shake).not.toBe(0);
    expect(hidePuffs(s).length).toBe(1);
  });
});

describe("preview switch and prompt", () => {
  it("?hide= works in dev and is ignored in production", () => {
    expect(hideOverride("?hide=1", false)).toBe("1");
    expect(hideOverride("?hide=found", false)).toBe("found");
    expect(hideOverride("?hide=x", false)).toBeNull();
    expect(hideOverride("?hide=1", true)).toBeNull();
    expect(hideOverride("", false)).toBeNull();
  });
  it("the found prompt has no numbers", () => { expect(FOUND_PROMPT).toBe("Found you?"); expect(FOUND_PROMPT).not.toMatch(/\d/); });
  it("E order in World: found, feed, sit, pond", () => {
    const src = readFileSync("components/World.tsx", "utf8");
    const i = [src.indexOf("if (hideFindable)"), src.indexOf("} else if (printNear) {"), src.indexOf('nearby?.kind === "rest"'), src.indexOf('nearby?.kind === "pond"')];
    expect(i.every((n) => n > 0)).toBe(true);
    expect([...i].sort((a, b) => a - b)).toEqual(i);
  });
  it("hide data has no network, and spacing is generous", () => {
    expect(readFileSync("lib/hide.ts", "utf8")).not.toMatch(/fetch\(|http/);
    expect(HIDE.spacing[0]).toBeGreaterThanOrEqual(60);
  });
});

describe("?hide=found is reproducible", () => {
  const starts = [[0, 9], [-6.6, 9.5], [-7.5, 8], [9, 5], [0, -4], [14, 1], [-12, -12], [4, 14]];
  it("puts the Print hiding in reach of the player at any start, on a clear spot, outside the pond", () => {
    for (const [x, z] of starts) for (const yaw of [0, 1, 2.5, -2]) {
      const player = { x, z }, sp = previewSpot(player, yaw, cols);
      const hiding = { ...withSpot(hideStart(), sp), phase: "hiding" as const, t: 0 };
      expect(canFind(hiding, player, sp.spot), `${x},${z},${yaw}`).toBe(true); // one E press works
      expect(insideAny(sp.spot, R, cols)).toBe(false);
      const pond = GARDEN.places.find((q) => q.kind === "pond")!;
      expect(Math.hypot(sp.spot.x - pond.x, sp.spot.z - pond.z)).toBeGreaterThan((pond.solid ?? 0) + R);
    }
  });
  it("is in front of the player when the way is clear (the default start)", () => {
    const sp = previewSpot({ x: 0, z: 9 }, 0, cols);
    expect(sp.spot.z).toBeLessThan(9);
    expect(Math.abs(sp.spot.x)).toBeLessThan(0.5);
  });
  it("found then plays and ends, and the prompt reads Found you?", () => {
    const sp = previewSpot({ x: 0, z: 9 }, 0, cols);
    let s = hideFound({ ...withSpot(hideStart(), sp), phase: "hiding" as const, t: 0 });
    expect(s.phase).toBe("found");
    for (let t = 0; t < HIDE.foundSeconds + 0.1; t += 0.02) s = hideAdvance(s, 0.02);
    expect(s.phase).toBe("idle"); // the burst is the end of the game
    expect(FOUND_PROMPT).toBe("Found you?");
  });
  it("World uses the preview spot and the findable prompt wins the E over the pond", () => {
    const w = readFileSync("components/World.tsx", "utf8");
    expect(w).toMatch(/previewSpot\(pos, yaw, cols\)/);
    expect(w.indexOf("if (hideFindable)")).toBeLessThan(w.indexOf("pgStart < 0 && canPlayerSplash"));
    expect(readFileSync("app/page.tsx", "utf8")).toMatch(/findable \? FOUND_PROMPT/);
  });
});

describe("the dash really reaches the hiding spot", () => {
  it("walks the route from many Print starts and rolls and ends at the spot, in time", () => {
    let games = 0, worst = 0;
    const players = [{ x: 0, z: 9 }, { x: -7.5, z: 8 }, { x: 9, z: 5 }, { x: 0, z: -4 }, { x: 12, z: -6 }];
    for (const player of players) for (let x = -14; x <= 14; x += 4) for (let z = -14; z <= 14; z += 4) {
      const print = { x, z };
      if (insideAny(print, R + 0.15, cols) || Math.hypot(x - player.x, z - player.z) > HIDE.inviteRadius) continue;
      for (const rolls of [[0, 0.2, 0.1], [0.9, 0.8, 0.7], [0.3, 0.5, 0.9]]) {
        const pick = pickSpot(player, print, -1, cols, rolls[0], rolls[1], rolls[2]);
        if (!pick) continue;
        games++;
        const route = routeTo(print, pick.spot, cols, R);
        let pos = print, leg = 0, done = false, t = 0;
        while (!done && t < HIDE.dashMaxSeconds) {
          const r = walkRoute(pos, route, leg, 0.05, R, cols, HIDE.dashSpeed);
          expect(insideAny(r.pos, R - 0.05, cols)).toBe(false);
          pos = r.pos; leg = r.leg; done = r.done; t += 0.05;
        }
        worst = Math.max(worst, t);
        expect(done, `dash from ${x},${z} to ${pick.spot.x.toFixed(1)},${pick.spot.z.toFixed(1)}`).toBe(true);
        expect(Math.hypot(pos.x - pick.spot.x, pos.z - pick.spot.z)).toBeLessThan(0.3);
      }
    }
    expect(games).toBeGreaterThan(40);
    expect(worst).toBeLessThan(HIDE.dashMaxSeconds);
  });
});

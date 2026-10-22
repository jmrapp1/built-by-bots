import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  FOLLOW, FOLLOWIDLE, canOfferFollow, followActive, followAdvance, followDrops, followEnd, followInterrupted, followMove, followOn, followOverride,
  followPose, followSpeed, followStart, followTarget, type OfferCtx, type StopCtx,
} from "@/lib/follow";
import { GARDEN, colliders, insideAny } from "@/lib/world";

const cols = colliders();
const R = GARDEN.print.radius;
const offer = (o: Partial<OfferCtx> = {}): OfferCtx => ({ hour: 12, awake: true, busy: false, panel: false, distance: 3, following: false, ...o });
const stop = (o: Partial<StopCtx> = {}): StopCtx => ({ awake: true, hour: 12, busy: false, panel: false, garden: true, distance: 3, ...o });

describe("prompt", () => {
  it("shows by day, near, idle", () => expect(canOfferFollow(offer())).toBe(true));
  it("is hidden at night, far away, while busy, with a panel open, or while already walking", () => {
    for (const o of [{ hour: 22 }, { hour: 3 }, { hour: 19 }, { distance: FOLLOW.promptRadius + 0.5 }, { busy: true }, { panel: true }, { following: true }, { awake: false }]) expect(canOfferFollow(offer(o))).toBe(false);
  });
});

describe("starting and ending", () => {
  it("starts with a hop, then walks", () => {
    let s = followStart();
    expect(s.phase).toBe("hop");
    s = followAdvance(s, FOLLOW.hopSeconds + 0.01, 4);
    expect(s.phase).toBe("on");
    expect(followOn(s)).toBe(true);
  });
  it("ends by key: a settle, then idle", () => {
    let s = followAdvance(followStart(), FOLLOW.hopSeconds + 0.01, 4);
    s = followEnd(s);
    expect(s.phase).toBe("settle");
    expect(followOn(s)).toBe(false);
    expect(followActive(s)).toBe(true);
    s = followAdvance(s, FOLLOW.settleSeconds + 0.01, 0);
    expect(s).toEqual(FOLLOWIDLE);
  });
  it("ends when the player stands still, but not while walking", () => {
    let s = followAdvance(followStart(), FOLLOW.hopSeconds + 0.01, 4);
    for (let i = 0; i < 100; i++) s = followAdvance(s, 0.1, 4); // 10 s of walking: still going
    expect(s.phase).toBe("on");
    for (let i = 0; i < Math.ceil(FOLLOW.stillSeconds / 0.1) + 2; i++) s = followAdvance(s, 0.1, 0);
    expect(s.phase).toBe("settle");
  });
  it("a short pause does not end it", () => {
    let s = followAdvance(followStart(), FOLLOW.hopSeconds + 0.01, 4);
    s = followAdvance(s, FOLLOW.stillSeconds - 0.5, 0);
    s = followAdvance(s, 0.1, 4);
    s = followAdvance(s, FOLLOW.stillSeconds - 0.5, 0);
    expect(s.phase).toBe("on");
  });
  it("ends by itself after the time limit", () => {
    let s = followAdvance(followStart(), FOLLOW.hopSeconds + 0.01, 4);
    for (let t = 0; t < FOLLOW.maxSeconds - 1; t += 0.5) s = followAdvance(s, 0.5, 4);
    expect(s.phase).toBe("on");
    s = followAdvance(s, 1.6, 4);
    expect(s.phase).toBe("settle");
  });
  it("ending twice, or while idle, changes nothing", () => {
    expect(followEnd(FOLLOWIDLE)).toEqual(FOLLOWIDLE);
    const s = followEnd(followAdvance(followStart(), 1, 4));
    expect(followEnd(s)).toEqual(s);
  });
});

describe("interrupts", () => {
  it("nothing wrong: carries on", () => expect(followInterrupted(stop())).toBe(false));
  it("a panel, another activity, night, bedtime, a door or being left far behind end it", () => {
    for (const o of [{ panel: true }, { busy: true }, { hour: 21 }, { awake: false }, { garden: false }, { distance: FOLLOW.farEnd + 1 }]) expect(followInterrupted(stop(o))).toBe(true);
  });
});

describe("where the Print walks", () => {
  const spots = [{ x: 0, z: 9 }, { x: -5, z: 3 }, { x: 10, z: -3 }, { x: 6, z: 14 }, { x: -12, z: -10 }];
  it("picks a clear spot behind and beside the player, never inside the player's reach", () => {
    for (const p of spots) for (let h = 0; h < 6.3; h += 0.4) {
      const t = followTarget(p, h, cols);
      if (!t) continue;
      expect(insideAny(t, R + 0.1, cols)).toBe(false);
      expect(Math.hypot(t.x - p.x, t.z - p.z)).toBeGreaterThanOrEqual(FOLLOW.minGap);
      expect(Math.abs(t.x)).toBeLessThanOrEqual(GARDEN.size / 2);
      expect(Math.abs(t.z)).toBeLessThanOrEqual(GARDEN.size / 2);
    }
  });
  it("sits behind the way the player walks", () => {
    const t = followTarget({ x: 0, z: 9 }, 0, cols)!; // walking toward +z: behind is -z
    expect(t.z).toBeLessThan(9);
  });
  it("finds a spot on open ground", () => expect(followTarget({ x: 0, z: 9 }, 1, cols)).not.toBeNull());
  it("gives up (null) when everything around is blocked", () => {
    const wall = { circles: [{ x: 0, z: 0, r: 30 }], boxes: [] };
    expect(followTarget({ x: 0, z: 0 }, 0, wall)).toBeNull();
  });
});

describe("speed and steps", () => {
  it("is zero when arrived, steady when near, faster but capped when far", () => {
    expect(followSpeed(0.1)).toBe(0);
    expect(followSpeed(1)).toBe(FOLLOW.baseSpeed);
    expect(followSpeed(6)).toBeGreaterThan(FOLLOW.baseSpeed);
    expect(followSpeed(500)).toBe(FOLLOW.maxSpeed);
    expect(FOLLOW.maxSpeed).toBeGreaterThan(GARDEN.print.speed);
  });
  it("never jumps farther than one frame's walk, and never enters scenery", () => {
    let at = { x: 0, z: 9 };
    const goal = { x: 12, z: -9 }, dt = 1 / 30;
    for (let i = 0; i < 900; i++) {
      const m = followMove(at, goal, FOLLOW.maxSpeed, dt, { x: 0, z: 30 }, cols);
      expect(Math.hypot(m.pos.x - at.x, m.pos.z - at.z)).toBeLessThanOrEqual(FOLLOW.maxSpeed * dt + 0.5); // the push-out can add a little
      expect(insideAny(m.pos, R - 0.15, cols)).toBe(false);
      at = m.pos;
    }
  });
  it("does not walk into the player", () => {
    const m = followMove({ x: 0, z: 1.5 }, { x: 0, z: 0 }, FOLLOW.maxSpeed, 0.1, { x: 0, z: 0 }, cols);
    expect(m.moving).toBe(false);
    expect(m.pos).toEqual({ x: 0, z: 1.5 });
  });
  it("stays put with zero speed", () => expect(followMove({ x: 1, z: 1 }, { x: 5, z: 5 }, 0, 0.1, { x: 9, z: 9 }, cols).moving).toBe(false));
});

describe("reduced motion", () => {
  it("has no hop and no drops, and calmer values", () => {
    const hop = followStart();
    expect(followPose({ ...hop, t: FOLLOW.hopSeconds / 2 }, false, true).hop).toBe(0);
    expect(followPose({ ...hop, t: FOLLOW.hopSeconds / 2 }, false, false).hop).toBeGreaterThan(0);
    const on = followAdvance(hop, FOLLOW.hopSeconds + 0.01, 4);
    expect(followDrops({ ...on, total: 1 }, true, true)).toEqual([]);
    expect(followPose(on, true, true).lean).toBeLessThan(followPose(on, true, false).lean);
  });
  it("drops show only while walking, not reduced", () => {
    const on = { ...followAdvance(followStart(), FOLLOW.hopSeconds + 0.01, 4), total: 1 };
    expect(followDrops(on, true, false).length).toBeGreaterThan(0);
    expect(followDrops(on, false, false)).toEqual([]);
    expect(followDrops(followStart(), true, false)).toEqual([]);
  });
});

describe("?follow=1 preview switch", () => {
  it("works in dev for the exact value only", () => {
    expect(followOverride("?follow=1", false)).toBe("1");
    expect(followOverride("?hour=12&follow=1", false)).toBe("1");
    for (const bad of ["", "?follow=", "?follow=0", "?follow=true", "?follows=1"]) expect(followOverride(bad, false)).toBeNull();
  });
  it("is ignored in production", () => expect(followOverride("?follow=1", true)).toBeNull());
});

describe("data", () => {
  const keys = ["key", "promptRadius", "maxSeconds", "stillSeconds", "stillSpeed", "farEnd", "hopSeconds", "hopHeight", "settleSeconds", "gap", "gapTries", "sides", "minGap", "arrive", "baseSpeed", "maxSpeed", "catchUpFrom", "catchUpTo", "routeEvery", "dropEvery", "calmFactor", "text"];
  it("has every key the code reads", () => { for (const k of keys) expect(FOLLOW).toHaveProperty(k); });
  it("sources no stray keys beyond the note", () => expect(Object.keys(FOLLOW).filter((k) => k !== "note" && !keys.includes(k))).toEqual([]));
  it("uses a key that is not already taken", () => {
    const taken = [JSON.parse(readFileSync("data/play.json", "utf8")).keys, { skip: "KeyF", map: "KeyM", walk: "KeyW" }].flatMap((o) => Object.values(o));
    expect(taken).not.toContain(FOLLOW.key);
  });
});

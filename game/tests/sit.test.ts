import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SIT, STANDING, canWalk, isSitting, lerpPos, sitAdvance, sitFrame, sitToggle, sitWalkKey, type SitState } from "@/lib/sit";
import { NIGHT } from "@/lib/night";
import { GARDEN, colliders, insideAny } from "@/lib/world";

const run = (s: SitState, secs: number, reduced = false, step = 0.05) => { for (let t = 0; t < secs; t += step) s = sitAdvance(s, step, reduced); return s; };

describe("sitting down", () => {
  it("takes a short, visible moment: it walks to the seat, then settles, then holds", () => {
    expect(SIT.goSeconds).toBeGreaterThanOrEqual(0.5);
    expect(SIT.goSeconds).toBeLessThanOrEqual(1.2);
    let s = sitToggle(STANDING);
    expect(s.phase).toBe("going");
    expect(sitFrame(s).move).toBe(0);
    expect(sitFrame(s).lower).toBe(0);
    s = run(s, SIT.goSeconds / 2);
    expect(sitFrame(s).move).toBeGreaterThan(0.2); // on the way, not teleported
    expect(sitFrame(s).move).toBeLessThan(0.8);
    s = run(s, SIT.goSeconds);
    expect(s.phase).toBe("seated");
    expect(sitFrame(s)).toMatchObject({ move: 1, lower: 1 });
  });
  it("walks first and lowers after, never lowering before it has started to move", () => {
    let s = sitToggle(STANDING), prevMove = 0, prevLower = 0;
    for (let t = 0; t < SIT.goSeconds; t += 0.02) {
      s = sitAdvance(s, 0.02);
      const f = sitFrame(s);
      expect(f.move).toBeGreaterThanOrEqual(prevMove);
      expect(f.lower).toBeGreaterThanOrEqual(prevLower);
      expect(f.lower).toBeLessThanOrEqual(f.move + 1e-9);
      prevMove = f.move; prevLower = f.lower;
    }
  });
  it("the glide never jumps in one frame", () => {
    let s = sitToggle(STANDING), prev = sitFrame(s).move;
    for (let t = 0; t < SIT.goSeconds + 0.1; t += 1 / 60) {
      s = sitAdvance(s, 1 / 60);
      const m = sitFrame(s).move;
      expect(Math.abs(m - prev)).toBeLessThan(0.1);
      prev = m;
    }
  });
});

describe("holding the pose", () => {
  const seated = run(sitToggle(STANDING), 2);
  it("sways gently and tilts, and stays lowered", () => {
    const sways = Array.from({ length: 90 }, (_, i) => sitFrame({ ...seated, t: i * 0.1 }).sway);
    expect(Math.max(...sways)).toBeGreaterThan(0.01);
    expect(Math.max(...sways)).toBeLessThanOrEqual(SIT.sway + 1e-9);
    expect(Math.min(...sways)).toBeLessThan(-0.01);
    expect(sitFrame(seated).tilt).toBeGreaterThan(0.05);
    expect(sitFrame(seated).lower).toBe(1);
  });
  it("is not sitting-still dead: it keeps swaying for as long as it is held", () => {
    expect(run(seated, 60).phase).toBe("seated");
  });
});

describe("standing up", () => {
  it("E rises back up and control only returns at the end", () => {
    let s = sitToggle(run(sitToggle(STANDING), 2));
    expect(s.phase).toBe("rising");
    expect(canWalk(s)).toBe(false);
    s = run(s, SIT.riseSeconds / 2);
    expect(canWalk(s)).toBe(false);
    expect(sitFrame(s).lower).toBeGreaterThan(0);
    expect(sitFrame(s).lower).toBeLessThan(1);
    s = run(s, SIT.riseSeconds);
    expect(s).toEqual(STANDING);
    expect(canWalk(s)).toBe(true);
    expect(sitFrame(s)).toMatchObject({ move: 0, lower: 0 });
  });
  it("a walking key gets you up, from the seat or half way down", () => {
    const seated = run(sitToggle(STANDING), 2);
    expect(sitWalkKey(seated).phase).toBe("rising");
    const half = run(sitToggle(STANDING), SIT.goSeconds * 0.7);
    const f = sitFrame(half).lower;
    const r = sitWalkKey(half);
    expect(r.phase).toBe("rising");
    expect(sitFrame(r).lower).toBeCloseTo(f); // continues from where it was: no pop
    expect(sitWalkKey(STANDING)).toEqual(STANDING);
  });
  it("pressing E again mid-move does nothing, so a double tap can't flip it", () => {
    const going = run(sitToggle(STANDING), 0.2);
    expect(sitToggle(going)).toEqual(going);
    const rising = sitToggle(run(sitToggle(STANDING), 2));
    expect(sitToggle(rising)).toEqual(rising);
  });
  it("the camera keeps easing until the player is fully up", () => {
    const rising = sitToggle(run(sitToggle(STANDING), 2));
    expect(isSitting(rising)).toBe(true);
    expect(isSitting(run(rising, 2))).toBe(false);
  });
});

describe("reduced motion", () => {
  it("is shorter, tilts less and does not sway", () => {
    let s = run(sitToggle(STANDING, true), SIT.goSeconds * SIT.reducedFactor + 0.1, true);
    expect(s.phase).toBe("seated");
    expect(run(sitToggle(STANDING), SIT.goSeconds * SIT.reducedFactor + 0.1).phase).toBe("going");
    const sways = Array.from({ length: 50 }, (_, i) => sitFrame({ ...s, t: i * 0.2 }, true).sway);
    expect(sways.every((v) => v === 0)).toBe(true);
    expect(sitFrame(s, true).tilt).toBeLessThan(sitFrame(s, false).tilt);
    s = sitToggle(s, true);
    expect(run(s, SIT.riseSeconds * SIT.reducedFactor + 0.1, true)).toEqual(STANDING);
  });
});

describe("the seat", () => {
  it("is clear of scenery for the player, next to the bed, and at a believable height", () => {
    expect(insideAny(NIGHT.sit, GARDEN.player.radius, colliders())).toBe(false);
    expect(Math.hypot(SIT.x - NIGHT.bed.x, SIT.z - NIGHT.bed.z)).toBeLessThanOrEqual(GARDEN.print.feedReach);
    expect(SIT.y).toBeLessThan(0.3); // down on the ground, not floating
    expect(SIT.y).toBeGreaterThanOrEqual(0);
    expect(SIT.lower).toBeGreaterThan(0.3); // clearly folded
    expect(SIT.lower).toBeLessThan(0.7);
  });
  it("blends positions smoothly", () => {
    expect(lerpPos({ x: 0, z: 0 }, { x: 10, z: 4 }, 0.5)).toEqual({ x: 5, z: 2 });
  });
});

describe("the client", () => {
  it("makes no server call for sitting", () => {
    expect(readFileSync(new URL("../lib/sit.ts", import.meta.url), "utf8").replace(/\/\/.*$/gm, "")).not.toMatch(/supabase|rpc|three|fetch|Date\.now|performance/);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  POND, PONDIDLE, answerTo, arrived, bigSplashLanded, canStartVisit, dropsAt, edgeNear, firstVisitDelay, isDay, maxDrops, nextVisitDelay,
  overrideState, phaseSeconds, playerGestureSeconds, playerLean, playerSplashLanded, pondAdvance, pondBusy, pondOverride, pondPlace, pondPose,
  pondStart, retryDelay, ringAt, ringCount, shorePoint, splashLife, splashSpot, tapsBetween, towardPond, distToPond, type PondState,
} from "@/lib/pond";
import { routeTo, walkRoute } from "@/lib/night";
import { GARDEN, colliders, insideAny } from "@/lib/world";
import { BOARD_PAGES } from "@/lib/board";

const cols = colliders();
const R = GARDEN.print.radius;
const run = (s: PondState, secs: number, step = 0.02) => { for (let t = 0; t < secs; t += step) s = pondAdvance(s, step); return s; };

describe("the shore", () => {
  it("is just outside the pond's collider and clear of scenery", () => {
    const c = pondPlace(), sh = shorePoint();
    const d = Math.hypot(sh.x - c.x, sh.z - c.z);
    expect(d).toBeGreaterThan(c.r + R * 0.9 - 0.4); // outside the water and bank
    expect(d).toBeLessThan(c.r + 1.6); // but close enough to reach in
    expect(insideAny(sh, R + 0.1, cols)).toBe(false);
    expect(insideAny(sh, GARDEN.player.radius, cols)).toBe(false);
  });
  it("splashes land on the water, in front of the Print, and face it", () => {
    const sh = shorePoint(), sp = splashSpot(sh), c = pondPlace();
    expect(Math.hypot(sp.x - c.x, sp.z - c.z)).toBeLessThan(c.r);
    expect(Math.hypot(sp.x - sh.x, sp.z - sh.z)).toBeCloseTo(POND.splashReach);
    const h = towardPond(sh);
    expect(Math.sin(h) * (c.x - sh.x) + Math.cos(h) * (c.z - sh.z)).toBeGreaterThan(0);
  });
  it("the player's splash starts at the water edge nearest them, inside the pond", () => {
    const c = pondPlace();
    for (const p of [{ x: -7.5, z: 8 }, { x: -11, z: 12 }, { x: -14, z: 6 }]) {
      const e = edgeNear(p);
      expect(Math.hypot(e.x - c.x, e.z - c.z)).toBeLessThan(c.r);
      expect(Math.hypot(e.x - c.x, e.z - c.z)).toBeGreaterThan(c.r - 0.8);
    }
  });
  it("from anywhere clear the Print can walk to the shore without getting stuck", () => {
    const lim = GARDEN.size / 2 - R - 1, shore = shorePoint();
    let tried = 0;
    for (let x = -lim; x <= lim; x += 2.5) for (let z = -lim; z <= lim; z += 2.5) {
      if (insideAny({ x, z }, R + 0.15, cols)) continue;
      tried++;
      let pos = { x, z }, leg = 0, done = false, steps = 0;
      const route = routeTo(pos, shore, cols, R);
      while (!done && steps++ < 6000) {
        const r = walkRoute(pos, route, leg, 0.05, R, cols, POND.walkSpeed);
        expect(insideAny(r.pos, R - 0.05, cols)).toBe(false);
        pos = r.pos; leg = r.leg; done = r.done;
      }
      expect(done, `stuck from ${x},${z}`).toBe(true);
      expect(Math.hypot(pos.x - shore.x, pos.z - shore.z)).toBeLessThan(0.3);
    }
    expect(tried).toBeGreaterThan(40);
  });
});

describe("when visits happen", () => {
  it("only by day, to an awake Print that is not too far", () => {
    expect(isDay(12)).toBe(true);
    expect(isDay(7)).toBe(false);
    expect(isDay(22)).toBe(false);
    expect(isDay(0)).toBe(false);
    expect(canStartVisit(12, true, { x: 0, z: 0 })).toBe(true);
    expect(canStartVisit(22, true, { x: 0, z: 0 })).toBe(false); // a night-time Print sleeps, it doesn't splash
    expect(canStartVisit(12, false, { x: 0, z: 0 })).toBe(false);
    expect(canStartVisit(12, true, { x: 200, z: 200 })).toBe(false);
  });
  it("is not constant: spacing is a range, and a retry is shorter", () => {
    expect(nextVisitDelay(0)).toBeGreaterThanOrEqual(POND.spacing[0]);
    expect(nextVisitDelay(1)).toBeLessThanOrEqual(POND.spacing[1]);
    expect(nextVisitDelay(1)).toBeGreaterThan(nextVisitDelay(0));
    expect(POND.spacing[0]).toBeGreaterThan(30); // never twice in a row
    expect(firstVisitDelay(0.5)).toBeLessThan(POND.spacing[0]); // the first one comes along reasonably soon
    expect(retryDelay(0.5)).toBeLessThan(nextVisitDelay(0));
  });
});

describe("a visit has a clear start, middle and end", () => {
  it("watches, goes, pats, splashes big, shakes off, then is idle again", () => {
    let s = pondStart();
    expect(s.phase).toBe("watching");
    s = run(s, POND.watchSeconds + 0.1);
    expect(s.phase).toBe("going");
    expect(pondAdvance(s, 100).phase).toBe("going"); // waits for arrival, not for time
    s = arrived(s);
    expect(s.phase).toBe("patting");
    s = run(s, POND.pats * POND.patPeriod + 0.1);
    expect(s.phase).toBe("splashing");
    s = run(s, POND.bigSplashSeconds + 0.1);
    expect(s.phase).toBe("leaving");
    s = run(s, POND.leaveSeconds + 0.1);
    expect(s).toEqual(PONDIDLE);
    expect(pondBusy(s)).toBe(false);
  });
  it("the whole visit takes a believable while", () => {
    const total = POND.watchSeconds + 5 + POND.pats * POND.patPeriod + POND.bigSplashSeconds + POND.leaveSeconds;
    expect(total).toBeGreaterThan(10);
    expect(total).toBeLessThan(22);
  });
  it("poses ease: no frame jumps, and the pat taps", () => {
    let s = arrived({ phase: "going", t: 0, pats: POND.pats, answer: false }), prev = pondPose(s);
    for (let t = 0; t < POND.pats * POND.patPeriod; t += 1 / 60) {
      s = pondAdvance(s, 1 / 60);
      const p = pondPose(s);
      expect(Math.abs(p.lean - prev.lean)).toBeLessThan(0.08);
      expect(Math.abs(p.squash - prev.squash)).toBeLessThan(0.2);
      prev = p;
    }
    const sq = Array.from({ length: 40 }, (_, i) => pondPose({ phase: "patting", t: 0.5 + i * 0.05, pats: 4, answer: false }).squash);
    expect(Math.max(...sq) - Math.min(...sq)).toBeGreaterThan(0.05);
    expect(pondPose({ phase: "patting", t: 1.5, pats: 4, answer: false }).lean).toBeGreaterThan(0.2); // leaning in
  });
  it("the big splash hops; the shake-off shimmies and settles", () => {
    const hops = Array.from({ length: 30 }, (_, i) => pondPose({ phase: "splashing", t: i * 0.05, pats: 0, answer: false }).hop);
    expect(Math.max(...hops)).toBeGreaterThan(0.15);
    const sh = Array.from({ length: 40 }, (_, i) => pondPose({ phase: "leaving", t: i * 0.03, pats: 0, answer: false }).shake);
    expect(Math.max(...sh)).toBeGreaterThan(0.1);
    expect(Math.min(...sh)).toBeLessThan(-0.1);
    expect(pondPose({ phase: "leaving", t: POND.leaveSeconds, pats: 0, answer: false }).shake).toBeCloseTo(0, 5);
  });
  it("reduced motion: no hop, no shimmy, leans less", () => {
    expect(pondPose({ phase: "splashing", t: 0.4, pats: 0, answer: false }, true).hop).toBe(0);
    expect(pondPose({ phase: "flinch", t: 0.2, pats: 2, answer: true }, true).hop).toBe(0);
    expect(pondPose({ phase: "leaving", t: 0.3, pats: 0, answer: false }, true).shake).toBe(0);
    expect(pondPose({ phase: "watching", t: 1, pats: 4, answer: false }, true).lean).toBeGreaterThan(pondPose({ phase: "watching", t: 1, pats: 4, answer: false }, false).lean);
  });
});

describe("splashes", () => {
  it("one tap per pat and one big splash, each landing exactly once", () => {
    let taps = 0;
    for (let t = 0; t < POND.pats * POND.patPeriod; t += 0.016) taps += tapsBetween(t, t + 0.016);
    expect(taps).toBe(POND.pats);
    let big = 0;
    for (let t = 0; t < POND.bigSplashSeconds; t += 0.016) if (bigSplashLanded(t, t + 0.016)) big++;
    expect(big).toBe(1);
    let ps = 0;
    for (let t = 0; t < playerGestureSeconds(); t += 0.016) if (playerSplashLanded(t, t + 0.016)) ps++;
    expect(ps).toBe(1);
  });
  it("a ring starts small at the splash, grows across the pond, fades, and is gone", () => {
    const at = splashSpot();
    const r = (age: number) => ringAt(age, false, false, 0, at);
    expect(r(0.01).radius).toBeLessThan(0.5);
    expect(r(0.5).radius).toBeGreaterThan(r(0.1).radius);
    expect(r(1.2).radius).toBeGreaterThan(r(0.5).radius);
    expect(r(1.2).opacity).toBeLessThan(r(0.3).opacity);
    expect(r(splashLife(false, false) + 0.01)).toEqual({ radius: 0, opacity: 0 });
    // reaches the far side of the pond, where the stencil cuts it at the edge
    const c = pondPlace();
    expect(ringAt(splashLife(false, false) * 0.99, false, false, 0, at).radius).toBeGreaterThan(Math.hypot(at.x - c.x, at.z - c.z) + c.r * 0.8);
    for (let a = 0; a < 3; a += 0.05) { const q = r(a); expect(q.opacity).toBeGreaterThanOrEqual(0); expect(q.opacity).toBeLessThanOrEqual(POND.ring.opacity); }
  });
  it("big splashes are bigger; reduced motion has fewer, slower, softer rings", () => {
    expect(splashLife(true, false)).toBeGreaterThan(splashLife(false, false));
    expect(ringCount(true, false)).toBeGreaterThan(ringCount(false, false));
    expect(ringCount(true, true)).toBe(1);
    expect(splashLife(false, true)).toBeGreaterThan(splashLife(false, false));
    const at = splashSpot();
    expect(ringAt(0.8, false, true, 0, at).opacity).toBeLessThan(ringAt(0.8, false, false, 0, at).opacity);
  });
  it("drops arc up and back down, spread out, and fade; more for the big splash; fewer when reduced", () => {
    const ys = Array.from({ length: 20 }, (_, i) => dropsAt(i * 0.05, false, false)[0]?.y ?? 0);
    expect(Math.max(...ys)).toBeGreaterThan(0.3);
    expect(ys[0]).toBeLessThan(0.05);
    expect(ys.indexOf(Math.max(...ys))).toBeGreaterThan(2);
    expect(ys.indexOf(Math.max(...ys))).toBeLessThan(17);
    const a = dropsAt(0.3, false, false), b = dropsAt(0.7, false, false);
    expect(Math.hypot(b[1].x, b[1].z)).toBeGreaterThan(Math.hypot(a[1].x, a[1].z)); // they move outwards
    expect(dropsAt(0.4, true, false).length).toBeGreaterThan(dropsAt(0.4, false, false).length);
    expect(dropsAt(0.4, true, true).length).toBeLessThan(dropsAt(0.4, true, false).length);
    expect(dropsAt(5, true, false)).toEqual([]);
    expect(dropsAt(0.4, true, false).length * POND.maxSplashes).toBeLessThanOrEqual(maxDrops() * 1.0001);
  });
});

describe("the player joins in", () => {
  it("leans down, holds, rises, smoothly", () => {
    const total = playerGestureSeconds();
    expect(total).toBeGreaterThan(0.8);
    expect(total).toBeLessThan(1.4);
    expect(playerLean(0)).toBe(0);
    expect(playerLean(POND.player.downSeconds + 0.1)).toBe(1);
    expect(playerLean(total + 0.1)).toBe(0);
    let prev = 0;
    for (let t = 0; t < total; t += 1 / 60) { const l = playerLean(t); expect(Math.abs(l - prev)).toBeLessThan(0.15); prev = l; }
    expect(playerLean(POND.player.splashAt)).toBeGreaterThan(0.5); // the splash lands as the lean arrives
  });
  it("a Print at the shore answers; one nearby comes over; far away or at night it stays put", () => {
    const sh = shorePoint();
    const patting: PondState = { phase: "patting", t: 1, pats: 4, answer: false };
    const a = answerTo(patting, sh, 12, true);
    expect(a.phase).toBe("flinch");
    expect(a.answer).toBe(true);
    expect(run(a, POND.flinchSeconds + 0.05).phase).toBe("patting");
    const answered = run(a, POND.flinchSeconds + 0.05);
    expect(run(answered, POND.answerPats * POND.patPeriod + 0.05).phase).toBe("leaving"); // pats back twice, then leaves
    const near = { x: sh.x + 4, z: sh.z + 2 };
    expect(distToPond(near)).toBeLessThanOrEqual(POND.callRadius);
    expect(answerTo(PONDIDLE, near, 12, true).phase).toBe("watching");
    expect(answerTo(PONDIDLE, { x: 100, z: 100 }, 12, true)).toEqual(PONDIDLE);
    expect(answerTo(PONDIDLE, near, 22, true)).toEqual(PONDIDLE);
    expect(answerTo(PONDIDLE, near, 12, false)).toEqual(PONDIDLE);
  });
});

describe("preview switches", () => {
  it("work in development and are ignored in production", () => {
    expect(pondOverride("?pond=1", false)).toBe("1");
    expect(pondOverride("?pond=splash", false)).toBe("splash");
    expect(pondOverride("?pond=1", true)).toBeNull();
    expect(pondOverride("?pond=splash", true)).toBeNull();
    expect(pondOverride("?pond=other", false)).toBeNull();
    expect(pondOverride("", false)).toBeNull();
    expect(overrideState("splash").phase).toBe("splashing");
    expect(overrideState("1").phase).toBe("patting");
  });
});

describe("the client", () => {
  const src = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
  it("makes no server call for pond play", () => {
    expect(src("../lib/pond.ts")).not.toMatch(/supabase|rpc|three|fetch|Date\.now|performance/);
    expect(src("../components/World.tsx")).not.toMatch(/supabase|\.rpc\(|fetch\(/);
  });
  it("a feed or stroke or bedtime cancels a visit, and the pond only runs for an awake Print", () => {
    const w = src("../components/World.tsx");
    expect(w).toMatch(/pondBusy\(pondS\) && \(engaged \|\| !awakeNow\)/);
    expect(w).toMatch(/awakeNow = ph === "awake" && bed === "none"/);
  });
  it("the pond prompt and the board have no numbers", () => {
    expect(GARDEN.places.find((p) => p.kind === "pond")!.prompt).toBe("Splash");
    expect(JSON.stringify(BOARD_PAGES)).not.toMatch(/\d/);
  });
});

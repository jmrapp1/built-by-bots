import { describe, expect, it } from "vitest";
import raw from "@/data/npcs.json";
import {
  ICON_NAMES, MAX_LINE, NOTICE0, NPCS, TALK0, TIMES, bubbleLook, checkNpc, checkNpcs, closeTalk, greetingIcons, noticeStep, npcSpot, sway, talk, talkStillNear, withinSlack,
} from "@/lib/npcs";
import { MARGINS, generateLayout, gatePosts, inGateZone } from "@/lib/margins";
import { insideAny } from "@/lib/world";

const good = () => JSON.parse(JSON.stringify(raw.npcs[0]));
const binder = NPCS[0];

describe("the data file", () => {
  it("has the Binder with 6 to 10 short lines and allowed icons", () => {
    expect(NPCS.map((n) => n.id)).toContain("binder");
    expect(binder.hints.length).toBeGreaterThanOrEqual(6);
    expect(binder.hints.length).toBeLessThanOrEqual(10);
    for (const h of binder.hints) {
      expect(h.text.length).toBeLessThanOrEqual(MAX_LINE);
      for (const i of h.icons) expect(ICON_NAMES).toContain(i);
    }
  });
  it("promises no reward and no errand", () => {
    for (const h of binder.hints) expect(h.text).not.toMatch(/reward|errand|trade|gift|pay|coin|prize/i);
  });
  it("rejects bad shapes without throwing", () => {
    const bad = (f: (n: any) => void) => { const n = good(); f(n); return checkNpc(n); };
    expect(bad(() => {})).not.toBeNull();
    expect(bad((n) => { n.id = ""; })).toBeNull();
    expect(bad((n) => { n.hints = []; })).toBeNull();
    expect(bad((n) => { n.hints = "no"; })).toBeNull();
    expect(bad((n) => { n.hints[0].icons = ["nope"]; })).toBeNull();
    expect(bad((n) => { n.hints[0].icons = []; })).toBeNull();
    expect(bad((n) => { n.hints[0].text = "x".repeat(MAX_LINE + 1); })).toBeNull();
    expect(bad((n) => { n.noticeLeave = n.noticeEnter; })).toBeNull();
    expect(bad((n) => { n.spot = null; })).toBeNull();
    expect(bad((n) => { n.greeting.otherwise = "bogus"; })).toBeNull();
    expect(bad((n) => { n.greeting.timeIcons[0].from = 9; n.greeting.timeIcons[0].to = 3; })).toBeNull();
    expect(bad((n) => { n.area = "garden"; })).toBeNull();
  });
  it("skips her, not the world, when the file is broken", () => {
    for (const junk of [null, undefined, 5, "x", [], {}, { npcs: null }, { npcs: [null, 3, "a"] }]) expect(checkNpcs(junk)).toEqual([]);
  });
  it("keeps ids unique", () => {
    const two = { npcs: [good(), good()] };
    expect(checkNpcs(two)).toHaveLength(1);
  });
});

describe("where she stands", () => {
  const at = npcSpot(binder), layout = generateLayout();
  it("is inside the Margins, clear of the gate posts, the gate zone and the scenery", () => {
    expect(Math.abs(at.x)).toBeLessThan(MARGINS.size / 2);
    expect(Math.abs(at.z)).toBeLessThan(MARGINS.size / 2);
    expect(inGateZone(at, "home")).toBe(false);
    expect(insideAny(at, binder.radius + 0.4, { circles: gatePosts("home"), boxes: [] })).toBe(false);
    expect(insideAny(at, binder.radius, layout.cols)).toBe(false);
  });
  it("is off the walkway from the gate", () => {
    const g = MARGINS.gate.margins, d = Math.hypot(at.x - g.x, at.z - g.z);
    expect(d).toBeGreaterThan(binder.radius + 1.5);
  });
});

describe("notice range with slack", () => {
  it("does not flicker at the edge", () => {
    const { noticeEnter: e, noticeLeave: l } = binder;
    expect(withinSlack(e + 0.1, false, e, l)).toBe(false);
    expect(withinSlack(e - 0.1, false, e, l)).toBe(true);
    expect(withinSlack(e + 0.1, true, e, l)).toBe(true);
    expect(withinSlack(l + 0.1, true, e, l)).toBe(false);
    let s = NOTICE0, flips = 0, last = false;
    for (let i = 0; i < 200; i++) { s = noticeStep(s, e + Math.sin(i) * 0.3, e, l, 0.016, false); if (s.near !== last) flips++; last = s.near; }
    expect(flips).toBeLessThanOrEqual(1);
  });
  it("turns in about 0.4 s, then blooms in about 0.3 s", () => {
    let s = NOTICE0, t = 0;
    const dt = 0.01;
    let turned = -1, bloomed = -1, started = -1;
    for (; t < 2; t += dt) {
      s = noticeStep(s, 1, binder.noticeEnter, binder.noticeLeave, dt, false);
      if (started < 0 && s.bubble > 0) started = t;
      if (turned < 0 && s.turn >= 1) turned = t;
      if (bloomed < 0 && s.bubble >= 1) bloomed = t;
    }
    expect(turned).toBeGreaterThan(TIMES.turn - 0.05);
    expect(turned).toBeLessThan(TIMES.turn + 0.05);
    expect(started).toBeGreaterThan(0); // the bubble comes after the turn has begun
    expect(bloomed - started).toBeGreaterThan(TIMES.bloom - 0.05);
    expect(bloomed - started).toBeLessThan(TIMES.bloom + 0.05);
  });
  it("eases back and fades out on leaving", () => {
    let s = { near: true, turn: 1, bubble: 1 };
    for (let i = 0; i < 100; i++) s = noticeStep(s, 50, binder.noticeEnter, binder.noticeLeave, 0.01, false);
    expect(s).toEqual({ near: false, turn: 0, bubble: 0 });
  });
  it("snaps and plainly fades with reduced motion", () => {
    const a = noticeStep(NOTICE0, 1, binder.noticeEnter, binder.noticeLeave, 0.01, true);
    expect(a.turn).toBe(1);
    let s = a, t = 0;
    while (s.bubble < 1 && t < 1) { s = noticeStep(s, 1, binder.noticeEnter, binder.noticeLeave, 0.01, true); t += 0.01; }
    expect(t).toBeLessThanOrEqual(TIMES.reducedFade + 0.02);
    expect(TIMES.reducedFade).toBeLessThanOrEqual(0.15);
    expect(bubbleLook(0.5, true).scale).toBe(1);
    expect(bubbleLook(0.5, false).scale).toBeLessThan(1);
    expect(sway(1.3, true)).toBe(0);
    expect(sway(1.3, false)).not.toBe(0);
  });
});

describe("the bubble icons by hour", () => {
  it("match the time of day", () => {
    expect(greetingIcons(binder, 12)[0]).toBe("leaf");
    expect(greetingIcons(binder, 6)[0]).toBe("drop");
    expect(greetingIcons(binder, 19)[0]).toBe("drop");
    expect(greetingIcons(binder, 23)[0]).toBe("moon");
    expect(greetingIcons(binder, 2)[0]).toBe("moon");
    expect(greetingIcons(binder, 12)).toContain("question");
    expect(greetingIcons(binder, 12).length).toBeLessThanOrEqual(3);
  });
});

describe("talking", () => {
  const n = binder.hints.length;
  it("starts at the first hint, cycles in order, and loops", () => {
    let s = TALK0; const seen: number[] = [];
    for (let i = 0; i < n * 2 + 1; i++) { s = talk(s, n); seen.push(s.shown); }
    expect(seen.slice(0, n)).toEqual(Array.from({ length: n }, (_, i) => i));
    expect(seen[n]).toBe(0);
    expect(s.open).toBe(true);
  });
  it("closing keeps the place; a fresh start (reload) is the first hint", () => {
    let s = talk(TALK0, n); s = closeTalk(s);
    expect(s.open).toBe(false);
    expect(talk(s, n).shown).toBe(1);
    expect(talk(TALK0, n).shown).toBe(0);
  });
  it("closes when the player walks away, with slack", () => {
    const s = talk(TALK0, n);
    expect(talkStillNear(s, binder.talkLeave - 0.1, binder).open).toBe(true);
    expect(talkStillNear(s, binder.talkLeave + 0.1, binder).open).toBe(false);
  });
  it("does nothing with no hints", () => { expect(talk(TALK0, 0)).toBe(TALK0); });
});

describe("N2: a list of neighbours", () => {
  const owl = NPCS.find((n) => n.id === "proofreader")!;
  const layout2 = generateLayout();
  it("has both, with distinct names, looks and greeting icons", () => {
    expect(NPCS.map((n) => n.id)).toEqual(["binder", "proofreader"]);
    expect(owl.look).not.toBe(binder.look);
    expect(greetingIcons(owl, 12)[0]).toBe("book");
    expect(greetingIcons(owl, 23)[0]).toBe("moon");
    expect(greetingIcons(owl, 12)).toContain("question");
    expect(owl.hints.length).toBeGreaterThanOrEqual(6);
    for (const h of owl.hints) { expect(h.text.length).toBeLessThanOrEqual(MAX_LINE); expect(h.text).not.toMatch(/reward|errand|trade|gift|prize/i); }
  });
  it("the Binder is unchanged (same spot form, same numbers)", () => {
    expect("from" in binder.spot).toBe(true);
    expect(binder.noticeEnter).toBe(6); expect(binder.noticeLeave).toBe(7.5); expect(binder.talkEnter).toBe(3); expect(binder.talkLeave).toBe(4.2);
    expect(binder.hints.length).toBe(8);
  });
  it("places the Proof-reader at a fixed point in Glyph Steps, clear of stacks, shelves, trees and the gate", () => {
    const at = npcSpot(owl);
    expect(at).toEqual({ x: -36, z: -18.5, face: owl.spot && "face" in owl.spot ? owl.spot.face : NaN });
    const zone = MARGINS.zones.find((z) => z.id === "glyph-steps")!;
    expect(at.x).toBeGreaterThan(zone.x0); expect(at.x).toBeLessThan(zone.x1);
    expect(at.z).toBeGreaterThan(zone.z0); expect(at.z).toBeLessThan(zone.z1);
    expect(insideAny(at, owl.radius + 1.2, layout2.cols)).toBe(false);
    expect(insideAny(at, owl.radius + 0.4, { circles: gatePosts("home"), boxes: [] })).toBe(false);
    expect(Math.hypot(at.x - npcSpot(binder).x, at.z - npcSpot(binder).z)).toBeGreaterThan(20);
  });
  it("is beside a shelf (within 3 m of one), off any walkway slot", () => {
    const at = npcSpot(owl);
    const d = Math.min(...layout2.shelves.map((b) => Math.hypot(Math.max(0, Math.abs(at.x - b.x) - b.w / 2), Math.max(0, Math.abs(at.z - b.z) - b.d / 2))));
    expect(d).toBeLessThan(3);
    expect(d).toBeGreaterThan(owl.radius + 0.5);
  });
  it("accepts the absolute spot form and rejects bad ones", () => {
    const v = (f: (n: any) => void) => { const n = JSON.parse(JSON.stringify(raw.npcs[1])); f(n); return checkNpc(n); };
    expect(v(() => {})).not.toBeNull();
    expect(v((n) => { n.spot = { at: [1], face: 0 }; })).toBeNull();
    expect(v((n) => { n.spot = { at: [1, "z"], face: 0 }; })).toBeNull();
    expect(v((n) => { n.spot = { at: [500, 0], face: 0 }; })).toBeNull();
    expect(v((n) => { n.spot = { at: [1, 1] }; })).toBeNull();
    expect(v((n) => { n.spot = { foo: 1 }; })).toBeNull();
    expect(v((n) => { n.look = "dragon"; })).toBeNull();
  });
  it("one broken entry skips only that neighbour", () => {
    const bad = JSON.parse(JSON.stringify(raw.npcs[1])); bad.hints = [];
    expect(checkNpcs({ npcs: [raw.npcs[0], bad] }).map((n) => n.id)).toEqual(["binder"]);
    expect(checkNpcs({ npcs: [bad, raw.npcs[0], null] }).map((n) => n.id)).toEqual(["binder"]);
  });
  it("each keeps its own hint place", () => {
    let a = TALK0, b = TALK0;
    a = talk(a, binder.hints.length); a = talk(a, binder.hints.length);
    b = talk(b, owl.hints.length);
    expect(a.shown).toBe(1); expect(b.shown).toBe(0);
  });
});

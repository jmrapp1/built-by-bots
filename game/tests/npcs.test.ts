import { describe, expect, it } from "vitest";
import raw from "@/data/npcs.json";
import {
  ICON_NAMES, MAX_DAY_SPOTS, MAX_LINE, NOTICE0, NPCS, TALK0, TIMES, bubbleLook, checkNpc, checkNpcs, closeTalk, dayNumber, daySpotIndex, npcSpotUsable, greetingIcons, noticeStep, npcSpot, sway, talk, talkStillNear, withinSlack,
} from "@/lib/npcs";
import { MARGINS, buildField, generateLayout, gatePosts, inGateZone, reachable, spotsForDay } from "@/lib/margins";
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
    expect(NPCS.map((n) => n.id)).toEqual(["binder", "proofreader", "wanderer"]);
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

describe("N3, the Wanderer", () => {
  const w = NPCS.find((n) => n.id === "wanderer")!;
  const layout = generateLayout(), field = buildField(layout.cols);
  const at = (i: number) => ({ x: w.spots![i].at[0], z: w.spots![i].at[1] });
  it("is loaded with the traveller look and 3 to MAX_DAY_SPOTS spots, 8 or 9 of them", () => {
    expect(w).toBeTruthy();
    expect(w.look).toBe("traveller");
    expect(w.spots!.length).toBeGreaterThanOrEqual(3);
    expect(w.spots!.length).toBeLessThanOrEqual(MAX_DAY_SPOTS);
    expect(MAX_DAY_SPOTS).toBe(9);
    expect([8, 9]).toContain(w.spots!.length); // not a divisor of 7: she does not land on the same place every week
    expect(w.hints).toHaveLength(8);
    for (const h of w.hints) expect(h.text).not.toMatch(/reward|errand|trade|gift|pay|coin|prize/i);
  });
  it("has at least one spot in each Margins zone", () => {
    for (const z of MARGINS.zones) expect(w.spots!.some((s) => s.at[0] >= z.x0 && s.at[0] < z.x1 && s.at[1] >= z.z0 && s.at[1] < z.z1)).toBe(true);
  });
  it("every spot is clear, reachable, off the gate path, away from the owl and from every page spot", () => {
    const owl = npcSpot(NPCS.find((n) => n.id === "proofreader")!), bind = npcSpot(NPCS.find((n) => n.id === "binder")!);
    const g = MARGINS.gate.margins, o = MARGINS.gate.out;
    const pages: { x: number; z: number }[] = [];
    for (let i = 0; i < 730; i++) pages.push(...spotsForDay(new Date(Date.UTC(2026, 9, 1) + i * 864e5).toISOString().slice(0, 10), layout, field));
    w.spots!.forEach((_, i) => {
      const p = at(i);
      expect(npcSpotUsable(p, w.radius, layout.cols, [{ x: owl.x, z: owl.z, r: 0.55 }, { x: bind.x, z: bind.z, r: 0.55 }])).toBe(true);
      expect(insideAny(p, w.radius + 1.5, layout.cols)).toBe(false);
      expect(reachable(field, p)).toBe(true);
      expect(Math.hypot(p.x - owl.x, p.z - owl.z)).toBeGreaterThan(8);
      let wd = Infinity; for (let t = 0; t <= 25; t += 0.5) wd = Math.min(wd, Math.hypot(p.x - (g.x + o[0] * t), p.z - (g.z + o[1] * t)));
      expect(wd).toBeGreaterThan(3);
      expect(Math.min(...pages.map((s) => Math.hypot(s.x - p.x, s.z - p.z)))).toBeGreaterThan(1.5);
    });
  });
  it("keeps the first four spots as they were, in order", () => {
    expect(w.spots!.slice(0, 4).map((s) => [...s.at, s.face])).toEqual([[-36, 30, 2.27], [-3, 16, 2.96], [18, -7, -1.2], [34, -3, -1.48]]);
  });
  it("every two spots are at least 6 apart", () => {
    for (let i = 0; i < w.spots!.length; i++) for (let j = i + 1; j < w.spots!.length; j++) expect(Math.hypot(at(i).x - at(j).x, at(i).z - at(j).z), `${i}-${j}`).toBeGreaterThanOrEqual(6);
  });
  it("crosses zones: no two days in a row (across a full cycle, wrapping) are in the same zone, and each zone has 2 or more", () => {
    const zoneOfSpot = (i: number) => MARGINS.zones.find((z) => at(i).x >= z.x0 && at(i).x < z.x1 && at(i).z >= z.z0 && at(i).z < z.z1)?.id;
    const n = w.spots!.length;
    for (let i = 0; i < n; i++) expect(zoneOfSpot(i), `${i}`).not.toBe(zoneOfSpot((i + 1) % n));
    for (const z of MARGINS.zones) expect(w.spots!.filter((_, i) => zoneOfSpot(i) === z.id).length).toBeGreaterThanOrEqual(2);
    // and the real day walk: a run of days over two cycles
    let last: string | undefined;
    for (let d = 0; d < n * 2; d++) { const day = new Date(Date.UTC(2026, 9, 1) + d * 864e5).toISOString().slice(0, 10); const z = zoneOfSpot(daySpotIndex(day, n)); if (last) expect(z).not.toBe(last); last = z; }
  });
  it("picks the spot from the day number, the same all day, and moves on the next day", () => {
    expect(dayNumber("1970-01-02")).toBe(1);
    expect(dayNumber("nope")).toBeNull();
    expect(daySpotIndex("2026-10-21", 4)).toBe(daySpotIndex("2026-10-21", 4));
    expect(daySpotIndex("2026-10-22", 4)).toBe((daySpotIndex("2026-10-21", 4) + 1) % 4);
    const seen = new Set<string>();
    for (let d = 1; d <= w.spots!.length; d++) { const p = npcSpot(w, `2026-11-0${d}`); seen.add(`${p.x},${p.z}`); }
    expect(seen.size).toBe(w.spots!.length);
    expect(daySpotIndex("garbage", 4)).toBe(0);
  });
  it("rejects bad spot lists and bad looks without throwing", () => {
    const raw0 = JSON.parse(JSON.stringify(raw.npcs.find((n: any) => n.id === "wanderer")));
    const bad = (f: (n: any) => void) => { const n = JSON.parse(JSON.stringify(raw0)); f(n); return checkNpc(n); };
    expect(bad(() => {})).not.toBeNull();
    expect(bad((n) => { n.spots = n.spots.slice(0, 2); })).toBeNull();
    expect(bad((n) => { n.spots = [...n.spots, ...n.spots]; })).toBeNull(); // 16 spots
    expect(bad((n) => { n.spots = [...n.spots, ...n.spots].slice(0, MAX_DAY_SPOTS + 1); })).toBeNull(); // 10 spots
    expect(bad((n) => { n.spots = [...n.spots, ...n.spots].slice(0, MAX_DAY_SPOTS); })).not.toBeNull(); // 9 spots
    expect(bad((n) => { n.spots[0].at = [999, 0]; })).toBeNull();
    expect(bad((n) => { n.spots[1] = null; })).toBeNull();
    expect(bad((n) => { n.spots = "x"; })).toBeNull();
    expect(bad((n) => { n.look = "ghost"; })).toBeNull();
    expect(checkNpcs({ npcs: [{ id: "x" }, raw0] }).map((n) => n.id)).toEqual(["wanderer"]);
  });
  it("skips a day's spot that is blocked, without throwing", () => {
    const tree = layout.trees[0];
    expect(npcSpotUsable({ x: tree.x, z: tree.z }, 0.55, layout.cols, [])).toBe(false);
    expect(npcSpotUsable(at(0), 0.55, layout.cols, [{ x: at(0).x + 0.5, z: at(0).z, r: 0.55 }])).toBe(false);
    expect(npcSpotUsable(at(0), 0.55, undefined, [])).toBe(false);
  });
  it("leaves the Binder and the Proof-reader as they were", () => {
    expect(npcSpot(binder)).toEqual(npcSpot(binder, "2026-10-21"));
    const owl = NPCS.find((n) => n.id === "proofreader")!;
    expect(npcSpot(owl, "2026-10-22")).toEqual({ x: -36, z: -18.5, face: 3.14 });
    expect(owl.spots).toBeNull(); expect(binder.spots).toBeNull();
  });
  it("greets with a trail by day, a moon at night, plus a question", () => {
    expect(greetingIcons(w, 12)).toEqual(["trail", "question"]);
    expect(greetingIcons(w, 23)).toEqual(["moon", "question"]);
  });
});

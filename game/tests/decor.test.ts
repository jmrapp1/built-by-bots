// Slice 2 (client only): decorations on the Home plots. Data checks, choices, motion with both reduced values, wiring pins.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HOME_ROOM, doorFrame, insideRoom, inDoorZone } from "@/lib/home";
import { CLEAR, DECORATIONS, DECOR_TITLE, M, PLOTS, PLOT_POSES, advanceSlot, canPlace, clearPose, clearSeconds, decorChoicesFor, decorPreview, decorStrip, fitting, inkDrops, markerPose, newSlot, nearestPlot, partsExtent, placePose, placeSeconds, setSlot, slotPose, withChoice } from "@/lib/decor";
import { PICKER_EMPTY, PICKER_TITLE, WEAR_NOTHING, choicesFor, keepsakeStrip } from "@/lib/picker";

const src = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
const R = HOME_ROOM.room;

describe("plots and decorations (data)", () => {
  it("six plots on existing anchors, each with a starter that fits, ids stable and unique", () => {
    expect(PLOTS.length).toBe(6);
    expect(new Set(PLOTS.map((p) => p.id)).size).toBe(6);
    expect(new Set(DECORATIONS.map((d) => d.id)).size).toBe(DECORATIONS.length);
    for (const p of PLOTS) {
      expect(HOME_ROOM.anchors.some((a) => a.id === p.id)).toBe(true);
      expect(fitting(p.id).some((d) => d.id === p.starter)).toBe(true);
    }
    expect(PLOTS.some((p) => p.id === "east-wall")).toBe(false);
  });
  it("floor plots take the five floor pieces and the wall plot only the framed page", () => {
    for (const p of PLOTS.filter((q) => q.kind === "floor")) expect(fitting(p.id).length).toBe(5);
    expect(fitting("west-wall").map((d) => d.id)).toEqual(["framed-page"]);
    expect(fitting("nope")).toEqual([]);
  });
  it("plots are inside the room, clear of the door zone and of each other, and pieces stay on their footprint", () => {
    for (const p of PLOT_POSES) {
      expect(insideRoom({ x: p.reachX, z: p.reachZ })).toBe(true);
      expect(inDoorZone({ x: p.x, z: p.z }, "room")).toBe(false);
      expect(Math.hypot(p.x - doorFrame("room").g.x, p.z - doorFrame("room").g.z)).toBeGreaterThan(3);
    }
    for (let i = 0; i < PLOT_POSES.length; i++) for (let j = i + 1; j < PLOT_POSES.length; j++) {
      expect(Math.hypot(PLOT_POSES[i].x - PLOT_POSES[j].x, PLOT_POSES[i].z - PLOT_POSES[j].z)).toBeGreaterThan(1.5);
    }
    for (const d of DECORATIONS) {
      const e = partsExtent(d);
      expect(e.low).toBeGreaterThanOrEqual(-0.001);
      expect(e.top).toBeLessThan(R.wallHeight);
      if (d.fits === "floor") { expect(e.hx).toBeLessThan(0.75); expect(e.hz).toBeLessThan(0.75); }
    }
    // a footprint on the floor never reaches a wall or another plot's footprint
    for (const p of PLOT_POSES.filter((q) => q.kind === "floor")) {
      const d = DECORATIONS.find((x) => x.id === PLOTS.find((q) => q.id === p.id)!.starter)!, e = partsExtent(d);
      expect(Math.abs(p.x) + e.hx).toBeLessThan(R.width / 2); expect(Math.abs(p.z) + e.hz).toBeLessThan(R.depth / 2);
    }
    const wall = PLOT_POSES.find((p) => p.kind === "wall")!;
    expect(Math.abs(wall.x)).toBeCloseTo(R.width / 2, 5);
  });
  it("wall pieces hang on the wall, thin, facing into the room (+z)", () => {
    const e = partsExtent(DECORATIONS.find((d) => d.fits === "wall")!);
    expect(e.hz).toBeLessThan(0.15); expect(e.low).toBeGreaterThan(0.5);
  });
});

describe("choices and placement rules", () => {
  it("Clear first and disabled when nothing is placed; the placed one is marked", () => {
    const c = decorChoicesFor("floor-left", {});
    expect(c[0]).toMatchObject({ id: null, label: CLEAR, disabled: true });
    expect(c.length).toBe(6); expect(c.every((x) => !x.current)).toBe(true);
    const d = decorChoicesFor("floor-left", { "floor-left": "bench" });
    expect(d[0].disabled).toBe(false); expect(d.filter((x) => x.current).map((x) => x.id)).toEqual(["bench"]);
  });
  it("only a fitting, different choice (or Clear when something is placed) is allowed", () => {
    expect(canPlace("floor-left", {}, "bench")).toBe(true);
    expect(canPlace("floor-left", { "floor-left": "bench" }, "bench")).toBe(false);
    expect(canPlace("floor-left", {}, "framed-page")).toBe(false);
    expect(canPlace("west-wall", {}, "bench")).toBe(false);
    expect(canPlace("floor-left", {}, null)).toBe(false);
    expect(canPlace("floor-left", { "floor-left": "bench" }, null)).toBe(true);
    expect(canPlace("floor-left", {}, "nope")).toBe(false);
  });
  it("withChoice returns a new object, ignores refused choices and clears", () => {
    const a = {}; expect(withChoice("floor-left", a, "bench")).toEqual({ "floor-left": "bench" }); expect(a).toEqual({});
    const b = { "floor-left": "bench" }; expect(withChoice("floor-left", b, "bench")).toBe(b);
    expect(withChoice("floor-left", b, null)).toEqual({});
  });
  it("the strip is titled Decorations and shows the empty line only when nothing fits", () => {
    expect(decorStrip("floor-left", {})).toMatchObject({ title: DECOR_TITLE, emptyText: null, currentSuffix: "placed" });
    expect(decorStrip("nope", {}).emptyText).toBeTruthy();
  });
  it("a plot is found only within reach, as a decor place", () => {
    const p = PLOT_POSES.find((q) => q.id === "floor-left")!;
    expect(nearestPlot({ x: p.x + 0.5, z: p.z })).toMatchObject({ id: "floor-left", kind: "decor" });
    expect(nearestPlot({ x: 0, z: 4 })).toBeNull();
  });
});

describe("the shared strip keeps keepsakes as they were", () => {
  it("the keepsake view has the same choices, title, empty text and 'worn' word", () => {
    const v = keepsakeStrip(["scarf", "ribbon"], "scarf");
    expect(v.choices).toEqual(choicesFor(["scarf", "ribbon"], "scarf"));
    expect(v).toMatchObject({ title: PICKER_TITLE, emptyText: null, currentSuffix: "worn" });
    expect(v.choices[0].label).toBe(WEAR_NOTHING);
    expect(keepsakeStrip([], null).emptyText).toBe(PICKER_EMPTY);
  });
  it("KeepsakePicker is a thin wrapper over PickerStrip, and its server calls stay in the page", () => {
    expect(src("../components/KeepsakePicker.tsx")).toContain("PickerStrip");
    expect(src("../components/PickerStrip.tsx")).not.toMatch(/supabase|fetch\(/);
  });
});

describe("motion", () => {
  for (const reduced of [false, true]) {
    it(`place pose is hidden before, whole after, and in range (reduced=${reduced})`, () => {
      expect(placePose(-0.1, reduced).visible).toBe(false);
      const end = placePose(placeSeconds(reduced) + 0.01, reduced);
      expect(end).toMatchObject({ y: 0, sx: 1, sy: 1, opacity: 1 });
      for (let t = 0; t <= placeSeconds(reduced); t += 0.02) { const p = placePose(t, reduced); expect(p.opacity).toBeGreaterThanOrEqual(0); expect(p.opacity).toBeLessThanOrEqual(1); expect(p.y).toBeGreaterThanOrEqual(0); expect(p.sy).toBeGreaterThan(0.5); }
    });
    it(`clear pose ends invisible (reduced=${reduced})`, () => {
      expect(clearPose(0, reduced).opacity).toBeCloseTo(1, 5);
      expect(clearPose(clearSeconds(reduced) + 0.01, reduced).visible).toBe(false);
    });
  }
  it("full motion falls from height, squashes on landing and lifts in an arc when cleared", () => {
    expect(placePose(0, false).y).toBeCloseTo(M.dropHeight, 5);
    expect(placePose(M.fall, false).y).toBeCloseTo(0, 5);
    expect(placePose(M.fall + M.settle / 2, false).sy).toBeLessThan(1);
    const c = clearPose(M.clear / 2, false); expect(c.y).toBeGreaterThan(0); expect(c.x).toBeGreaterThan(0); expect(c.sx).toBeLessThan(1);
  });
  it("reduced motion never moves or scales: only opacity changes", () => {
    for (let t = 0; t < 0.5; t += 0.05) for (const p of [placePose(t, true), clearPose(t, true)]) expect(p).toMatchObject({ x: 0, y: 0, sx: 1, sy: 1, sz: 1 });
    expect(inkDrops(0.1, true)).toEqual([]);
    expect(inkDrops(0.1, false).length).toBe(2); expect(inkDrops(M.dropsLife + 0.01, false)).toEqual([]);
  });
  it("replacing clears first and drops the new one after, with no overlap", () => {
    for (const reduced of [false, true]) {
      let s = setSlot(newSlot("bench"), "books", 10);
      expect(s).toMatchObject({ id: "bench", phase: "clearing" });
      s = advanceSlot(s, 10 + clearSeconds(reduced) / 2, reduced); expect(s.id).toBe("bench");
      s = advanceSlot(s, 10 + clearSeconds(reduced) + 0.01, reduced); expect(s).toMatchObject({ id: "books", phase: "placing" });
      expect(slotPose(s, 10 + clearSeconds(reduced) + 0.01, reduced).visible).toBe(true);
      s = advanceSlot(s, 20, reduced); expect(s.phase).toBe("idle");
    }
  });
  it("clearing empties the slot and brings the marker back; a request during a clear is kept", () => {
    let s = setSlot(newSlot("bench"), null, 5);
    s = advanceSlot(s, 5 + M.clear + 0.01, false);
    expect(s).toMatchObject({ id: null, phase: "idle" });
    expect(markerPose(s, s.markerSince, false, false).opacity).toBe(0);
    expect(markerPose(s, s.markerSince + M.markerIn + 0.1, false, false).opacity).toBeGreaterThan(0);
    const t = setSlot(setSlot(newSlot("bench"), null, 1), "books", 1.1);
    expect(advanceSlot(t, 1.1 + M.clear + 0.1, false)).toMatchObject({ id: "books", phase: "placing" });
  });
  it("the marker pulses only in reach, and is steady (no pulse) when reduced; hidden while something stands there", () => {
    const e = newSlot(null);
    const a = markerPose(e, 100, false, true).opacity, b = markerPose(e, 100 + M.pulsePeriod / 2, false, true).opacity;
    expect(Math.abs(a - b)).toBeGreaterThan(0.1);
    expect(markerPose(e, 100, false, false).opacity).toBe(markerPose(e, 101, false, false).opacity);
    expect(markerPose(e, 100, true, true)).toEqual(markerPose(e, 100.9, true, true));
    expect(markerPose(newSlot("bench"), 100, false, true).opacity).toBe(0);
  });
});

describe("wiring", () => {
  it("the dev switch is ?decor=stub and never in production", () => {
    expect(decorPreview("?decor=stub", false)).toBe(true);
    expect(decorPreview("?area=home&decor=stub", false)).toBe(true);
    expect(decorPreview("?decor=stub", true)).toBe(false);
    expect(decorPreview("?decor=1", false)).toBe(false);
    expect(decorPreview("", false)).toBe(false);
  });
  it("no network, no storage and no timers in the decor files", () => {
    for (const f of ["../lib/decor.ts", "../components/decorScene.ts", "../components/PickerStrip.tsx"]) {
      expect(src(f)).not.toMatch(/supabase|fetch\(|localStorage|sessionStorage|setTimeout|setInterval|XMLHttpRequest/);
    }
  });
  it("the room builds the decorations only when the switch is on, and frees them with the room", () => {
    const w = src("../components/World.tsx");
    expect(w).toMatch(/decorOn\s*=\s*decorPreview\(/);
    expect(w).toMatch(/decorPlaced && decorOn/);
    expect(w).toMatch(/leaveHomeZone = \(\) => \{ decor\?\.dispose\(\)/);
  });
  it("the page keeps the placements in memory only and the strip needs the switch", () => {
    const p = src("../app/page.tsx");
    expect(p).toMatch(/menu === "decor" && stubDecor/);
    expect(p).toMatch(/decorPlaced=\{stubDecor \? placed : null\}/);
  });
  it("the scene has a dispose that frees its geometry and materials", () => {
    const s = src("../components/decorScene.ts");
    expect(s).toMatch(/dispose\(\)/); expect(s).toMatch(/geometry\.dispose\(\)/); expect(s).toMatch(/m\.dispose\(\)/);
  });
});

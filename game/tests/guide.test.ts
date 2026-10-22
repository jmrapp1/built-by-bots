import { describe, expect, it } from "vitest";
import { GUIDE_KEY, GUIDE_TEXT, PREVIEW_DONE, STEPS, guideOverride, afterEggClaimed, currentHint, eggBearing, feedFinishes, strokeFinishes, guideDay, PREVIEW_DONE_STROKE, PREVIEW_DONE_MAP, PREVIEW_DONE_HATCH, mapFinishes, nestPointerOn, hatchText, hasMoved, hintText, isExistingPlayer, markDone, pointerOn, readDone, writeDone, type Ctx, type Step, type Store } from "@/lib/guide";

const mem = (): Store & { data: Record<string, string> } => {
  const data: Record<string, string> = {};
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
};
const blocked: Store = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
const ctx = (o: Partial<Ctx> = {}): Ctx => ({ ready: true, inGarden: true, nearEgg: false, eggPending: true, printNear: false, hasSnack: false, hasCreature: false, dismissed: [], ...o });

describe("done steps store", () => {
  it("reads nothing from fresh storage", () => expect(readDone(mem())).toEqual([]));
  it("round-trips and keeps one small key", () => {
    const s = mem();
    expect(writeDone(s, ["move", "egg"])).toBe(true);
    expect(Object.keys(s.data)).toEqual([GUIDE_KEY]);
    expect(readDone(s)).toEqual(["move", "egg"]);
  });
  it("treats bad data as empty", () => {
    for (const bad of ["{", "null", "[]", "7", '{"v":1}', '{"v":1,"done":"move"}', '{"v":99,"done":["move"]}']) {
      const s = mem(); s.data[GUIDE_KEY] = bad;
      expect(readDone(s)).toEqual([]);
    }
  });
  it("drops unknown steps", () => {
    const s = mem(); s.data[GUIDE_KEY] = '{"v":1,"done":["move","zzz",3]}';
    expect(readDone(s)).toEqual(["move"]);
  });
  it("never throws when storage is blocked or missing", () => {
    expect(readDone(blocked)).toEqual([]);
    expect(writeDone(blocked, ["move"])).toBe(false);
    expect(readDone(null)).toEqual([]);
    expect(writeDone(null, ["move"])).toBe(false);
  });
  it("still guides for the session when storage is blocked", () => {
    let done = readDone(blocked);
    expect(currentHint(done, ctx())).toBe("move");
    done = markDone(done, "move"); writeDone(blocked, done);
    expect(currentHint(done, ctx())).toBeNull();
  });
});

describe("existing players", () => {
  it("are recognised by a Print or a hatched egg", () => {
    expect(isExistingPlayer(1, 0)).toBe(true);
    expect(isExistingPlayer(0, 1)).toBe(true);
    expect(isExistingPlayer(0, 0)).toBe(false);
  });
  it("see nothing once everything is marked done", () => {
    const done = [...STEPS];
    for (const o of [{}, { nearEgg: true }, { hasCreature: true, printNear: true, hasSnack: true, eggPending: false }]) {
      expect(currentHint(done, ctx(o))).toBeNull();
      expect(pointerOn(done, ctx(o))).toBe(false);
    }
  });
});

describe("which hint shows", () => {
  it("is the walking hint first, only when ready and in the garden", () => {
    expect(currentHint([], ctx())).toBe("move");
    expect(currentHint([], ctx({ ready: false }))).toBeNull();
    expect(currentHint([], ctx({ inGarden: false }))).toBeNull();
  });
  it("swaps to the egg prompt near the egg", () => {
    expect(currentHint([], ctx({ nearEgg: true }))).toBe("egg");
    expect(currentHint(["move"], ctx({ nearEgg: true }))).toBe("egg");
  });
  it("shows the feed hint only with a Print near and a snack in hand, once", () => {
    const base = { hasCreature: true, eggPending: false, printNear: true, hasSnack: true };
    expect(currentHint(["move", "egg"], ctx(base))).toBe("feed");
    expect(currentHint(["move", "egg"], ctx({ ...base, hasSnack: false }))).toBeNull();
    expect(currentHint(["move", "egg"], ctx({ ...base, printNear: false }))).toBeNull();
    expect(currentHint(["move", "egg", "feed"], ctx(base))).toBeNull();
  });
  it("hides a step skipped this session", () => {
    expect(currentHint([], ctx({ dismissed: ["move"] }))).toBeNull();
  });
  it("never returns a done step", () => {
    for (const s of STEPS) expect(currentHint([s], ctx({ nearEgg: true, hasCreature: true, printNear: true, hasSnack: true })) ).not.toBe(s);
  });
  it("collecting the egg finishes the first two steps", () => {
    expect(afterEggClaimed([])).toEqual(["move", "egg"]);
    expect(afterEggClaimed(["feed"])).toEqual(["feed", "move", "egg"]);
  });
});

describe("feed step", () => {
  it("finishes on the first successful feed while the feed hint is showing", () => expect(feedFinishes("feed", 0, 1)).toBe(true));
  it("ignores a feed made before the hint showed, or while another hint shows", () => {
    expect(feedFinishes(null, 0, 1)).toBe(false);
    expect(feedFinishes("move", 0, 1)).toBe(false);
    expect(feedFinishes("egg", 0, 1)).toBe(false);
  });
  it("ignores a hint that was skipped (nothing shows) and an unchanged tick", () => {
    expect(feedFinishes(null, 2, 3)).toBe(false);
    expect(feedFinishes("feed", 3, 3)).toBe(false);
  });
  it("is done for good after the first feed: the hint never returns", () => {
    const c = { ready: true, inGarden: true, nearEgg: false, eggPending: false, printNear: true, hasSnack: true, hasCreature: true, dismissed: [] };
    expect(currentHint(["move", "egg"], c)).toBe("feed");
    expect(currentHint(["move", "egg", "feed"], c)).toBeNull();
  });
});

describe("egg pointer", () => {
  it("shows until the egg is reached, then stops", () => {
    expect(pointerOn([], ctx())).toBe(true);
    expect(pointerOn([], ctx({ nearEgg: true }))).toBe(false);
    expect(pointerOn(["egg"], ctx())).toBe(false);
    expect(pointerOn([], ctx({ eggPending: false }))).toBe(false);
    expect(pointerOn([], ctx({ ready: false }))).toBe(false);
  });
  it("turns with the camera", () => {
    const egg = { x: 0, z: -10 };
    const ahead = eggBearing({ x: 0, z: 0, yaw: 0 }, egg); // camera sits at +z looking toward -z
    expect(ahead.inView).toBe(true);
    expect(Math.abs(ahead.angle)).toBeLessThan(1e-9);
    const behind = eggBearing({ x: 0, z: 0, yaw: Math.PI }, egg);
    expect(behind.inView).toBe(false);
    const left = eggBearing({ x: 0, z: 0, yaw: -Math.PI / 2 }, egg), right = eggBearing({ x: 0, z: 0, yaw: Math.PI / 2 }, egg);
    expect(left.angle).toBeCloseTo(-right.angle);
    expect(Math.abs(left.angle)).toBeCloseTo(Math.PI / 2);
    expect(right.inView).toBe(false);
  });
  it("detects walking", () => {
    expect(hasMoved(null, { x: 5, z: 5 })).toBe(false);
    expect(hasMoved({ x: 0, z: 0 }, { x: 0.1, z: 0 })).toBe(false);
    expect(hasMoved({ x: 0, z: 0 }, { x: 1, z: 0 })).toBe(true);
  });
});

describe("wording", () => {
  const all = [...STEPS.map((x) => hintText(x)), GUIDE_TEXT.arrow];
  it("is one short line with no digits", () => {
    for (const t of all) { expect(t).not.toMatch(/\d/); expect(t.length).toBeLessThanOrEqual(60); }
  });
  it("names the real bound keys", () => {
    expect(hintText("move")).toContain("W A S D");
    expect(hintText("egg")).toContain("E");
  });
});

describe("?guide=stroke preview switch", () => {
  it("accepts feed and stroke in dev, nothing in production or for other values", () => {
    expect(guideOverride("?guide=stroke", false)).toBe("stroke");
    expect(guideOverride("?guide=feed", false)).toBe("feed");
    expect(guideOverride("?guide=stroke", true)).toBeNull();
    for (const bad of ["", "?guide=", "?guide=STROKE", "?guide=strokes", "?guide=move"]) expect(guideOverride(bad, false)).toBeNull();
  });
  it("starts with move, egg and feed done", () => expect(PREVIEW_DONE_STROKE).toEqual(["move", "egg", "feed"]));
});

describe("stroke step", () => {
  const near = { eggPending: false, printNear: true, hasCreature: true, hasSnack: true };
  it("is the fourth step and the old saved list reads back unchanged", () => {
    expect(STEPS).toEqual(["move", "egg", "hatch", "feed", "stroke", "map"]);
    const s = mem(); s.data[GUIDE_KEY] = '{"v":1,"done":["move","egg","feed"]}';
    expect(readDone(s)).toEqual(["move", "egg", "feed"]);
  });
  it("shows only after a feed finished this session, never from a saved list", () => {
    const saved: Step[] = ["move", "egg", "feed"];
    expect(currentHint(saved, ctx(near))).toBeNull();
    expect(currentHint(saved, ctx({ ...near, fedThisSession: false }))).toBeNull();
    expect(currentHint(saved, ctx({ ...near, fedThisSession: true }))).toBe("stroke");
  });
  it("comes after egg, move and feed", () => {
    expect(currentHint([], ctx({ ...near, fedThisSession: true, eggPending: true, nearEgg: true }))).toBe("egg");
    expect(currentHint([], ctx({ ...near, fedThisSession: true }))).toBe("move");
    expect(currentHint(["move", "egg"], ctx({ ...near, fedThisSession: true }))).toBe("feed");
  });
  it("needs the Print near, a Print, the garden and daytime; Escape keeps it away", () => {
    const base = { ...near, fedThisSession: true };
    const d: Step[] = ["move", "egg", "feed"];
    expect(currentHint(d, ctx({ ...base, printNear: false }))).toBeNull();
    expect(currentHint(d, ctx({ ...base, hasCreature: false }))).toBeNull();
    expect(currentHint(d, ctx({ ...base, inGarden: false }))).toBeNull();
    expect(currentHint(d, ctx({ ...base, ready: false }))).toBeNull();
    expect(currentHint(d, ctx({ ...base, day: false }))).toBeNull();
    expect(currentHint(d, ctx({ ...base, dismissed: ["stroke"] }))).toBeNull();
    expect(guideDay(12)).toBe(true); expect(guideDay(23)).toBe(false);
  });
  it("is finished only by a stroke while its hint shows", () => {
    expect(strokeFinishes("stroke", 0, 1)).toBe(true);
    expect(strokeFinishes("stroke", 1, 1)).toBe(false);
    expect(strokeFinishes(null, 0, 1)).toBe(false);
    expect(strokeFinishes("feed", 0, 1)).toBe(false);
  });
  it("existing players with a full saved list see nothing", () => {
    expect(currentHint([...STEPS], ctx({ ...near, fedThisSession: true }))).toBeNull();
  });
  it("works for the session when storage is blocked", () => {
    let done = readDone(blocked); done = markDone(markDone(markDone(done, "move"), "egg"), "feed");
    expect(() => writeDone(blocked, done)).not.toThrow();
    expect(currentHint(done, ctx({ ...near, fedThisSession: true }))).toBe("stroke");
  });
  it("wording names the real stroke key and fits one short line", () => {
    expect(hintText("stroke")).toBe("Hold R beside your Print to stroke it.");
  });
});

describe("map step", () => {
  const inGarden = { eggPending: false };
  const four: Step[] = ["move", "egg", "feed", "stroke"];
  it("an old save with four steps reads back as four, and map is open", () => {
    const s = mem(); s.data[GUIDE_KEY] = '{"v":1,"done":["move","egg","feed","stroke"]}';
    expect(readDone(s)).toEqual(four);
    expect(currentHint(readDone(s), ctx(inGarden))).toBe("map");
  });
  it("shows only after stroke is done, when ready and in the garden", () => {
    expect(currentHint(["move", "egg", "feed"], ctx(inGarden))).toBeNull();
    expect(currentHint(four, ctx(inGarden))).toBe("map");
    expect(currentHint(four, ctx({ ...inGarden, ready: false }))).toBeNull();
    expect(currentHint(four, ctx({ ...inGarden, inGarden: false }))).toBeNull();
    expect(currentHint([...four, "map"], ctx(inGarden))).toBeNull();
    expect(currentHint(four, ctx({ ...inGarden, dismissed: ["map"] }))).toBeNull();
  });
  it("shows at night too, and never while an earlier step is due", () => {
    expect(currentHint(four, ctx({ ...inGarden, day: false }))).toBe("map");
    expect(currentHint(["stroke"], ctx({ eggPending: false }))).toBe("move");
    expect(currentHint(["move", "egg", "stroke"], ctx({ eggPending: false, hasCreature: true, printNear: true, hasSnack: true }))).toBe("feed");
  });
  it("mapFinishes is true exactly when the map goes from closed to open", () => {
    expect(mapFinishes(false, true)).toBe(true);
    expect(mapFinishes(true, true)).toBe(false);
    expect(mapFinishes(true, false)).toBe(false);
    expect(mapFinishes(false, false)).toBe(false);
  });
  it("the line names the map key from data and no other key", () => {
    expect(hintText("map")).toBe("Press M to open your map and see where else you can go.");
    expect(hintText("map").match(/\b[A-Z]\b/g)).toEqual(["M"]);
  });
  it("preview: accepted in dev only, starts with four steps done", () => {
    expect(guideOverride("?guide=map", false)).toBe("map");
    expect(guideOverride("?guide=map", true)).toBeNull();
    expect(guideOverride("?guide=MAP", false)).toBeNull();
    expect(PREVIEW_DONE_MAP).toEqual(four);
  });
  it("works for the session when storage is blocked", () => {
    let done = readDone(blocked); for (const s of four) done = markDone(done, s);
    expect(() => writeDone(blocked, done)).not.toThrow();
    expect(currentHint(done, ctx(inGarden))).toBe("map");
    done = markDone(done, "map"); expect(currentHint(done, ctx(inGarden))).toBeNull();
  });
});

describe("?guide=feed preview switch", () => {
  it("is on in dev only for the exact value", () => {
    expect(guideOverride("?guide=feed", false)).toBe("feed");
    expect(guideOverride("?area=home&guide=feed", false)).toBe("feed");
    expect(guideOverride("?guide=feed", true)).toBeNull();
    for (const bad of ["", "?guide=", "?guide=move", "?guide=FEED"]) expect(guideOverride(bad, false)).toBeNull();
  });
  it("puts the feed hint on screen when a Print and snack are in hand", () => {
    expect(PREVIEW_DONE).toEqual(["move", "egg"]);
    expect(currentHint(PREVIEW_DONE, ctx({ eggPending: false, printNear: true, hasSnack: true, hasCreature: true }))).toBe("feed");
  });
});

describe("hatch step", () => {
  const waiting = { eggPending: false, hasWaiting: true, hasCreature: false };
  const two = ["move", "egg"] as const;
  it("sits between egg and feed, and an old save without it still reads", () => {
    expect(STEPS.indexOf("hatch")).toBe(STEPS.indexOf("egg") + 1);
    expect(STEPS.indexOf("feed")).toBe(STEPS.indexOf("hatch") + 1);
    const s = mem(); s.data[GUIDE_KEY] = '{"v":1,"done":["move","egg","feed","stroke","map"]}';
    expect(readDone(s)).toEqual(["move", "egg", "feed", "stroke", "map"]);
  });
  it("shows once the egg is collected and waits in the nest, with no Print", () => {
    expect(currentHint([...two], ctx(waiting))).toBe("hatch");
    expect(currentHint([...two], ctx({ ...waiting, hasWaiting: false }))).toBeNull();
    expect(currentHint([...two], ctx({ ...waiting, hasCreature: true }))).toBeNull();
    expect(currentHint([...two], ctx({ ...waiting, ready: false }))).toBeNull();
    expect(currentHint([...two], ctx({ ...waiting, inGarden: false }))).toBeNull();
    expect(currentHint([], ctx({ ...waiting, eggPending: true }))).toBe("move");
  });
  it("shows day and night, and never twice", () => {
    for (const day of [true, false]) expect(currentHint([...two], ctx({ ...waiting, day }))).toBe("hatch");
    expect(currentHint([...two], ctx({ ...waiting, printNear: true, hasSnack: true }))).toBe("hatch");
  });
  it("is done by hatching or Escape, and the feed hint follows", () => {
    expect(currentHint([...two, "hatch"], ctx(waiting))).toBeNull();
    expect(currentHint([...two], ctx({ ...waiting, dismissed: ["hatch"] }))).toBeNull();
    const after = { eggPending: false, hasCreature: true, hasWaiting: false, printNear: true, hasSnack: true };
    expect(currentHint([...two, "hatch"], ctx(after))).toBe("feed");
  });
  it("existing players see nothing", () => {
    const done = [...STEPS];
    expect(currentHint(done, ctx(waiting))).toBeNull();
    expect(nestPointerOn(done, ctx(waiting))).toBe(false);
  });
  it("wording: away, timer running, ready", () => {
    expect(hatchText(false, 9)).toBe("Your egg is waiting in the nest.");
    expect(hatchText(true, 9)).toBe("Your egg is nearly ready.");
    expect(hatchText(true, 0)).toBe("Press E to hatch your egg.");
    expect(hintText("hatch")).toBe("Press E to hatch your egg.");
  });
  it("nest pointer shows only away from the nest while the hint is due", () => {
    expect(nestPointerOn([...two], ctx({ ...waiting, nearNest: false }))).toBe(true);
    expect(nestPointerOn([...two], ctx({ ...waiting, nearNest: true }))).toBe(false);
    expect(nestPointerOn([...two, "hatch"], ctx(waiting))).toBe(false);
    expect(nestPointerOn([...two], ctx({ ...waiting, dismissed: ["hatch"] }))).toBe(false);
    expect(nestPointerOn([...two], ctx({ ...waiting, hasCreature: true }))).toBe(false);
    expect(pointerOn([...two], ctx(waiting))).toBe(false);
  });
  it("works for the session when storage is blocked", () => {
    let done = readDone(blocked); for (const x of two) done = markDone(done, x);
    expect(currentHint(done, ctx(waiting))).toBe("hatch");
    done = markDone(done, "hatch"); expect(() => writeDone(blocked, done)).not.toThrow();
    expect(currentHint(done, ctx(waiting))).toBeNull();
  });
  it("?guide=hatch is dev only", () => {
    expect(guideOverride("?guide=hatch", false)).toBe("hatch");
    expect(guideOverride("?guide=hatch", true)).toBeNull();
    expect(guideOverride("?guide=HATCH", false)).toBeNull();
    expect(PREVIEW_DONE_HATCH).toEqual(["move", "egg"]);
  });
});

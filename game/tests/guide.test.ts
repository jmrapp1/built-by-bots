import { describe, expect, it } from "vitest";
import { GUIDE_KEY, GUIDE_TEXT, STEPS, afterEggClaimed, currentHint, eggBearing, feedFinishes, hasMoved, hintText, isExistingPlayer, markDone, pointerOn, readDone, writeDone, type Ctx, type Store } from "@/lib/guide";

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
  const all = [...STEPS.map(hintText), GUIDE_TEXT.arrow];
  it("is one short line with no digits", () => {
    for (const t of all) { expect(t).not.toMatch(/\d/); expect(t.length).toBeLessThanOrEqual(60); }
  });
  it("names the real bound keys", () => {
    expect(hintText("move")).toContain("W A S D");
    expect(hintText("egg")).toContain("E");
  });
});

import { describe, expect, it } from "vitest";
import { ITEMS, TRY_KEY, TRY_TEXT, allDone, lineText, lines, markDone, nextOpen, readTry, tabVisible, tryOverride, writeTry, type Item, type Store } from "@/lib/tryList";

const mem = (): Store & { data: Record<string, string> } => {
  const data: Record<string, string> = {};
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
};
const blocked: Store = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
const all = [...ITEMS] as Item[];

describe("try list store", () => {
  it("reads nothing from fresh storage", () => expect(readTry(mem())).toEqual({ done: [], retired: false }));
  it("round-trips under one small key", () => {
    const s = mem();
    expect(writeTry(s, { done: ["share", "forage"], retired: true })).toBe(true);
    expect(Object.keys(s.data)).toEqual([TRY_KEY]);
    expect(readTry(s)).toEqual({ done: ["forage", "share"], retired: true });
  });
  it("treats bad data as empty", () => {
    for (const bad of ["{", "null", "[]", "7", '{"v":1}', '{"v":1,"done":"x"}', '{"v":9,"done":["forage"]}']) {
      const s = mem(); s.data[TRY_KEY] = bad;
      expect(readTry(s)).toEqual({ done: [], retired: false });
    }
  });
  it("drops unknown items", () => {
    const s = mem(); s.data[TRY_KEY] = '{"v":1,"done":["forage","zzz",3]}';
    expect(readTry(s).done).toEqual(["forage"]);
  });
  it("never throws when storage is blocked or missing", () => {
    expect(readTry(blocked)).toEqual({ done: [], retired: false });
    expect(readTry(null).done).toEqual([]);
    expect(writeTry(blocked, { done: [], retired: false })).toBe(false);
    expect(writeTry(null, { done: [], retired: false })).toBe(false);
  });
  it("marks once", () => expect(markDone(markDone([], "pond"), "pond")).toEqual(["pond"]));
});

describe("lines and nextOpen", () => {
  it("has five lines, none ticked at the start", () => {
    expect(lines([], { dailyUp: true }).map((l) => l.state)).toEqual(["open", "open", "open", "open", "open"]);
    expect(nextOpen([], { dailyUp: true })).toBe("forage");
  });
  it("ticks lines as they are done", () => {
    const l = lines(["forage", "pond"], { dailyUp: true });
    expect(l.map((x) => x.state)).toEqual(["done", "open", "done", "open", "open"]);
    expect(nextOpen(["forage", "pond"], { dailyUp: true })).toBe("share");
  });
  it("shows the egg line greyed with tomorrow wording when no daily egg is up", () => {
    const l = lines([], { dailyUp: false })[4];
    expect(l.state).toBe("later");
    expect(lineText(l)).toBe(TRY_TEXT.eggLater);
    expect(lineText(lines([], { dailyUp: true })[4])).toBe(TRY_TEXT.egg);
  });
  it("a collected egg stays ticked once the next day's egg is not up", () => expect(lines(["egg"], { dailyUp: false })[4].state).toBe("done"));
  it("is finished when four are done and the egg waits for tomorrow", () => {
    expect(allDone(all.filter((i) => i !== "egg"), { dailyUp: false })).toBe(true);
    expect(allDone(all.filter((i) => i !== "egg"), { dailyUp: true })).toBe(false);
    expect(allDone(all, { dailyUp: true })).toBe(true);
    expect(allDone([], { dailyUp: false })).toBe(false);
  });
});

describe("tab visibility", () => {
  const ok = { retired: false, guideDone: true, guideHint: false, inGarden: true, loaded: true, dailyKnown: true };
  it("shows when the guide is finished and quiet", () => expect(tabVisible(ok)).toBe(true));
  it("waits for the guide, and never shows over a guide hint", () => {
    expect(tabVisible({ ...ok, guideDone: false })).toBe(false);
    expect(tabVisible({ ...ok, guideHint: true })).toBe(false);
  });
  it("stays away when retired, loading or out of the garden", () => {
    for (const o of [{ retired: true }, { inGarden: false }, { loaded: false }, { dailyKnown: false }]) expect(tabVisible({ ...ok, ...o })).toBe(false);
  });
});

describe("dev switch", () => {
  it("reads ?try=on and ?try=reset outside production only", () => {
    expect(tryOverride("?try=on", false)).toBe("on");
    expect(tryOverride("?try=reset", false)).toBe("reset");
    expect(tryOverride("?try=zzz", false)).toBeNull();
    expect(tryOverride("", false)).toBeNull();
    expect(tryOverride("?try=on", true)).toBeNull();
  });
});

describe("wording", () => {
  it("has no numbers, timers or rewards", () => {
    for (const t of Object.values(TRY_TEXT)) expect(t).not.toMatch(/\d|reward|streak|bonus/i);
  });
});

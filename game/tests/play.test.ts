import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PLAY, feedPose, feedPuffs, holdDone, holdProgress, nextFood, puffAt, strokePose, strokePuffs } from "@/lib/play";
import { RULES, FOODS } from "@/lib/rules";
import { friendlyFeedError, feedPrompt, isFeedMessage, FED_MESSAGE } from "@/lib/ui";
import { BOARD_PAGES } from "@/lib/board";

describe("hold to feed", () => {
  it("fills over the hold time and is done only when full", () => {
    expect(holdProgress(0)).toBe(0);
    expect(holdProgress(PLAY.holdSeconds / 2)).toBeCloseTo(0.5);
    expect(holdProgress(99)).toBe(1);
    expect(holdDone(PLAY.holdSeconds - 0.01)).toBe(false);
    expect(holdDone(PLAY.holdSeconds)).toBe(true);
  });
  it("is about a second", () => {
    expect(PLAY.holdSeconds).toBeGreaterThanOrEqual(0.8);
    expect(PLAY.holdSeconds).toBeLessThanOrEqual(1.5);
  });
  it("a cancelled hold never completes (a shorter hold is not done)", () => {
    for (const t of [0, 0.2, 0.5, 0.9]) expect(holdDone(t)).toBe(false);
  });
});

describe("the reaction covers the feed cooldown", () => {
  it("lasts longer than the server cooldown, so the next hold cannot hit it", () => {
    expect(PLAY.reactionSeconds).toBeGreaterThan(RULES.feedCooldownSeconds);
    expect(PLAY.holdSeconds + PLAY.reactionSeconds).toBeGreaterThan(RULES.feedCooldownSeconds);
  });
  it("all timed moments fall inside the reaction", () => {
    const f = PLAY.feed;
    expect(f.chewEnd).toBeLessThan(PLAY.reactionSeconds);
    expect(f.hopAt + f.hopLength).toBeLessThanOrEqual(PLAY.reactionSeconds);
    for (const l of f.dropLaunches) expect(l + PLAY.drop.life).toBeLessThanOrEqual(PLAY.reactionSeconds + 0.01);
  });
});

describe("poses", () => {
  it("rest before and after", () => {
    expect(feedPose(-1)).toEqual({ lean: 0, squash: 1, hop: 0 });
    expect(feedPose(PLAY.reactionSeconds)).toEqual({ lean: 0, squash: 1, hop: 0 });
  });
  it("leans in, chews and hops during the feed", () => {
    expect(feedPose(1).lean).toBeGreaterThan(0.1);
    const squashes = Array.from({ length: 60 }, (_, i) => feedPose(PLAY.feed.chewStart + i * 0.025).squash);
    expect(Math.min(...squashes)).toBeLessThan(0.95);
    expect(feedPose(PLAY.feed.hopAt + PLAY.feed.hopLength / 2).hop).toBeGreaterThan(0.1);
  });
  it("never squashes below a sane limit", () => {
    for (let t = 0; t < PLAY.reactionSeconds; t += 0.02) expect(feedPose(t).squash).toBeGreaterThan(0.8);
    for (let t = 0; t < 5; t += 0.02) expect(strokePose(t).squash).toBeGreaterThan(0.8);
  });
  it("reduced motion is calmer: no hop, shallower lean and chew", () => {
    for (let t = 0; t < PLAY.reactionSeconds; t += 0.05) {
      expect(feedPose(t, true).hop).toBe(0);
      expect(feedPose(t, true).lean).toBeLessThanOrEqual(feedPose(t, false).lean + 1e-9);
      expect(feedPose(t, true).squash).toBeGreaterThanOrEqual(feedPose(t, false).squash - 1e-9);
    }
    for (let t = 0; t < 3; t += 0.05) expect(strokePose(t, true).hop).toBe(0);
  });
  it("stroking squishes and hops, loops, and eases out after release", () => {
    const s = Array.from({ length: 60 }, (_, i) => strokePose(i * 0.02));
    expect(Math.min(...s.map((p) => p.squash))).toBeLessThan(0.95);
    expect(Math.max(...s.map((p) => p.hop))).toBeGreaterThan(0.05);
    expect(strokePose(0.3 + PLAY.stroke.period).squash).toBeCloseTo(strokePose(0.3).squash);
    expect(strokePose(0.3, false, PLAY.stroke.easeOut)).toEqual({ lean: 0, squash: 1, hop: 0 });
  });
});

describe("ink drops", () => {
  it("are visible only during their life and fade out", () => {
    expect(puffAt(0, -0.1)).toBeNull();
    expect(puffAt(0, PLAY.drop.life)).toBeNull();
    expect(puffAt(0, 0.01)!.opacity).toBeGreaterThan(0.9);
    expect(puffAt(0, PLAY.drop.life - 0.01)!.opacity).toBeLessThan(0.1);
  });
  it("show up during a feed and a stroke, fewer when calm", () => {
    expect(feedPuffs(0.9).length).toBeGreaterThan(0);
    expect(feedPuffs(0.1).length).toBe(0);
    expect(strokePuffs(1).length).toBeGreaterThan(0);
    expect(feedPuffs(2.4, true).length).toBeLessThanOrEqual(feedPuffs(2.4, false).length);
    expect(strokePuffs(-1)).toEqual([]);
  });
});

describe("Q swaps the food in hand", () => {
  const ids = FOODS.map((f) => f.id);
  it("cycles ink and glyph and starts from ink", () => {
    expect(ids[0]).toBe("ink");
    expect(nextFood("ink", ids)).toBe("glyph");
    expect(nextFood("glyph", ids)).toBe("ink");
    expect(nextFood("zzz", ids)).toBe(ids[0]);
  });
});

describe("text and keys", () => {
  it("uses E to hold, Q to swap and R to stroke", () => {
    expect(PLAY.keys).toEqual({ hold: "KeyE", swap: "KeyQ", stroke: "KeyR" });
  });
  it("prompts to hold, only near a hatched Print", () => {
    expect(feedPrompt(true, true)).toBe("Hold to feed");
    expect(feedPrompt(true, false)).toBeNull();
    expect(feedPrompt(false, true)).toBeNull();
  });
  it("feed messages are recognised so they fade by themselves", () => {
    expect(isFeedMessage(FED_MESSAGE)).toBe(true);
    expect(isFeedMessage(friendlyFeedError("too soon"))).toBe(true);
    expect(isFeedMessage(friendlyFeedError("fed enough for today"))).toBe(true);
    expect(isFeedMessage("Your egg is in the nest.")).toBe(false);
  });
  it("the board says play is just for fun and shows no numbers", () => {
    const text = BOARD_PAGES.flatMap((p) => p.lines).join(" ");
    expect(text).toMatch(/stroke/i);
    expect(text).toMatch(/for fun/i);
    expect(JSON.stringify(BOARD_PAGES)).not.toMatch(/\d/);
  });
});

describe("the client stays out of the server for play", () => {
  const src = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
  it("play.ts has no server or three.js access", () => {
    expect(src("../lib/play.ts")).not.toMatch(/supabase|rpc|three|Date\.now|performance/);
  });
  it("the page feeds only through feed_creature and has no stroke call", () => {
    const page = src("../app/page.tsx");
    expect((page.match(/\.rpc\("feed_creature"/g) ?? []).length).toBe(1);
    // Every server call the page makes, by name. Stroking is not among them.
    const calls = [...page.matchAll(/\.rpc\("([a-z_]+)"/g)].map((m) => m[1]).sort();
    expect(calls).toEqual(["claim_daily_egg", "claim_starter_egg", "feed_creature", "grow_creature", "hatch_egg", "margins_unfold", "set_worn_cosmetic"]);
  });
  it("World.tsx never calls the server", () => {
    expect(src("../components/World.tsx")).not.toMatch(/supabase|\.rpc\(/);
  });
});

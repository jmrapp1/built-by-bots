import { describe, expect, it } from "vitest";
import { FED_MESSAGE, dropFill, feedPrompt, friendlyFeedError, friendlyAuthError, moodFace, promptFor } from "@/lib/ui";
import { GARDEN } from "@/lib/world";

const place = (kind: string) => GARDEN.places.find((p) => p.kind === kind)!;

describe("mood", () => {
  it("never shows a sad face", () => {
    for (let m = 0; m <= 100; m += 5) expect(["happy", "content", "sleepy"]).toContain(moodFace(m));
    expect(moodFace(0)).toBe("sleepy");
    expect(moodFace(50)).toBe("content");
    expect(moodFace(100)).toBe("happy");
  });
  it("clamps drop fill", () => {
    expect(dropFill(-5)).toBe(0);
    expect(dropFill(50)).toBe(0.5);
    expect(dropFill(500)).toBe(1);
  });
});

describe("prompts", () => {
  it("follows the game state", () => {
    expect(promptFor(place("egg"), { hasEgg: false, hasCreature: false, hatchWait: 0 })).toBe("Take egg");
    expect(promptFor(place("egg"), { hasEgg: true, hasCreature: false, hatchWait: 0 })).toBeNull();
    expect(promptFor(place("nest"), { hasEgg: true, hasCreature: false, hatchWait: 12 })).toBe("Hatching in 12s");
    expect(promptFor(place("nest"), { hasEgg: true, hasCreature: false, hatchWait: 0 })).toBe("Hatch");
  });
  it("offers the daily egg only when nothing is waiting and today's is free", () => {
    const base = { hasEgg: true, hasCreature: true, hatchWait: 0 };
    expect(promptFor(place("egg"), { ...base, hasWaiting: false, dailyReady: true, dailyKnown: true })).toBe("Collect today's egg");
    expect(promptFor(place("egg"), { ...base, hasWaiting: true, dailyReady: false, dailyKnown: true })).toBeNull();
    expect(promptFor(place("egg"), { ...base, hasWaiting: false, dailyReady: false, dailyKnown: true })).toBe("Come back tomorrow");
    expect(promptFor(place("egg"), { ...base, hasWaiting: false, dailyReady: false, dailyKnown: false })).toBeNull();
  });
  it("the nest prompt follows the waiting egg, not the first Print", () => {
    expect(promptFor(place("nest"), { hasEgg: true, hasCreature: true, hatchWait: 0, hasWaiting: true })).toBe("Hatch");
    expect(promptFor(place("nest"), { hasEgg: true, hasCreature: true, hatchWait: 0, hasWaiting: false })).toBeNull();
  });
  it("gives the inkwell no prompt", () => {
    expect(promptFor(place("scenery"), { hasEgg: true, hasCreature: true, hatchWait: 0 })).toBeNull();
  });
  it("offers Feed only for a hatched Print that is close", () => {
    expect(feedPrompt(true, true)).toBe("Feed");
    expect(feedPrompt(true, false)).toBeNull();
    expect(feedPrompt(false, true)).toBeNull(); // an unhatched egg is never feedable
  });
});

describe("auth errors", () => {
  it("turns raw messages into short sentences", () => {
    expect(friendlyAuthError("Invalid login credentials")).toMatch(/didn't match/);
    expect(friendlyAuthError("User already registered")).toMatch(/already has an account/);
    expect(friendlyAuthError("Password should be at least 8 characters")).toMatch(/longer password/);
    expect(friendlyAuthError("weird thing 500")).toBe("Something went wrong. Please try again.");
  });
});

describe("feed messages", () => {
  it("has a gentle confirmation", () => {
    expect(FED_MESSAGE).toMatch(/fed/i);
  });
  it("turns server errors into short sentences, never raw text", () => {
    expect(friendlyFeedError("too soon")).toMatch(/munching/);
    expect(friendlyFeedError("fed enough for today")).toMatch(/full for today/);
    expect(friendlyFeedError("not signed in")).toMatch(/sign in/i);
    expect(friendlyFeedError("PGRST500 boom")).toBe("That didn't work. Please try again.");
  });
});

describe("css class names", () => {
  it("keeps the growth card's classes apart from the sign-in .stage layout", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
    expect(css.match(/^\.stage\s*\{/gm)?.length).toBe(1);
    expect(css).toMatch(/^\.growth\s*\{/m);
  });
});

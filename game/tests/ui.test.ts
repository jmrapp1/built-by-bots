import { describe, expect, it } from "vitest";
import { dropFill, friendlyAuthError, moodFace, promptFor } from "@/lib/ui";
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
    expect(promptFor(place("feeding"), { hasEgg: true, hasCreature: false, hatchWait: 0 })).toBeNull();
    expect(promptFor(place("feeding"), { hasEgg: true, hasCreature: true, hatchWait: 0 })).toBe("Feed");
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

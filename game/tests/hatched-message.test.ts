import { describe, it, expect } from "vitest";
import { HATCHED_MESSAGE, BAD_MESSAGE_WORDS, isFeedMessage, fadesAway, POUCH_FULL, FED_MESSAGE, friendlyFeedError } from "@/lib/ui";

describe("hatched message", () => {
  it("is a warm, non-empty line", () => {
    expect(HATCHED_MESSAGE).toBe("Your egg hatched. Say hello to your Print.");
  });
  it("does not look like an error", () => {
    expect(BAD_MESSAGE_WORDS.test(HATCHED_MESSAGE)).toBe(false);
    expect(isFeedMessage(HATCHED_MESSAGE)).toBe(false);
  });
  it("the error words still match", () => {
    for (const m of ["Not ready yet", "Something went wrong", "Please sign in", "Too soon"]) expect(BAD_MESSAGE_WORDS.test(m)).toBe(true);
  });
  it("fades like the other toasts", () => {
    expect(fadesAway(HATCHED_MESSAGE)).toBe(true);
    expect(fadesAway(POUCH_FULL)).toBe(true);
    expect(fadesAway(FED_MESSAGE)).toBe(true);
    expect(fadesAway("Hints are back", ["Hints are back"])).toBe(true);
  });
  it("errors and the too-early hatch do not fade", () => {
    for (const m of ["Your egg hatches in 5s.", "Something went wrong", "not ready", ""]) expect(fadesAway(m)).toBe(false);
    expect(fadesAway(friendlyFeedError("x"))).toBe(true); // existing behaviour: feed errors fade
  });
});

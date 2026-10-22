import { describe, it, expect } from "vitest";
import { HATCHED_MESSAGE, BAD_MESSAGE_WORDS, isFeedMessage } from "@/lib/ui";

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
});

import { describe, expect, it } from "vitest";
import { screenFor } from "@/lib/gate";

describe("sign-in gate", () => {
  it("never shows the world before the session is known", () => {
    expect(screenFor(null)).toBe("loading");
  });
  it("shows sign-in when there is no session", () => {
    expect(screenFor(false)).toBe("sign-in");
  });
  it("shows the world only with a session", () => {
    expect(screenFor(true)).toBe("world");
  });
});

// H4: come-along Prints stand on the ground height; reach stays x/z only. Pure checks, no WebGL.
import { describe, expect, it } from "vitest";
import { groundLift, groundY } from "@/lib/ground";
import { printInReach } from "@/lib/world";

const spots = [[-75, 10], [50, 35], [30, -100], [100, -100], [-40, 40], [0, 0], [12.5, -7.25]];

describe("H4 Prints follow the ground", () => {
  it("with the switch on, the lift is groundY at the Print's own x/z", () => {
    let raised = 0;
    for (const [x, z] of spots) { expect(groundLift(true, x, z)).toBe(groundY(x, z)); if (groundY(x, z) > 0.05) raised++; }
    expect(raised).toBeGreaterThan(0);
  });
  it("with the switch off, the lift is exactly 0 everywhere (identical to today)", () => {
    for (const [x, z] of spots) expect(groundLift(false, x, z)).toBe(0);
    expect(Object.is(groundLift(false, -75, 10), 0)).toBe(true);
  });
  it("a Print walking along a path rides groundY at each step, never below 0", () => {
    for (let i = 0; i <= 100; i++) { const x = -90 + i * 1.8, z = 10 + Math.sin(i / 7) * 30; expect(groundLift(true, x, z)).toBe(groundY(x, z)); expect(groundLift(true, x, z)).toBeGreaterThanOrEqual(0); }
  });
  it("reach stays x/z only: a Print on a rise is as reachable as one on the flat", () => {
    const hill = { x: -75, z: 10 };
    expect(groundLift(true, hill.x, hill.z)).toBeGreaterThan(0.05);
    const near = { x: hill.x + 1.5, z: hill.z }, far = { x: hill.x + 50, z: hill.z };
    expect(printInReach(near, hill)).toBe(printInReach({ x: 0, z: 0 }, { x: 1.5, z: 0 }));
    expect(printInReach(far, hill)).toBe(false);
    expect(printInReach(near, hill, 2)).toBe(true);
  });
});

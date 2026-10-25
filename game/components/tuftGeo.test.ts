import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { tuftGeo } from "@/components/worldShell";

// The tuft's three stems end at y 0.42, 0.12 out from the centre; each bloom is a sphere of radius ~0.075 (wobble up to +10%).
const BLOOM_R = 0.075 * 1.1, STEM_TIP_Y = 0.42, STEM_OFFSET = 0.12;
const BLOOM_COLORS = ["#d9606b", "#e8b84a", "#8b6fa8"];

describe("tuft shape", () => {
  const g = tuftGeo(), pos = g.getAttribute("position"), col = g.getAttribute("color");
  const tips = [0, 1, 2].map((k) => { const a = (k / 3) * Math.PI * 2 + 0.4; return { x: Math.cos(a) * STEM_OFFSET, z: Math.sin(a) * STEM_OFFSET }; });
  const hex = (i: number) => "#" + new THREE.Color().setRGB(col.getX(i), col.getY(i), col.getZ(i)).getHexString();

  it("has every bloom resting on its own stem tip", () => {
    // Blooms are the vertices not coloured stem green; group them by which stem tip they're nearest.
    for (const c of BLOOM_COLORS) {
      const pts: number[][] = [];
      for (let i = 0; i < pos.count; i++) {
        const h = hex(i);
        if (h === c) pts.push([pos.getX(i), pos.getY(i), pos.getZ(i)]);
      }
      expect(pts.length).toBeGreaterThan(0);
      const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length, cz = pts.reduce((a, p) => a + p[2], 0) / pts.length;
      const d = Math.min(...tips.map((t) => Math.hypot(cx - t.x, cy - STEM_TIP_Y, cz - t.z)));
      expect(d).toBeLessThan(BLOOM_R * 0.5); // the bloom's centre is on the tip
      const lowest = Math.min(...pts.map((p) => p[1]));
      expect(lowest).toBeLessThanOrEqual(STEM_TIP_Y); // its underside reaches the stem, so nothing hangs in the air
    }
  });
  it("keeps the tuft low and finite", () => {
    let max = 0;
    for (let i = 0; i < pos.count; i++) { expect(Number.isFinite(pos.getY(i))).toBe(true); max = Math.max(max, pos.getY(i)); }
    expect(max).toBeLessThan(0.6);
  });
});

// S23: glyph scraps as three.js objects. One InstancedMesh, one small canvas-drawn atlas, no outside assets.
// Scenery only: not pickable (never raycast), no collision, nothing saved. Positions come from lib/scraps.ts.
import * as THREE from "three";
import { GLYPH_BITS, GLYPH_IDS, liftAt, tiltAt, type GlyphBit } from "@/lib/scraps";

export type GlyphScraps = {
  group: THREE.Group;
  /** Moves only the lift and tilt. With reduced motion the scraps are set once and never touched again. */
  update(t: number, reduced: boolean): void;
  dispose(): void;
};

const CELL = 96;
function atlas(): THREE.CanvasTexture {
  const n = GLYPH_IDS.length;
  const c = document.createElement("canvas");
  c.width = CELL * n; c.height = CELL;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fffaf0"; g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < n; i++) {
    const x0 = i * CELL, cx = x0 + CELL / 2, cy = CELL / 2;
    g.strokeStyle = "rgba(110,90,60,0.7)"; g.lineWidth = 6; g.strokeRect(x0 + 3, 3, CELL - 6, CELL - 6); // a worn edge
    g.strokeStyle = "#2f2a44"; g.fillStyle = "#2f2a44"; g.lineWidth = 9; g.lineCap = "round"; g.lineJoin = "round";
    g.beginPath();
    switch (GLYPH_IDS[i]) {
      case "dot": g.arc(cx, cy, 11, 0, Math.PI * 2); g.fill(); g.beginPath(); break;
      case "loop": g.arc(cx, cy, 22, 0.4, Math.PI * 2 - 0.2); g.stroke(); break;
      case "wave": g.moveTo(cx - 30, cy); g.bezierCurveTo(cx - 20, cy - 26, cx - 8, cy - 26, cx, cy); g.bezierCurveTo(cx + 8, cy + 26, cx + 20, cy + 26, cx + 30, cy); g.stroke(); break;
      case "cross": g.moveTo(cx - 20, cy - 20); g.lineTo(cx + 20, cy + 20); g.moveTo(cx + 20, cy - 20); g.lineTo(cx - 20, cy + 20); g.stroke(); break;
      case "leaf": g.moveTo(cx - 24, cy + 20); g.quadraticCurveTo(cx - 20, cy - 26, cx + 24, cy - 22); g.quadraticCurveTo(cx + 22, cy + 22, cx - 24, cy + 20); g.moveTo(cx - 24, cy + 20); g.lineTo(cx + 8, cy - 8); g.stroke(); break;
      case "star":
        for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + (k * 2 * Math.PI) / 5, b = -Math.PI / 2 + (((k * 2 + 2) % 5) * 2 * Math.PI) / 5; if (k === 0) g.moveTo(cx + Math.cos(a) * 26, cy + Math.sin(a) * 26); g.lineTo(cx + Math.cos(b) * 26, cy + Math.sin(b) * 26); }
        g.closePath(); g.stroke(); break;
      default: break;
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

export function buildGlyphScraps(bits: GlyphBit[], scale: number): GlyphScraps {
  const group = new THREE.Group();
  const geo = new THREE.PlaneGeometry(1, 1);
  const tex = atlas();
  const material = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }); // lit like the ground, so night dims it with the ground
  const n = GLYPH_IDS.length;
  geo.setAttribute("aGlyph", new THREE.InstancedBufferAttribute(new Float32Array(bits.map((b) => b.glyph)), 1));
  material.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aGlyph;")
      .replace("#include <uv_vertex>", `#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv.x = (vMapUv.x + aGlyph) / ${n}.0;\n#endif`);
  };
  const mesh = new THREE.InstancedMesh(geo, material, Math.max(1, bits.length));
  mesh.count = bits.length;
  mesh.frustumCulled = false; // small and cheap; its bounds would need recomputing as the instances lift
  mesh.raycast = () => {}; // never a target for a click
  group.add(mesh);

  const size = GLYPH_BITS.size * scale;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3(size, size, size);
  const set = (t: number, reduced: boolean) => {
    bits.forEach((b, i) => {
      const tl = tiltAt(t, b.phase, reduced);
      e.set(-Math.PI / 2 + tl.x, 0, b.yaw + tl.z, "YXZ"); // lies flat; the yaw turns it about its own up
      q.setFromEuler(e);
      p.set(b.x, liftAt(t, b.phase, reduced), b.z);
      m4.compose(p, q, sc);
      mesh.setMatrixAt(i, m4);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
  set(0, true); // the first placement; with reduced motion this is the only one
  return {
    group,
    update(t, reduced) { if (reduced || !bits.length) return; set(t, false); },
    dispose() { group.remove(mesh); mesh.dispose(); geo.dispose(); material.dispose(); tex.dispose(); },
  };
}

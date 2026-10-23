// S31a/b: the sky dome, the paper sun and moon, and the stars. One gradient dome centred on the camera, drawn first, no depth, no fog.
// Look only: nothing here is raycast, saved, sent or collides. The dome, sun and moon are opaque flat shapes (drawn before the
// world, which paints over them) and the sun and moon melt into the sky colour as they set. The stars are the one transparent
// piece (for their fade): they are depth-TESTED but never depth-written, so ridges, props and the horizon hide them, and they
// sit inside the camera far plane so the world can occlude them. Freed whole by dispose().
import * as THREE from "three";
import { SKY, STARS, domeColor, glare, starAt, starLevel, twinkle, marginsZenith, moonLevel, moonDir, moonOffset, moonShade, sunDir, sunLevel, type Dir } from "@/lib/sky";

export type SkyScene = {
  group: THREE.Group;
  /** Colours: the horizon (today's sky colour, with any weather grey) and the zenith for this hour. About once a second is plenty. */
  setColors(horizon: string, zenith: string): void;
  /** Every frame: follow the camera and place the sun and moon for the hour. */
  update(a: { at: THREE.Vector3; hour: number; t: number; reduced: boolean; phase: number; weather?: number }): void;
  dispose(): void;
};

const flat = (color: string) => new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, depthTest: false, depthWrite: false, fog: false });

export function buildSkyScene(scene: THREE.Scene, opts: { bodies: boolean; margins: boolean; stars?: boolean }): SkyScene {
  const D = SKY.dome, group = new THREE.Group();
  group.name = "sky";
  const owned: { dispose(): void }[] = [];

  // --- the dome: rings of vertices from just under the horizon to straight up, coloured per vertex ---
  const rings = D.rings, seg = D.segments, R = D.radius;
  const lo = -D.belowHorizon * (Math.PI / 2);
  const pos = new Float32Array((rings + 1) * (seg + 1) * 3), col = new Float32Array(pos.length), ups: number[] = [];
  for (let r = 0; r <= rings; r++) {
    const el = lo + (r / rings) * (Math.PI / 2 - lo); // the rings bunch near the horizon where the gradient matters
    for (let s = 0; s <= seg; s++) {
      const az = (s / seg) * Math.PI * 2, i = (r * (seg + 1) + s) * 3;
      pos[i] = Math.cos(el) * Math.cos(az) * R; pos[i + 1] = Math.sin(el) * R; pos[i + 2] = Math.cos(el) * Math.sin(az) * R;
      ups.push(Math.sin(el));
    }
  }
  const idx: number[] = [];
  for (let r = 0; r < rings; r++) for (let s = 0; s < seg; s++) {
    const a = r * (seg + 1) + s, b = a + seg + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setIndex(idx);
  const domeMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, depthTest: false, depthWrite: false, fog: false });
  const dome = new THREE.Mesh(geo, domeMat);
  dome.renderOrder = -100; dome.frustumCulled = false; dome.raycast = () => {};
  group.add(dome);
  owned.push(geo, domeMat);

  let horizon = "#f6f1e4", zenith = "#d9e2ea";
  const tmp = new THREE.Color();
  const skyAt = (up: number) => domeColor(horizon, zenith, up);

  // --- the sun: a paper disc, an ink ring and a few short ink rays ---
  const S = SKY.sun, M = SKY.moon;
  const sunG = new THREE.Group(), moonG = new THREE.Group();
  let sunMats: { m: THREE.MeshBasicMaterial; c: string }[] = [], moonMats: { m: THREE.MeshBasicMaterial; c: string }[] = [];
  let raysG: THREE.Group | null = null, shade: THREE.Mesh | null = null;
  const piece = (g: THREE.Group, list: typeof sunMats, geometry: THREE.BufferGeometry, color: string, order: number) => {
    const m = flat(color), mesh = new THREE.Mesh(geometry, m);
    mesh.renderOrder = order; mesh.frustumCulled = false; mesh.raycast = () => {};
    g.add(mesh); list.push({ m, c: color }); owned.push(geometry, m);
    return mesh;
  };
  if (opts.bodies) {
    const ring = new THREE.RingGeometry(S.radius, S.radius + S.ringWidth, 40);
    piece(sunG, sunMats, new THREE.CircleGeometry(S.radius, 40), S.disc, -90);
    piece(sunG, sunMats, ring, S.ink, -89);
    // rays: one flat strip each, merged into one geometry
    const rp: number[] = [];
    for (let i = 0; i < S.rays; i++) {
      const a = (i / S.rays) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), r0 = S.radius + S.ringWidth + S.rayGap, r1 = r0 + S.rayLength, w = S.rayWidth / 2;
      const px = -s * w, py = c * w;
      rp.push(c * r0 - px, s * r0 - py, 0, c * r1 - px * 0.4, s * r1 - py * 0.4, 0, c * r1 + px * 0.4, s * r1 + py * 0.4, 0,
        c * r0 - px, s * r0 - py, 0, c * r1 + px * 0.4, s * r1 + py * 0.4, 0, c * r0 + px, s * r0 + py, 0);
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(rp), 3));
    raysG = new THREE.Group();
    sunG.add(raysG);
    const rm = piece(raysG, sunMats, rg, S.ink, -89);
    void rm;

    piece(moonG, moonMats, new THREE.CircleGeometry(M.radius, M.segments), M.disc, -90);
    piece(moonG, moonMats, new THREE.RingGeometry(M.radius, M.radius + M.ringWidth, M.segments), M.ink, -88);
    const sg = new THREE.BufferGeometry();
    shade = piece(moonG, moonMats, sg, M.shade, -89);
    group.add(sunG, moonG);
  }
  let shownPhase = -1;
  const setShade = (phase: number) => {
    if (!shade || phase === shownPhase) return;
    shownPhase = phase;
    const poly = moonShade(moonOffset(phase)).map(([x, y]) => [x * M.radius, y * M.radius] as [number, number]);
    const v: number[] = [];
    if (poly.length >= 3) {
      let cx = 0, cy = 0; for (const [x, y] of poly) { cx += x; cy += y; } cx /= poly.length; cy /= poly.length;
      for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; v.push(cx, cy, 0, a[0], a[1], 0, b[0], b[1], 0); }
    }
    shade.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(v), 3));
    shade.geometry.setDrawRange(0, v.length / 3);
    shade.visible = v.length > 0;
  };

  const place = (g: THREE.Group, mats: typeof sunMats, d: Dir, dist: number, level: number) => {
    g.visible = level > 0.002;
    if (!g.visible) return;
    g.position.set(d.x * dist, d.y * dist, d.z * dist);
    g.lookAt(group.position); // faces the camera, which is the centre of the dome
    const bg = skyAt(d.y);
    for (const { m, c } of mats) m.color.set(c).lerp(tmp.set(bg), 1 - level); // melts into the sky as it sets: opaque, never sorted
  };


  // --- S31b: the stars: one mesh of flat triangles (dots as small diamonds, about one in ten a four-point mark), per-vertex alpha ---
  let starMesh: THREE.Mesh | null = null, starAlpha: Float32Array | null = null, starOf: number[] = [];
  const starList = opts.stars && STARS.count > 0 ? Array.from({ length: STARS.count }, (_, i) => starAt(i)) : [];
  if (starList.length) {
    const P: number[] = [];
    const base = new THREE.Color(STARS.color);
    starList.forEach((st, i) => {
      const c = new THREE.Vector3(st.dir.x, st.dir.y, st.dir.z), up = Math.abs(c.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const e1 = new THREE.Vector3().crossVectors(up, c).normalize(), e2 = new THREE.Vector3().crossVectors(c, e1);
      const at = (a: number, r: number) => c.clone().multiplyScalar(STARS.distance).addScaledVector(e1, Math.cos(a + st.spin) * r).addScaledVector(e2, Math.sin(a + st.spin) * r);
      const tri = (a: THREE.Vector3, b: THREE.Vector3, d: THREE.Vector3) => { P.push(a.x, a.y, a.z, b.x, b.y, b.z, d.x, d.y, d.z); starOf.push(i, i, i); };
      const mid = at(0, 0);
      if (st.kind === "glyph") {
        for (let k = 0; k < 8; k++) {
          const r0 = k % 2 === 0 ? st.size : st.size * STARS.glyphInner, r1 = k % 2 === 0 ? st.size * STARS.glyphInner : st.size;
          tri(mid, at((k * Math.PI) / 4, r0), at(((k + 1) * Math.PI) / 4, r1));
        }
      } else for (let k = 0; k < 4; k++) tri(mid, at((k * Math.PI) / 2, st.size), at(((k + 1) * Math.PI) / 2, st.size));
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(P), 3));
    starAlpha = new Float32Array(starOf.length * 4);
    for (let v = 0; v < starOf.length; v++) { starAlpha[v * 4] = base.r; starAlpha[v * 4 + 1] = base.g; starAlpha[v * 4 + 2] = base.b; starAlpha[v * 4 + 3] = 0; }
    g.setAttribute("color", new THREE.BufferAttribute(starAlpha, 4).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, side: THREE.DoubleSide, depthTest: true, depthWrite: false, fog: false }); // tested against the world, never written: the world hides them
    starMesh = new THREE.Mesh(g, m);
    starMesh.renderOrder = -95; starMesh.frustumCulled = false; starMesh.raycast = () => {}; starMesh.visible = false;
    group.add(starMesh); owned.push(g, m);
  }

  scene.add(group);
  const api: SkyScene = {
    group,
    setColors(h, z) {
      horizon = h; zenith = opts.margins ? marginsZenith(h, z) : z;
      for (let i = 0; i < ups.length; i++) { tmp.set(domeColor(horizon, zenith, ups[i])); col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b; }
      (geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    },
    update({ at, hour, t, reduced, phase, weather = 0 }) {
      group.position.copy(at);
      if (starMesh && starAlpha) {
        const lvl = starLevel(hour, weather);
        starMesh.visible = lvl > 0.003;
        if (starMesh.visible) {
          const sd = sunDir(hour), sl = sunLevel(hour);
          for (let v = 0; v < starOf.length; v++) {
            const st = starList[starOf[v]];
            starAlpha[v * 4 + 3] = lvl * twinkle(st, t, reduced) * glare(st.dir, sd, sl);
          }
          (starMesh.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
        }
      }
      if (!opts.bodies) return;
      place(sunG, sunMats, sunDir(hour), S.distance, sunLevel(hour));
      if (raysG) raysG.rotation.z = reduced ? 0 : t * S.spin;
      setShade(phase);
      place(moonG, moonMats, moonDir(hour), M.distance, moonLevel(hour));
    },
    dispose() { scene.remove(group); for (const o of owned) o.dispose(); },
  };
  api.setColors(horizon, zenith);
  return api;
}

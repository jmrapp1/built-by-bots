"use client";
// W0 SPIKE (throwaway, dev-only): a flat square filled with seeded, instanced, chunked scenery, with fog and an optional
// paper-fold horizon, plus a benchmark that walks across it and records draw calls, triangles, frame times, chunk build times
// and memory. Not part of the game. Delete with the branch.
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { chunkContents, chunksAround, chunksPerSide, instanceCount, mean, percentile, type Opts } from "@/lib/worldtest";

type Chunk = { g: THREE.Group; geoms: THREE.InstancedMesh[]; inst: number };
const INK = 0x1b1b2a;

export default function WorldTest(o: Opts) {
  const ref = useRef<HTMLDivElement>(null);
  const hud = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const el = ref.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.setPixelRatio(1);
    el.appendChild(renderer.domElement);
    const sky = new THREE.Color("#f6f1e4");
    const scene = new THREE.Scene();
    scene.background = sky;
    scene.fog = new THREE.Fog(sky, o.fogFar * 0.4, o.fogFar);
    const camera = new THREE.PerspectiveCamera(55, el.clientWidth / el.clientHeight, 0.3, o.fogFar + 40);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb5c9a0, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2); sun.position.set(8, 14, 6); scene.add(sun);

    // Ground: one plane for the whole square.
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(o.size + 400, o.size + 400), new THREE.MeshStandardMaterial({ color: 0xcfe0b4, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; scene.add(ground);

    // Shared geometry and materials: made once, never disposed per chunk.
    const G = {
      trunk: new THREE.CylinderGeometry(0.12, 0.18, 1.2, 6).translate(0, 0.6, 0),
      crown: new THREE.ConeGeometry(0.9, 2.6, 7).translate(0, 2.5, 0),
      rock: new THREE.DodecahedronGeometry(0.7, 0).translate(0, 0.35, 0),
      hedge: new THREE.BoxGeometry(2.4, 1, 0.9).translate(0, 0.5, 0),
      tower: new THREE.BoxGeometry(2.2, 9, 2.2).translate(0, 4.5, 0),
      roof: new THREE.ConeGeometry(2.1, 3, 4).translate(0, 10.5, 0).rotateY(Math.PI / 4),
      band: new THREE.BoxGeometry(2.4, 0.5, 2.4).translate(0, 6, 0),
    };
    const M = {
      trunk: new THREE.MeshStandardMaterial({ color: 0x6b5a48, roughness: 0.9 }), crown: new THREE.MeshStandardMaterial({ color: 0x5e9c76, roughness: 0.8 }),
      rock: new THREE.MeshStandardMaterial({ color: 0xb9b6ad, roughness: 1 }), hedge: new THREE.MeshStandardMaterial({ color: 0x6faa7f, roughness: 0.9 }),
      tower: new THREE.MeshStandardMaterial({ color: 0xf1dfae, roughness: 0.9 }), roof: new THREE.MeshStandardMaterial({ color: 0xd9606b, roughness: 0.8 }),
      band: new THREE.MeshStandardMaterial({ color: INK, roughness: 1 }),
    };

    const chunks = new Map<string, Chunk>();
    const tmp = new THREE.Object3D();
    const stats = { builds: [] as number[], disposes: [] as number[], instances: 0, perFrameBuilds: [] as number[] };
    const build = (ix: number, iz: number) => {
      const t0 = performance.now();
      const c = chunkContents(ix, iz, o);
      const g = new THREE.Group(), geoms: THREE.InstancedMesh[] = [];
      const make = (geo: THREE.BufferGeometry, mat: THREE.Material, items: { x: number; z: number; s: number; r: number }[]) => {
        if (!items.length) return;
        const im = new THREE.InstancedMesh(geo, mat, items.length);
        items.forEach((it, i) => { tmp.position.set(it.x, 0, it.z); tmp.rotation.set(0, it.r, 0); tmp.scale.setScalar(it.s); tmp.updateMatrix(); im.setMatrixAt(i, tmp.matrix); });
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere(); // so culling works per chunk
        g.add(im); geoms.push(im);
      };
      make(G.trunk, M.trunk, c.trees); make(G.crown, M.crown, c.trees); make(G.rock, M.rock, c.rocks); make(G.hedge, M.hedge, c.hedges);
      make(G.tower, M.tower, c.landmarks); make(G.roof, M.roof, c.landmarks); make(G.band, M.band, c.landmarks);
      scene.add(g);
      const inst = instanceCount(c);
      chunks.set(`${ix},${iz}`, { g, geoms, inst });
      stats.instances += inst;
      stats.builds.push(performance.now() - t0);
    };
    const drop = (k: string) => {
      const t0 = performance.now(), c = chunks.get(k);
      if (!c) return;
      scene.remove(c.g);
      for (const im of c.geoms) im.dispose(); // frees the instance buffer; the shared geometry and materials stay
      stats.instances -= c.inst; chunks.delete(k);
      stats.disposes.push(performance.now() - t0);
    };
    // Keep the chunks near the player; build the nearest missing ones within a per-frame budget; drop the ones far behind.
    const stream = (x: number, z: number, budget: number) => {
      const want = chunksAround(x, z, o.fogFar + o.chunk, o), keep = new Set(want.map(([a, b]) => `${a},${b}`));
      let made = 0;
      for (const [ix, iz] of want) { if (made >= budget) break; if (!chunks.has(`${ix},${iz}`)) { build(ix, iz); made++; } }
      const far = chunksAround(x, z, o.fogFar + o.chunk * 2.5, o), keepFar = new Set(far.map(([a, b]) => `${a},${b}`));
      for (const k of [...chunks.keys()]) if (!keep.has(k) && !keepFar.has(k)) drop(k);
      return made;
    };

    // Paper-fold horizon: three jagged ridge rings that follow the player, tinted toward the fog.
    const ridges: THREE.Mesh[] = [];
    if (o.horizon) {
      for (let k = 0; k < 3; k++) {
        const seg = 192, pos: number[] = [], idx: number[] = [], R = o.fogFar * (0.86 + k * 0.05);
        for (let i = 0; i <= seg; i++) {
          const a = (i / seg) * Math.PI * 2, h = 10 + k * 5 + 7 * Math.abs(Math.sin(a * (3 + k) + k)) + 4 * Math.sin(a * 11 + k * 2);
          pos.push(Math.cos(a) * R, 0, Math.sin(a) * R, Math.cos(a) * R, h, Math.sin(a) * R);
          if (i < seg) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
        }
        const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xb8c6a2).lerp(sky, 0.25 + k * 0.2), side: THREE.DoubleSide, fog: false }));
        m.frustumCulled = false; scene.add(m); ridges.push(m);
      }
    }

    // The player: a point on the ground; WASD / arrows by hand, or the benchmark's straight walk.
    let px = 0, pz = 0, yaw = 0;
    const keys = new Set<string>();
    const kd = (e: KeyboardEvent) => keys.add(e.code), ku = (e: KeyboardEvent) => keys.delete(e.code);
    window.addEventListener("keydown", kd); window.addEventListener("keyup", ku);

    // ---- the benchmark ----
    type Phase = "warm" | "stand" | "walk" | "teardown" | "done";
    let phase: Phase = o.bench ? "warm" : "done";
    const heap = () => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null;
    const rec = () => ({ ft: [] as number[], cpu: [] as number[], calls: [] as number[], tris: [] as number[], chunks: [] as number[], made: [] as number[] });
    let cur = rec(); const R = { stand: rec(), walk: rec() };
    let frameN = 0, phaseStart = 0, last = performance.now();
    const heapAt: Record<string, number | null> = {};
    let geoPeak = 0, walkStart = { x: 0, z: 0 };
    const half = o.size / 2, WALK_SPEED = 30, EDGE = half - 20;
    const summary = (r: ReturnType<typeof rec>) => ({
      frames: r.ft.length, frameMsAvg: +mean(r.ft).toFixed(2), frameMsP95: +percentile(r.ft, 0.95).toFixed(2), frameMsMax: +Math.max(0, ...r.ft).toFixed(2),
      renderCpuMsAvg: +mean(r.cpu).toFixed(2), renderCpuMsP95: +percentile(r.cpu, 0.95).toFixed(2),
      callsAvg: Math.round(mean(r.calls)), callsMax: Math.max(0, ...r.calls), trisAvg: Math.round(mean(r.tris)), trisMax: Math.max(0, ...r.tris), chunksMax: Math.max(0, ...r.chunks),
      maxBuildsInOneFrame: Math.max(0, ...r.made),
    });
    const finish = () => {
      const gl = renderer.getContext(); const ext = gl.getExtension("WEBGL_debug_renderer_info");
      const res = {
        opts: o, gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown", ua: navigator.userAgent, cores: navigator.hardwareConcurrency,
        stand: summary(R.stand), walk: summary(R.walk),
        chunkBuild: { count: stats.builds.length, msAvg: +mean(stats.builds).toFixed(2), msP95: +percentile(stats.builds, 0.95).toFixed(2), msMax: +Math.max(0, ...stats.builds).toFixed(2) },
        chunkDispose: { count: stats.disposes.length, msAvg: +mean(stats.disposes).toFixed(3) },
        memory: { heapBytes: heapAt, geometriesPeak: geoPeak, geometriesAfterTeardown: renderer.info.memory.geometries, texturesAfterTeardown: renderer.info.memory.textures, chunksAfterTeardown: chunks.size, instancesAfterTeardown: stats.instances },
        walkMetres: Math.round(Math.hypot(px - walkStart.x, pz - walkStart.z)),
      };
      (window as unknown as { __bench: unknown }).__bench = res;
      if (hud.current) hud.current.textContent = "DONE\n" + JSON.stringify(res, null, 1).slice(0, 1200);
    };

    let raf = 0;
    const loop = () => {
      const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000), ftMs = now - last; last = now; frameN++;
      let made = 0;
      if (phase === "done" || phase === "walk" || phase === "stand" || phase === "warm") {
        if (phase === "done") {
          const sp = (keys.has("ShiftLeft") ? 14 : 6) * dt, f = (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) - (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0);
          yaw += ((keys.has("ArrowLeft") ? 1 : 0) - (keys.has("ArrowRight") ? 1 : 0)) * 1.6 * dt + ((keys.has("KeyA") ? 1 : 0) - (keys.has("KeyD") ? 1 : 0)) * 1.6 * dt;
          px = Math.max(-half, Math.min(half, px - Math.sin(yaw) * f * sp)); pz = Math.max(-half, Math.min(half, pz - Math.cos(yaw) * f * sp));
        }
        if (phase === "walk") {
          px += WALK_SPEED * dt; // a straight line along the middle of the world, east
          if (px >= EDGE) { phase = "teardown"; frameN = 0; heapAt.afterWalk = heap(); }
        }
        if (phase === "warm" && frameN === 1) { px = o.bench ? -EDGE : 0; walkStart = { x: px, z: 0 }; heapAt.before = heap(); }
        if (o.stream) made = stream(px, pz, phase === "warm" ? 9999 : o.budget);
        else if (chunks.size === 0) { const n = chunksPerSide(o.size, o.chunk); for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) build(a, b); made = n * n; }
      }
      camera.position.set(px, 1.7, pz); camera.rotation.set(0, yaw, 0, "YXZ");
      if (phase !== "done") camera.rotation.y = -Math.PI / 2; // the benchmark looks east along its walk
      for (const m of ridges) m.position.set(px, 0, pz);
      const c0 = performance.now(); renderer.render(scene, camera); const cpu = performance.now() - c0;
      const info = renderer.info;
      if (phase === "stand" || phase === "walk") {
        const r = phase === "stand" ? R.stand : R.walk;
        r.ft.push(ftMs); r.cpu.push(cpu); r.calls.push(info.render.calls); r.tris.push(info.render.triangles); r.chunks.push(chunks.size); r.made.push(made);
        geoPeak = Math.max(geoPeak, info.memory.geometries);
        const h = heap(); if (h !== null) heapAt.peak = Math.max(heapAt.peak ?? 0, h);
      }
      if (phase === "warm" && frameN >= 30) { phase = "stand"; frameN = 0; phaseStart = now; heapAt.afterWarm = heap(); }
      else if (phase === "stand" && frameN >= 120) { phase = "walk"; frameN = 0; cur = rec(); walkStart = { x: px, z: pz }; }
      else if (phase === "teardown") {
        if (frameN === 1) { for (const k of [...chunks.keys()]) drop(k); }
        if (frameN >= 20) { heapAt.afterTeardown = heap(); phase = "done"; finish(); }
      }
      if (hud.current && phase !== "done" || (hud.current && !o.bench)) hud.current!.textContent =
        `${phase} size=${o.size} chunk=${o.chunk} fog=${o.fogFar} stream=${o.stream} horizon=${o.horizon}\ncalls=${info.render.calls} tris=${info.render.triangles} chunks=${chunks.size} geoms=${info.memory.geometries}\nframe=${ftMs.toFixed(1)}ms cpu=${cpu.toFixed(1)}ms pos=${px.toFixed(0)},${pz.toFixed(0)}`;
    };
    renderer.setAnimationLoop(loop);
    void raf; void cur; void phaseStart;

    const onResize = () => { renderer.setSize(el.clientWidth, el.clientHeight); camera.aspect = el.clientWidth / el.clientHeight; camera.updateProjectionMatrix(); };
    window.addEventListener("resize", onResize);
    return () => {
      renderer.setAnimationLoop(null);
      window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); window.removeEventListener("resize", onResize);
      for (const k of [...chunks.keys()]) drop(k);
      Object.values(G).forEach((g) => g.dispose()); Object.values(M).forEach((m) => m.dispose()); ground.geometry.dispose(); (ground.material as THREE.Material).dispose();
      ridges.forEach((m) => { m.geometry.dispose(); (m.material as THREE.Material).dispose(); });
      renderer.dispose(); renderer.domElement.remove();
    };
  }, [o.size, o.chunk, o.fogFar, o.stream, o.horizon, o.bench, o.budget, o.seed]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <div ref={ref} style={{ position: "absolute", inset: 0 }} />
      <pre ref={hud} style={{ position: "absolute", left: 8, top: 8, margin: 0, padding: 6, background: "rgba(255,255,255,.8)", font: "11px monospace", maxWidth: 560, whiteSpace: "pre-wrap" }} />
    </div>
  );
}

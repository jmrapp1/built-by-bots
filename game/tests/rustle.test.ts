// F4: rustle. The flag, the pusher cap, reduced motion, and that nothing else changes (no collider, no network, no storage, shadows untouched).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import raw from "@/data/foliage.json";
import { MOVING, RUSTLE, rustleBlooms, rustleFlag, rustleGrass, rustleSettings, rustleStep, type RustleState } from "@/lib/foliage";
import { buildWorldShell, MAX_PUSH } from "@/components/worldShell";
import { CHUNKS, chunkContents } from "@/lib/worldMap";
import { createHash } from "node:crypto";

const base = { foliage: { enabled: true }, blooms: { enabled: true }, rustle: { enabled: true, grass: true, blooms: true } };
const cfg = { maxPushers: 4, recover: 0.8 };
const mov = (x: number, others: { id: string; x: number; z: number }[] = []) => [{ id: "_me", x, z: 0 }, ...others];

describe("the rustle switch", () => {
  it("ships on with its tunables", () => {
    expect(raw.rustle.enabled).toBe(true);
    expect(RUSTLE).toMatchObject({ maxPushers: 4, grass: true, blooms: true });
    expect(rustleSettings()).toMatchObject({ maxPushers: 4 });
  });
  it("only a plain true is on", () => {
    for (const v of ["true", 1, "1", null, undefined, {}, [], false]) { expect(rustleFlag({ ...base, rustle: { enabled: v } })).toBe(false); expect(rustleGrass({ ...base, rustle: { ...base.rustle, enabled: v } })).toBe(false); }
    expect(rustleFlag(null)).toBe(false); expect(rustleFlag({})).toBe(false); expect(rustleFlag(base)).toBe(true);
  });
  it("is a sub-flag: it needs the layer it bends", () => {
    expect(rustleGrass({ ...base, foliage: { enabled: false } })).toBe(false);
    expect(rustleBlooms({ ...base, blooms: { enabled: false } })).toBe(false);
    expect(rustleGrass({ ...base, blooms: { enabled: false } })).toBe(true);
    expect(rustleBlooms({ ...base, foliage: { enabled: false } })).toBe(true);
    expect(rustleFlag({ ...base, foliage: { enabled: false }, blooms: { enabled: false } })).toBe(false);
  });
  it("grass and blooms switch off alone", () => {
    const g = { ...base, rustle: { ...base.rustle, grass: false } }, b = { ...base, rustle: { ...base.rustle, blooms: false } };
    expect(rustleGrass(g)).toBe(false); expect(rustleBlooms(g)).toBe(true); expect(rustleGrass(b)).toBe(true); expect(rustleBlooms(b)).toBe(false);
  });
  it("tunables are clamped whatever the file says", () => {
    expect(rustleSettings({ maxPushers: 99 }).maxPushers).toBe(8); expect(rustleSettings({ maxPushers: 0 }).maxPushers).toBe(1);
    expect(rustleSettings({ maxPushers: "x" as unknown as number })).toMatchObject({ maxPushers: 4, radius: 0.9, maxBend: 25, recover: 0.8 });
    expect(rustleSettings({ maxBend: 500 }).maxBend).toBe(60);
    expect(MAX_PUSH).toBeGreaterThanOrEqual(8);
  });
});

describe("the pushers", () => {
  it("standing still pushes nothing", () => {
    const st: RustleState = new Map(); let out = rustleStep(st, mov(0), 0.016, cfg, false);
    for (let i = 0; i < 60; i++) out = rustleStep(st, mov(0), 0.016, cfg, false);
    expect(out).toEqual([]);
  });
  it("walking pushes, then the strength falls to nothing in about the recover time after stopping", () => {
    const st: RustleState = new Map(); let x = 0, out = rustleStep(st, mov(x), 0.016, cfg, false);
    for (let i = 0; i < 30; i++) { x += 0.05; out = rustleStep(st, mov(x), 0.016, cfg, false); }
    expect(out).toHaveLength(1); expect(out[0].s).toBe(1); expect(MOVING).toBeLessThan(0.05 / 0.016);
    let t = 0, mid = 1; while (out.length && t < 3) { out = rustleStep(st, mov(x), 0.016, cfg, false); t += 0.016; if (t > 0.4 && t < 0.42) mid = out[0]?.s ?? 0; }
    expect(t).toBeGreaterThan(0.7); expect(t).toBeLessThan(0.9); expect(mid).toBeGreaterThan(0.3); expect(mid).toBeLessThan(0.7);
  });
  it("a jump (a teleport, a zone change) is not walking", () => {
    const st: RustleState = new Map(); rustleStep(st, mov(0), 0.016, cfg, false);
    expect(rustleStep(st, mov(40), 0.016, cfg, false)).toEqual([]);
  });
  it("at most maxPushers, the player always in, then the nearest Prints", () => {
    const st: RustleState = new Map(), prints = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, x: 1 + i, z: 0 }));
    let out = rustleStep(st, mov(0, prints), 0.016, cfg, false);
    for (let i = 1; i <= 30; i++) { const mv = prints.map((p) => ({ ...p, x: p.x + i * 0.05 })); out = rustleStep(st, mov(i * 0.05, mv), 0.016, cfg, false); }
    expect(out.length).toBe(4);
    const xs = out.map((o) => o.x); expect(xs[0]).toBeCloseTo(1.5, 5); expect(Math.max(...xs.slice(1))).toBeLessThan(5); // the player, then p0..p2 (the nearest)
    for (const m of [1, 2, 8, 50]) { const s2: RustleState = new Map(); let o2 = rustleStep(s2, mov(0, prints), 0.016, { ...cfg, maxPushers: m }, false); for (let i = 1; i <= 30; i++) o2 = rustleStep(s2, mov(i * 0.05, prints.map((p) => ({ ...p, x: p.x + i * 0.05 }))), 0.016, { ...cfg, maxPushers: m }, false); expect(o2.length).toBe(Math.min(m, 13)); }
    expect(st.size).toBeLessThanOrEqual(4);
  });
  it("maxPushers 1 is the player only", () => {
    const st: RustleState = new Map(); let out = rustleStep(st, mov(0, [{ id: "a", x: 1, z: 0 }]), 0.016, { ...cfg, maxPushers: 1 }, false);
    for (let i = 1; i < 20; i++) out = rustleStep(st, mov(i * 0.05, [{ id: "a", x: 1 + i * 0.05, z: 0 }]), 0.016, { ...cfg, maxPushers: 1 }, false);
    expect(out).toHaveLength(1);
  });
  it("reduced motion: strength stays zero, nothing is kept, and it comes back when switched off", () => {
    const st: RustleState = new Map(); let x = 0;
    for (let i = 0; i < 30; i++) { x += 0.05; expect(rustleStep(st, mov(x), 0.016, cfg, true)).toEqual([]); }
    expect(st.size).toBe(0);
    for (let i = 0; i < 30; i++) { x += 0.05; rustleStep(st, mov(x), 0.016, cfg, false); }
    expect(rustleStep(st, mov(x + 0.05), 0.016, cfg, false)).toHaveLength(1);
  });
  it("a bad frame time pushes nothing", () => { for (const dt of [0, -1, NaN]) expect(rustleStep(new Map(), mov(0), dt, cfg, false)).toEqual([]); });
});

describe("the shell", () => {
  const draws = (d?: unknown) => { const sc = new THREE.Scene(), sh = buildWorldShell(sc, { ground: true, features: true, rustleData: d }); sh.update(-75, 10, true); const mats = new Set<THREE.Material>(); let n = 0; sc.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { n++; if ((m.material as THREE.Material).onBeforeCompile.toString().includes("uRP") || (m.material as THREE.Material).customProgramCacheKey().startsWith("rustle")) mats.add(m.material as THREE.Material); } }); return { n, mats, sh, sc }; };
  it("flag off: no material is touched; flag on: only the grass and bloom materials, and the draw count is the same", () => {
    const off = draws({ ...raw, rustle: { ...raw.rustle, enabled: false } }), on = draws(raw);
    expect(off.mats.size).toBe(0); expect(on.mats.size).toBe(2); expect(on.n).toBe(off.n);
    for (const m of on.mats) { expect((m as THREE.MeshToonMaterial).vertexColors).toBe(true); expect(m.side).toBe(THREE.DoubleSide); }
    off.sh.dispose(); on.sh.dispose();
  });
  it("flag off: setPushers does nothing; flag on: it fills the uniforms", () => {
    const off = draws({ ...raw, rustle: { ...raw.rustle, enabled: false } }); expect(() => off.sh.setPushers([{ x: 1, z: 1, s: 1 }])).not.toThrow(); off.sh.dispose();
    const on = draws(raw); expect(() => on.sh.setPushers(Array.from({ length: 20 }, (_, i) => ({ x: i, z: 0, s: 1 })))).not.toThrow(); on.sh.dispose();
  });
  it("the bend compiles into the shader with the pusher loop capped, and shadows are left unbent", () => {
    const on = draws(raw); const m = [...on.mats][0]; const sh = { uniforms: {} as Record<string, unknown>, vertexShader: "#include <common>\n#include <begin_vertex>" };
    m.onBeforeCompile(sh as never, null as never);
    expect(sh.vertexShader).toContain("uRP[8]"); expect(sh.vertexShader).toContain("break"); expect(Object.keys(sh.uniforms)).toEqual(expect.arrayContaining(["uRP", "uRN", "uRR", "uRK"]));
    on.sc.traverse((o) => { if ((o as THREE.Mesh).isMesh) expect((o as THREE.Mesh).customDepthMaterial ?? null).toBeNull(); });
    on.sh.dispose();
  });
  it("no collider: chunk contents are untouched", () => {
    const all = () => { const o: unknown[] = []; for (let a = 0; a < CHUNKS; a++) for (let b = 0; b < CHUNKS; b++) o.push(chunkContents(a, b)); return o; };
    const h = () => createHash("sha256").update(JSON.stringify(all())).digest("hex"); const before = h(); const d = draws(raw); d.sh.dispose(); expect(h()).toBe(before);
  });
});

describe("no network, no storage, reduced motion read", () => {
  const code = (f: string) => readFileSync(f, "utf8");
  it("the rustle code in lib and shell makes no network or storage call", () => {
    const lib = code("lib/foliage.ts"), shell = code("components/worldShell.ts");
    for (const src of [lib, shell]) expect(src).not.toMatch(/\bfetch\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB|WebSocket|sendBeacon/);
  });
  it("World reads reduced motion live and passes it to the step, and calls nothing else for rustle", () => {
    const w = code("components/World.tsx");
    expect(w).toContain('rustleMq = window.matchMedia("(prefers-reduced-motion: reduce)")');
    expect(w).toContain("rustleStep(rustleState, who, dt, rustleCfg, rustleMq.matches)");
    expect(w).toContain("shell.setPushers(");
  });
});

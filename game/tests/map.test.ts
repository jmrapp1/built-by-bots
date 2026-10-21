// W4: the map page's pure rules, the signposts' place in the World, and the wiring (no text on the map, no network, no new hosts).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CELLS, MAP, SIGNPOSTS, cellCentre, cellIndex, cellOf, isWalked, newWalked, opensMap, parseWalked, pathRuns, pin, reveal, seenLandmarks, seenSignposts, serialize, storageKey, toPage } from "@/lib/map";
import { CHUNKS, HALF, WORLD, blocked, chunkCircles, chunkContents, distToPath, pathPoints, POST_R } from "@/lib/worldMap";

const src = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");

describe("map cells", () => {
  it("the grid covers the world and every cell maps back to itself", () => {
    expect(CELLS * MAP.cell).toBeGreaterThanOrEqual(WORLD.size);
    for (let i = 0; i < CELLS * CELLS; i++) { const c = cellCentre(i); expect(cellIndex(cellOf(c.x), cellOf(c.z))).toBe(i); }
    expect(cellOf(-1e6)).toBe(0); expect(cellOf(1e6)).toBe(CELLS - 1);
  });
  it("starts blank, and walking reveals cells near the player only", () => {
    const w = newWalked(); expect(w.size).toBe(0);
    expect(reveal(w, 0, 0)).toBe(true);
    expect(isWalked(w, 0, 0)).toBe(true); expect(isWalked(w, 100, 100)).toBe(false);
    expect(reveal(w, 0, 0)).toBe(false); // standing still adds nothing
    for (const i of w) { const c = cellCentre(i); expect(Math.hypot(c.x, c.z)).toBeLessThanOrEqual(MAP.reveal + 1e-6); }
  });
  it("walking the whole path reveals the path and the far landmark; the far corner stays blank", () => {
    const w = newWalked(); for (const p of pathPoints(4)) reveal(w, p.x, p.z);
    expect(pathRuns(w).length).toBe(1);
    expect(isWalked(w, HALF - 4, HALF - 4)).toBe(false);
    expect(seenLandmarks(w).length).toBeLessThan(WORLD.landmarks.length);
  });
  it("a gap in the walk leaves a gap in the inked path", () => {
    const w = newWalked(); const P = pathPoints(4);
    for (const p of P.slice(0, 6)) reveal(w, p.x, p.z);
    for (const p of P.slice(-6)) reveal(w, p.x, p.z);
    expect(pathRuns(w).length).toBe(2);
  });
});

describe("saving", () => {
  it("round-trips, sorted, and per player", () => {
    const w = newWalked(); reveal(w, 10, -30);
    expect(parseWalked(serialize(w))).toEqual(w);
    expect(storageKey("a")).not.toBe(storageKey("b")); expect(storageKey(null)).toBe(MAP.storageKey);
  });
  it("unreadable or hostile saves are just an empty map", () => {
    for (const bad of [null, undefined, "", "nope", "{}", "5", "x".repeat(30000)]) expect(parseWalked(bad).size).toBe(0);
    expect([...parseWalked(JSON.stringify([3, -1, 1.5, "a", CELLS * CELLS, 7, 3]))].sort()).toEqual([3, 7]);
  });
});

describe("page placement and pin", () => {
  it("north is up and the page edges are the world edges", () => {
    expect(toPage(-HALF, -HALF, 400)).toEqual({ x: 0, z: 0 }); expect(toPage(HALF, HALF, 400)).toEqual({ x: 400, z: 400 });
    expect(toPage(0, -50, 400).z).toBeLessThan(toPage(0, 50, 400).z);
  });
  it("the pin points the way the player faces", () => {
    const up = pin(0, 0, 0, 400).angle, down = pin(0, 0, Math.PI, 400).angle;
    expect(Math.sin(up)).toBeLessThan(-0.99); // yaw 0: the camera is at +z looking back, so the player faces -z, up the page
    expect(Math.sin(down)).toBeGreaterThan(0.99);
    expect(Math.cos(pin(0, 0, -Math.PI / 2, 400).angle)).toBeGreaterThan(0.99); // yaw -90 degrees: the camera is at -x, the player faces +x, right
  });
  it("M opens the map, except while typing", () => {
    expect(opensMap("KeyM", { tagName: "DIV" })).toBe(true); expect(opensMap("KeyM", { tagName: "INPUT" })).toBe(false); expect(opensMap("KeyE", null)).toBe(false);
  });
});

describe("picture signposts", () => {
  it("are three, each with a picture, and are beside the path inside the World", () => {
    expect(SIGNPOSTS.map((s) => s.icon).sort()).toEqual(["book", "leaf", "moon"]);
    for (const s of SIGNPOSTS) {
      expect(Math.abs(s.x)).toBeLessThan(HALF); expect(Math.abs(s.z)).toBeLessThan(HALF);
      expect(distToPath(s.x, s.z)).toBeGreaterThan(WORLD.path.width / 2 + POST_R); // not on the ink
      expect(distToPath(s.x, s.z)).toBeLessThan(WORLD.path.keepOut + 1); // but beside it
    }
  });
  it("each is solid in exactly one chunk, keeps trees away, and does not close the path", () => {
    const all: [number, number][] = []; for (let a = 0; a < CHUNKS; a++) for (let b = 0; b < CHUNKS; b++) all.push([a, b]);
    for (const s of SIGNPOSTS) {
      expect(all.filter(([a, b]) => chunkContents(a, b).posts.some((p) => p.x === s.x && p.z === s.z))).toHaveLength(1);
      expect(blocked(s.x, s.z)).toBe(true);
      for (const [a, b] of all) for (const c of chunkCircles(chunkContents(a, b))) if (!(c.x === s.x && c.z === s.z)) expect(Math.hypot(c.x - s.x, c.z - s.z)).toBeGreaterThan(c.r + POST_R);
    }
  });
  it("show on the map once walked past", () => {
    const w = newWalked(); expect(seenSignposts(w)).toHaveLength(0);
    reveal(w, SIGNPOSTS[0].x, SIGNPOSTS[0].z); expect(seenSignposts(w).map((s) => s.id)).toContain(SIGNPOSTS[0].id);
  });
});

describe("shape of the change", () => {
  it("the map keeps nothing on a server and draws no words", () => {
    for (const f of ["../lib/map.ts", "../components/MapPage.tsx"]) { const s = src(f); expect(s).not.toMatch(/fetch\(|supabase|XMLHttp|https?:\/\//); expect(s).not.toMatch(/fillText|strokeText/); }
    expect(src("../components/worldShell.ts")).not.toMatch(/fillText|CanvasTexture|https?:\/\//);
  });
  it("the walked cells stay in this browser (localStorage), in one small module", () => {
    expect(src("../lib/mapStore.ts")).toContain("localStorage.setItem"); expect(src("../lib/mapStore.ts")).not.toMatch(/fetch\(|supabase/);
    expect(src("../app/page.tsx")).not.toContain("localStorage");
  });
  it("the map is kept per signed-in player, not per Print, so switching Prints keeps one map", () => {
    const page = src("../app/page.tsx");
    expect(page).toMatch(/walkKey=\{userId\}/); expect(page).not.toMatch(/walkKey=\{creatureId/);
    expect(page).toMatch(/setUserId\(s\?\.user\?\.id \?\? null\)/);
  });
});

describe("the map card in a short window", () => {
  it("is truly centred (fade, not rise) and its square canvas is capped by the window height, so Close stays on screen", () => {
    const css = src("../app/globals.css");
    expect(css.match(/^\.tray\.mappage\s*\{[^}]*animation-name:\s*fade/m)).not.toBeNull();
    const canvas = css.match(/^\.mappage canvas\s*\{[^}]*\}/m)?.[0] ?? "";
    expect(canvas).toMatch(/width:\s*min\(100%, calc\(100dvh - \d+px\)\)/);
    expect(canvas).toMatch(/aspect-ratio:\s*1/);
    expect(css).toMatch(/^\.tray\s*\{[^}]*translate\(-50%, -50%\)/m); // the tray's centring itself is unchanged
    expect(css.match(/^\.tray\.mappage\s*\{/gm)).toHaveLength(1);
  });
});

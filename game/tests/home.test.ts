// H2: the Home room: data, doors, walls, the zone wiring and the dispose-leak check.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { GARDEN, colliders, insideAny, movePlayer, pushOut } from "@/lib/world";
import { createZoneController, type ZoneDef, type ZoneId } from "@/lib/zones";
import { HOME_ROOM, ROOM_OFF, doorArrival, doorFrame, doorPath, doorPosts, doorYaw, homeOverride, inDoorZone, insideRoom, roomColliders } from "@/lib/home";
import { HALF } from "@/lib/worldMap";
import { OFF } from "@/components/marginsScene";
import { HOME } from "@/lib/world";

const src = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
const R = HOME_ROOM.room, P = GARDEN.player.radius;

describe("the Home room data", () => {
  it("is a small room, placed far from the garden, the World and the Margins", () => {
    expect(R.width).toBeGreaterThan(6); expect(R.width).toBeLessThan(25); expect(R.depth).toBeLessThan(25);
    expect(ROOM_OFF - R.width).toBeGreaterThan(OFF + 50); expect(ROOM_OFF).toBeGreaterThan(HALF + 100);
  });
  it("has anchors for later decorations, all inside the room, apart from each other and clear of the door", () => {
    const a = HOME_ROOM.anchors; expect(a.length).toBeGreaterThanOrEqual(5);
    expect(new Set(a.map((x) => x.id)).size).toBe(a.length);
    for (const p of a) { expect(insideRoom(p)).toBe(true); expect(Math.hypot(p.x - doorFrame("room").g.x, p.z - doorFrame("room").g.z)).toBeGreaterThan(3); }
    for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) expect(Math.hypot(a[i].x - a[j].x, a[i].z - a[j].z)).toBeGreaterThan(1.5);
  });
  it("has the Home door on the garden's edge, inside Home and clear of everything solid", () => {
    const g = doorFrame("garden").g;
    expect(Math.abs(g.x)).toBeLessThanOrEqual(HOME.half); expect(Math.abs(g.x)).toBeGreaterThan(HOME.half - 2);
    expect(insideAny({ x: g.x + 1.5, z: g.z }, 1, colliders())).toBe(false);
    for (const q of GARDEN.places) expect(Math.hypot(q.x - g.x, q.z - g.z)).toBeGreaterThan(4);
  });
});

describe("the door", () => {
  for (const side of ["garden", "room"] as const) {
    it(`${side}: standing in front of it you can use it; walking the path goes through without touching the posts`, () => {
      const { g, d } = doorFrame(side), start = { x: g.x - d.x * 1.5, z: g.z - d.z * 1.5 };
      expect(inDoorZone(start, side)).toBe(true);
      expect(inDoorZone({ x: g.x - d.x * 1.5 + -d.z * 3, z: g.z - d.z * 1.5 + d.x * 3 }, side)).toBe(false);
      const path = doorPath(start, side), posts = doorPosts(side);
      for (let a = 1; a < path.length; a++) for (let k = 0; k <= 40; k++) {
        const p = { x: path[a - 1].x + ((path[a].x - path[a - 1].x) * k) / 40, z: path[a - 1].z + ((path[a].z - path[a - 1].z) * k) / 40 };
        for (const q of posts) expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeGreaterThan(q.r + P);
      }
    });
  }
  it("you arrive just beyond the door, facing the way you walk, and not inside a wall or post", () => {
    const inRoom = doorArrival("home"), inGarden = doorArrival("garden");
    expect(insideRoom(inRoom[1], P)).toBe(true); expect(Math.abs(inRoom[0].z - doorFrame("room").g.z)).toBeLessThan(1); // you step out of the doorway
    expect(pushOut(inRoom[1], P, roomColliders())).toEqual(inRoom[1]);
    expect(pushOut(inGarden[1], P, colliders())).toEqual(inGarden[1]);
    expect(Math.abs(inGarden[1].x)).toBeLessThan(HOME.half);
    expect(doorYaw("home")).toBeCloseTo(0, 5); // walking north in the room: the camera looks along -z
    expect(Math.cos(doorYaw("garden"))).toBeCloseTo(0, 3); // out of the west door walking east: looks along +x
  });
  it("the garden door posts are colliders in the garden, so the Print goes round them", () => {
    expect(src("../components/World.tsx")).toMatch(/cols\.circles\.push\(\.\.\.doorPosts\("garden"\)\)/);
  });
});

describe("the walls", () => {
  it("keep the player inside the room, with only the doorway open", () => {
    const cols = roomColliders();
    let p = { x: 0, z: 0 };
    for (const [fx, rx] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) { p = { x: 3, z: 0 }; for (let i = 0; i < 600; i++) p = movePlayer(p, { forward: fx, right: rx }, 0, 7, 1 / 60, P, cols, R.width).pos; expect(insideRoom(p)).toBe(true); } // from x=3 so the south run meets the wall, not the doorway
    // out of the doorway the player can go; beside it they cannot
    const { g } = doorFrame("room");
    let q = { x: g.x, z: g.z - 1 }; for (let i = 0; i < 120; i++) q = movePlayer(q, { forward: -1, right: 0 }, 0, 4, 1 / 60, P, cols, 40).pos;
    expect(q.z).toBeGreaterThan(R.depth / 2 + 0.2);
    let s = { x: g.x + 3, z: g.z - 1 }; for (let i = 0; i < 120; i++) s = movePlayer(s, { forward: -1, right: 0 }, 0, 4, 1 / 60, P, cols, 40).pos;
    expect(s.z).toBeLessThan(R.depth / 2);
  });
});

describe("the zone", () => {
  function fake() {
    const live = new Set<string>(); let made = 0, freed = 0;
    const mk = (id: ZoneId, n: number): ZoneDef => ({ id, enter() { for (let i = 0; i < n; i++) live.add(`${id}${made++}`); }, leave() { for (const k of [...live]) if (k.startsWith(id)) { live.delete(k); freed++; } } });
    return { live, defs: [mk("garden", 3), mk("margins", 5), mk("home", 12)], get made() { return made; }, get freed() { return freed; } };
  }
  it("goes garden -> home -> garden through the one path, and between all three zones", () => {
    const f = fake(), z = createZoneController(f.defs, "garden");
    z.enterZone("home"); expect(z.current).toBe("home"); z.leaveZone(); expect(z.current).toBe("garden");
    z.enterZone("margins"); z.enterZone("home"); z.leaveZone(); expect(z.current).toBe("garden");
  });
  it("leaves nothing behind after ten (or fifty) round trips", () => {
    const f = fake(), z = createZoneController(f.defs);
    for (let i = 0; i < 50; i++) { z.enterZone("home"); z.leaveZone(); }
    z.dispose(); expect(f.live.size).toBe(0);
  });
  it("the real wiring builds the room on enter and frees it on leave, and frees the garden door with the garden", () => {
    const w = src("../components/World.tsx");
    expect(w).toMatch(/\{ id: "home", enter: enterHomeZone, leave: leaveHomeZone \}/);
    expect(w).toMatch(/const leaveHomeZone = \(\) => \{ room\?\.dispose\(\); room = null; \};/);
    expect(w.match(/buildHomeScene\(/g)).toHaveLength(1); expect(w.match(/buildGardenDoor\(/g)).toHaveLength(1);
    const scene = src("../components/homeScene.ts");
    expect(scene).toMatch(/for \(const d of own\) d\.dispose\(\)/); expect(scene).toMatch(/group\.removeFromParent\(\)/);
  });
  it("the Print stays out of the room: nothing in the room zone builds or moves it", () => {
    const scene = src("../components/homeScene.ts");
    expect(scene).not.toMatch(/buildCreature|wander|print/i);
    expect(src("../components/World.tsx")).toMatch(/zones\.is\("garden"\) && t >= cosHold/); // keepsakes swap only while the Print is on screen (in the garden)
  });
});

describe("dev start and prompt", () => {
  it("?area=home works only outside production", () => {
    expect(homeOverride("?area=home", false)).toBe(true); expect(homeOverride("?area=home", true)).toBe(false);
    expect(homeOverride("?area=margins", false)).toBe(false); expect(homeOverride("", false)).toBe(false);
  });
  it("the door prompts read like the gate prompts, with no numbers", () => {
    const w = src("../components/World.tsx");
    expect(w).toMatch(/prompt: "Go through the door"/); expect(w).toMatch(/prompt: "Back to the garden"/);
    expect(src("../lib/ui.ts")).toMatch(/case "door": return place\.prompt/);
  });
  it("no network, assets or text in the room", () => {
    for (const f of ["../components/homeScene.ts", "../lib/home.ts"]) expect(src(f)).not.toMatch(/fetch\(|supabase|\.png|\.jpg|\.glb|TextGeometry|fillText/);
  });
});

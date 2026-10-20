// W1: the zone controller's order and bookkeeping, a dispose-leak check, and pins that the Margins wiring is unchanged.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createZoneController, HOME_ZONE, type ZoneDef, type ZoneId } from "@/lib/zones";

const src = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");

// A fake world that counts what each zone creates and frees, the way a zone owns scene objects.
function fake() {
  const live = new Set<string>(); let made = 0, freed = 0; const calls: string[] = [];
  const mk = (id: ZoneId, n: number): ZoneDef => ({
    id,
    enter() { calls.push(`enter:${id}`); for (let i = 0; i < n; i++) { live.add(`${id}${made++}`); } },
    leave() { calls.push(`leave:${id}`); for (const k of [...live]) if (k.startsWith(id)) { live.delete(k); freed++; } },
  });
  return { live, calls, defs: [mk("garden", 0), mk("margins", 5)], get made() { return made; }, get freed() { return freed; } };
}

describe("zone controller", () => {
  it("starts in the garden and does nothing when asked for the zone it is in", () => {
    const f = fake(), z = createZoneController(f.defs);
    expect(z.current).toBe("garden"); expect(z.is("garden")).toBe(true);
    expect(z.enterZone("garden")).toBe(false); expect(z.leaveZone()).toBe(false);
    expect(f.calls).toEqual([]);
  });
  it("leaves the old zone before it enters the new one, and the new zone is current inside enter()", () => {
    const f = fake(); let seen: ZoneId | null = null;
    const defs = f.defs.map((d) => (d.id === "margins" ? { ...d, enter: () => { seen = z.current; d.enter(); } } : d));
    const z = createZoneController(defs);
    expect(z.enterZone("margins")).toBe(true);
    expect(seen).toBe("margins");
    expect(f.calls).toEqual(["leave:garden", "enter:margins"]);
    expect(z.leaveZone()).toBe(true);
    expect(z.current).toBe(HOME_ZONE);
    expect(f.calls).toEqual(["leave:garden", "enter:margins", "leave:margins", "enter:garden"]);
    expect(z.log.map((e) => `${e.step}:${e.zone}`)).toEqual(f.calls);
  });
  it("entering the zone you are in again does not rebuild it", () => {
    const f = fake(), z = createZoneController(f.defs);
    z.enterZone("margins"); expect(z.enterZone("margins")).toBe(false);
    expect(f.made).toBe(5);
  });
  it("leaves nothing behind after entering and leaving many times", () => {
    const f = fake(), z = createZoneController(f.defs);
    for (let i = 0; i < 50; i++) { z.enterZone("margins"); expect(f.live.size).toBe(5); z.leaveZone(); expect(f.live.size).toBe(0); }
    expect(f.made).toBe(250); expect(f.freed).toBe(250);
  });
  it("dispose frees the current zone once, and a second dispose does nothing", () => {
    const f = fake(), z = createZoneController(f.defs);
    z.enterZone("margins"); z.dispose(); z.dispose();
    expect(f.live.size).toBe(0); expect(f.calls.filter((c) => c === "leave:margins")).toHaveLength(1);
    z.enterZone("garden"); expect(f.calls.at(-1)).toBe("enter:garden"); // usable again after dispose
  });
  it("rejects bad lists and unknown zones", () => {
    const f = fake();
    expect(() => createZoneController([...f.defs, f.defs[0]])).toThrow();
    expect(() => createZoneController([f.defs[1]])).toThrow();
    expect(() => createZoneController(f.defs).enterZone("cave" as ZoneId)).toThrow();
  });
});

describe("the Margins wiring is unchanged (pins)", () => {
  const world = src("../components/World.tsx");
  it("the Margins scene is built once per enter and freed on every leave and on teardown", () => {
    expect(world.match(/buildMarginsScene\(/g)).toHaveLength(1);
    expect(world.match(/mg\.dispose\(\)/g)).toHaveLength(2);
    expect(world).toMatch(/zones\.dispose\(\)/);
  });
  it("gate travel swaps zones behind the full wipe, in either direction, through one path", () => {
    expect(world).toMatch(/if \(travel\.into === "garden"\) zones\.leaveZone\(\); else zones\.enterZone\(travel\.into\);/);
    expect(world).not.toMatch(/\benterMargins\b|\bleaveMargins\b/);
  });
  it("the fog distances and the claims-read gate are the same as before", () => {
    expect(world).toMatch(/\.near = MARGINS\.fog\[0\]; \(scene\.fog as THREE\.Fog\)\.far = MARGINS\.fog\[1\]/);
    expect(world).toMatch(/\.near = WORLD\.fog\[0\]; \(scene\.fog as THREE\.Fog\)\.far = WORLD\.fog\[1\]/); // W2: the garden zone now has the World's fog
    expect(world).toMatch(/serverReady = local; readFailed = false; downNoted = false;/);
    expect(world).toMatch(/if \(myVisit !== visit \|\| !zones\.is\("margins"\)\) return;/);
  });
  it("a visit is invalidated on leave so a late claims read or answer is not applied to the next visit", () => {
    expect(world).toMatch(/uPending = false; visit\+\+;/);
  });
});

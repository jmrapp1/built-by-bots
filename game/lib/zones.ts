// W1: one zone list and one enter/leave path. A zone builds what it needs in enter() and frees all of it in leave().
// Pure logic, no three.js: the controller only decides order and bookkeeping, so it is testable without a browser.

export type ZoneId = "garden" | "margins";
export type ZoneDef = { id: ZoneId; enter(): void; leave(): void };
export type ZoneEvent = { zone: ZoneId; step: "enter" | "leave" };

export type ZoneController = {
  readonly current: ZoneId;
  is(id: ZoneId): boolean;
  /** Leave the current zone, then enter `id`. Entering the zone you are already in does nothing. */
  enterZone(id: ZoneId): boolean;
  /** Leave the current zone and go back to the home zone (the garden). Does nothing when already there. */
  leaveZone(): boolean;
  /** Free whatever the current zone holds (component teardown). Safe to call more than once. */
  dispose(): void;
  readonly log: ZoneEvent[];
};

export const HOME_ZONE: ZoneId = "garden";

export function createZoneController(defs: ZoneDef[], start: ZoneId = HOME_ZONE): ZoneController {
  const byId = new Map(defs.map((d) => [d.id, d] as const));
  if (byId.size !== defs.length) throw new Error("duplicate zone id");
  if (!byId.has(start) || !byId.has(HOME_ZONE)) throw new Error("unknown start zone");
  let current: ZoneId = start;
  let live = true; // the start zone is considered entered by whoever built the scene
  const log: ZoneEvent[] = [];
  const leave = () => { if (!live) return; live = false; log.push({ zone: current, step: "leave" }); byId.get(current)!.leave(); };
  const c: ZoneController = {
    get current() { return current; },
    log,
    is: (id) => current === id,
    enterZone(id) {
      const d = byId.get(id);
      if (!d) throw new Error(`unknown zone ${id}`);
      if (id === current && live) return false;
      leave();
      current = id; live = true; // the zone counts as current before enter() runs, so enter() can read it
      log.push({ zone: id, step: "enter" });
      d.enter();
      return true;
    },
    leaveZone() { return c.current === HOME_ZONE ? false : c.enterZone(HOME_ZONE); },
    dispose() { leave(); },
  };
  return c;
}

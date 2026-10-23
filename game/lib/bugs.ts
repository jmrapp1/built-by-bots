// S32: bug watching. Pure rules and numbers (no three.js, clock, randomness or server): the day gate, the still detector, the
// activation and cap choice, the per-spot calm state, the insect motion and the Print's notice scheduler. components/bugScene.ts draws
// it; World.tsx wires it in. Numbers live in data/bugs.json. Look and feel only: nothing here is saved, sent or collides.
import data from "@/data/bugs.json";
import { POND } from "@/lib/pond";

export const BUGS = data.bugWatching;
export type BugKind = "flutterer" | "beetle" | "dragonfly";
export type BugSpot = { id: string; zone: string; x: number; z: number; radius: number; kind: string; count: number };
export type BugCfg = Omit<typeof data.bugWatching, "spots"> & { spots: BugSpot[]; forceDay: boolean; forceReduced: boolean };

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const ease = (n: number) => n * n * (3 - 2 * n);

// Dev-only: ?bugpreview=1 forces day, every spot at once, a short still-time and a certain glance; ?bugpreview=reduced is the same
// with reduced motion forced on. Ignored (null) in production builds, like ?follow= and ?sky=.
export type BugPreview = "1" | "reduced";
export function bugPreview(search: string, isProduction: boolean): BugPreview | null {
  if (isProduction) return null;
  const v = new URLSearchParams(search).get("bugpreview");
  return v === "1" || v === "reduced" ? v : null;
}

export function bugConfig(preview: BugPreview | null = null): BugCfg {
  const base = { ...BUGS, spots: BUGS.spots as BugSpot[], forceDay: false, forceReduced: false };
  return preview ? { ...base, ...BUGS.preview, forceDay: true, forceReduced: preview === "reduced" } : base;
}

// 1 by day, easing to 0 over fadeSeconds at each end of the existing day window (the Print's pond-visit day). 0 at night.
export function dayLevel(hour: number, fadeSeconds: number, forced = false): number {
  if (forced) return 1;
  const h = ((hour % 24) + 24) % 24, fadeH = Math.max(1e-6, fadeSeconds / 3600);
  return ease(clamp01(Math.min((h - POND.dayFrom) / fadeH, (POND.dayTo - h) / fadeH)));
}

// Seconds of standing still: any movement input or camera drag sets it back to zero.
export const stepStill = (still: number, dt: number, active: boolean): number => (active ? 0 : still + dt);
export const isWatching = (still: number, dist: number, spot: { radius: number }, cfg: { stillSeconds: number }): boolean => still >= cfg.stillSeconds && dist <= spot.radius;

export type ActiveSpot = { idx: number; count: number };
// Spots in the player's area, nearest first, each limited to maxPerSpot, and all together limited to maxActiveInsects. `inGarden`
// is true while the player is in the garden zone: garden spots count then, World spots count only out in the World (inWorld).
export function selectSpots(player: { x: number; z: number }, inGarden: boolean, cfg: BugCfg): ActiveSpot[] {
  if (!inGarden) return [];
  const near = cfg.spots
    .map((s, idx) => ({ idx, d: Math.hypot(s.x - player.x, s.z - player.z), s }))
    .filter((q) => q.d <= cfg.activationRadius)
    .sort((a, b) => a.d - b.d || a.idx - b.idx);
  const out: ActiveSpot[] = [];
  let room = cfg.maxActiveInsects;
  for (const q of near) {
    const count = Math.min(q.s.count, cfg.maxPerSpot, room);
    if (count <= 0) break;
    out.push({ idx: q.idx, count }); room -= count;
  }
  return out;
}

export type SpotSim = { away: number; quiet: number; watch: number };
// One step of a spot's calm: walking through it drifts the insects away slowly; once the player has stopped (or left) for
// returnDelaySeconds they drift back. `watch` eases to 1 while the player has stood still inside the spot.
export function stepSpot(s: SpotSim, dt: number, inside: boolean, moving: boolean, watching: boolean, cfg: BugCfg): void {
  if (inside && moving) { s.away = Math.min(cfg.awayMax, s.away + cfg.driftAwaySpeed * dt); s.quiet = 0; }
  else { s.quiet += dt; if (s.quiet >= cfg.returnDelaySeconds) s.away = Math.max(0, s.away - cfg.driftAwaySpeed * dt); }
  const target = watching && s.away < 0.05 ? 1 : 0;
  const step = dt / cfg.watchEaseSeconds;
  s.watch = target > s.watch ? Math.min(target, s.watch + step) : Math.max(target, s.watch - step);
}

export type BugSim = {
  cfg: BugCfg; spots: SpotSim[]; active: ActiveSpot[]; level: number; still: number; selectIn: number; inGarden: boolean;
  step(dt: number, player: { x: number; z: number }, inGarden: boolean, moving: boolean, hour: number): void;
  spotAt(x: number, z: number): number;
};
// null when the kill switch is off: callers then build nothing and run nothing.
export function createBugSim(cfg: BugCfg): BugSim | null {
  if (!cfg.enabled || !cfg.spots.length) return null;
  const sim: BugSim = {
    cfg, spots: cfg.spots.map(() => ({ away: 0, quiet: 0, watch: 0 })), active: [], level: 0, still: 0, selectIn: 0, inGarden: true,
    step(dt, player, inGarden, moving, hour) {
      sim.level = dayLevel(hour, cfg.fadeSeconds, cfg.forceDay);
      sim.still = stepStill(sim.still, dt, moving);
      sim.selectIn -= dt;
      if (sim.selectIn <= 0 || inGarden !== sim.inGarden) { sim.selectIn = cfg.selectEverySeconds; sim.inGarden = inGarden; sim.active = selectSpots(player, inGarden, cfg); }
      for (const a of sim.active) {
        const sp = cfg.spots[a.idx], d = Math.hypot(sp.x - player.x, sp.z - player.z), inside = d <= sp.radius;
        stepSpot(sim.spots[a.idx], dt, inside, moving, isWatching(sim.still, d, sp, cfg), cfg);
      }
    },
    // Which active, visible spot a point (the Print) stands in; -1 for none.
    spotAt(x, z) {
      if (sim.level <= 0.5) return -1;
      for (const a of sim.active) { const sp = cfg.spots[a.idx]; if (Math.hypot(sp.x - x, sp.z - z) <= sp.radius) return a.idx; }
      return -1;
    },
  };
  return sim;
}

const frac = (n: number) => n - Math.floor(n);
export const bugHash = (n: number): number => frac(Math.sin(n * 127.1 + 311.7) * 43758.5453);

export type InsectPose = { x: number; y: number; z: number; heading: number; open: number };
export const newPose = (): InsectPose => ({ x: 0, y: 0, z: 0, heading: 0, open: 0.5 });

// An insect's place and wing opening at time t (seconds). A pure function of its inputs, so it is the same for the same clock.
// Normal motion: a smooth wander round the spot (two slow sines per axis), settling toward the spot centre while watched.
// Reduced motion: slow hops between a few fixed anchor points, wings still, slightly open.
export function insectPose(out: InsectPose, kind: BugKind, spot: { x: number; z: number }, spotIdx: number, i: number, t: number, watch: number, reduced: boolean, cfg: BugCfg): InsectPose {
  const k = cfg.kinds[kind], seed = spotIdx * 7 + i * 3 + 1, p1 = bugHash(seed) * 6.283, p2 = bugHash(seed + 1) * 6.283, p3 = bugHash(seed + 2) * 6.283, p4 = bugHash(seed + 3) * 6.283;
  const wr = k.wanderRadius;
  if (reduced) {
    const R = cfg.reduced, A = Math.max(2, R.anchors), off = bugHash(seed + 4) * R.hopSeconds * A;
    const tt = t + off, hop = Math.floor(tt / R.hopSeconds), u = ease(clamp01((tt - hop * R.hopSeconds) / R.hopMoveSeconds));
    const ax = (n: number) => wr * 0.7 * Math.cos(((n % A) / A) * 6.283 + p1), az = (n: number) => wr * 0.7 * Math.sin(((n % A) / A) * 6.283 + p1);
    const dx = ax(hop + 1) - ax(hop), dz = az(hop + 1) - az(hop);
    out.x = spot.x + ax(hop) + dx * u; out.z = spot.z + az(hop) + dz * u;
    out.y = k.height * (1 - 0.7 * watch) + 0.1 * Math.sin(u * Math.PI) * (kind === "beetle" ? 0 : 1);
    out.heading = u > 0 && u < 1 ? Math.atan2(dx, dz) : bugHash(seed + 5) * 6.283;
    out.open = R.wingOpen;
    return out;
  }
  const amp = wr * 0.72 * (1 - 0.85 * watch), w1 = (k.speed / wr) * 0.5, w2 = (k.speed / wr) * 0.8;
  out.x = spot.x + amp * (0.55 * Math.sin(w1 * t + p1) + 0.45 * Math.sin(w2 * t + p2));
  out.z = spot.z + amp * (0.55 * Math.cos(w1 * t * 0.9 + p3) + 0.45 * Math.cos(w2 * t * 1.1 + p4));
  const vx = amp * (0.55 * w1 * Math.cos(w1 * t + p1) + 0.45 * w2 * Math.cos(w2 * t + p2));
  const vz = -amp * (0.55 * w1 * 0.9 * Math.sin(w1 * t * 0.9 + p3) + 0.45 * w2 * 1.1 * Math.sin(w2 * t * 1.1 + p4));
  out.heading = Math.atan2(vx, vz);
  out.y = k.height * (1 - (kind === "beetle" ? 0 : kind === "flutterer" ? 0.75 : 0.3) * watch) + (kind === "beetle" ? 0 : 0.1 * Math.sin(t * 1.7 + p1) * (1 - watch));
  const fast = 0.5 + 0.5 * Math.sin(6.283 * k.wingBeatHz * t + p2), slow = 0.5 + 0.5 * Math.sin(6.283 * 0.4 * t + p2);
  out.open = 0.2 + 0.8 * (fast + (slow - fast) * watch);
  return out;
}

// Pushes an insect straight away from the player by `away` metres (the calm drift when someone walks through).
export function applyAway(p: InsectPose, player: { x: number; z: number }, away: number): void {
  if (away <= 0) return;
  const dx = p.x - player.x, dz = p.z - player.z, d = Math.hypot(dx, dz) || 1;
  p.x += (dx / d) * away; p.z += (dz / d) * away;
}

// ---- The Print's glance. Runs on a timer (noticeCheckSeconds), never per frame; the roll comes from a seeded generator. ----
export type NoticeState = { nextAt: number; until: number; coolUntil: number };
export const NOTICEIDLE: NoticeState = { nextAt: 0, until: 0, coolUntil: 0 };
// `ok` is true while the Print is idle (not fed, stroked, following, at the pond, hiding, sleeping...) and stands in a visible spot.
// Returns the next state and whether the glance is on. A glance ends the moment ok turns false; it never starts inside the cooldown.
export function noticeTick(s: NoticeState, now: number, ok: boolean, roll: () => number, cfg: BugCfg): { state: NoticeState; active: boolean } {
  if (s.until > now) return ok ? { state: s, active: true } : { state: { ...s, until: 0 }, active: false };
  if (now < s.nextAt) return { state: s, active: false };
  const next = now + cfg.noticeCheckSeconds;
  if (ok && now >= s.coolUntil && roll() < cfg.noticeChance) {
    const until = now + cfg.noticeHoldSeconds;
    return { state: { nextAt: next, until, coolUntil: until + cfg.noticeCooldownSeconds }, active: true };
  }
  return { state: { ...s, nextAt: next }, active: false };
}

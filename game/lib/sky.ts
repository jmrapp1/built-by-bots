// S31a: the sky, as pure numbers. A gradient dome, a paper sun and a pale moon, all functions of the local hour and day.
// No three.js here, so it is unit-tested. Look only: nothing here is saved, sent or collides with anything.
import data from "@/data/sky.json";
import { KEYS, lerpColor, lightingAt, type Key } from "@/lib/daynight";
import { dayNumber } from "@/lib/npcs";

export const SKY = data;
export type SkyMode = "off";

// Dev-only switch: ?sky=off draws no dome, sun or moon. Ignored (null) in production.
export const skyOverride = (search: string, isProduction: boolean): SkyMode | null =>
  isProduction ? null : new URLSearchParams(search).get("sky") === "off" ? "off" : null;

export const skyEnabled = (search: string, isProduction: boolean): boolean => SKY.enabled && skyOverride(search, isProduction) !== "off";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (t: number) => { const c = clamp01(t); return c * c * (3 - 2 * c); };
const ZENITH_KEYS: Key[] = (data.zenith as { hour: number; color: string }[]).map((z, i) => ({ ...KEYS[i], hour: z.hour, sky: z.color }));

/** The colour straight overhead at this hour (the horizon colour is today's sky colour, passed in by the caller). */
export const zenithAt = (hour: number): string => lightingAt(hour, ZENITH_KEYS).sky;

/** Dome colour at height `up` (0 at the horizon, 1 straight up; negative is below the horizon: the horizon colour). */
export function domeColor(horizon: string, zenith: string, up: number): string {
  return lerpColor(horizon, zenith, Math.pow(clamp01(up), SKY.dome.curve));
}

export type Dir = { x: number; y: number; z: number };

/** Unit direction of the sun for this hour. y > 0 is above the horizon. A full circle a day: up by day, below by night. */
export function sunDir(hour: number): Dir {
  const s = SKY.sun, h = ((hour % 24) + 24) % 24, day = s.set - s.rise;
  const f = h >= s.rise && h <= s.set ? (h - s.rise) / day : 1 + (((h - s.set + 24) % 24) / (24 - day));
  const a = Math.PI * f; // 0 east rising, pi west setting, 2pi back to east under the world
  const x = Math.cos(a), y = Math.sin(a) * s.maxElevation, z = s.lean;
  const n = Math.hypot(x, y, z);
  return { x: x / n, y: y / n, z: z / n };
}

/** The moon sits opposite the sun. */
export function moonDir(hour: number): Dir {
  const d = sunDir(hour);
  return { x: -d.x, y: -d.y, z: d.z };
}

/** 0 below the horizon, 1 clear above it, easing between (the disc melts into the sky at the edge). */
export const bodyLevel = (up: number, from: number, to: number): number => smooth((up - from) / (to - from));

export const sunLevel = (hour: number): number => bodyLevel(sunDir(hour).y, SKY.sun.fadeFrom, SKY.sun.fadeTo);
export const moonLevel = (hour: number): number => bodyLevel(moonDir(hour).y, SKY.moon.fadeFrom, SKY.moon.fadeTo);

/** Which of the 8 moon phases a local day (YYYY-MM-DD, or a day number) shows. A fixed table, no astronomy. */
export function moonPhase(day: string | number): number {
  const n = typeof day === "number" ? day : dayNumber(day) ?? 0;
  return ((Math.floor(n / SKY.moon.stepDays) % 8) + 8) % 8;
}

/** Where the shadow disc sits for a phase, in moon radii from the moon's centre (sign = which side). 2 or more: no shadow at all. */
export const moonOffset = (phase: number): number => SKY.phases[((phase % 8) + 8) % 8].offset;

/**
 * The shaded part of the moon: where two unit circles overlap (the moon, and the same circle shifted by `offset`), as a polygon
 * in moon radii. Empty when they do not overlap, the whole disc when the offset is 0. This is what makes the soft crescent.
 */
export function moonShade(offset: number, arc = 14): [number, number][] {
  const d = Math.abs(offset);
  if (d >= 2) return [];
  const pts: [number, number][] = [];
  if (d < 1e-6) {
    for (let i = 0; i < arc * 2; i++) pts.push([Math.cos((i / (arc * 2)) * Math.PI * 2), Math.sin((i / (arc * 2)) * Math.PI * 2)]);
    return pts;
  }
  const al = Math.acos(d / 2);
  for (let i = 0; i <= arc; i++) { const a = -al + (2 * al * i) / arc; pts.push([Math.cos(a), Math.sin(a)]); } // the moon's own rim, inside the shifted circle
  for (let i = 0; i <= arc; i++) { const a = Math.PI - al + (2 * al * i) / arc; pts.push([d + Math.cos(a), Math.sin(a)]); } // the shifted rim, inside the moon
  return offset < 0 ? pts.map(([x, y]) => [-x, y] as [number, number]) : pts;
}

/** Margins keep the same horizon but a gentler zenith. */
export const marginsZenith = (horizon: string, zenith: string): string => lerpColor(horizon, zenith, SKY.margins.zenithKeep);

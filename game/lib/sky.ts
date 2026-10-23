// S31a: the sky, as pure numbers. A gradient dome, a paper sun and a pale moon, all functions of the local hour and day.
// No three.js here, so it is unit-tested. Look only: nothing here is saved, sent or collides with anything.
import data from "@/data/sky.json";
import { KEYS, lerpColor, lightingAt, type Key } from "@/lib/daynight";
import { dayNumber } from "@/lib/npcs";
import { nightness } from "@/lib/weather";

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

// ---- S31b: stars. The same field every night: positions come from an integer hash of the index, never from chance. ----
export const STARS = SKY.stars;
export type StarsMode = "off";

// Dev-only switch: ?stars=off draws no stars (the dome, sun and moon stay). Ignored (null) in production.
export const starsOverride = (search: string, isProduction: boolean): StarsMode | null =>
  isProduction ? null : new URLSearchParams(search).get("stars") === "off" ? "off" : null;
export const starsEnabled = (search: string, isProduction: boolean): boolean => STARS.count > 0 && starsOverride(search, isProduction) !== "off";

export const starHash = (n: number): number => {
  let h = (Math.imul(n | 0, 0x9e3779b1) ^ Math.imul(STARS.seed, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
};
const unit = (n: number): number => starHash(n) / 4294967296;

export type Star = { dir: Dir; kind: "small" | "big" | "glyph"; size: number; phase: number; spin: number };

/** Star i: a fixed spot on the upper dome (area-uniform), a size class, a twinkle phase and a spin for the glyph marks. */
export function starAt(i: number): Star {
  const y = STARS.minElevation + (1 - STARS.minElevation) * unit(i * 5 + 1), az = unit(i * 5 + 2) * Math.PI * 2, r = Math.sqrt(1 - y * y);
  const roll = unit(i * 5 + 3);
  const kind = roll < STARS.glyphShare ? "glyph" : roll < STARS.glyphShare + STARS.bigShare ? "big" : "small";
  const size = kind === "glyph" ? STARS.glyph : kind === "big" ? STARS.big : STARS.small;
  return { dir: { x: r * Math.cos(az), y, z: r * Math.sin(az) }, kind, size, phase: unit(i * 5 + 4), spin: unit(i * 5 + 5) * Math.PI };
}

/** How strongly the stars show: nightness, less under the weather grey (0..1). 0 by day, 1 at deep night with dry weather at most maxAlpha. */
export const starLevel = (hour: number, weatherTint = 0): number =>
  nightness(hour) * STARS.maxAlpha * (1 - STARS.weatherDim * Math.min(1, Math.max(0, weatherTint)));

/** A very slow twinkle, 1 = full. Fixed at 1 with reduced motion. */
export const twinkle = (s: Star, t: number, reduced: boolean): number =>
  reduced ? 1 : 1 - STARS.twinkleDepth * (0.5 + 0.5 * Math.sin((t / STARS.twinkleSeconds + s.phase) * Math.PI * 2));

/** 0 right at the sun, easing to 1 away from it. Only matters while the sun is up (scaled by its level), so dawn glare hides the stars near it. */
export function glare(star: Dir, sun: Dir, sunLvl: number): number {
  if (sunLvl <= 0) return 1;
  const ang = Math.acos(Math.min(1, Math.max(-1, star.x * sun.x + star.y * sun.y + star.z * sun.z)));
  const near = 1 - smooth((ang - STARS.glareRadius * (1 - STARS.glareSoft)) / (STARS.glareRadius * STARS.glareSoft + 1e-9));
  return 1 - near * sunLvl;
}

// ---- S31c: layered distant hills. Rings of smooth ridges far beyond the walkable world; nothing collides with them. ----
export const HILLS = SKY.hills;
export type HillsMode = "off";

// Dev-only switch: ?hills=off draws no hill layers and the old jagged ridges stay. Ignored (null) in production.
export const hillsOverride = (search: string, isProduction: boolean): HillsMode | null =>
  isProduction ? null : new URLSearchParams(search).get("hills") === "off" ? "off" : null;
export const hillsEnabled = (search: string, isProduction: boolean): boolean => HILLS.layers > 0 && hillsOverride(search, isProduction) !== "off";

export type HillLayer = (typeof HILLS.list)[number];
/** The layers actually drawn: the first `layers` of the list. */
export const hillLayers = (): HillLayer[] => HILLS.list.slice(0, Math.max(0, HILLS.layers));

/** Height of a layer's top at angle `a` (radians round the player): base plus a few sines with whole-number frequencies, so the ring closes. */
export const hillTop = (l: HillLayer, a: number): number => l.sines.reduce((h, [f, amp, ph]) => h + amp * Math.sin(f * a + ph), l.base);

const hex = (c: string) => [(parseInt(c.slice(1), 16) >> 16) & 255, (parseInt(c.slice(1), 16) >> 8) & 255, parseInt(c.slice(1), 16) & 255];
const luma = (c: string) => { const [r, g, b] = hex(c); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
const dim = (c: string, k: number) => "#" + ((1 << 24) | (Math.round(hex(c)[0] * k) << 16) | (Math.round(hex(c)[1] * k) << 8) | Math.round(hex(c)[2] * k)).toString(16).slice(1);

/** A layer's colour: the tint (darkened as the sky darkens, so night hills are not bright) mixed with the hour's sky colour. */
export function hillColor(skyColor: string, l: HillLayer): string {
  const k = Math.min(1, Math.max(HILLS.nightFloor, luma(skyColor) / HILLS.dayLuma));
  return lerpColor(skyColor, dim(l.tint, k), l.mix);
}

// ---- S31d: drifting paper clouds. Flat torn-paper shapes high on the sky; same shapes and places every day, drift is a pure function of time. ----
export const CLOUDS = SKY.clouds;
export type CloudsMode = "off";

// Dev-only switch: ?clouds=off draws no clouds. Ignored (null) in production.
export const cloudsOverride = (search: string, isProduction: boolean): CloudsMode | null =>
  isProduction ? null : new URLSearchParams(search).get("clouds") === "off" ? "off" : null;
export const cloudsEnabled = (search: string, isProduction: boolean): boolean => CLOUDS.count > 0 && cloudsOverride(search, isProduction) !== "off";

export const cloudHash = (n: number): number => {
  let h = (Math.imul(n | 0, 0x9e3779b1) ^ Math.imul(CLOUDS.seed, 0xc2b2ae35)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
};
const cu = (n: number): number => cloudHash(n) / 4294967296;
const between = (r: number[], u: number) => r[0] + (r[1] - r[0]) * u;
const KEYS_PER = 4 + 2 * 32; // hash slots reserved per cloud, so the points never overlap the next cloud's

export type Cloud = { az0: number; y: number; width: number; height: number; speed: number; tilt: number; poly: [number, number][] };

/** Cloud i: where it starts, how high, how big, how fast it drifts and its torn outline (x across, y up, in metres at the cloud distance, centred on 0,0). */
export function cloudAt(i: number): Cloud {
  const b = i * KEYS_PER, width = between(CLOUDS.width, cu(b + 2)), height = width * between(CLOUDS.aspect, cu(b + 3));
  const poly: [number, number][] = [];
  for (let k = 0; k < CLOUDS.points; k++) {
    const a = (k / CLOUDS.points) * Math.PI * 2, r = 1 - CLOUDS.jitter * cu(b + 4 + k);
    poly.push([Math.cos(a) * r * width / 2, Math.sin(a) * r * height / 2]);
  }
  return { az0: cu(b + 0) * Math.PI * 2, y: between([CLOUDS.minElevation, CLOUDS.maxElevation], cu(b + 1)), width, height, speed: between(CLOUDS.speed, cu(b + 66)), tilt: (cu(b + 67) - 0.5) * 0.3, poly };
}

/** Where cloud i is at time t seconds: azimuth wraps round 0..2pi. With reduced motion it never moves. */
export const cloudAzimuth = (c: Cloud, t: number, reduced: boolean): number => {
  const a = c.az0 + (reduced ? 0 : c.speed * t), tau = Math.PI * 2;
  return ((a % tau) + tau) % tau;
};
/** Unit direction of the cloud's centre for an azimuth. */
export const cloudDir = (c: Cloud, az: number): Dir => { const r = Math.sqrt(1 - c.y * c.y); return { x: r * Math.cos(az), y: c.y, z: r * Math.sin(az) }; };

/** How present cloud i is (0..1): `calm` clouds on a dry day, up to all of them as the weather level (0..1) rises. */
export const cloudPresence = (i: number, weather: number): number => {
  const w = clamp01(weather), shown = CLOUDS.calm + (CLOUDS.count - CLOUDS.calm) * w;
  return clamp01(shown - i);
};

/** Opacity of the clouds: thin by day, heavier with weather, nearly gone at night. Never above maxAlpha. */
export const cloudAlpha = (hour: number, weather = 0): number => {
  const n = nightness(hour);
  return Math.min(CLOUDS.maxAlpha, CLOUDS.alpha * (1 + (CLOUDS.heavy - 1) * clamp01(weather)) * (1 - (1 - CLOUDS.nightAlpha) * n));
};

/** Cloud colour: cream by day, grey-violet toward dusk and night, a little greyer with weather. */
export function cloudColor(hour: number, weather = 0): string {
  const dusk = lerpColor(CLOUDS.day, CLOUDS.dusk, smooth(nightness(hour) * 2));
  return lerpColor(dusk, CLOUDS.grey, CLOUDS.greyMix * clamp01(weather));
}

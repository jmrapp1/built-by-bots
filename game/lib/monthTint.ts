// Month tint: a slight colour shift of the World's daylight by UTC month. Looks only: nothing is given, saved or sent.
// The month comes from the UTC date alone (no Math.random, no local clock), so a reload gives the same tint. The twelve
// colours and strengths are in data/monthTint.json. It eases the hemisphere and sun colours a little toward the month's colour
// and fades out before dusk and after dawn, so the night and dusk lighting are exactly as they were. Sky and fog are never touched.
import raw from "@/data/monthTint.json";
import { lerpColor, type Lighting } from "@/lib/daynight";

export const MONTH_TINT = raw;
type Data = typeof raw;

/** Month 0 to 11 from the UTC date. A bad date gives 0. */
export const utcMonth = (d: Date): number => { const m = d.getUTCMonth(); return Number.isInteger(m) && m >= 0 && m <= 11 ? m : 0; };

/** Dev builds only: ?tint=off draws no tint. Ignored (null) in production. */
export const tintOverride = (search: string, production: boolean): "off" | null => {
  if (production) return null;
  try { return new URLSearchParams(search).get("tint") === "off" ? "off" : null; } catch { return null; }
};
export const tintEnabled = (search: string, production: boolean): boolean => tintOverride(search, production) !== "off";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (t: number) => { const u = clamp01(t); return u * u * (3 - 2 * u); };

/** 0 at night, dawn and dusk, 1 across the middle of the day. */
export function dayWeight(hour: number, d: Data = raw): number {
  const h = ((hour % 24) + 24) % 24;
  const [n0, n1] = d.none, [f0, f1] = d.full;
  return Math.min(smooth((h - n0) / (f0 - n0)), smooth((n1 - h) / (n1 - f1)));
}

/** How far toward the month's colour the light goes at this hour. Always within 0 and max. */
export function tintAmount(month: number, hour: number, d: Data = raw): number {
  const m = d.months[((Math.trunc(month) % 12) + 12) % 12];
  if (!m) return 0;
  return Math.min(d.max, Math.max(0, m.strength)) * dayWeight(hour, d);
}

/** The lighting with the month's tint on the hemisphere and sun colours only. Intensities, sky, fog and sun position are returned as given. */
export function tintLight<T extends Lighting>(L: T, month: number, hour: number, d: Data = raw): T {
  const a = tintAmount(month, hour, d);
  if (a <= 0) return L;
  const c = d.months[((Math.trunc(month) % 12) + 12) % 12].color;
  return { ...L, hemisphereSky: lerpColor(L.hemisphereSky, c, a), hemisphereGround: lerpColor(L.hemisphereGround, c, a), sun: lerpColor(L.sun, c, a) };
}

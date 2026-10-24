// S37: phone support, step 1. Pure helpers: is touch mode on, is the screen portrait, the dev preview switches, and the fullscreen call.
// No three.js, storage or network here. Numbers live in data/mobile.json. The fullscreen and orientation calls fail silently.
import raw from "@/data/mobile.json";

export const MOBILE = raw.mobile;
export const isEnabled = (d: unknown): boolean => { try { return (d as { mobile?: { enabled?: unknown } })?.mobile?.enabled === true; } catch { return false; } }; // anything but a plain true is off; never throws
export const MOBILE_ENABLED: boolean = isEnabled(raw);

export type LastInput = "touch" | "mouse" | null;

/**
 * Touch mode: the flag is on AND the device has touch AND (its primary pointer is coarse, or the player has just touched it).
 * A real mouse move or key press turns it off for the session; the next real touch turns it back on.
 * `coarse` is the caller's reading of (pointer: coarse), or (any-pointer: coarse) when hybridPrimaryOnly is false.
 */
export function touchMode(coarse: boolean, maxTouchPoints: number, enabled: boolean, lastInput: LastInput = null): boolean {
  if (!enabled) return false;
  if (!(maxTouchPoints > 0)) return false;
  if (lastInput === "touch") return true;
  if (lastInput === "mouse") return false;
  return coarse === true;
}

/** Portrait when taller than wide. Zero or odd sizes count as landscape, so the cover never flashes on a bad reading. */
export function isPortrait(width: number, height: number): boolean {
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > width;
}

/** The portrait cover shows only over the signed-in game (never over the sign-in form), only in touch mode. */
export function showPortraitCover(touch: boolean, portrait: boolean, signedIn: boolean, forced = false): boolean {
  return forced ? true : touch && portrait && signedIn;
}

/** Dev preview: ?touch=1 or ?touch=0 forces touch mode on or off; ?portrait=1 shows the cover. Inert in production and for anything else. */
export type Override = { touch: boolean | null; portrait: boolean };
export function touchOverride(search: string, production: boolean): Override {
  const none: Override = { touch: null, portrait: false };
  if (production) return none;
  try {
    const q = new URLSearchParams(search);
    const t = q.get("touch");
    return { touch: t === "1" ? true : t === "0" ? false : null, portrait: q.get("portrait") === "1" };
  } catch { return none; }
}

type FsDoc = { fullscreenElement?: Element | null; webkitFullscreenElement?: Element | null; exitFullscreen?: () => Promise<void> };
type FsEl = { requestFullscreen?: () => Promise<void> };
type Lockable = { orientation?: { lock?: (o: "landscape") => Promise<void> } };

/** Can this page go full screen at all? (Not on iPhone Safari.) */
export function canFullscreen(el: FsEl | null | undefined): boolean {
  try { return !!el && typeof el.requestFullscreen === "function"; } catch { return false; }
}
export function isFullscreen(doc: FsDoc | null | undefined): boolean {
  try { return !!doc && !!(doc.fullscreenElement ?? doc.webkitFullscreenElement); } catch { return false; }
}
/** Ask for full screen (must run from a real tap), then try to lock to landscape. Every failure is silent. Returns whether full screen was entered. */
export async function goFullscreen(el: FsEl | null | undefined, scr: Lockable | null | undefined): Promise<boolean> {
  try {
    if (!canFullscreen(el)) return false;
    await el!.requestFullscreen!();
  } catch { return false; }
  try { await scr?.orientation?.lock?.("landscape"); } catch { /* unsupported or refused: fine */ }
  return true;
}
export async function leaveFullscreen(doc: FsDoc | null | undefined): Promise<void> {
  try { if (isFullscreen(doc)) await doc!.exitFullscreen?.(); } catch { /* silent */ }
}

// ---- S37 step 3: performance on phones (pure; World.tsx applies the numbers) ----
export type RenderSettings = { pixelRatio: number; shadowType: "soft" | "basic"; shadowMap: number };
/** Renderer settings. Not touch mode: exactly today's (ratio capped at 2, soft shadows, 1024 map). Touch mode: the lower cap and the basic shadow filter. */
export function renderSettings(touch: boolean, devicePixelRatio: number, m = MOBILE): RenderSettings {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  if (!touch) return { pixelRatio: Math.min(dpr, 2), shadowType: "soft", shadowMap: 1024 };
  return { pixelRatio: Math.max(m.pixelRatioMin, Math.min(dpr, m.pixelRatioTouch)), shadowType: m.shadowsTouch === "basic" ? "basic" : "soft", shadowMap: m.shadowMapTouch };
}

/** The slow-frame step: over each perfWindowS, if the average frame is slower than slowMs, drop the ratio by `step`, never below pixelRatioMin, never back up. */
export type Perf = { ratio: number; sum: number; n: number; since: number };
export const perfStart = (ratio: number, now: number): Perf => ({ ratio, sum: 0, n: 0, since: now });
export function perfStep(p: Perf, frameMs: number, now: number, m = MOBILE, step = 0.25): { perf: Perf; dropped: boolean } {
  if (p.since <= 0) return { perf: { ...p, since: now }, dropped: false }; // the first frame starts the first window
  if (!Number.isFinite(frameMs) || frameMs <= 0 || frameMs > 1000) return { perf: p, dropped: false }; // a tab switch or a hiccup is not slowness
  const sum = p.sum + frameMs, n = p.n + 1;
  if (now - p.since < m.perfWindowS * 1000) return { perf: { ...p, sum, n }, dropped: false };
  const slow = sum / n > m.slowMs && p.ratio - step >= m.pixelRatioMin - 1e-9;
  const ratio = slow ? Math.max(m.pixelRatioMin, p.ratio - step) : p.ratio;
  return { perf: { ratio, sum: 0, n: 0, since: now }, dropped: slow };
}

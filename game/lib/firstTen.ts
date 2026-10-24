// S38: first ten minutes. Pure switch reader, one boolean per slice (data/firstTen.json). Anything but a plain true is off; never throws.
import raw from "@/data/firstTen.json";

export type FirstTenKey = "wording" | "snackHint";
export const flagOn = (d: unknown, key: FirstTenKey): boolean => { try { return (d as { firstTen?: Record<string, unknown> })?.firstTen?.[key] === true; } catch { return false; } };
export const SNACK_HINT_ENABLED: boolean = flagOn(raw, "snackHint");
export const WORDING_ENABLED: boolean = flagOn(raw, "wording");

/** Is touch wording switched on? The data file decides; in dev builds ?wording=1 or ?wording=0 overrides it (inert in production). */
export function wordingOn(search: string, production: boolean, data: unknown = raw): boolean {
  if (!production) {
    try {
      const v = new URLSearchParams(search).get("wording");
      if (v === "1") return true;
      if (v === "0") return false;
    } catch { /* fall through to the file */ }
  }
  return flagOn(data, "wording");
}

/** Is the snack hint switched on? The data file decides; in dev builds ?snackhint=1 or ?snackhint=0 overrides it (inert in production). */
export function snackHintOn(search: string, production: boolean, data: unknown = raw): boolean {
  if (!production) {
    try {
      const v = new URLSearchParams(search).get("snackhint");
      if (v === "1") return true;
      if (v === "0") return false;
    } catch { /* fall through to the file */ }
  }
  return flagOn(data, "snackHint");
}

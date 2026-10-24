// S38: first ten minutes. Pure switch reader, one boolean per slice (data/firstTen.json). Anything but a plain true is off; never throws.
import raw from "@/data/firstTen.json";

export type FirstTenKey = "wording" | "snackHint" | "unstick" | "hudFit" | "pointers" | "signinNote";
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

/** Is the un-stick guide order switched on? The data file decides; in dev builds ?unstick=1 or ?unstick=0 overrides it (inert in production). */
export function unstickOn(search: string, production: boolean, data: unknown = raw): boolean {
  if (!production) {
    try {
      const v = new URLSearchParams(search).get("unstick");
      if (v === "1") return true;
      if (v === "0") return false;
    } catch { /* fall through to the file */ }
  }
  return flagOn(data, "unstick");
}

/** Is the phone HUD fit switched on? The data file decides; in dev builds ?hudfit=1 or ?hudfit=0 overrides it (inert in production). Only matters in touch mode. */
export function hudFitOn(search: string, production: boolean, data: unknown = raw): boolean {
  if (!production) {
    try {
      const v = new URLSearchParams(search).get("hudfit");
      if (v === "1") return true;
      if (v === "0") return false;
    } catch { /* fall through to the file */ }
  }
  return flagOn(data, "hudFit");
}

/** Is the S42 gate/Home pointer switched on? The data file decides; in dev builds ?pointers=1 or ?pointers=0 overrides it (inert in production). */
export function pointersOn(search: string, production: boolean, data: unknown = raw): boolean {
  if (!production) {
    try {
      const v = new URLSearchParams(search).get("pointers");
      if (v === "1") return true;
      if (v === "0") return false;
    } catch { /* fall through to the file */ }
  }
  return flagOn(data, "pointers");
}

/** Is the sideways note on the sign-in card switched on? The data file decides; in dev builds ?signinnote=1 or ?signinnote=0 overrides it (inert in production). Only shows in touch mode. */
export function signinNoteOn(search: string, production: boolean, data: unknown = raw): boolean {
  if (!production) {
    try {
      const v = new URLSearchParams(search).get("signinnote");
      if (v === "1") return true;
      if (v === "0") return false;
    } catch { /* fall through to the file */ }
  }
  return flagOn(data, "signinNote");
}

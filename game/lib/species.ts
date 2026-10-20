// Species data helpers. Species rows live in the database (game_species); data/species.json mirrors them
// for looks and text. Pure functions, so they can be tested.
import species from "@/data/species.json";

export type Species = {
  id: string; name: string; hatchSeconds: number; shapes: string[]; parts: string[];
  hueMin: number; hueMax: number; body: "blob" | "page"; favouriteFood: string | null; blurb: string;
};
export const SPECIES = species as Species[];

export function speciesById(id: string | null | undefined): Species {
  return SPECIES.find((s) => s.id === id) ?? SPECIES[0];
}

// Keep a hue inside a species' range (wraps around the colour wheel).
export function clampHue(hue: number, s: Species): number {
  const h = ((Math.round(hue) % 360) + 360) % 360;
  return Math.min(s.hueMax, Math.max(s.hueMin, h));
}

// Dev-only preview: "?species=leaflet" shows the player's Print as that species. It only changes how the
// Print is drawn on this screen. It never talks to the server, and it is ignored in production builds.
export function speciesOverride(search: string, isProduction: boolean): string | null {
  if (isProduction) return null;
  const id = new URLSearchParams(search).get("species");
  return id && SPECIES.some((s) => s.id === id) ? id : null;
}

// Parts a species can show; unknown parts from another species are dropped.
export function partsFor(partList: string[], s: Species): string[] {
  const known = partList.filter((p) => s.parts.includes(p));
  return known.length ? known : s.parts.slice(0, 2);
}

export function isFavourite(foodId: string, speciesId: string | null | undefined): boolean {
  return speciesById(speciesId).favouriteFood === foodId;
}

// S26: one small ink/sepia/watercolor palette, replacing the old saturated primaries.
// Pure data: no three.js import needed for the colour table itself (toonGradient below does,
// since a toon gradient map is a tiny texture). Geometry is never touched from this file.

export const PALETTE = {
  ink: "#2f2a44", // deep ink: outlines, dark accents, eyes
  inkSoft: "#4a4360", // a lighter ink, for props that used to be bright navy
  paper: "#fffaf0", // warm paper white
  sepia: "#8a6b4a", // warm mid-brown, for wood/earth tones that used to be flat primaries
  gold: "#d9a15a", // warm gold, replaces poster-bright yellow accents
  moss: "#6f9a6a", // muted green, replaces saturated leaf green
  watercolorBlue: "#6f8fb0", // soft, desaturated blue, replaces bright primary blue accents
  blush: "#c8847a", // warm rose accent, used sparingly
} as const;

export type PaletteKey = keyof typeof PALETTE;

// A short, warm toon gradient (3 bands: shadow, mid, lit) instead of the default smooth ramp.
// Fewer, warmer steps so forms read as ink-shaded bands rather than poster-bright fills.
export function toonGradientData(): Uint8Array {
  // 3 texels: dark sepia shadow, warm mid, pale lit. THREE samples nearest, so this gives 3 flat bands.
  return new Uint8Array([
    120, 100, 80, 255, // shadow band (warm dark)
    200, 180, 150, 255, // mid band
    255, 250, 235, 255, // lit band
  ]);
}

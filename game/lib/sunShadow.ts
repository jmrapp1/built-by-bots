// The sun's shadow box, in one place to tune. The box is a square of side 2*HALF (metres) that follows the player.
// The sun sits DIST metres off along its direction, so the ground at the edge of the box (and hills and props) stays between near and far.
export const SUN_SHADOW = {
  half: 70, // was 18: about 4x the reach
  dist: 80, // metres from the followed point to the sun (direction comes from the day/night sunPosition)
  near: 5,
  far: 160,
  bias: -0.0004, // was -0.0015 over a 39 m depth range (about 6 cm); the range is now about 155 m, so same 6 cm
  mapDesktop: 2048, // was 1024; phones keep data/mobile.json shadowMapTouch (1024) so they pay for the wider box in softness, not speed
  liftCap: 0.1, // was 0.05: a texel is about twice as wide now, so slopes need about twice the normal bias
} as const;

/** Desktop gets the bigger map; a phone keeps what it had. */
export const shadowMapSize = (touch: boolean, current: number): number => (touch ? current : Math.max(current, SUN_SHADOW.mapDesktop));

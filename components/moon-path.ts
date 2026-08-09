/**
 * Geometry for the moon disc, in its own module so MoonDisc.tsx stays a file
 * that exports only a component (react/only-export-components).
 */

/** Disc radius, in the -12..12 user space MoonDisc's viewBox sets up. */
export const MOON_RADIUS = 11

function round(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * The lit-region path for an illuminated `fraction`, waxing or waning.
 *
 * The terminator is a half-ellipse whose x-radius shrinks to nothing at the
 * quarters and grows back to the full disc radius at new and full: the
 * projection of a circle seen edge-on, which is why the real terminator looks
 * straight at first quarter.
 *
 * Both sweep flags matter and neither is guessable. Get one wrong and the
 * result is a plausible crescent facing the wrong way, which no amount of
 * squinting at a single phase will reveal -- the MoonDisc suite pins them.
 */
export function litPath(fraction: number, waxing: boolean): string {
  // Full radius at new and full, zero at the quarters.
  const rx = round(MOON_RADIUS * Math.abs(1 - 2 * fraction))
  // Northern hemisphere: a waxing moon is lit on its right limb.
  const limb = waxing ? 1 : 0
  // A gibbous terminator bows away from the lit limb and adds to the half disc;
  // a crescent terminator bows back across it and cuts the half disc down.
  // Equal flags carry on around the circle, opposite flags retrace the same
  // semicircle -- which is exactly full moon and new moon.
  const terminator = fraction < 0.5 ? 1 - limb : limb
  return `M0 ${-MOON_RADIUS}A${MOON_RADIUS} ${MOON_RADIUS} 0 0 ${limb} 0 ${MOON_RADIUS}A${rx} ${MOON_RADIUS} 0 0 ${terminator} 0 ${-MOON_RADIUS}Z`
}

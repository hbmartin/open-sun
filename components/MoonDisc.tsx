import type React from "react"
import { MOON_RADIUS, litPath } from "@/components/moon-path"
import { cn } from "@/lib/utils"

/**
 * The moon at its actual phase, drawn as a lit region over a dark disc.
 *
 * Indigo rather than the app's usual grays, tying the card to the moon cells of
 * the sun strip. The unlit disc stays visible rather than going transparent, so
 * a waning crescent still reads as a moon and not as a stray comma.
 */
export default function MoonDisc({
  fraction,
  phase,
  size = 24,
  className,
}: {
  /** Illuminated fraction, 0-1. */
  fraction: number
  /** SunCalc's phase, 0-1; below 0.5 is waxing. */
  phase: number
  size?: number
  className?: string
}): React.JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="-12 -12 24 24"
      aria-hidden="true"
      focusable="false"
      className={cn("shrink-0", className)}
    >
      <circle r={MOON_RADIUS} className="fill-indigo-100 dark:fill-indigo-950" />
      <path d={litPath(fraction, phase < 0.5)} className="fill-indigo-400 dark:fill-indigo-200" />
    </svg>
  )
}

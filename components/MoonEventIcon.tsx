import type { MoonKind } from "@/lib/moon"
import type React from "react"
import { ARROW_HEAD_DOWN, ARROW_HEAD_UP, ARROW_SHAFT, HORIZON } from "@/components/TwilightIcon"
import { cn } from "@/lib/utils"

// The twilight glyphs' horizon and arrow, with a crescent where the sun's cap
// goes. Sharing the frame is what makes a six-cell strip read as one row rather
// than two icon sets pushed together.
//
// The crescent is lucide's Moon scaled to r=3.5 about (12,17.5), so it is
// tangent to the horizon at (12,21) exactly where the sun's dome meets it, and
// its top clears the arrow shaft's y=11 by three units. The 2.5 radius on the
// first arc is lucide's 6 scaled up a shade: at 2.33 the chord is longer than
// the diameter and the renderer silently inflates it anyway.
const CRESCENT = "M12 14a2.5 2.5 0 0 0 3.5 3.5 3.5 3.5 0 1 1-3.5-3.5Z"

const HEAD: Record<MoonKind, string> = {
  moonrise: ARROW_HEAD_UP,
  moonset: ARROW_HEAD_DOWN,
}

// Indigo, off the orange-morning / purple-evening axis the twilight glyphs use.
// Moonrise is not a morning event -- it walks through every hour of the day
// across a month -- so borrowing either hue would state something false.
const TONE = "text-indigo-500 dark:text-indigo-300"

export default function MoonEventIcon({
  kind,
  size = 16,
  className,
}: {
  kind: MoonKind
  size?: number
  className?: string
}): React.JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={cn("shrink-0", TONE, className)}
    >
      <path d={HORIZON} />
      <path d={CRESCENT} />
      <path d={ARROW_SHAFT} />
      <path d={HEAD[kind]} />
    </svg>
  )
}

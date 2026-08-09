import type { TwilightKind } from "@/lib/twilight"
import type React from "react"
import { cn } from "@/lib/utils"

// The sun's cap above a horizon rule, at a height set by how far below the
// horizon the event puts it, plus an arrow for which way the light is going.
//
// A literal 1:3 depression ratio would leave the astronomical cap about a pixel
// tall at this render size, so the height difference is compressed and depth is
// carried redundantly by the fade in TONE. The shallow cap still has to clear
// its own 2-unit stroke, or it renders as a lump rather than an arc: 9.8 of
// chord on r=5.5 puts it 3 units tall against the civil cap's 5.5.
const HORIZON = "M2 21h20"
const DOME_CIVIL = "M6.5 21a5.5 5.5 0 0 1 11 0"
const DOME_ASTRONOMICAL = "M7.1 21a5.5 5.5 0 0 1 9.8 0"
const ARROW_SHAFT = "M12 3v8"
const ARROW_HEAD_UP = "m9 6 3-3 3 3"
const ARROW_HEAD_DOWN = "m9 8 3 3 3-3"

const GEOMETRY: Record<TwilightKind, { dome: string; head: string }> = {
  astronomicalDawn: { dome: DOME_ASTRONOMICAL, head: ARROW_HEAD_UP },
  civilDawn: { dome: DOME_CIVIL, head: ARROW_HEAD_UP },
  civilDusk: { dome: DOME_CIVIL, head: ARROW_HEAD_DOWN },
  astronomicalDusk: { dome: DOME_ASTRONOMICAL, head: ARROW_HEAD_DOWN },
}

// The same families the sunrise/sunset icons already wear elsewhere. Hue carries
// morning versus evening, opacity carries civil versus astronomical, so depth
// reads on one axis and never collides with direction.
const TONE: Record<TwilightKind, string> = {
  astronomicalDawn: "text-orange-600 dark:text-orange-400 opacity-60",
  civilDawn: "text-orange-600 dark:text-orange-400",
  civilDusk: "text-purple-800 dark:text-purple-400",
  astronomicalDusk: "text-purple-800 dark:text-purple-400 opacity-60",
}

export default function TwilightIcon({
  kind,
  size = 16,
  className,
}: {
  kind: TwilightKind
  size?: number
  className?: string
}): React.JSX.Element {
  const { dome, head } = GEOMETRY[kind]
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
      className={cn("shrink-0", TONE[kind], className)}
    >
      <path d={HORIZON} />
      <path d={dome} />
      <path d={ARROW_SHAFT} />
      <path d={head} />
    </svg>
  )
}

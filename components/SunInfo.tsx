"use client"

import type { TwilightEvent } from "@/lib/twilight"
import type React from "react"
import TwilightIcon from "@/components/TwilightIcon"
import { useNow } from "@/components/use-now"
import { TWILIGHT_LABELS, selectNextTwilight } from "@/lib/twilight"
import { formatStationTime } from "@/lib/utils"

interface SunInfoProperties {
  twilight: readonly TwilightEvent[]
  initialNow: Date
}

/**
 * The next few twilight boundaries, counting forward from now.
 *
 * Fixed-width cells and tabular figures so the strip does not shuffle sideways
 * as times roll between one and two digits on the minute tick.
 */
export default function SunInfo({
  twilight,
  initialNow,
}: SunInfoProperties): React.JSX.Element | undefined {
  const now = useNow(initialNow)
  const next = selectNextTwilight(twilight, now)

  if (next.length === 0) {
    return undefined
  }

  return (
    <ul aria-label="Next twilight times" className="grid grid-cols-4 gap-1 px-4 py-3">
      {next.map((event) => (
        <li key={event.at.toISOString()} className="flex items-center justify-center gap-1">
          <TwilightIcon kind={event.kind} />
          <span className="sr-only">{TWILIGHT_LABELS[event.kind]}</span>
          <time
            dateTime={event.at.toISOString()}
            className="text-xs tabular-nums whitespace-nowrap text-gray-700 dark:text-gray-300"
          >
            {formatStationTime(event.at)}
          </time>
        </li>
      ))}
    </ul>
  )
}

"use client"

import type { MoonEvent } from "@/lib/moon"
import type { TwilightEvent } from "@/lib/twilight"
import type React from "react"
import MoonEventIcon from "@/components/MoonEventIcon"
import TwilightIcon from "@/components/TwilightIcon"
import { MOON_LABELS, selectNextMoonEvents } from "@/lib/moon"
import { TWILIGHT_LABELS, selectNextTwilight } from "@/lib/twilight"
import { formatStationTime } from "@/lib/utils"

interface SunInfoProperties {
  twilight: readonly TwilightEvent[]
  moon: readonly MoonEvent[]
  now: Date
}

function Cell({
  at,
  label,
  icon,
}: {
  at: Date
  label: string
  icon: React.ReactNode
}): React.JSX.Element {
  return (
    <li className="flex flex-col items-center gap-1">
      {icon}
      <span className="sr-only">{label}</span>
      <time
        dateTime={at.toISOString()}
        className="text-xs font-semibold tabular-nums whitespace-nowrap text-gray-700 dark:text-gray-300"
      >
        {formatStationTime(at)}
      </time>
    </li>
  )
}

/**
 * The next few twilight boundaries and the next moonrise and moonset.
 *
 * Fixed-width cells and tabular figures so the strip does not shuffle sideways
 * as times roll between one and two digits on the minute tick. Six cells is the
 * most 384px of phone will carry at this type size; the horizontal padding is
 * px-2 rather than the px-4 used elsewhere for exactly that reason.
 */
export default function SunInfo({
  twilight,
  moon,
  now,
}: SunInfoProperties): React.JSX.Element | undefined {
  const nextTwilight = selectNextTwilight(twilight, now)
  const nextMoon = selectNextMoonEvents(moon, now)

  // Both windows have to be spent before the card goes: the moon's events are
  // built over a different span than the sun's and run out on their own clock.
  if (nextTwilight.length === 0 && nextMoon.length === 0) {
    return undefined
  }

  // One timeline rather than a sun run followed by a moon run: the strip reads
  // left to right as what happens next, whichever body it belongs to. Each
  // selector already returns its own events in order, so this only interleaves.
  const cells = [
    ...nextTwilight.map((event) => ({
      at: event.at,
      label: TWILIGHT_LABELS[event.kind],
      icon: <TwilightIcon kind={event.kind} />,
    })),
    ...nextMoon.map((event) => ({
      at: event.at,
      label: MOON_LABELS[event.kind],
      icon: <MoonEventIcon kind={event.kind} />,
    })),
  ].toSorted((first, second) => first.at.getTime() - second.at.getTime())

  return (
    <ul
      aria-label="Next sun and moon times"
      className="grid grid-cols-6 gap-1 mx-4 mb-4 px-2 py-3 bg-white dark:bg-gray-900 rounded-lg shadow-sm"
    >
      {cells.map((cell) => (
        // Keyed on the label too: a moon event and a twilight boundary can land
        // on the same minute, and the instant alone would collide.
        <Cell
          key={`${cell.label}-${cell.at.toISOString()}`}
          at={cell.at}
          label={cell.label}
          icon={cell.icon}
        />
      ))}
    </ul>
  )
}

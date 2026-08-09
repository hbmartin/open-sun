import type { TimesData } from "@/lib/suncalc"
import { getStationDate, getStationSunTimes } from "@/lib/utils"

/**
 * The twilight boundaries the sun strip names, in the order they occur each day.
 *
 * Civil twilight is the sun at -6 degrees, astronomical at -18. Sunrise and
 * sunset themselves (-0.833) are deliberately absent: the strip counts down the
 * light, not the disc.
 */
export type TwilightKind = "astronomicalDawn" | "civilDawn" | "civilDusk" | "astronomicalDusk"

export interface TwilightEvent {
  kind: TwilightKind
  at: Date
}

/** Days of events precomputed on the server. Three keeps a ~47h tab honest. */
export const TWILIGHT_DAYS = 3

/** Cells in the strip. */
export const TWILIGHT_SLOTS = 4

export const TWILIGHT_LABELS: Record<TwilightKind, string> = {
  astronomicalDawn: "Astronomical dawn",
  civilDawn: "Civil dawn",
  civilDusk: "Civil dusk",
  astronomicalDusk: "Astronomical dusk",
}

// Literal keys rather than the Record<string, Date> index signature TimesData
// carries: a typo there would type-check as Date and yield undefined at runtime.
type TimesKey = "nightEnd" | "dawn" | "dusk" | "night"

const TWILIGHT_KEYS: readonly (readonly [TwilightKind, TimesKey])[] = [
  ["astronomicalDawn", "nightEnd"],
  ["civilDawn", "dawn"],
  ["civilDusk", "dusk"],
  ["astronomicalDusk", "night"],
]

/**
 * Split from the date-string entry point so polar latitudes stay testable
 * without reaching for the station's configured coordinates.
 */
export function twilightEventsFromTimes(times: TimesData): TwilightEvent[] {
  return (
    TWILIGHT_KEYS.map(([kind, key]) => ({ kind, at: times[key] }))
      // getTimes yields an Invalid Date where an event never happens -- above the
      // Arctic circle in summer, the sun never falls to -18. formatStationTime
      // throws RangeError on those, so they must not reach the view.
      .filter((event) => Number.isFinite(event.at.getTime()))
      .toSorted((first, second) => first.at.getTime() - second.at.getTime())
  )
}

export function twilightEventsForDate(dateString: string): TwilightEvent[] {
  return twilightEventsFromTimes(getStationSunTimes(dateString))
}

/** Consecutive station-local calendar dates, "YYYY-MM-DD", starting at `from`'s. */
export function stationDateSeries(from: Date, days: number): string[] {
  const dates: string[] = []
  let date = getStationDate(from)
  for (let index = 0; index < days; index++) {
    dates.push(date)
    // Step on the same midday-UTC anchor getStationSunTimes uses, so the walk is
    // plain UTC calendar arithmetic. Adding 86_400_000ms to a station-local
    // instant repeats or skips a day across a DST transition.
    const anchor = new Date(`${date}T12:00:00Z`)
    anchor.setUTCDate(anchor.getUTCDate() + 1)
    date = anchor.toISOString().slice(0, 10)
  }
  return dates
}

/**
 * Every twilight event across the next `days` station-local days.
 *
 * Days concatenate already sorted: a day's astronomical dusk precedes the next
 * day's astronomical dawn everywhere the sun still sets.
 */
export function buildTwilightEvents(from: Date, days: number = TWILIGHT_DAYS): TwilightEvent[] {
  return stationDateSeries(from, days).flatMap((date) => twilightEventsForDate(date))
}

/** The first `count` events strictly after `now`; fewer once the window runs out. */
export function selectNextTwilight(
  events: readonly TwilightEvent[],
  now: Date,
  count: number = TWILIGHT_SLOTS,
): TwilightEvent[] {
  const cutoff = now.getTime()
  return events.filter((event) => event.at.getTime() > cutoff).slice(0, count)
}

import type { MoonTimesData } from "@/lib/suncalc"
import { getEnvironment } from "@/lib/environment"
import { getMoonIllumination, getMoonTimes } from "@/lib/suncalc"

/**
 * Moonrise and moonset, in the same shape the twilight strip already speaks.
 *
 * Deliberately parallel to lib/twilight.ts rather than folded into it: the sun
 * events are boundaries of one station-local day, while the moon's cycle is
 * 24h50m and drifts through the calendar, so the two cannot share a per-day
 * builder without one of them lying about which day an event belongs to.
 */
export type MoonKind = "moonrise" | "moonset"

export interface MoonEvent {
  kind: MoonKind
  at: Date
}

/** Days of events precomputed on the server; matches TWILIGHT_DAYS. */
export const MOON_DAYS = 3

export const MOON_LABELS: Record<MoonKind, string> = {
  moonrise: "Moonrise",
  moonset: "Moonset",
}

/** Mean synodic month, in days. */
const SYNODIC_MONTH = 29.530_588_853

const MILLISECONDS_PER_DAY = 86_400_000

/**
 * The rise and set of one search window, as events.
 *
 * Split from buildMoonEvents for the same reason twilightEventsFromTimes is
 * split from twilightEventsForDate: it makes the polar cases testable without
 * reaching for the station's configured coordinates.
 *
 * Above the Arctic circle getMoonTimes reports alwaysUp/alwaysDown and omits
 * rise and set entirely; the finite check on top of that is the guard against
 * an Invalid Date, which formatStationTime throws a RangeError on.
 */
export function moonEventsFromTimes(times: MoonTimesData): MoonEvent[] {
  const events: MoonEvent[] = []
  for (const [kind, at] of [
    ["moonrise", times.rise],
    ["moonset", times.set],
  ] as const) {
    if (at !== undefined && Number.isFinite(at.getTime())) {
      events.push({ kind, at })
    }
  }
  return events
}

/**
 * Every moonrise and moonset across the next `days`, sorted and deduplicated.
 *
 * The walk is over UTC days, not station-local ones. That is safe here in a way
 * it would not be for the sun strip: nothing ever asks "when did the moon rise
 * on the 5th", only "what happens next", so where the search windows are cut
 * cannot change the answer -- and getMoonTimes' own `inUTC` flag makes UTC
 * midnight the one boundary it computes exactly.
 */
export function buildMoonEvents(from: Date, days: number = MOON_DAYS): MoonEvent[] {
  const { LOCATION_LATITUDE, LOCATION_LONGITUDE } = getEnvironment()
  const events: MoonEvent[] = []

  for (let index = 0; index < days; index++) {
    const anchor = new Date(from.getTime() + index * MILLISECONDS_PER_DAY)
    events.push(
      ...moonEventsFromTimes(getMoonTimes(anchor, LOCATION_LATITUDE, LOCATION_LONGITUDE, true)),
    )
  }

  // getMoonTimes searches [midnight, midnight+24h] inclusive, so an event landing
  // exactly on midnight is found by both the day before and the day after.
  const seen = new Set<number>()
  return events
    .filter((event) => {
      const key = event.at.getTime()
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
    .toSorted((first, second) => first.at.getTime() - second.at.getTime())
}

/**
 * The next moonrise and the next moonset after `now` -- at most one of each.
 *
 * One per kind rather than "the next two events", so the strip's last two cells
 * keep a stable meaning instead of showing two moonrises on the nights when the
 * moon sets before dawn.
 */
export function selectNextMoonEvents(events: readonly MoonEvent[], now: Date): MoonEvent[] {
  const cutoff = now.getTime()
  const upcoming = events.filter((event) => event.at.getTime() > cutoff)
  const next: MoonEvent[] = []
  for (const kind of ["moonrise", "moonset"] as const) {
    const event = upcoming.find((candidate) => candidate.kind === kind)
    if (event !== undefined) {
      next.push(event)
    }
  }
  return next.toSorted((first, second) => first.at.getTime() - second.at.getTime())
}

export type MoonPhaseName =
  | "New Moon"
  | "Waxing Crescent"
  | "First Quarter"
  | "Waxing Gibbous"
  | "Full Moon"
  | "Waning Gibbous"
  | "Last Quarter"
  | "Waning Crescent"

/**
 * How close to a cardinal phase still counts as that phase, in cycles.
 *
 * 0.02 of a synodic month is about 14 hours either side, so "Full Moon" names
 * roughly the night it is full. Splitting the cycle into eight equal eighths
 * instead would call it full for nearly four days.
 */
const CARDINAL_WINDOW = 0.02

/** Names SunCalc's `phase`: 0 new, 0.25 first quarter, 0.5 full, 0.75 last. */
export function moonPhaseName(phase: number): MoonPhaseName {
  if (phase < CARDINAL_WINDOW || phase > 1 - CARDINAL_WINDOW) {
    return "New Moon"
  }
  if (Math.abs(phase - 0.25) < CARDINAL_WINDOW) {
    return "First Quarter"
  }
  if (Math.abs(phase - 0.5) < CARDINAL_WINDOW) {
    return "Full Moon"
  }
  if (Math.abs(phase - 0.75) < CARDINAL_WINDOW) {
    return "Last Quarter"
  }
  if (phase < 0.25) {
    return "Waxing Crescent"
  }
  if (phase < 0.5) {
    return "Waxing Gibbous"
  }
  if (phase < 0.75) {
    return "Waning Gibbous"
  }
  return "Waning Crescent"
}

/**
 * Whole days until the moon is next full.
 *
 * The double modulo is not decoration: a waning moon has `phase > 0.5`, so a
 * bare `0.5 - phase` is negative and would report a full moon in the past.
 */
export function daysToNextFullMoon(phase: number): number {
  const cyclesUntilFull = (((0.5 - phase) % 1) + 1) % 1
  return Math.round(cyclesUntilFull * SYNODIC_MONTH)
}

export interface MoonSummary {
  /** Illuminated fraction, 0-1. */
  fraction: number
  phase: number
  name: MoonPhaseName
  daysToFull: number
}

/** One illumination computation, shared by the phase name, disc and countdown. */
export function summariseMoon(date: Date): MoonSummary {
  const { fraction, phase } = getMoonIllumination(date)
  return {
    fraction,
    phase,
    name: moonPhaseName(phase),
    daysToFull: daysToNextFullMoon(phase),
  }
}

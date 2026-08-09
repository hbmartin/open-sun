import type { QuantileBand } from "@/lib/quantiles"
import type { ForecastDayData, ForecastMetric, WeatherCondition } from "@/lib/types"
import { mapForecastToCondition } from "@/lib/forecast-conditions"
import { STATION_TIME_ZONE, getStationDate, getStationHour } from "@/lib/utils"

/**
 * View model for the hourly forecast chart.
 *
 * The window starts at the current station-local hour and runs to the end of
 * the published hourly horizon, crossing midnight into the next day's rows as
 * it goes. Slots whose hourly row is absent produce no point, which the chart
 * renders as a gap. The chart shows WINDOW_HOURS at a time and scrolls
 * sideways through the rest.
 */

/** One screenful: the default, unscrolled view is the next 24 hours. */
export const WINDOW_HOURS = 24

/** How far right the scroll can reach, ~4 local days of published rows. */
export const MAX_HORIZON_HOURS = 96

export interface NextHoursPoint {
  /** Slot index within the horizon, 0 to horizonHours-1. */
  offset: number
  /** Station-local hour of day, "0"-"23", for formatHour. */
  hour: string
  /** The selected metric's value; undefined breaks the line. */
  value?: number
  /** Nested uncertainty bands, widest first; empty when the hour has none. */
  bands: QuantileBand[]
  condition: WeatherCondition
  /** Percent. */
  pop?: number
}

export type DayPartLabel = "Morning" | "Afternoon" | "Evening" | "Overnight"

export interface DayPartRun {
  label: DayPartLabel
  /**
   * What the header shows. The weekday abbreviation for Overnight runs, which
   * begin at local midnight and so double as the day marker; the label
   * otherwise. Over four days the bare labels repeat with nothing to tell the
   * days apart.
   */
  heading: string
  /** Inclusive slot index. */
  startOffset: number
  /** Exclusive slot index. */
  endOffset: number
  /** Highest chance of rain across the run's present hours, percent. */
  maxPop?: number
}

export interface NextHoursModel {
  points: NextHoursPoint[]
  /** Contiguous runs covering all horizonHours slots, partial at both ends. */
  dayParts: DayPartRun[]
  /** Station-local hour of day the window starts at, 0-23. */
  startHour: number
  /** Slots the chart spans, at least WINDOW_HOURS; trailing gaps trimmed. */
  horizonHours: number
  /** Fractional slot offset of the present moment, 0-1 into the first hour. */
  nowOffset: number
  domainMin: number
  domainMax: number
  summary?: string
}

const stationMinuteFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: STATION_TIME_ZONE,
  minute: "numeric",
})

function dayPartOf(hourOfDay: number): DayPartLabel {
  if (hourOfDay < 6) {
    return "Overnight"
  }
  if (hourOfDay < 12) {
    return "Morning"
  }
  if (hourOfDay < 18) {
    return "Afternoon"
  }
  return "Evening"
}

function dayPartRuns(
  startHour: number,
  points: NextHoursPoint[],
  horizonHours: number,
): DayPartRun[] {
  const pointsByOffset = new Map(points.map((point) => [point.offset, point]))
  const runs: DayPartRun[] = []
  for (let offset = 0; offset < horizonHours; offset++) {
    const label = dayPartOf((startHour + offset) % 24)
    const previous = runs.at(-1)
    if (previous?.label === label) {
      previous.endOffset = offset + 1
    } else {
      runs.push({ label, heading: label, startOffset: offset, endOffset: offset + 1 })
    }
  }
  for (const run of runs) {
    let maxPop: number | undefined
    for (let offset = run.startOffset; offset < run.endOffset; offset++) {
      const pop = pointsByOffset.get(offset)?.pop
      if (pop !== undefined && (maxPop === undefined || pop > maxPop)) {
        maxPop = pop
      }
    }
    run.maxPop = maxPop
  }
  return runs
}

const conditionPhrases: Record<WeatherCondition, string> = {
  sunny: "Clear skies",
  "sun-medium": "Mostly sunny",
  "sun-dim": "Hazy sun",
  cloudy: "Cloudy",
  drizzle: "A chance of rain",
  rain: "Rain",
  "rain-wind": "Wind-driven rain",
  wind: "Windy",
  "clear-night": "Clear skies",
}

const dayPartPhrases: Record<DayPartLabel, string> = {
  Morning: "this morning",
  Afternoon: "this afternoon",
  Evening: "this evening",
  Overnight: "overnight",
}

function dominantCondition(
  run: DayPartRun,
  points: NextHoursPoint[],
): WeatherCondition | undefined {
  const counts = new Map<WeatherCondition, number>()
  for (const point of points) {
    if (point.offset >= run.startOffset && point.offset < run.endOffset) {
      counts.set(point.condition, (counts.get(point.condition) ?? 0) + 1)
    }
  }
  let winner: WeatherCondition | undefined
  let best = 0
  for (const [condition, count] of counts) {
    if (count > best) {
      winner = condition
      best = count
    }
  }
  return winner
}

/**
 * A deterministic one-liner: the dominant condition of the current day part,
 * then the next. Undefined when the window lacks the data to say anything
 * honest.
 */
export function buildSummary(points: NextHoursPoint[], dayParts: DayPartRun[]): string | undefined {
  const [first, second] = dayParts
  if (!first || !second) {
    return undefined
  }
  const firstCondition = dominantCondition(first, points)
  const secondCondition = dominantCondition(second, points)
  if (!firstCondition || !secondCondition) {
    return undefined
  }

  const firstPhrase = conditionPhrases[firstCondition]
  const secondPhrase = conditionPhrases[secondCondition]
  return firstPhrase === secondPhrase
    ? `${firstPhrase} ${dayPartPhrases[first.label]} and ${dayPartPhrases[second.label]}.`
    : `${firstPhrase} ${dayPartPhrases[first.label]}, ${secondPhrase.toLowerCase()} ${
        dayPartPhrases[second.label]
      }.`
}

export function buildNextHours(
  days: ForecastDayData[],
  now: Date,
  metric: ForecastMetric,
): NextHoursModel | undefined {
  const startDate = getStationDate(now)
  const startIndex = days.findIndex((day) => day.date === startDate)
  if (startIndex === -1) {
    return undefined
  }
  const startHour = Number(getStationHour(now))

  const points: NextHoursPoint[] = []
  for (let offset = 0; offset < MAX_HORIZON_HOURS; offset++) {
    // Days are 24 fixed slots wide, so this arithmetic drifts by an hour across
    // a DST transition. That is the mapper's bucketing, not ours; the chart
    // reads its tick labels off the points themselves rather than recomputing.
    const absoluteHour = startHour + offset
    const day = days[startIndex + Math.floor(absoluteHour / 24)]
    const hour = day?.hours[absoluteHour % 24]
    if (hour === undefined) {
      continue
    }
    points.push({
      offset,
      hour: hour.hour,
      value: hour[metric],
      bands: hour.bands[metric] ?? [],
      condition: mapForecastToCondition(hour),
      pop: hour.pop,
    })
  }

  const valued = points.filter((point) => point.value !== undefined)
  if (valued.length < 2) {
    return undefined
  }

  const extents = points.flatMap((point) =>
    [point.value, ...point.bands.flatMap((band) => [band.low, band.high])].filter(
      (value) => value !== undefined,
    ),
  )
  let domainMin = Math.min(...extents)
  let domainMax = Math.max(...extents)
  if (domainMax <= domainMin) {
    domainMin -= 1
    domainMax += 1
  }

  // Trailing empty slots would render as dead space at the right edge; the
  // floor keeps a short document at one screenful rather than stretching a
  // handful of hours across it.
  const horizonHours = Math.max(WINDOW_HOURS, Math.max(...points.map((point) => point.offset)) + 1)

  const dayParts = dayPartRuns(startHour, points, horizonHours)
  for (const run of dayParts) {
    if (run.label === "Overnight") {
      const day = days[startIndex + Math.floor((startHour + run.startOffset) / 24)]
      run.heading = day?.day ?? run.label
    }
  }
  const minutes = Number(stationMinuteFormatter.format(now))

  return {
    points,
    dayParts,
    startHour,
    horizonHours,
    nowOffset: minutes / 60,
    domainMin,
    domainMax,
    summary: buildSummary(points, dayParts),
  }
}

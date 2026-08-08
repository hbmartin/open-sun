import type { ForecastDayData, ForecastMetric, WeatherCondition } from "@/lib/types"
import { mapForecastToCondition } from "@/lib/forecast-conditions"
import { STATION_TIME_ZONE, formatStationTime, getStationDate, getStationHour } from "@/lib/utils"

/**
 * View model for the Next 24 Hours chart.
 *
 * The window starts at the current station-local hour and spans 24 hour slots,
 * crossing midnight into the next day's rows when it must. Slots whose hourly
 * row is absent produce no point, which the chart renders as a gap.
 */

export const WINDOW_HOURS = 24

export interface NextHoursPoint {
  /** Slot index within the window, 0-23. */
  offset: number
  /** Station-local hour of day, "0"-"23", for formatHour. */
  hour: string
  /** The selected metric's value; undefined breaks the line. */
  value?: number
  bandLow?: number
  bandHigh?: number
  condition: WeatherCondition
  /** Percent. */
  pop?: number
}

export type DayPartLabel = "Morning" | "Afternoon" | "Evening" | "Overnight"

export interface DayPartRun {
  label: DayPartLabel
  /** Inclusive slot index. */
  startOffset: number
  /** Exclusive slot index. */
  endOffset: number
  /** Highest chance of rain across the run's present hours, percent. */
  maxPop?: number
}

export interface NextHoursModel {
  points: NextHoursPoint[]
  /** Contiguous runs covering all 24 slots, partial at both ends. */
  dayParts: DayPartRun[]
  /** Station-local hour of day the window starts at, 0-23. */
  startHour: number
  /** Horizontal fraction of the window where the present moment sits, 0-1. */
  nowFraction: number
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

function dayPartRuns(startHour: number, points: NextHoursPoint[]): DayPartRun[] {
  const pointsByOffset = new Map(points.map((point) => [point.offset, point]))
  const runs: DayPartRun[] = []
  for (let offset = 0; offset < WINDOW_HOURS; offset++) {
    const label = dayPartOf((startHour + offset) % 24)
    const previous = runs.at(-1)
    if (previous?.label === label) {
      previous.endOffset = offset + 1
    } else {
      runs.push({ label, startOffset: offset, endOffset: offset + 1 })
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
 * then the next, then the upcoming sun event. Undefined when the window lacks
 * the data to say anything honest.
 */
export function buildSummary(
  points: NextHoursPoint[],
  dayParts: DayPartRun[],
  today: ForecastDayData,
  tomorrow?: ForecastDayData,
): string | undefined {
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
  const conditions =
    firstPhrase === secondPhrase
      ? `${firstPhrase} ${dayPartPhrases[first.label]} and ${dayPartPhrases[second.label]}.`
      : `${firstPhrase} ${dayPartPhrases[first.label]}, ${secondPhrase.toLowerCase()} ${
          dayPartPhrases[second.label]
        }.`

  // Before evening the sunset is still ahead; after it, tomorrow's sunrise is
  // the next sun event worth naming.
  const sunEvent =
    first.label === "Morning" || first.label === "Afternoon"
      ? `Sunset at ${formatStationTime(today.sunTimes.sunset)}.`
      : `Sunrise at ${formatStationTime((tomorrow ?? today).sunTimes.sunrise)}.`

  return `${conditions} ${sunEvent}`
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
  for (let offset = 0; offset < WINDOW_HOURS; offset++) {
    const absoluteHour = startHour + offset
    const day = days[startIndex + Math.floor(absoluteHour / 24)]
    const hour = day?.hours[absoluteHour % 24]
    if (hour === undefined) {
      continue
    }
    const band = hour.bands[metric]
    points.push({
      offset,
      hour: hour.hour,
      value: hour[metric],
      bandLow: band?.low,
      bandHigh: band?.high,
      condition: mapForecastToCondition(hour),
      pop: hour.pop,
    })
  }

  const valued = points.filter((point) => point.value !== undefined)
  if (valued.length < 2) {
    return undefined
  }

  const extents = points.flatMap((point) =>
    [point.value, point.bandLow, point.bandHigh].filter((value) => value !== undefined),
  )
  let domainMin = Math.min(...extents)
  let domainMax = Math.max(...extents)
  if (domainMax <= domainMin) {
    domainMin -= 1
    domainMax += 1
  }

  const dayParts = dayPartRuns(startHour, points)
  const minutes = Number(stationMinuteFormatter.format(now))

  return {
    points,
    dayParts,
    startHour,
    nowFraction: minutes / 60 / WINDOW_HOURS,
    domainMin,
    domainMax,
    summary: buildSummary(points, dayParts, days[startIndex], days[startIndex + 1]),
  }
}

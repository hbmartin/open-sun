import type { ForecastDailyRow, ForecastDocument, ForecastHourlyRow } from "@/lib/forecast-schemas"
import type { QuantileBand } from "@/lib/quantiles"
import type {
  ForecastCount,
  ForecastData,
  ForecastDayData,
  ForecastFreshness,
  ForecastHourData,
  ForecastRanges,
} from "@/lib/types"
import { getAbbreviatedDay } from "@/lib/mappers"
import { likelyBand, quantileBands } from "@/lib/quantiles"
import { ForecastMetric } from "@/lib/types"
import { getStationDate, getStationHour, getStationSunTimes } from "@/lib/utils"

const HOURS_PER_DAY = 24
const FRESH_MAX_HOURS = 3
const STALE_MAX_HOURS = 12
const MILLISECONDS_PER_HOUR = 3_600_000

const emptyForecastRanges: ForecastRanges = {
  min_temp: 0,
  max_temp: 0,
  min_pop: 0,
  max_pop: 0,
  min_precip: 0,
  max_precip: 0,
  min_humidity: 0,
  max_humidity: 0,
  min_wind: 0,
  max_wind: 0,
}

/** Probability of precipitation arrives as a fraction and renders as a percent. */
function toPercent(value: number | null | undefined): number | undefined {
  return value === null || value === undefined ? undefined : value * 100
}

/** POP is a fraction on the wire, a percent in the UI; bands must scale too. */
function scaleBands(bands: QuantileBand[], factor: number): QuantileBand[] {
  return bands.map((band) => ({ ...band, low: band.low * factor, high: band.high * factor }))
}

function toValue(value: number | null | undefined): number | undefined {
  // Absent and null both mean "no value here"; the distinction is not one the
  // UI can act on.
  return value ?? undefined
}

function hasEvidence(row: { release_ids: Record<string, string> }): boolean {
  // status: "ready" only means SOME slice was promoted. Per-row release ids are
  // the honest signal, and most daily rows carry none.
  return Object.keys(row.release_ids).length > 0
}

export function getForecastFreshness(
  issuedAt: string,
  now: Date,
): { ageHours: number; freshness: ForecastFreshness } {
  // Schema validation guarantees this parses, so there is no unparseable branch
  // to cover here. Negative ages come from publisher clock skew, not from a
  // forecast about the past.
  const elapsed = (now.getTime() - Date.parse(issuedAt)) / MILLISECONDS_PER_HOUR
  const ageHours = Math.max(0, elapsed)
  if (ageHours <= FRESH_MAX_HOURS) {
    return { ageHours, freshness: "fresh" }
  }
  if (ageHours <= STALE_MAX_HOURS) {
    return { ageHours, freshness: "stale" }
  }
  return { ageHours, freshness: "expired" }
}

function mapHourlyRow(row: ForecastHourlyRow, sunrise: Date, sunset: Date): ForecastHourData {
  const validTime = new Date(row.valid_time)
  const pop = toPercent(row.values.pop)
  const precip = toValue(row.values.precip_in)

  return {
    date: getStationDate(validTime),
    hour: getStationHour(validTime),
    validTime: row.valid_time,
    leadBucket: row.lead_bucket,
    isDaytime: validTime >= sunrise && validTime <= sunset,
    hasEvidence: hasEvidence(row),
    temp: toValue(row.values.temp_f),
    pop,
    precip,
    humidity: toValue(row.values.humidity_pct),
    dewPoint: toValue(row.values.dew_point_f),
    wind: toValue(row.values.wind_speed_mph),
    gust: toValue(row.values.wind_gust_mph),
    pressure: toValue(row.values.pressure_sea_inhg),
    bands: {
      [ForecastMetric.TEMP]: quantileBands(row.quantiles["temp_f"]),
      [ForecastMetric.POP]: scaleBands(quantileBands(row.quantiles["pop"]), 100),
      [ForecastMetric.PRECIP]: quantileBands(row.quantiles["precip_in"]),
    },
    methods: {
      [ForecastMetric.TEMP]: row.methods["temp_f"],
      [ForecastMetric.POP]: row.methods["pop"],
      [ForecastMetric.PRECIP]: row.methods["precip_in"],
    },
  }
}

function hourRangesFor(hours: (ForecastHourData | undefined)[]): ForecastRanges {
  const present = hours.filter((hour) => hour !== undefined)
  if (present.length === 0) {
    return { ...emptyForecastRanges }
  }
  const ranges = { ...emptyForecastRanges }
  for (const metric of Object.values(ForecastMetric)) {
    const values = present.map((hour) => hour[metric]).filter((value) => value !== undefined)
    if (values.length > 0) {
      ranges[`min_${metric}`] = Math.min(...values)
      ranges[`max_${metric}`] = Math.max(...values)
    }
  }
  return ranges
}

function mapDailyRow(
  row: ForecastDailyRow,
  hoursByDate: Map<string, (ForecastHourData | undefined)[]>,
): ForecastDayData {
  const pop = toPercent(row.values.pop)
  const precipSum = toValue(row.values.precip_sum_in)
  const temperatureBands = quantileBands(row.quantiles["temp_max_f"])
  const popBands = scaleBands(quantileBands(row.quantiles["pop"]), 100)
  const precipBands = quantileBands(row.quantiles["precip_sum_in"])
  const likelyPop = likelyBand(popBands)
  const likelyPrecip = likelyBand(precipBands)
  const hours = hoursByDate.get(row.date_local) ?? []
  const present = hours.filter((hour) => hour !== undefined)

  // POP and precipitation have no daily min/max, so the 60% band is the row's
  // displayed spread outright, and the point value stands in for both ends when
  // there is no grid.
  const popLow = likelyPop ? likelyPop.low : pop
  const popHigh = likelyPop ? likelyPop.high : pop

  return {
    date: row.date_local,
    day: getAbbreviatedDay(row.date_local),
    leadDays: row.lead_days,
    hasEvidence: hasEvidence(row),
    min_temp: toValue(row.values.temp_min_f),
    max_temp: toValue(row.values.temp_max_f),
    min_pop: popLow,
    max_pop: popHigh,
    min_precip: likelyPrecip ? likelyPrecip.low : precipSum,
    max_precip: likelyPrecip ? likelyPrecip.high : precipSum,
    pop,
    precipSum,
    // The wire carries no daily humidity or wind, so their bounds come from
    // whatever hourly coverage the day has; absent coverage leaves them
    // undefined and the row renders "No value".
    min_humidity: minimumOf(present.map((hour) => hour.humidity)),
    max_humidity: maximumOf(present.map((hour) => hour.humidity)),
    min_wind: minimumOf(present.map((hour) => hour.wind)),
    max_wind: maximumOf(present.map((hour) => hour.wind)),
    // Icon inputs only: a day-representative humidity and the day's peak wind.
    humidity: present.length > 0 ? averageOf(present.map((hour) => hour.humidity)) : undefined,
    wind: present.length > 0 ? maximumOf(present.map((hour) => hour.wind)) : undefined,
    bands: {
      [ForecastMetric.TEMP]: temperatureBands,
      [ForecastMetric.POP]: popBands,
      [ForecastMetric.PRECIP]: precipBands,
    },
    methods: {
      [ForecastMetric.TEMP]: row.methods["temp_max_f"],
      [ForecastMetric.POP]: row.methods["pop"],
      [ForecastMetric.PRECIP]: row.methods["precip_sum_in"],
    },
    sunTimes: getStationSunTimes(row.date_local),
    hours,
    hourRanges: hourRangesFor(hours),
  }
}

function averageOf(values: (number | undefined)[]): number | undefined {
  const present = values.filter((value) => value !== undefined)
  if (present.length === 0) {
    return undefined
  }
  return present.reduce((total, value) => total + value, 0) / present.length
}

function maximumOf(values: (number | undefined)[]): number | undefined {
  const present = values.filter((value) => value !== undefined)
  return present.length === 0 ? undefined : Math.max(...present)
}

function minimumOf(values: (number | undefined)[]): number | undefined {
  const present = values.filter((value) => value !== undefined)
  return present.length === 0 ? undefined : Math.min(...present)
}

/** Tallies of each distinct value across per-row string maps, descending. */
function countsOf(maps: Record<string, string>[]): ForecastCount[] {
  const counts = new Map<string, number>()
  for (const map of maps) {
    for (const value of Object.values(map)) {
      counts.set(value, (counts.get(value) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .toSorted((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

/** The fraction of served variable slots backed by a release id. */
function coverageOf(rows: { values: object; release_ids: Record<string, string> }[]): number {
  let slots = 0
  let backed = 0
  for (const row of rows) {
    slots += Object.keys(row.values).length
    backed += Object.keys(row.release_ids).length
  }
  return slots === 0 ? 0 : backed / slots
}

export function calculateForecastRanges(days: ForecastDayData[]): ForecastRanges {
  if (days.length === 0) {
    return { ...emptyForecastRanges }
  }
  const ranges = { ...emptyForecastRanges }
  for (const metric of Object.values(ForecastMetric)) {
    const lows = days.map((day) => day[`min_${metric}`]).filter((value) => value !== undefined)
    const highs = days.map((day) => day[`max_${metric}`]).filter((value) => value !== undefined)
    if (lows.length > 0) {
      ranges[`min_${metric}`] = Math.min(...lows)
    }
    if (highs.length > 0) {
      ranges[`max_${metric}`] = Math.max(...highs)
    }
  }
  return ranges
}

export function mapForecastDocument(document: ForecastDocument, now: Date): ForecastData {
  // Sun times drive the day/night icon split, so they must be resolved before
  // the hourly rows that consult them.
  const sunTimesByDate = new Map(
    document.daily.map((row) => [row.date_local, getStationSunTimes(row.date_local)]),
  )

  const hoursByDate = new Map<string, (ForecastHourData | undefined)[]>()
  const acceptedHourly: ForecastHourlyRow[] = []
  for (const row of document.hourly) {
    const date = getStationDate(new Date(row.valid_time))
    const sunTimes = sunTimesByDate.get(date)
    if (!sunTimes) {
      // An hourly row outside the daily horizon has nowhere to render.
      continue
    }
    acceptedHourly.push(row)
    const hour = mapHourlyRow(row, sunTimes.sunrise, sunTimes.sunset)
    const slots =
      hoursByDate.get(date) ??
      (Array.from({ length: HOURS_PER_DAY }) as (ForecastHourData | undefined)[])
    slots[Number(hour.hour)] = hour
    hoursByDate.set(date, slots)
  }

  const days = document.daily.map((row) => mapDailyRow(row, hoursByDate))
  const { ageHours, freshness } = getForecastFreshness(document.issued_at, now)
  // The Info aggregates describe what the app can render, so hourly rows
  // dropped above as outside the daily horizon stay out of them too.
  const allRows = [...acceptedHourly, ...document.daily]

  return {
    issuedAt: document.issued_at,
    ageHours,
    freshness,
    status: document.status,
    statusReason: document.status_reason ?? undefined,
    sources: document.sources,
    publisherVersion: document.publisher_version,
    days,
    ranges: calculateForecastRanges(days),
    info: {
      status: document.status,
      statusReason: document.status_reason ?? undefined,
      issuedAt: document.issued_at,
      ageHours,
      freshness,
      observationAt: document.observation_at ?? undefined,
      releaseIds: document.release_ids,
      evidenceCoverage: {
        hourly: coverageOf(acceptedHourly),
        daily: coverageOf(document.daily),
      },
      hourlyRows: document.hourly.length,
      dailyRows: document.daily.length,
      methodCounts: countsOf(allRows.map((row) => row.methods)),
      reasonCounts: countsOf(allRows.map((row) => row.selection_reasons)),
      sources: document.sources,
      datasetFingerprint: document.dataset_fingerprint,
      publisherVersion: document.publisher_version,
      schemaVersion: document.schema_version,
      timezone: document.timezone,
    },
  }
}

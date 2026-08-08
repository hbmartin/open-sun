import type { QuantileBand } from "@/lib/quantiles"
import type { TimesData } from "@/lib/suncalc"

export interface InstantObservation {
  inTemp: number | null
  inHumi: number | null
  AbsPress: number | null
  RelPress: number | null
  outTemp: number
  outHumi: number
  windir: number
  avgwind: number
  gustspeed: number
  dailygust: number
  solarrad: number
  uv: number
  uvi: number
  pm25: number | null
  rainofhourly: number
  eventrain: number
  sunTimes: TimesData
}

export interface RangeObservation {
  date: string
  min_outTemp: number
  avg_outTemp: number
  max_outTemp: number
  min_outHumi: number
  avg_outHumi: number
  max_outHumi: number
  max_gustspeed: number
  min_avgwind: number
  avg_avgwind: number
  max_avgwind: number
  avg_rainofhourly: number
  min_uvi: number
  avg_uvi: number
  max_uvi: number
  min_solarrad: number
  avg_solarrad: number
  max_solarrad: number
}

export interface DayData extends RangeObservation {
  day: string
  sunTimes: TimesData
}

export interface HourData extends RangeObservation {
  hour: string
}

export interface Ranges {
  min_outTemp: number
  max_outTemp: number
  min_outHumi: number
  max_outHumi: number
  max_gustspeed: number
  min_avgwind: number
  max_avgwind: number
  min_uvi: number
  max_uvi: number
  min_solarrad: number
  max_solarrad: number
}

export interface WeeklyData {
  data: DayData[]
  ranges: Ranges
}

export interface DailyData {
  data: (HourData | undefined)[]
  ranges: Ranges
}

export type WeatherCondition =
  | "cloudy"
  | "drizzle"
  | "rain"
  | "rain-wind"
  | "wind"
  | "sun-dim"
  | "sun-medium"
  | "sunny"
  | "clear-night"

export enum DisplayMetric {
  TEMP = "outTemp",
  HUMID = "outHumi",
  WIND = "avgwind",
  UVI = "uvi",
  SOLAR = "solarrad",
}

export const metric_display_units: Record<DisplayMetric, string> = {
  [DisplayMetric.TEMP]: "°",
  [DisplayMetric.HUMID]: "%",
  [DisplayMetric.WIND]: "",
  [DisplayMetric.UVI]: "",
  [DisplayMetric.SOLAR]: "",
}

/**
 * Forecast view models.
 *
 * These are a parallel key family to RangeObservation rather than an extension
 * of it: the forecast's variables do not overlap the station's, and it carries
 * no solar radiation or UV index at all. Keeping the same `min_`/`max_` naming
 * shape means the template-key indexing used throughout the history view
 * (day[`min_${metric}`]) works unchanged on forecast rows.
 */

/**
 * Temperature, rain chance and rain amount arrive at both daily and hourly
 * resolution. Humidity and wind exist only on the hourly rows, so their daily
 * min/max are derived from whatever hourly coverage a day has — days beyond
 * the hourly horizon carry none and render as unclickable rows.
 */
export enum ForecastMetric {
  TEMP = "temp",
  POP = "pop",
  PRECIP = "precip",
  HUMIDITY = "humidity",
  WIND = "wind",
}

export const forecast_metric_display_units: Record<ForecastMetric, string> = {
  [ForecastMetric.TEMP]: "°",
  [ForecastMetric.POP]: "%",
  [ForecastMetric.PRECIP]: '"',
  [ForecastMetric.HUMIDITY]: "%",
  [ForecastMetric.WIND]: "",
}

export const forecast_metric_precision: Record<ForecastMetric, number> = {
  [ForecastMetric.TEMP]: 0,
  [ForecastMetric.POP]: 0,
  [ForecastMetric.PRECIP]: 2,
  [ForecastMetric.HUMIDITY]: 0,
  [ForecastMetric.WIND]: 0,
}

export type ForecastRangeKey = `min_${ForecastMetric}` | `max_${ForecastMetric}`
export type ForecastRanges = Record<ForecastRangeKey, number>

export interface ForecastHourData {
  date: string
  hour: string
  validTime: string
  leadBucket: string
  /** Computed from sun times, since the forecast carries no solar radiation. */
  isDaytime: boolean
  hasEvidence: boolean
  temp?: number
  pop?: number
  precip?: number
  humidity?: number
  dewPoint?: number
  wind?: number
  gust?: number
  pressure?: number
  bands: Partial<Record<ForecastMetric, QuantileBand>>
  methods: Partial<Record<ForecastMetric, string>>
}

export interface ForecastDayData extends Partial<ForecastRanges> {
  date: string
  day: string
  leadDays: number
  /** False when no promoted release backed any variable in this row. */
  hasEvidence: boolean
  pop?: number
  precipSum?: number
  humidity?: number
  wind?: number
  bands: Partial<Record<ForecastMetric, QuantileBand>>
  methods: Partial<Record<ForecastMetric, string>>
  sunTimes: TimesData
  /** Indexed by station-local hour; empty beyond the published hourly horizon. */
  hours: (ForecastHourData | undefined)[]
  hourRanges: ForecastRanges
}

export type ForecastFreshness = "fresh" | "stale" | "expired"

export interface ForecastData {
  issuedAt: string
  ageHours: number
  freshness: ForecastFreshness
  status: "ready" | "degraded"
  statusReason?: string
  sources: string[]
  publisherVersion: string
  days: ForecastDayData[]
  ranges: ForecastRanges
}

export type ForecastFetchResult =
  | { kind: "ok"; forecast: ForecastData }
  | { kind: "unavailable"; reason: string }

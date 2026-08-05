import type { TimesData } from "./suncalc"
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { getEnvironment } from "@/lib/environment"
import { getTimes } from "@/lib/suncalc"

export const STATION_TIME_ZONE = "America/Los_Angeles"

const calendarDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
})

// en-CA yields ISO ordering (2026-08-05), which is what the forecast's
// date_local uses and what sorts correctly as a string.
const stationDayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: STATION_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

// hourCycle h23 rather than hour12:false: the latter renders midnight as "24"
// under some ICU builds, which would bucket it into the wrong day.
const stationHourFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: STATION_TIME_ZONE,
  hour: "2-digit",
  hourCycle: "h23",
})

const stationTimeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: STATION_TIME_ZONE,
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatHour(hour: string) {
  const hourNumber = Number.parseInt(hour, 10)
  if (hourNumber === 0) return "12 AM"
  if (hourNumber === 12) return "12 PM"
  if (hourNumber > 12) return `${hourNumber - 12} PM`
  return `${hourNumber} AM`
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  })
}

export function formatCalendarDate(dateString: string): string {
  const calendarDate = dateString.slice(0, 10)
  return calendarDateFormatter.format(new Date(`${calendarDate}T00:00:00Z`))
}

export function formatStationTime(date: Date): string {
  return stationTimeFormatter.format(date)
}

export function getRangePosition(
  value: number,
  minimum: number,
  maximum: number,
): number {
  if (maximum <= minimum) {
    return 50
  }

  const position = ((value - minimum) / (maximum - minimum)) * 100
  return Math.min(100, Math.max(0, position))
}

export function getStationDate(date: Date): string {
  return stationDayFormatter.format(date)
}

export function getStationHour(date: Date): string {
  return stationHourFormatter.format(date)
}

export function formatMetricValue(value: number, precision: number): string {
  // toFixed(0) renders small negatives as "-0"; rounding sidesteps that.
  if (precision === 0) {
    return String(Math.round(value))
  }
  return value.toFixed(precision)
}

export function getSunTimes(date: Date): TimesData {
  const environment = getEnvironment()
  return getTimes(date, environment.LOCATION_LATITUDE, environment.LOCATION_LONGITUDE)
}

/**
 * Sun times for a station-local calendar date such as "2026-08-05".
 *
 * new Date("2026-08-05") is UTC midnight, which is still the afternoon of the
 * 4th at the station, so getTimes would pick the previous day's solar noon.
 * Anchoring at midday UTC keeps the nearest solar noon on the intended date for
 * any offset within +/-12 hours.
 */
export function getStationSunTimes(dateString: string): TimesData {
  return getSunTimes(new Date(`${dateString}T12:00:00Z`))
}

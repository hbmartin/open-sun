import type { TimesData } from "./suncalc"
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { getEnvironment } from "@/lib/environment"
import { getTimes } from "@/lib/suncalc"

const STATION_TIME_ZONE = "America/Los_Angeles"

const calendarDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
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

export function getSunTimes(date: Date): TimesData {
  const environment = getEnvironment()
  return getTimes(date, environment.LOCATION_LATITUDE, environment.LOCATION_LONGITUDE)
}

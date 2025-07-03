import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import * as SunCalc from "@/lib/suncalc"

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
  })
}

export function getSunTimes(date: Date): SunCalc.TimesData {
    const latitude = Number(process.env["LOCATION_LATITUDE"])
    const longitude = Number(process.env["LOCATION_LONGITUDE"])
    return SunCalc.getTimes(date, latitude, longitude)
  }
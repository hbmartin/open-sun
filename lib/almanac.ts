import type { DayData } from "@/lib/types"

/**
 * Derived numbers for the almanac cards at the foot of the forecast.
 *
 * Kept out of the component so the arithmetic is covered by the lib/ gate --
 * the components suite renders to a string and could not tell a dew point of
 * 44 from one of 4.
 */

// Magnus-Tetens coefficients, the same pair the WMO guidance uses. Good to
// about 0.35 degrees C over -45..60 C, which comfortably covers a weather
// station in northern California.
const MAGNUS_B = 17.625
const MAGNUS_C = 243.04

function toCelsius(fahrenheit: number): number {
  return ((fahrenheit - 32) * 5) / 9
}

function toFahrenheit(celsius: number): number {
  return (celsius * 9) / 5 + 32
}

/**
 * Dew point in degrees F from a dry-bulb temperature and relative humidity.
 *
 * Returns NaN at or below zero humidity rather than the -Infinity that ln(0)
 * would produce: the cards check with Number.isFinite and render an em dash,
 * and an "-Infinity" leaking into the markup is exactly what the suite's
 * not.toContain guards exist to catch.
 */
export function dewPointF(tempF: number, humidityPercent: number): number {
  if (!(humidityPercent > 0)) {
    return Number.NaN
  }
  const tempC = toCelsius(tempF)
  const gamma = Math.log(humidityPercent / 100) + (MAGNUS_B * tempC) / (MAGNUS_C + tempC)
  return toFahrenheit((MAGNUS_C * gamma) / (MAGNUS_B - gamma))
}

/**
 * Mean daily high across the station's prior days, in degrees F.
 *
 * `days` is newest-first (lib/fetcher.ts reverses the published document), so
 * the first entry is today and is dropped: comparing a day that is still
 * running against completed ones would drag the baseline down every morning.
 *
 * The publisher bounds daily.json to eight days, so this is a seven-day
 * trailing mean and nothing more -- it is NOT a climate normal, and the card
 * that shows it has to say so.
 */
export function averageDailyHighF(days: readonly DayData[]): number | undefined {
  const prior = days.slice(1)
  if (prior.length === 0) {
    return undefined
  }
  let total = 0
  for (const day of prior) {
    total += day.max_outTemp
  }
  return total / prior.length
}

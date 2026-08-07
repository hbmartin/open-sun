import type {
  DailyData,
  DayData,
  ForecastFetchResult,
  InstantObservation,
  Ranges,
  WeeklyData,
} from "./types"
import { getEnvironment } from "@/lib/environment"
import { mapForecastDocument } from "@/lib/forecast-mappers"
import { ForecastDocumentSchema } from "@/lib/forecast-schemas"
import { calculateRanges, mapDailyApiResponse, mapHourlyApiResponse } from "@/lib/mappers"
import {
  CurrentWeatherApiResponseSchema,
  DailyApiResponseSchema,
  HourlyApiResponseSchema,
} from "@/lib/schemas"
import { getSunTimes } from "@/lib/utils"

const FORECAST_TIMEOUT_MS = 5000

export async function fetchCurrentWeatherData(): Promise<InstantObservation> {
  const environment = getEnvironment()
  const url = environment.WEATHER_CURRENT_API_URL
  const response = await fetch(url)
  const body = await response.json()
  const validatedResponse = CurrentWeatherApiResponseSchema.parse(body)
  return {
    ...validatedResponse.data,
    sunTimes: getSunTimes(new Date()),
  }
}

export async function fetchLastWeekData(): Promise<WeeklyData> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 5000)

  const environment = getEnvironment()
  const url = environment.WEATHER_DAILY_API_URL
  const response = await fetch(url, {
    signal: controller.signal,
  })
  clearTimeout(timeoutId)
  const body = await response.json()
  const validatedResponse = DailyApiResponseSchema.parse(body)
  const data: DayData[] = mapDailyApiResponse(validatedResponse)
  const ranges: Ranges = calculateRanges(data)

  return { data: data.toReversed(), ranges }
}

export async function fetchHourlyDataRange(start_date: string): Promise<Record<string, DailyData>> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 5000)

  const environment = getEnvironment()
  const baseUrl = environment.WEATHER_HOURLY_API_URL
  // The published document is already bounded to the days the page shows, so it
  // takes no parameters. A live aw2sqlite endpoint does require start_date, and
  // is always identifiable by the tz/q query string it needs anyway — keying on
  // that rather than on the substring "localhost" keeps a LAN address or
  // 127.0.0.1 working too.
  const url = baseUrl.includes("?") ? `${baseUrl}&start_date=${start_date}` : baseUrl
  const response = await fetch(url, {
    signal: controller.signal,
  })
  clearTimeout(timeoutId)
  const body = await response.json()
  const validatedResponse = HourlyApiResponseSchema.parse(body)
  return mapHourlyApiResponse(validatedResponse)
}

/**
 * The published forecast, or a reason it is not available.
 *
 * Never rejects. The forecast is supplementary to the station history, so a
 * publisher that is down, stale, or emitting a shape we do not recognise must
 * degrade to a message inside the Forecast tab rather than take the page with
 * it. The `reason` is how a contract violation stays loud without throwing.
 */
export async function fetchForecastData(now: Date = new Date()): Promise<ForecastFetchResult> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FORECAST_TIMEOUT_MS)

  try {
    const url = getEnvironment().WEATHER_FORECAST_API_URL
    const response = await fetch(url, { signal: controller.signal })
    // A missing branch returns an HTML 404 body, so checking status first turns
    // that into a clear message instead of an opaque JSON parse error.
    if (!response.ok) {
      return { kind: "unavailable", reason: `HTTP ${response.status}` }
    }

    const parsed = ForecastDocumentSchema.safeParse(await response.json())
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      console.warn("forecast document rejected", parsed.error.issues)
      return {
        kind: "unavailable",
        reason: `schema mismatch: ${issue.path.join(".") || "document"}`,
      }
    }

    return { kind: "ok", forecast: mapForecastDocument(parsed.data, now) }
  } catch (error) {
    if (controller.signal.aborted) {
      return { kind: "unavailable", reason: "timed out" }
    }
    console.warn("forecast fetch failed", error)
    return { kind: "unavailable", reason: "network error" }
  } finally {
    // The other fetchers clear this after an await, so a rejection leaks the
    // timer; a finally block is the fix rather than the pattern to copy.
    clearTimeout(timeoutId)
  }
}

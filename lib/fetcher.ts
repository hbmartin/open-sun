import {
  calculateRanges,
  mapDailyApiResponse,
  mapHourlyApiResponse,
} from "@/lib/mappers"
import { getEnvironment } from "@/lib/environment"
import type {
  DailyData,
  DayData,
  InstantObservation,
  Ranges,
  WeeklyData,
} from "./types.ts"
import { getSunTimes } from "@/lib/utils"
import { CurrentWeatherApiResponseSchema, DailyApiResponseSchema, HourlyApiResponseSchema } from "@/lib/schemas"

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

  return { data: data.reverse(), ranges }
}

export async function fetchHourlyDataRange(start_date: string): Promise<Record<string, DailyData>> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 5000)
  
  const environment = getEnvironment()
  const baseUrl = environment.WEATHER_HOURLY_API_URL
  const url = `${baseUrl}&start_date=${start_date}`
  const response = await fetch(url, {
    signal: controller.signal,
  })
  
  clearTimeout(timeoutId)
  const body = await response.json()
  const validatedResponse = HourlyApiResponseSchema.parse(body)
  return mapHourlyApiResponse(validatedResponse)
}
// biome-ignore-all lint/suspicious/noExplicitAny: API calls

import {
  calculateRanges,
  mapDailyApiResponse,
  mapHourlyApiResponse,
} from "@/lib/mappers"
import { getEnvironment } from "@/lib/environment"
import type {
  DailyData,
  DayData,
  HourData,
  InstantObservation,
  Ranges,
  WeeklyData,
} from "./types.ts"

export async function fetchCurrentWeatherData(): Promise<InstantObservation> {
  const environment = getEnvironment()
  const url = environment.WEATHER_CURRENT_API_URL
  const response = await fetch(url)
  const body = await response.json()
  return body.data
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
  const data: DayData[] = body.data.map((item: any) =>
    mapDailyApiResponse(item),
  )
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
  const hourlyDataByDate: Record<string, DailyData> = {}
  
  for (const [date, dayData] of Object.entries(body.data)) {
    const data: (HourData | undefined)[] = (dayData as any[]).map((item: any) =>
      mapHourlyApiResponse(item, date),
    )
    const filteredData = data.filter((d) => d !== undefined) as HourData[]
    const ranges: Ranges = calculateRanges(filteredData)
    
    hourlyDataByDate[date] = { data, ranges }
  }

  return hourlyDataByDate
}
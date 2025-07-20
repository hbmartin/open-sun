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
import { z } from "zod"

const CurrentWeatherApiResponseSchema = z.object({
  data: z.object({
    inTemp: z.number().nullable(),
    inHumi: z.number().nullable(),
    AbsPress: z.number().nullable(),
    RelPress: z.number().nullable(),
    outTemp: z.number(),
    outHumi: z.number(),
    windir: z.number(),
    avgwind: z.number(),
    gustspeed: z.number(),
    dailygust: z.number(),
    solarrad: z.number(),
    uv: z.number(),
    uvi: z.number(),
    pm25: z.number().nullable(),
    rainofhourly: z.number(),
    eventrain: z.number(),
  }),
})

const DailyApiResponseSchema = z.object({
  data: z.array(z.unknown()),
})

const HourlyApiResponseSchema = z.object({
  data: z.record(z.string(), z.array(z.unknown())),
})

export async function fetchCurrentWeatherData(): Promise<InstantObservation> {
  const environment = getEnvironment()
  const url = environment.WEATHER_CURRENT_API_URL
  const response = await fetch(url)
  const body = await response.json()
  const validatedResponse = CurrentWeatherApiResponseSchema.parse(body)
  const { getSunTimes } = await import("@/lib/utils")
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
  const data: DayData[] = validatedResponse.data.map((item) =>
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
  const validatedResponse = HourlyApiResponseSchema.parse(body)
  const hourlyDataByDate: Record<string, DailyData> = {}
  
  for (const [date, dayData] of Object.entries(validatedResponse.data)) {
    const data: (HourData | undefined)[] = dayData.map((item) =>
      mapHourlyApiResponse(item, date),
    )
    const filteredData = data.filter((d) => d !== undefined) as HourData[]
    const ranges: Ranges = calculateRanges(filteredData)
    
    hourlyDataByDate[date] = { data, ranges }
  }

  return hourlyDataByDate
}
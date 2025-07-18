// biome-ignore-all lint/suspicious/noExplicitAny: API calls

import {
  calculateRanges,
  mapDailyApiResponse,
  mapHourlyApiResponse,
} from "@/lib/mappers"
import type {
  DailyData,
  DayData,
  HourData,
  InstantObservation,
  Ranges,
  WeeklyData,
} from "./types.ts"

export async function fetchCurrentWeatherData(): Promise<InstantObservation> {
  const url = process.env["WEATHER_CURRENT_API_URL"] || "http://localhost:8080/"
  const response = await fetch(url)
  const body = await response.json()
  return body.data
}

export async function fetchLastWeekData(): Promise<WeeklyData> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 5000)
  
  const url = process.env["WEATHER_DAILY_API_URL"] || 
    "http://localhost:8080/daily.json?tz=America/Los_Angeles&q=min_outTemp&q=max_outTemp" + 
    "&q=avg_outTemp&q=min_outHumi&q=avg_outHumi&q=max_outHumi&q=max_gustspeed&q=avg_avgwind" + 
    "&q=avg_uvi&q=avg_solarrad&q=avg_rainofhourly&q=min_avgwind&q=max_avgwind" +
    "&q=min_uvi&q=max_uvi&q=min_solarrad&q=max_solarrad"
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

export async function fetchHourlyData(date: string): Promise<DailyData> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 5000)
  
  const baseUrl = process.env["WEATHER_HOURLY_API_URL"] || 
    "http://localhost:8080/hourly.json?tz=America/Los_Angeles&q=min_outTemp&q=max_outTemp&q=min_outHumi&q=max_outHumi&q=max_gustspeed&q=avg_avgwind&q=max_gustspeed&q=avg_rainofhourly&q=avg_outHumi&q=avg_outTemp&q=avg_uvi&q=avg_solarrad&q=min_avgwind&q=max_avgwind&q=min_uvi&q=max_uvi&q=min_solarrad&q=max_solarrad"
  const url = `${baseUrl}&date=${date}`
  const response = await fetch(url, {
    signal: controller.signal,
  })
  
  clearTimeout(timeoutId)
  const body = await response.json()
  const data: (HourData | undefined)[] = body.data.map((item: any) =>
    mapHourlyApiResponse(item, date),
  )
  const filteredData = data.filter((d) => d !== undefined) as HourData[]
  const ranges: Ranges = calculateRanges(filteredData)

  return { data, ranges }
}

export async function fetchHourlyDataRange(start_date: string, end_date: string): Promise<Record<string, DailyData>> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 5000)
  
  const baseUrl = process.env["WEATHER_HOURLY_API_URL"] || 
    "http://localhost:8080/hourly.json?tz=America/Los_Angeles&q=min_outTemp&q=max_outTemp&q=min_outHumi&q=max_outHumi&q=max_gustspeed&q=avg_avgwind&q=max_gustspeed&q=avg_rainofhourly&q=avg_outHumi&q=avg_outTemp&q=avg_uvi&q=avg_solarrad&q=min_avgwind&q=max_avgwind&q=min_uvi&q=max_uvi&q=min_solarrad&q=max_solarrad"
  const url = `${baseUrl}&start_date=${start_date}&end_date=${end_date}`
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
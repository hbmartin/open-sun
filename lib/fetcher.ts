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
import { readFileSync } from "fs"
import { join } from "path"

const isDev = process.env.NODE_ENV === "development"

export const revalidate = 3600 // Revalidate every hour

export async function fetchCurrentWeatherData(): Promise<InstantObservation> {
  if (isDev) {
    const response = await fetch("http://localhost:8080/")
    const body = await response.json()
    return body.data
  } else {
    const staticData = readFileSync(join(process.cwd(), "data", "current.json"), "utf-8")
    const body = JSON.parse(staticData)
    return body.data
  }
}

export async function fetchLastWeekData(): Promise<WeeklyData> {
  if (isDev) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)
    
    const response = await fetch(
      "http://localhost:8080/daily.json?tz=America/Los_Angeles&q=min_outTemp&q=max_outTemp" + 
      "&q=avg_outTemp&q=min_outHumi&q=avg_outHumi&q=max_outHumi&q=max_gustspeed&q=avg_avgwind" + 
      "&q=avg_uvi&q=avg_solarrad&q=avg_rainofhourly&q=min_avgwind&q=max_avgwind" +
      "&q=min_uvi&q=max_uvi&q=min_solarrad&q=max_solarrad",
      {
        signal: controller.signal,
      },
    )
    clearTimeout(timeoutId)
    const body = await response.json()
    const data: DayData[] = body.data.map((item: any) =>
      mapDailyApiResponse(item),
    )
    const ranges: Ranges = calculateRanges(data)

    return { data: data.reverse(), ranges }
  } else {
    const staticData = readFileSync(join(process.cwd(), "data", "daily.json"), "utf-8")
    const body = JSON.parse(staticData)
    const data: DayData[] = body.data.map((item: any) =>
      mapDailyApiResponse(item),
    )
    const ranges: Ranges = calculateRanges(data)

    return { data: data.reverse(), ranges }
  }
}

export async function fetchHourlyData(date: string): Promise<DailyData> {
  if (isDev) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)
    
    const response = await fetch(
      `http://localhost:8080/hourly.json?tz=America/Los_Angeles&date=${date}` + 
      "&q=min_outTemp&q=max_outTemp&q=min_outHumi&q=max_outHumi&q=max_gustspeed&q=avg_avgwind&" + 
      "q=max_gustspeed&q=avg_rainofhourly&q=avg_outHumi&q=avg_outTemp&q=avg_uvi&q=avg_solarrad" +
      "&q=min_avgwind&q=max_avgwind&q=min_uvi&q=max_uvi&q=min_solarrad&q=max_solarrad",
      {
        signal: controller.signal,
      },
    )
    
    clearTimeout(timeoutId)
    const body = await response.json()
    const data: (HourData | undefined)[] = body.data.map((item: any) =>
      mapHourlyApiResponse(item, date),
    )
    const filteredData = data.filter((d) => d !== undefined) as HourData[]
    const ranges: Ranges = calculateRanges(filteredData)

    return { data, ranges }
  } else {
    const staticData = readFileSync(join(process.cwd(), "data", `hourly-${date}.json`), "utf-8")
    const body = JSON.parse(staticData)
    const data: (HourData | undefined)[] = body.data.map((item: any) =>
      mapHourlyApiResponse(item, date),
    )
    const filteredData = data.filter((d) => d !== undefined) as HourData[]
    const ranges: Ranges = calculateRanges(filteredData)

    return { data, ranges }
  }
}

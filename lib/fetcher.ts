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
  const response = await fetch("http://localhost:8080/")
  const body = await response.json()
  return body.data
}

export async function fetchLastWeekData(): Promise<WeeklyData> {
  const response = await fetch(
    "http://localhost:8080/daily.json?tz=America/Los_Angeles&q=min_outTemp&q=max_outTemp" + 
    "&q=avg_outTemp&q=min_outHumi&q=avg_outHumi&q=max_outHumi&q=max_gustspeed&q=avg_avgwind" + 
    "&q=avg_uvi&q=avg_solarrad&q=avg_rainofhourly",
  )
  const body = await response.json()
  const data: DayData[] = body.data.map((item: any) =>
    mapDailyApiResponse(item),
  )
  const ranges: Ranges = calculateRanges(data)

  return { data: data.reverse(), ranges }
}

export async function fetchHourlyData(date: string): Promise<DailyData> {
  const response = await fetch(
    `http://localhost:8080/hourly.json?tz=America/Los_Angeles&date=${date}` + 
    "&q=min_outTemp&q=max_outTemp&q=min_outHumi&q=max_outHumi&q=max_gustspeed&q=avg_avgwind&" + 
    "q=max_gustspeed&q=avg_rainofhourly&q=avg_outHumi&q=avg_outTemp&q=avg_uvi&q=avg_solarrad",
  )
  const body = await response.json()
  const data: (HourData | undefined)[] = body.data.map((item: any) =>
    mapHourlyApiResponse(item, date),
  )
  const filteredData = data.filter((d) => d !== undefined) as HourData[]
  const ranges: Ranges = calculateRanges(filteredData)
  console.log(data)

  return { data, ranges }
}

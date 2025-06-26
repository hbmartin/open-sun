// biome-ignore-all lint/suspicious/noExplicitAny: API calls
import type { DailyData, DayData, HourData, Ranges, WeatherData, WeeklyData } from "./types.ts"

function getAbbreviatedDay(dateString: string): string {
  const date = new Date(dateString)
  const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]
  return days[date.getDay()]
}

export async function fetchCurrentWeatherData(): Promise<WeatherData> {
  const response = await fetch("http://localhost:8080/")
  const body = await response.json()
  return body.data
}

export async function fetchLastWeekData(): Promise<WeeklyData> {
  const response = await fetch(
    "http://localhost:8080/daily.json?q=min_outTemp&q=max_outTemp&q=min_outHumi&q=max_outHumi&q=max_gustspeed&q=avg_avgwind&q=max_gustspeed&q=avg_rainofhourly",
  )
  const body = await response.json()
    // eslint-disable-line @typescript-eslint/no-explicit-any
    const data: DayData[] = body.data.map((item: any) => ({
    day: getAbbreviatedDay(item.date),
    date: item.date,
    min_outTemp: item.min_outTemp,
    max_outTemp: item.max_outTemp,
    min_outHumi: item.min_outHumi,
    max_outHumi: item.max_outHumi,
    max_gustspeed: item.max_gustspeed,
    avg_avgwind: item.avg_avgwind,
    avg_rainofhourly: item.avg_rainofhourly,
  }))
  const ranges: Ranges = {
    min_outTemp: Math.min(...data.map((d) => d.min_outTemp)),
    max_outTemp: Math.max(...data.map((d) => d.max_outTemp)),
    min_outHumi: Math.min(...data.map((d) => d.min_outHumi)),
    max_outHumi: Math.max(...data.map((d) => d.max_outHumi)),
    max_gustspeed: Math.max(...data.map((d) => d.max_gustspeed)),
  }

  return { data: data.reverse(), ranges }
}

export async function fetchHourlyData(date: string): Promise<DailyData> {
    const response = await fetch(
      `http://localhost:8080/hourly.json?date=${date}&q=min_outTemp&q=max_outTemp&q=min_outHumi&q=max_outHumi&q=max_gustspeed&q=avg_avgwind&q=max_gustspeed&q=avg_rainofhourly&q=avg_outHumi&q=avg_outTemp`,
    )
    const body = await response.json()
      // eslint-disable-line @typescript-eslint/no-explicit-any
    const data: HourData[] = body.data.map((item: any) => (item === null ? undefined : {
      date,
      hour: item.hour,
      min_outTemp: item.min_outTemp,
      avg_outTemp: item.avg_outTemp,
      max_outTemp: item.max_outTemp,
      min_outHumi: item.min_outHumi,
      avg_outHumi: item.avg_outHumi,
      max_outHumi: item.max_outHumi,
      max_gustspeed: item.max_gustspeed,
      avg_avgwind: item.avg_avgwind,
      avg_rainofhourly: item.avg_rainofhourly,
    }))
    const filteredData = data.filter((d) => d !== undefined)
    const ranges: Ranges = {
      min_outTemp: Math.min(...filteredData.map((d) => d.min_outTemp)),
      max_outTemp: Math.max(...filteredData.map((d) => d.max_outTemp)),
      min_outHumi: Math.min(...filteredData.map((d) => d.min_outHumi)),
      max_outHumi: Math.max(...filteredData.map((d) => d.max_outHumi)),
      max_gustspeed: Math.max(...filteredData.map((d) => d.max_gustspeed)),
    }
    console.log(data)

    return { data, ranges }
  }

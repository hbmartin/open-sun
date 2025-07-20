// biome-ignore-all lint/suspicious/noExplicitAny: API calls
import type { DayData, HourData, RangeObservation, Ranges } from "@/lib/types"
import { getSunTimes } from "@/lib/utils"

const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]
function getAbbreviatedDay(dateString: string): string {
  const date = new Date(`${dateString}T00:00:00`)
  return days[date.getDay()]
}

export function mapDailyApiResponse(item: any): DayData {
  return {
    day: getAbbreviatedDay(item.date),
    date: item.date,
    min_outTemp: item.min_outTemp,
    avg_outTemp: item.avg_outTemp,
    max_outTemp: item.max_outTemp,
    min_outHumi: item.min_outHumi,
    avg_outHumi: item.avg_outHumi,
    max_outHumi: item.max_outHumi,
    max_gustspeed: item.max_gustspeed,
    min_avgwind: item.min_avgwind,
    max_avgwind: item.max_avgwind,
    avg_avgwind: item.avg_avgwind,
    avg_rainofhourly: item.avg_rainofhourly,
    avg_uvi: item.avg_uvi,
    avg_solarrad: item.avg_solarrad,
    min_uvi: item.min_uvi,
    max_uvi: item.max_uvi,
    min_solarrad: item.min_solarrad,
    max_solarrad: item.max_solarrad,
    sunTimes: getSunTimes(new Date(item.date)),
  }
}

export function mapHourlyApiResponse(
  item: any,
  date: string,
): HourData | undefined {
  if (item === null) return undefined

  return {
    date,
    hour: item.hour,
    min_outTemp: item.min_outTemp,
    avg_outTemp: item.avg_outTemp,
    max_outTemp: item.max_outTemp,
    min_outHumi: item.min_outHumi,
    avg_outHumi: item.avg_outHumi,
    max_outHumi: item.max_outHumi,
    max_gustspeed: item.max_gustspeed,
    min_avgwind: item.min_avgwind,
    max_avgwind: item.max_avgwind,
    avg_avgwind: item.avg_avgwind,
    avg_rainofhourly: item.avg_rainofhourly,
    avg_uvi: item.avg_uvi,
    avg_solarrad: item.avg_solarrad,
    min_uvi: item.min_uvi,
    max_uvi: item.max_uvi,
    min_solarrad: item.min_solarrad,
    max_solarrad: item.max_solarrad,
  }
}

export function calculateRanges(data: RangeObservation[]): Ranges {
  return {
    min_outTemp: Math.min(...data.map((d) => d.min_outTemp)),
    max_outTemp: Math.max(...data.map((d) => d.max_outTemp)),
    min_outHumi: Math.min(...data.map((d) => d.min_outHumi)),
    max_outHumi: Math.max(...data.map((d) => d.max_outHumi)),
    max_gustspeed: Math.max(...data.map((d) => d.max_gustspeed)),
    min_avgwind: Math.min(...data.map((d) => d.min_avgwind)),
    max_avgwind: Math.max(...data.map((d) => d.max_avgwind)),
    min_uvi: Math.min(...data.map((d) => d.min_uvi)),
    max_uvi: Math.max(...data.map((d) => d.max_uvi)),
    min_solarrad: Math.min(...data.map((d) => d.min_solarrad)),
    max_solarrad: Math.max(...data.map((d) => d.max_solarrad)),
  }
}

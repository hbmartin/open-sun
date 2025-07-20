import type { DayData, HourData, RangeObservation, Ranges } from "@/lib/types"
import { getSunTimes } from "@/lib/utils"
import { z } from "zod"

const DailyApiResponseSchema = z.object({
  date: z.string(),
  min_outTemp: z.number(),
  avg_outTemp: z.number(),
  max_outTemp: z.number(),
  min_outHumi: z.number(),
  avg_outHumi: z.number(),
  max_outHumi: z.number(),
  max_gustspeed: z.number(),
  min_avgwind: z.number(),
  max_avgwind: z.number(),
  avg_avgwind: z.number(),
  avg_rainofhourly: z.number(),
  avg_uvi: z.number(),
  avg_solarrad: z.number(),
  min_uvi: z.number(),
  max_uvi: z.number(),
  min_solarrad: z.number(),
  max_solarrad: z.number(),
})

const HourlyApiResponseSchema = z.object({
  hour: z.string(),
  min_outTemp: z.number(),
  avg_outTemp: z.number(),
  max_outTemp: z.number(),
  min_outHumi: z.number(),
  avg_outHumi: z.number(),
  max_outHumi: z.number(),
  max_gustspeed: z.number(),
  min_avgwind: z.number(),
  max_avgwind: z.number(),
  avg_avgwind: z.number(),
  avg_rainofhourly: z.number(),
  avg_uvi: z.number(),
  avg_solarrad: z.number(),
  min_uvi: z.number(),
  max_uvi: z.number(),
  min_solarrad: z.number(),
  max_solarrad: z.number(),
}).nullable()

const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]
function getAbbreviatedDay(dateString: string): string {
  const date = new Date(`${dateString}T00:00:00`)
  return days[date.getDay()]
}

export function mapDailyApiResponse(item: unknown): DayData {
  const validatedItem = DailyApiResponseSchema.parse(item)
  return {
    day: getAbbreviatedDay(validatedItem.date),
    date: validatedItem.date,
    min_outTemp: validatedItem.min_outTemp,
    avg_outTemp: validatedItem.avg_outTemp,
    max_outTemp: validatedItem.max_outTemp,
    min_outHumi: validatedItem.min_outHumi,
    avg_outHumi: validatedItem.avg_outHumi,
    max_outHumi: validatedItem.max_outHumi,
    max_gustspeed: validatedItem.max_gustspeed,
    min_avgwind: validatedItem.min_avgwind,
    max_avgwind: validatedItem.max_avgwind,
    avg_avgwind: validatedItem.avg_avgwind,
    avg_rainofhourly: validatedItem.avg_rainofhourly,
    avg_uvi: validatedItem.avg_uvi,
    avg_solarrad: validatedItem.avg_solarrad,
    min_uvi: validatedItem.min_uvi,
    max_uvi: validatedItem.max_uvi,
    min_solarrad: validatedItem.min_solarrad,
    max_solarrad: validatedItem.max_solarrad,
    sunTimes: getSunTimes(new Date(validatedItem.date)),
  }
}

export function mapHourlyApiResponse(
  item: unknown,
  date: string,
): HourData | undefined {
  const validatedItem = HourlyApiResponseSchema.parse(item)
  if (validatedItem === null) return undefined

  return {
    date,
    hour: validatedItem.hour,
    min_outTemp: validatedItem.min_outTemp,
    avg_outTemp: validatedItem.avg_outTemp,
    max_outTemp: validatedItem.max_outTemp,
    min_outHumi: validatedItem.min_outHumi,
    avg_outHumi: validatedItem.avg_outHumi,
    max_outHumi: validatedItem.max_outHumi,
    max_gustspeed: validatedItem.max_gustspeed,
    min_avgwind: validatedItem.min_avgwind,
    max_avgwind: validatedItem.max_avgwind,
    avg_avgwind: validatedItem.avg_avgwind,
    avg_rainofhourly: validatedItem.avg_rainofhourly,
    avg_uvi: validatedItem.avg_uvi,
    avg_solarrad: validatedItem.avg_solarrad,
    min_uvi: validatedItem.min_uvi,
    max_uvi: validatedItem.max_uvi,
    min_solarrad: validatedItem.min_solarrad,
    max_solarrad: validatedItem.max_solarrad,
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

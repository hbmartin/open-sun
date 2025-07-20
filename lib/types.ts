import type { TimesData } from "@/lib/suncalc"

export interface InstantObservation {
  inTemp: number | null
  inHumi: number | null
  AbsPress: number | null
  RelPress: number | null
  outTemp: number
  outHumi: number
  windir: number
  avgwind: number
  gustspeed: number
  dailygust: number
  solarrad: number
  uv: number
  uvi: number
  pm25: number | null
  rainofhourly: number
  eventrain: number
  sunTimes: TimesData
}

export interface RangeObservation {
  date: string
  min_outTemp: number
  avg_outTemp: number
  max_outTemp: number
  min_outHumi: number
  avg_outHumi: number
  max_outHumi: number
  max_gustspeed: number
  min_avgwind: number
  avg_avgwind: number
  max_avgwind: number
  avg_rainofhourly: number
  min_uvi: number
  avg_uvi: number
  max_uvi: number
  min_solarrad: number
  avg_solarrad: number
  max_solarrad: number
}

export interface DayData extends RangeObservation {
  day: string
  sunTimes: TimesData
}

export interface HourData extends RangeObservation {
  hour: string
}

export interface Ranges {
  min_outTemp: number
  max_outTemp: number
  min_outHumi: number
  max_outHumi: number
  max_gustspeed: number
  min_avgwind: number
  max_avgwind: number
  min_uvi: number
  max_uvi: number
  min_solarrad: number
  max_solarrad: number
}

export interface WeeklyData {
  data: DayData[]
  ranges: Ranges
}

export interface DailyData {
  data: (HourData | undefined)[]
  ranges: Ranges
}

export type WeatherCondition = 
| "cloudy" 
| "drizzle" 
| "rain" 
| "rain-wind" 
| "wind" 
| "sun-dim" 
| "sun-medium" 
| "sunny" 
| "clear-night";

export enum DisplayMetric {
  TEMP = "outTemp",
  HUMID = "outHumi", 
  WIND = "avgwind",
  UVI = "uvi",
  SOLAR = "solarrad"
}

export const metric_display_units: Record<DisplayMetric, string> = {
  [DisplayMetric.TEMP]: "°",
  [DisplayMetric.HUMID]: "%",
  [DisplayMetric.WIND]: "",
  [DisplayMetric.UVI]: "",
  [DisplayMetric.SOLAR]: "",
}

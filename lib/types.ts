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
  avg_avgwind: number
  avg_rainofhourly: number
  avg_uvi: number
  avg_solarrad: number
}

export interface DayData extends RangeObservation {
  day: string
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
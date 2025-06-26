export interface WeatherData {
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

export interface DayData {
  date: string
  day: string
  icon: string
  precipChance: number
  min_outTemp: number
  max_outTemp: number
  min_outHumi: number
  max_outHumi: number
  max_gustspeed: number
  avg_avgwind: number
  avg_rainofhourly: number
  description: string
  hourlyData: HourlyData[]
}

export interface Ranges {
  min_outTemp: number
  max_outTemp: number
  min_outHumi: number
  max_outHumi: number
  max_gustspeed: number
}

export interface WeekData {
  data: DayData[]
  ranges: Ranges
}

export interface HourlyData {
  hour: number
  temp: number
  condition: string
  precipChance: number
  precipIntensity: number // 0-1 scale for color intensity
}

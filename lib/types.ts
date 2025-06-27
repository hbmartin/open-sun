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

export interface Observation {
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
}

export interface DayData extends Observation {
  day: string
}

export interface HourData extends Observation {
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

// Interface for suncalc-ts
export interface TimesData {
  dawn: Date
  dusk: Date
}

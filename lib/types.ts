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

export interface DayForecast {
    day: string
    icon: string
    precipChance: number
    lowTemp: number
    highTemp: number
    date: string
    description: string
    hourlyData: HourlyData[]
}

export interface HourlyData {
    time: string
    temp: number
    condition: string
    precipChance: number
    precipIntensity: number // 0-1 scale for color intensity
}

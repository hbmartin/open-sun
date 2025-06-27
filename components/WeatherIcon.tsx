import { Cloud, CloudDrizzle, CloudRain, CloudRainWind, Moon, Sun, SunDim, SunMedium, Wind } from "lucide-react"
import type React from "react"
import { useMemo } from "react"
import type { RangeObservation, WeatherCondition } from "@/lib/types"
import { mapWeatherToCondition } from "@/lib/weather-conditions"

const iconMap: Record<WeatherCondition, [React.ElementType, string]> = {
  cloudy: [Cloud, "text-gray-500"],
  drizzle: [CloudDrizzle, "text-blue-400"],
  rain: [CloudRain, "text-blue-500"],
  "rain-wind": [CloudRainWind, "text-blue-600"],
  wind: [Wind, "text-gray-400"],
  "sun-dim": [SunDim, "text-yellow-600"],
  "sun-medium": [SunMedium, "text-yellow-500"], 
  sunny: [Sun, "text-yellow-400"],
  "clear-night": [Moon, "text-gray-300"],
}

export default function WeatherIcon({
  data,
  size = 24,
}: {
  data: RangeObservation
  size?: number
}): React.JSX.Element {
  const condition = useMemo(() => mapWeatherToCondition(data), [data])
  const [Icon, color] = iconMap[condition]
  return <Icon size={size} className={color} />
}

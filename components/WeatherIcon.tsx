import type { WeatherCondition } from "@/lib/types"
import type React from "react"
import {
  Cloud,
  CloudDrizzle,
  CloudRain,
  CloudRainWind,
  Moon,
  Sun,
  SunDim,
  SunMedium,
  Wind,
} from "lucide-react"

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

// Takes a condition rather than an observation so the same icon set serves both
// station history and forecast rows, whose shapes have nothing in common.
export default function WeatherIcon({
  condition,
  size = 24,
}: {
  condition: WeatherCondition
  size?: number
}): React.JSX.Element {
  const [Icon, color] = iconMap[condition]
  return <Icon size={size} className={color} />
}

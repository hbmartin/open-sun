import type React from "react"
import { Cloud, CloudRain, CloudSnow, Sun } from "lucide-react"

export default function WeatherIcon({
  type,
  size = 24,
}: {
  type: string
  size?: number
}): React.JSX.Element {
  const iconProps = { size, className: "text-orange-500" }

  switch (type) {
    case "sunny":
      return <Sun {...iconProps} className="text-yellow-500" />
    case "partly-cloudy":
      return <Cloud {...iconProps} className="text-gray-500" />
    case "rainy":
      return <CloudRain {...iconProps} className="text-blue-500" />
    case "snowy":
      return <CloudSnow {...iconProps} className="text-blue-300" />
    default:
      return <Sun {...iconProps} />
  }
}

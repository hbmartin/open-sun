import { Cloud, CloudRain, CloudSnow, Sun } from "lucide-react"
import type React from "react"

export default function WeatherIcon({
  type,
  size = 24,
}: {
  type: string
  size?: number
}): React.JSX.Element {
  const iconProperties = { size, className: "text-orange-500" }

  switch (type) {
    case "sunny": {
      return <Sun {...iconProperties} className="text-yellow-500" />
    }
    case "partly-cloudy": {
      return <Cloud {...iconProperties} className="text-gray-500" />
    }
    case "rainy": {
      return <CloudRain {...iconProperties} className="text-blue-500" />
    }
    case "snowy": {
      return <CloudSnow {...iconProperties} className="text-blue-300" />
    }
    default: {
      return <Sun {...iconProperties} />
    }
  }
}

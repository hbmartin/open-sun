import type { HourlyData } from "@/lib/types"
import type React from "react"

export default function HourlyRow({
  hour,
  minTemp = 70,
  maxTemp = 95,
}: {
  hour: HourlyData
  minTemp?: number
  maxTemp?: number
}): React.JSX.Element {
  // Calculate temperature position (0-100%)
  const tempRange = maxTemp - minTemp
  const tempPosition = ((hour.temp - minTemp) / tempRange) * 100

  // Calculate rain color intensity
  const getRainColor = (intensity: number) => {
    if (intensity === 0) return "bg-gray-200"
    if (intensity <= 0.2) return "bg-blue-200"
    if (intensity <= 0.4) return "bg-blue-300"
    if (intensity <= 0.6) return "bg-blue-400"
    if (intensity <= 0.8) return "bg-blue-500"
    return "bg-blue-600"
  }

  return (
    <div className="flex items-center border-b border-gray-100 last:border-b-0 relative">
      {/* Rain intensity bar */}
      <div
        className={`w-1 h-full absolute left-0 ${getRainColor(hour.precipIntensity)}`}
      />

      <div className="flex items-center w-full pl-4 pr-4 py-3">
        <div className="w-16 text-sm font-semibold text-gray-900">
          {hour.time}
        </div>

        <div className="flex-1 px-3">
          {hour.condition && (
            <div className="text-sm text-gray-700 mb-1">{hour.condition}</div>
          )}
          {hour.precipChance > 0 && (
            <div className="text-xs text-gray-500">({hour.precipChance}%)</div>
          )}
        </div>

        {/* Temperature positioning area */}
        <div className="relative w-24 h-12 flex items-center">
          <div
            className="absolute w-10 h-10 bg-gray-700 rounded-full flex items-center justify-center transition-all duration-300"
            style={{
              left: `${Math.max(0, Math.min(56, (tempPosition / 100) * 56))}px`,
            }}
          >
            <span className="text-white text-sm font-medium">{hour.temp}°</span>
          </div>
        </div>
      </div>
    </div>
  )
}

import type React from "react"
import { useMemo } from "react"

export default function RangedBar({
  low,
  high,
  minTemp,
  maxTemp,
  unit,
}: {
  low: number
  high: number
  minTemp: number
  maxTemp: number
  unit: string
}): React.JSX.Element {

  const { lowPercent, highPercent, barWidth } = useMemo(() => {
    const range = maxTemp - minTemp
    const lowPercent = ((low - minTemp) / range) * 100
    const highPercent = ((high - minTemp) / range) * 100
    const barWidth = highPercent - lowPercent
    return { lowPercent, highPercent, barWidth }
  }, [low, high, minTemp, maxTemp])

  return (
    <div className="relative flex-1 h-6 inline-flex ml-12 mr-6 items-center">
      <span
        className="text-sm font-medium text-gray-700 absolute pr-1 transition-all duration-300 ease-out"
        style={{
          right: `${100 - lowPercent}%`,
        }}
      >
        {Math.round(low)}
        {unit}
      </span>
      <div
        className="absolute h-full range-bar rounded-full transition-all duration-300 ease-out"
        style={{
          left: `${lowPercent}%`,
          width: `${barWidth}%`,
        }}
      />
      <span
        className="text-sm font-medium text-gray-900 absolute pl-1 transition-all duration-300 ease-out"
        style={{
          left: `${highPercent}%`,
        }}
      >
        {Math.round(high)}{unit}
      </span>
    </div>
  )
}

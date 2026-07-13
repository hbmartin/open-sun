import type React from "react"
import { getRangePosition } from "@/lib/utils"

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
  const lowPercent = getRangePosition(low, minTemp, maxTemp)
  const highPercent = getRangePosition(high, minTemp, maxTemp)
  const barWidth = highPercent - lowPercent

  return (
    <div className="relative flex-1 h-6 inline-flex ml-12 mr-6 items-center">
      <span
        className="text-sm font-medium text-gray-700 dark:text-gray-300 absolute pr-1 transition-all duration-300 ease-out"
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
        className="text-sm font-medium text-gray-900 dark:text-gray-100 absolute pl-1 transition-all duration-300 ease-out"
        style={{
          left: `${highPercent}%`,
        }}
      >
        {Math.round(high)}{unit}
      </span>
    </div>
  )
}

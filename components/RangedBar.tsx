import type React from "react"

export default function RangedBar({
  low,
  high,
  minTemp,
  maxTemp,
}: {
  low: number
  high: number
  minTemp: number
  maxTemp: number
}): React.JSX.Element {
  const range = maxTemp - minTemp
  const lowPercent = ((low - minTemp) / range) * 100
  const highPercent = ((high - minTemp) / range) * 100
  const barWidth = highPercent - lowPercent

  return (
    <div className="relative flex-1 h-6 inline-flex ml-12 mr-6 items-center">
      <span
        className="text-sm font-medium text-gray-700 absolute pr-1"
        style={{
          right: `${100 - lowPercent}%`,
        }}
      >
        {Math.round(low)}°
      </span>
      <div
        className="absolute h-full range-bar rounded-full"
        style={{
          left: `${lowPercent}%`,
          width: `${barWidth}%`,
        }}
      />
      <span
        className="text-sm font-medium text-gray-900 absolute pl-1"
        style={{
          left: `${highPercent}%`,
        }}
      >
        {Math.round(high)}°
      </span>
    </div>
  )
}

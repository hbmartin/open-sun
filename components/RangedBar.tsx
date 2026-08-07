import type React from "react"
import { formatMetricValue, getRangePosition } from "@/lib/utils"

/** The uncertainty interval, drawn behind the range bar. */
function BandOverlay({
  low,
  high,
  minimum,
  maximum,
}: {
  low?: number
  high?: number
  minimum: number
  maximum: number
}): React.JSX.Element | undefined {
  if (low === undefined || high === undefined) {
    return undefined
  }
  const lowPercent = getRangePosition(low, minimum, maximum)
  const highPercent = getRangePosition(high, minimum, maximum)
  return (
    <div
      className="absolute h-full range-bar-band rounded-full transition-all duration-300 ease-out"
      style={{
        left: `${lowPercent}%`,
        width: `${highPercent - lowPercent}%`,
      }}
    />
  )
}

export default function RangedBar({
  low,
  high,
  minTemp,
  maxTemp,
  unit,
  precision = 0,
  bandLow,
  bandHigh,
}: {
  low: number
  high: number
  minTemp: number
  maxTemp: number
  unit: string
  /** Decimal places for the end labels; precipitation needs more than zero. */
  precision?: number
  /** Optional uncertainty interval, drawn behind the bar. */
  bandLow?: number
  bandHigh?: number
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
        {formatMetricValue(low, precision)}
        {unit}
      </span>
      <BandOverlay low={bandLow} high={bandHigh} minimum={minTemp} maximum={maxTemp} />
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
        {formatMetricValue(high, precision)}
        {unit}
      </span>
    </div>
  )
}

import type { QuantileBand } from "@/lib/quantiles"
import type React from "react"
import { formatMetricValue, getRangePosition } from "@/lib/utils"

const band_coverage_classes: Record<number, string> = {
  0.9: "range-bar-band-90",
  0.6: "range-bar-band-60",
  0.3: "range-bar-band-30",
}

const no_bands: QuantileBand[] = []

/** The nested uncertainty intervals, drawn behind the range bar. */
function BandOverlays({
  bands,
  minimum,
  maximum,
}: {
  bands: QuantileBand[]
  minimum: number
  maximum: number
}): React.JSX.Element[] {
  // Bands arrive widest first, so DOM order paints narrower bands on top.
  return bands.map((band) => {
    const lowPercent = getRangePosition(band.low, minimum, maximum)
    const highPercent = getRangePosition(band.high, minimum, maximum)
    const colorClass = band_coverage_classes[band.coverage] ?? "range-bar-band-60"
    return (
      <div
        key={band.coverage}
        className={`absolute h-full ${colorClass} rounded-full transition-all duration-300 ease-out`}
        style={{
          left: `${lowPercent}%`,
          width: `${highPercent - lowPercent}%`,
        }}
      />
    )
  })
}

export default function RangedBar({
  low,
  high,
  minTemp,
  maxTemp,
  unit,
  precision = 0,
  bands = no_bands,
}: {
  low: number
  high: number
  minTemp: number
  maxTemp: number
  unit: string
  /** Decimal places for the end labels; precipitation needs more than zero. */
  precision?: number
  /** Optional uncertainty intervals, widest first, drawn behind the bar. */
  bands?: QuantileBand[]
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
      <BandOverlays bands={bands} minimum={minTemp} maximum={maxTemp} />
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

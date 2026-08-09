import type { ForecastData, ForecastFetchResult, ForecastMetric, ForecastRanges } from "@/lib/types"
import type React from "react"
import { Droplets } from "lucide-react"
import { useState } from "react"
import ForecastHourlyContainer from "@/components/ForecastHourlyContainer"
import RangedBar from "@/components/RangedBar"
import WeatherIcon from "@/components/WeatherIcon"
import { mapForecastToCondition } from "@/lib/forecast-conditions"
import { forecast_metric_display_units, forecast_metric_precision } from "@/lib/types"
import { formatMetricValue, formatStationDateTime } from "@/lib/utils"

function ProvenanceLine({ forecast }: { forecast: ForecastData }): React.JSX.Element {
  const isSuspect = forecast.status === "degraded" || forecast.freshness !== "fresh"
  // An absolute stamp rather than an age: this renders once per ISR revalidation
  // and would otherwise sit here claiming "5m ago" for the rest of the hour.
  const parts = [`Last updated: ${formatStationDateTime(new Date(forecast.issuedAt))}`]
  if (forecast.status === "degraded") {
    parts.push(`degraded: ${forecast.statusReason ?? "no backtest evidence"}`)
  } else if (forecast.freshness === "expired") {
    parts.push("publisher may be down")
  }

  return (
    <p
      className={`text-xs mb-2 ${
        isSuspect ? "text-amber-600 dark:text-amber-400" : "text-gray-500 dark:text-gray-400"
      }`}
    >
      {parts.join(" · ")}
    </p>
  )
}

function DayValue({
  low,
  high,
  ranges,
  metric,
  unit,
  precision,
}: {
  low: number | undefined
  high: number | undefined
  ranges: ForecastRanges
  metric: ForecastMetric
  unit: string
  precision: number
}): React.JSX.Element {
  if (low === undefined || high === undefined) {
    return (
      <span className="flex-1 ml-12 mr-6 text-sm text-gray-400 dark:text-gray-600">No value</span>
    )
  }
  if (low === high) {
    // A zero-width range would stack both labels at the same position; one
    // value reads better than two on top of each other. Common for probability
    // of precipitation when the row carries no quantiles.
    return (
      <span className="flex-1 ml-12 mr-6 text-sm font-medium text-gray-900 dark:text-gray-100">
        {formatMetricValue(low, precision)}
        {unit}
      </span>
    )
  }
  return (
    <RangedBar
      low={low}
      high={high}
      minTemp={ranges[`min_${metric}`]}
      maxTemp={ranges[`max_${metric}`]}
      unit={unit}
      precision={precision}
    />
  )
}

export default function ForecastWeather({
  metric,
  forecast,
}: {
  metric: ForecastMetric
  forecast: ForecastFetchResult
}): React.JSX.Element {
  const [expandedDayIndex, setExpandedDayIndex] = useState<Set<number>>(new Set())

  const handleDayClick = (index: number) => {
    setExpandedDayIndex((previous) => {
      const newSet = new Set(previous)
      if (previous.has(index)) {
        newSet.delete(index)
      } else {
        newSet.add(index)
      }
      return newSet
    })
  }

  if (forecast.kind === "unavailable") {
    return (
      <div className="px-4">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Next 10 Days</h2>
        <div className="text-center text-gray-500 dark:text-gray-400 py-8">
          Forecast unavailable.
          <div className="text-sm mt-1">{forecast.reason}</div>
        </div>
      </div>
    )
  }

  const unit = forecast_metric_display_units[metric]
  const precision = forecast_metric_precision[metric]

  return (
    <div className="px-4">
      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Next 10 Days</h2>
      <ProvenanceLine forecast={forecast.forecast} />

      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm overflow-hidden">
        {forecast.forecast.days.map((day, index) => {
          const low = day[`min_${metric}`]
          const high = day[`max_${metric}`]
          const hasHours = day.hours.some((hour) => hour !== undefined)

          let dayLabelClass = "text-gray-400 dark:text-gray-600"
          if (hasHours) {
            dayLabelClass = day.hasEvidence
              ? "text-gray-900 dark:text-gray-100"
              : "text-gray-400 dark:text-gray-500"
          }

          const rowContent = (
            <>
              <div className="flex flex-col w-14">
                <div className={`text-base font-semibold text-left ${dayLabelClass}`}>
                  {index === 0 ? "TDY" : day.day}
                </div>
                <div className="flex space-x-1">
                  <Droplets size={14} className="text-blue-400" />
                  <span className="text-xs text-blue-500 dark:text-blue-400 font-medium">
                    {day.pop === undefined ? "—" : `${Math.round(day.pop)}%`}
                  </span>
                </div>
              </div>
              <WeatherIcon
                condition={mapForecastToCondition({
                  pop: day.pop,
                  precip: day.precipSum,
                  humidity: day.humidity,
                  wind: day.wind,
                  isDaytime: true,
                })}
                size={30}
              />
              <DayValue
                low={low}
                high={high}
                ranges={forecast.forecast.ranges}
                metric={metric}
                unit={unit}
                precision={precision}
              />
            </>
          )

          const rowClass =
            "w-full flex items-center px-4 py-3 border-b border-gray-100 dark:border-gray-800 transition-colors"

          return (
            <div key={day.date}>
              {hasHours ? (
                <button
                  type="button"
                  onClick={() => handleDayClick(index)}
                  aria-expanded={expandedDayIndex.has(index)}
                  aria-controls={`forecast-hourly-${day.date}`}
                  aria-label={`Toggle hourly detail for ${index === 0 ? "today" : day.day}${
                    day.hasEvidence ? "" : ", unvalidated"
                  }`}
                  className={rowClass}
                >
                  {rowContent}
                </button>
              ) : (
                // No hourly rows means expanding has nothing to show, so the
                // row is inert and its day label grays out to say so.
                <div className={rowClass}>{rowContent}</div>
              )}

              {hasHours && (
                <div
                  id={`forecast-hourly-${day.date}`}
                  className={`overflow-hidden transition-all duration-300 ease-out ${
                    expandedDayIndex.has(index) ? "max-h-screen" : "max-h-0"
                  }`}
                >
                  <ForecastHourlyContainer
                    day={day}
                    metric={metric}
                    hourRanges={forecast.forecast.hourRanges}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

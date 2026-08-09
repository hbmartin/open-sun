import type { ForecastHourData, ForecastMetric } from "@/lib/types"
import type React from "react"
import WeatherIcon from "@/components/WeatherIcon"
import { mapForecastToColor, mapForecastToCondition } from "@/lib/forecast-conditions"
import { forecast_metric_precision } from "@/lib/types"
import { formatHour, formatMetricValue, getRangePosition } from "@/lib/utils"

/** Below this the hour reads as dry, and the row shows wind instead of rain. */
const RAIN_VISIBLE_IN = 0.01

export default function ForecastHourlyDetail({
  hourly_data,
  metric,
  minTemp,
  maxTemp,
}: {
  hourly_data: (ForecastHourData | undefined)[]
  metric: ForecastMetric
  minTemp: number
  maxTemp: number
}): React.JSX.Element {
  const precision = forecast_metric_precision[metric]

  return (
    <div className="bg-gray-50 dark:bg-gray-950 transition-all duration-500 ease-in-out border-b border-gray-200 dark:border-gray-800 ">
      <div className="py-4">
        <div className="relative">
          {[...Array.from({ length: 12 }).keys()].map((index) => {
            const hour = hourly_data[index * 2]
            if (hour === undefined) {
              return
            }
            const value = hour[metric]
            // Rain and wind share one line so the row stays two lines tall inside its
            // fixed 60px; a third line overflows and collides with the next hour's label.
            const segments: string[] = []
            if (hour.precip !== undefined && hour.precip >= RAIN_VISIBLE_IN) {
              segments.push(`${hour.precip.toFixed(2)}"`)
            }
            if (hour.wind !== undefined) {
              segments.push(`${Math.round(hour.wind)} mph`)
            }
            // A dry hour with no wind reading still needs to read as dry, not as blank.
            const conditionLine = segments.length === 0 ? '0"' : segments.join(" · ")
            return (
              <div
                key={`${hour.hour} ${hour.date}`}
                className="flex items-center relative"
                style={{ height: "60px" }}
              >
                <div
                  className="absolute left-0 w-4"
                  style={{
                    height: "60px",
                    top: 0,
                    background: `linear-gradient(to bottom, ${mapForecastToColor(hour)} 50%, ${mapForecastToColor(hourly_data[index * 2 + 1] || hour)} 50%)`,
                  }}
                />

                <div className="flex items-center justify-between w-full ml-6 py-3">
                  <div className="w-32">
                    <div className="font-semibold text-gray-900 dark:text-gray-100">
                      {formatHour(hour.hour)}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 mt-1 flex items-center gap-1 whitespace-nowrap">
                      <WeatherIcon condition={mapForecastToCondition(hour)} size={15} />
                      <span>{conditionLine}</span>
                    </div>
                  </div>

                  <div className="relative w-full h-10 flex items-center mx-4">
                    {value === undefined ? (
                      <span className="text-sm text-gray-400 dark:text-gray-600">—</span>
                    ) : (
                      <div
                        className="absolute bg-gray-700 dark:bg-gray-300 text-white dark:text-gray-900 rounded-full size-10 flex items-center justify-center font-medium text-sm transition-all duration-300 ease-out"
                        style={{
                          left: `${getRangePosition(value, minTemp, maxTemp)}%`,
                          transform: "translateX(-50%)",
                        }}
                      >
                        {formatMetricValue(value, precision)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

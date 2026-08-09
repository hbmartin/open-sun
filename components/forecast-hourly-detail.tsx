import type { ForecastHourData, ForecastMetric } from "@/lib/types"
import type React from "react"
import WeatherIcon from "@/components/WeatherIcon"
import { mapForecastToColor, mapForecastToCondition } from "@/lib/forecast-conditions"
import { forecast_metric_precision } from "@/lib/types"
import { formatHour, formatMetricValue, getRangePosition } from "@/lib/utils"

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
                  <div className="w-20">
                    <div className="font-semibold text-gray-900 dark:text-gray-100">
                      {formatHour(hour.hour)}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 mt-1 flex items-center gap-1">
                      <WeatherIcon condition={mapForecastToCondition(hour)} size={15} />
                      <span>
                        {hour.precip !== undefined && hour.precip > 0.005
                          ? hour.precip.toFixed(2)
                          : 0}
                        &quot;
                      </span>
                    </div>
                    {/* Wind accompanies every hour regardless of the selected
                        metric, matching the precip line above. */}
                    <div className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
                      {hour.wind === undefined ? "" : `${Math.round(hour.wind)} mph`}
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

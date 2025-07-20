import type React from "react"
import WeatherIcon from "@/components/WeatherIcon"
import type { DisplayMetric, HourData } from "@/lib/types"
import { formatHour } from "@/lib/utils"
import { mapWeatherToColor } from "@/lib/weather-conditions"

export default function HourlyDetailInline({
  hourly_data,
  metric,
  minTemp,
  maxTemp,
}: {
  hourly_data: (HourData | undefined)[]
  metric: DisplayMetric
  minTemp: number
  maxTemp: number
}): React.JSX.Element {
  if (hourly_data === undefined) {
    return <div>No data</div>
  }
  return (
    <div className="bg-gray-50 transition-all duration-500 ease-in-out border-b border-gray-200 ">
      <div className="py-4">
        <div className="relative">
          {[...Array.from({ length: 12 }).keys()].map((index) => {
            const hour = hourly_data[index * 2]
            if (hour === undefined) {
              return
            }
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
                    background: `linear-gradient(to bottom, ${mapWeatherToColor(hour)} 50%, ${mapWeatherToColor(hourly_data[(index * 2) + 1] || hour)} 50%)`,
                  }}
                />

                <div className="flex items-center justify-between w-full ml-6 py-3">
                  <div className="w-16">
                    <div className="font-semibold text-gray-900">
                      {formatHour(hour.hour)}
                    </div>
                    <div className="text-sm text-gray-600 mt-1 flex items-center gap-1">
                      <WeatherIcon data={hour} size={15} />
                      <span>{hour.avg_rainofhourly > 0.005 ? hour.avg_rainofhourly.toFixed(2) : 0}&quot;</span>
                    </div>
                  </div>

                  <div className="relative w-full h-10 flex items-center mx-4">
                    <div
                      className="absolute bg-gray-700 text-white rounded-full size-10 flex items-center justify-center font-medium text-sm transition-all duration-300 ease-out"
                      style={{
                        left: `${((hour[`avg_${metric}`] - minTemp) / (maxTemp - minTemp)) * 100}%`,
                        transform: "translateX(-50%)",
                      }}
                    >
                      {Math.round(hour[`avg_${metric}`])}
                    </div>
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

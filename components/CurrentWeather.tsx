import type React from "react"
import type { InstantObservation } from "@/lib/types"

interface CurrentWeatherProperties {
  currentWeatherData: InstantObservation
}

export default function CurrentWeather({
  currentWeatherData,
}: CurrentWeatherProperties): React.JSX.Element {
  return (
    <div className="px-4 py-2 bg-white dark:bg-gray-900 mx-4 rounded-lg shadow-sm mb-4">
      <div className="grid grid-cols-4 gap-2">
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {currentWeatherData.outTemp === undefined
              ? "..."
              : Math.round(currentWeatherData.outTemp)}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">°F</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {currentWeatherData.outHumi === undefined
              ? "..."
              : Math.round(currentWeatherData.outHumi)}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">%</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {currentWeatherData.avgwind === undefined
              ? "..."
              : Math.round(currentWeatherData.avgwind)}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">MPH</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {currentWeatherData.uvi === undefined
              ? "..."
              : Math.round(currentWeatherData.uvi)}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">UVI</div>
        </div>
      </div>
    </div>
  )
}

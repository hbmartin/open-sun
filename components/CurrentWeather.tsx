import React from "react"
import { fetchCurrentWeatherData } from "@/lib/fetcher"
import { useQuery } from "@tanstack/react-query"

export default function CurrentWeather(): React.JSX.Element {
  const { data: currentWeatherData } = useQuery({
    queryKey: ["currentWeatherData"],
    queryFn: fetchCurrentWeatherData,
  })
  return (
    <div className="px-4 py-2 bg-white mx-4 rounded-lg shadow-sm mb-4">
      <div className="grid grid-cols-4 gap-2">
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900">
            {currentWeatherData?.outTemp === undefined
              ? "..."
              : Math.round(currentWeatherData.outTemp)}
          </div>
          <div className="text-sm text-gray-500">°F</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900">
            {currentWeatherData?.outHumi === undefined
              ? "..."
              : Math.round(currentWeatherData.outHumi)}
          </div>
          <div className="text-sm text-gray-500">%</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900">
            {currentWeatherData?.avgwind === undefined
              ? "..."
              : Math.round(currentWeatherData.avgwind)}
          </div>
          <div className="text-sm text-gray-500">MPH</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900">
            {currentWeatherData?.uvi === undefined
              ? "..."
              : Math.round(currentWeatherData.uvi)}
          </div>
          <div className="text-sm text-gray-500">UVI</div>
        </div>
      </div>
    </div>
  )
}

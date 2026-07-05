"use client"

import type React from "react"
import { Clock, Eye, Library, Wind } from "lucide-react"
import { useCallback, useState } from "react"
import CurrentWeather from "@/components/CurrentWeather"
import SunInfo from "@/components/SunInfo"
import WeeklyWeather from "@/components/WeeklyWeather"
import { type DailyData, DisplayMetric, type InstantObservation, type WeeklyData } from "@/lib/types"

const tab_names: Record<DisplayMetric, string> = {
  [DisplayMetric.TEMP]: "TEMP (°F)",
  [DisplayMetric.HUMID]: "HUMID (%)",
  [DisplayMetric.WIND]: "WIND (MPH)",
  [DisplayMetric.UVI]: "UV INDEX",
  [DisplayMetric.SOLAR]: "SOLAR RAD",
}
const navItems = ["History", "Forecast", "Notifications"]
const iconMap: Record<string, React.ElementType> = {
  Forecast: Eye,
  History: Library,
  Notifications: Clock,
}

interface WeatherAppProperties {
  currentWeatherData: InstantObservation
  lastWeekData: WeeklyData
  hourlyDataByDate: Record<string, DailyData>
  currentDate: Date
}

export default function WeatherApp({
  currentWeatherData,
  lastWeekData,
  hourlyDataByDate,
  currentDate,
}: WeatherAppProperties) {
  const [activeTab, setActiveTab] = useState<DisplayMetric>(DisplayMetric.TEMP)
  const [activeNavItem, setActiveNavItem] = useState("History")
  const handleMetricTabClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      setActiveTab(event.currentTarget.value as DisplayMetric)
    },
    [],
  )
  const handleNavItemClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      setActiveNavItem(event.currentTarget.value)
    },
    [],
  )

  return (
    <div className="min-h-screen bg-gray-50 max-w-sm mx-auto relative">
      <div className="px-4 pt-2 mb-2">
        <div className="flex space-x-6 border-b border-gray-200">
          {Object.values(DisplayMetric).map(tab => (
            <button
              type="button"
              key={tab}
              value={tab}
              onClick={handleMetricTabClick}
              className={`pb-2 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? "text-orange-500 border-b-2 border-orange-500"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab_names[tab]}
            </button>
          ))}
        </div>
      </div>

      <CurrentWeather currentWeatherData={currentWeatherData} />
      <SunInfo currentDate={currentDate} timesData={currentWeatherData.sunTimes} />
      <WeeklyWeather metric={activeTab} lastWeekData={lastWeekData} hourlyDataByDate={hourlyDataByDate} />

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-sm bg-white border-t border-gray-200">
        <div className="flex justify-around py-2">
          {navItems.map((item) => {
            const IconComponent = iconMap[item] ?? Wind

            return (
              <button
                type="button"
                key={item}
                value={item}
                onClick={handleNavItemClick}
                className={`flex flex-col items-center py-2 px-4 transition-colors ${
                  activeNavItem === item
                    ? "text-blue-500"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <IconComponent size={20} />
                <span className="text-xs mt-1">{item}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Bottom padding to account for fixed navigation */}
      <div className="h-16" />
    </div>
  )
}

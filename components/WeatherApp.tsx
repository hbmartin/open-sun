"use client"

import type React from "react"
import { Clock, Eye, Library, Wind } from "lucide-react"
import { useId, useRef, useState } from "react"
import CurrentWeather from "@/components/CurrentWeather"
import SunInfo from "@/components/SunInfo"
import ThemeToggle from "@/components/ThemeToggle"
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
  hourlyDataByDate: Partial<Record<string, DailyData>>
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
  const tabs = Object.values(DisplayMetric)
  const tabReferences = useRef<(HTMLButtonElement | null)[]>([])
  const panelId = useId()

  const handleTabKeyDown = (event: React.KeyboardEvent, index: number) => {
    let nextIndex: number | undefined
    switch (event.key) {
    case "ArrowRight": {
      nextIndex = (index + 1) % tabs.length
    
    break
    }
    case "ArrowLeft": {
      nextIndex = (index - 1 + tabs.length) % tabs.length
    
    break
    }
    case "Home": {
      nextIndex = 0
    
    break
    }
    case "End": {
      nextIndex = tabs.length - 1
    
    break
    }
    // No default
    }
    if (nextIndex === undefined) {
      return
    }
    event.preventDefault()
    setActiveTab(tabs[nextIndex])
    tabReferences.current[nextIndex]?.focus()
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 max-w-sm md:max-w-2xl mx-auto relative">
      <div className="flex items-center justify-between px-4 pt-3">
        <h1 className="text-base font-bold text-gray-900 dark:text-gray-100">Open Sun</h1>
        <ThemeToggle />
      </div>

      <div className="px-4 pt-2 mb-2">
        <div
          role="tablist"
          aria-label="Weather metric"
          className="flex space-x-6 border-b border-gray-200 dark:border-gray-800"
        >
          {tabs.map((tab, index) => (
            <button
              type="button"
              key={tab}
              role="tab"
              id={`tab-${tab}`}
              aria-selected={activeTab === tab}
              aria-controls={panelId}
              tabIndex={activeTab === tab ? 0 : -1}
              ref={(element) => {
                tabReferences.current[index] = element
              }}
              onClick={() => setActiveTab(tab)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
              className={`pb-2 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? "text-orange-500 border-b-2 border-orange-500"
                  : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >
              {tab_names[tab]}
            </button>
          ))}
        </div>
      </div>

      <CurrentWeather currentWeatherData={currentWeatherData} />
      <SunInfo currentDate={currentDate} timesData={currentWeatherData.sunTimes} />

      <div id={panelId} role="tabpanel" aria-labelledby={`tab-${activeTab}`}>
        <WeeklyWeather metric={activeTab} lastWeekData={lastWeekData} hourlyDataByDate={hourlyDataByDate} />
      </div>

      <nav
        aria-label="Views"
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-sm md:max-w-2xl bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800"
      >
        <div className="flex justify-around py-2">
          {navItems.map((item) => {
            const IconComponent = iconMap[item] ?? Wind
            const isActive = activeNavItem === item

            return (
              <button
                type="button"
                key={item}
                aria-current={isActive ? "page" : undefined}
                onClick={() => setActiveNavItem(item)}
                className={`flex flex-col items-center py-2 px-4 transition-colors ${
                  isActive
                    ? "text-blue-500"
                    : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                }`}
              >
                <IconComponent size={20} />
                <span className="text-xs mt-1">{item}</span>
              </button>
            )
          })}
        </div>
      </nav>

      {/* Bottom padding to account for fixed navigation */}
      <div className="h-16" />
    </div>
  )
}

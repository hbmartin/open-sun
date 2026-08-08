"use client"

import type { DailyData, ForecastFetchResult, InstantObservation, WeeklyData } from "@/lib/types"
import type React from "react"
import { Clock, Eye, Library } from "lucide-react"
import { useId, useState } from "react"
import CurrentWeather from "@/components/CurrentWeather"
import ForecastWeather from "@/components/ForecastWeather"
import MetricTabs from "@/components/MetricTabs"
import NextHours from "@/components/NextHours"
import SunInfo from "@/components/SunInfo"
import ThemeToggle from "@/components/ThemeToggle"
import WeeklyWeather from "@/components/WeeklyWeather"
import { DisplayMetric, ForecastMetric } from "@/lib/types"

const tab_names: Record<DisplayMetric, string> = {
  [DisplayMetric.TEMP]: "TEMP (°F)",
  [DisplayMetric.HUMID]: "HUMID (%)",
  [DisplayMetric.WIND]: "WIND (MPH)",
  [DisplayMetric.UVI]: "UV INDEX",
  [DisplayMetric.SOLAR]: "SOLAR RAD",
}

// The forecast carries no UV index or solar radiation. Humidity and wind are
// hourly-only on the wire, so their day rows populate only where hourly
// coverage exists and gray out beyond it.
const forecast_tab_names: Record<ForecastMetric, string> = {
  [ForecastMetric.TEMP]: "TEMP (°F)",
  [ForecastMetric.POP]: "RAIN %",
  [ForecastMetric.PRECIP]: "RAIN (IN)",
  [ForecastMetric.HUMIDITY]: "HUMID (%)",
  [ForecastMetric.WIND]: "WIND (MPH)",
}

const navItems = ["Forecast", "History", "Notifications"] as const
type NavItem = (typeof navItems)[number]

const iconMap: Record<NavItem, React.ElementType> = {
  Forecast: Eye,
  History: Library,
  Notifications: Clock,
}

const historyTabs = Object.values(DisplayMetric)
const forecastTabs = Object.values(ForecastMetric)

interface WeatherAppProperties {
  currentWeatherData: InstantObservation
  lastWeekData: WeeklyData
  hourlyDataByDate: Partial<Record<string, DailyData>>
  currentDate: Date
  forecast: ForecastFetchResult
}

export default function WeatherApp({
  currentWeatherData,
  lastWeekData,
  hourlyDataByDate,
  currentDate,
  forecast,
}: WeatherAppProperties) {
  const [activeTab, setActiveTab] = useState<DisplayMetric>(DisplayMetric.TEMP)
  // Each view keeps its own metric selection, so switching back restores it.
  const [activeForecastTab, setActiveForecastTab] = useState<ForecastMetric>(ForecastMetric.TEMP)
  const [activeNavItem, setActiveNavItem] = useState<NavItem>("Forecast")
  const panelId = useId()

  const isForecast = activeNavItem === "Forecast"

  const renderPanel = () => {
    if (isForecast) {
      return <ForecastWeather metric={activeForecastTab} forecast={forecast} />
    }
    if (activeNavItem === "Notifications") {
      return (
        <div className="text-center text-gray-500 dark:text-gray-400 py-8">
          Notifications are not available yet.
        </div>
      )
    }
    return (
      <WeeklyWeather
        metric={activeTab}
        lastWeekData={lastWeekData}
        hourlyDataByDate={hourlyDataByDate}
      />
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 max-w-sm md:max-w-2xl mx-auto relative">
      <div className="flex items-center justify-between px-4 pt-3">
        <h1 className="text-base font-bold text-gray-900 dark:text-gray-100">Open Sun</h1>
        <ThemeToggle />
      </div>

      {/* Keyed by view: the tablist's ref array is positional, so a five-tab
          set must not be reconciled onto a three-tab one. */}
      {isForecast ? (
        <MetricTabs
          key="forecast"
          tabs={forecastTabs}
          labels={forecast_tab_names}
          activeTab={activeForecastTab}
          onSelect={setActiveForecastTab}
          panelId={panelId}
          label="Forecast metric"
        />
      ) : (
        <MetricTabs
          key="history"
          tabs={historyTabs}
          labels={tab_names}
          activeTab={activeTab}
          onSelect={setActiveTab}
          panelId={panelId}
          label="Weather metric"
        />
      )}

      {isForecast ? (
        <NextHours forecast={forecast} metric={activeForecastTab} initialNow={currentDate} />
      ) : (
        <CurrentWeather currentWeatherData={currentWeatherData} />
      )}
      <SunInfo currentDate={currentDate} timesData={currentWeatherData.sunTimes} />

      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={`tab-${isForecast ? activeForecastTab : activeTab}`}
      >
        {renderPanel()}
      </div>

      <nav
        aria-label="Views"
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-sm md:max-w-2xl bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800"
      >
        <div className="flex justify-around py-2">
          {navItems.map((item) => {
            const IconComponent = iconMap[item]
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

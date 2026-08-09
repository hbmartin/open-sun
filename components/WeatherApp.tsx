"use client"

import type { MoonEvent } from "@/lib/moon"
import type { TwilightEvent } from "@/lib/twilight"
import type { DailyData, ForecastFetchResult, InstantObservation, WeeklyData } from "@/lib/types"
import type React from "react"
import { Eye, Info, Library, Map as MapIcon } from "lucide-react"
import { useId, useRef, useState } from "react"
import Almanac from "@/components/Almanac"
import CurrentWeather from "@/components/CurrentWeather"
import ForecastInfo from "@/components/ForecastInfo"
import ForecastWeather from "@/components/ForecastWeather"
import MetricTabs from "@/components/MetricTabs"
import NextHours from "@/components/NextHours"
import ScrollToTop from "@/components/ScrollToTop"
import SunInfo from "@/components/SunInfo"
import { useForegroundRefresh } from "@/components/use-foreground-refresh"
import { useNow } from "@/components/use-now"
import WeatherMap from "@/components/WeatherMap"
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

const navItems = ["Forecast", "Map", "History", "Info"] as const
type NavItem = (typeof navItems)[number]

const iconMap: Record<NavItem, React.ElementType> = {
  Forecast: Eye,
  Map: MapIcon,
  History: Library,
  Info,
}

const historyTabs = Object.values(DisplayMetric)
const forecastTabs = Object.values(ForecastMetric)

interface WeatherAppProperties {
  currentWeatherData: InstantObservation
  lastWeekData: WeeklyData
  hourlyDataByDate: Partial<Record<string, DailyData>>
  currentDate: Date
  twilight: TwilightEvent[]
  moon: MoonEvent[]
  forecast: ForecastFetchResult
}

export default function WeatherApp({
  currentWeatherData,
  lastWeekData,
  hourlyDataByDate,
  currentDate,
  twilight,
  moon,
  forecast,
}: WeatherAppProperties) {
  const [activeTab, setActiveTab] = useState<DisplayMetric>(DisplayMetric.TEMP)
  // Each view keeps its own metric selection, so switching back restores it.
  const [activeForecastTab, setActiveForecastTab] = useState<ForecastMetric>(ForecastMetric.TEMP)
  const [activeNavItem, setActiveNavItem] = useState<NavItem>("Forecast")
  const panelId = useId()
  // One clock for the whole screen: the chart's Now line and the twilight strip
  // read the same instant, so they cannot tick a minute apart.
  const now = useNow(currentDate)
  // The scroll-to-top button watches this block rather than a scroll offset;
  // wrapping here rather than inside NextHoursChart keeps the History view,
  // whose first block is CurrentWeather, behaving identically.
  const leadRef = useRef<HTMLDivElement>(null)
  useForegroundRefresh()

  const isForecast = activeNavItem === "Forecast"
  const isInfo = activeNavItem === "Info"
  const isMap = activeNavItem === "Map"
  // The Info and Map views own the whole screen: no metrics, no chart, no strip.
  const hasChrome = !isInfo && !isMap

  const renderPanel = () => {
    if (isForecast) {
      return <ForecastWeather metric={activeForecastTab} forecast={forecast} />
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 max-w-sm md:max-w-2xl mx-auto relative pt-3">
      {/* The visible wordmark is gone, but this is the document's only level-one
          heading and every panel below hangs an h2 off it. */}
      <h1 className="sr-only">Weather Forecast: North of the Ridge</h1>

      {/* Keyed by view: the tablist's ref array is positional, so a five-tab
          set must not be reconciled onto a three-tab one. The Info and Map views
          have no metrics, chart or sun strip — they unmount the whole chrome. */}
      {hasChrome &&
        (isForecast ? (
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
        ))}

      {/* Above the chart: the sun and moon times frame the hours that follow,
          and a strip of six short times reads faster than the chart does. */}
      {hasChrome && <SunInfo twilight={twilight} moon={moon} now={now} />}

      {hasChrome && (
        <div ref={leadRef}>
          {isForecast ? (
            <NextHours forecast={forecast} metric={activeForecastTab} now={now} />
          ) : (
            <CurrentWeather currentWeatherData={currentWeatherData} />
          )}
        </div>
      )}

      {isMap && <WeatherMap />}

      {isInfo && <ForecastInfo forecast={forecast} />}

      {hasChrome && (
        <div
          id={panelId}
          role="tabpanel"
          aria-labelledby={`tab-${isForecast ? activeForecastTab : activeTab}`}
        >
          {renderPanel()}
        </div>
      )}

      {isForecast && (
        <Almanac
          moon={moon}
          now={now}
          currentWeatherData={currentWeatherData}
          lastWeekData={lastWeekData}
          forecast={forecast}
        />
      )}

      {hasChrome && <ScrollToTop watch={leadRef} />}

      <nav
        aria-label="Views"
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-sm md:max-w-2xl bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800"
      >
        <div className="flex justify-around py-1">
          {navItems.map((item) => {
            const IconComponent = iconMap[item]
            const isActive = activeNavItem === item

            return (
              <button
                type="button"
                key={item}
                aria-current={isActive ? "page" : undefined}
                onClick={() => setActiveNavItem(item)}
                className={`flex flex-col items-center py-1 px-4 transition-colors ${
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

      {/* Bottom padding to account for fixed navigation. The map is already
          sized around the nav, so a spacer under it would only add scroll. */}
      {!isMap && <div className="h-16" />}
    </div>
  )
}

"use client"

import type React from "react"

import { useState } from "react"
import { Search, Settings, Sun, Cloud, Umbrella, ChevronDown, ChevronUp, Sunrise, Sunset } from "lucide-react"

// Mock data based on your structure
const currentWeather = {
  inTemp: null,
  inHumi: null,
  AbsPress: null,
  RelPress: null,
  outTemp: 84.0,
  outHumi: 21.0,
  windir: 303.0,
  avgwind: 0.0,
  gustspeed: 0.0,
  dailygust: 3.4,
  solarrad: 748.7,
  uv: 2847.0,
  uvi: 7.0,
  pm25: null,
  rainofhourly: 0.0,
  eventrain: 0.0,
}

// Mock 7-day forecast data with hourly breakdowns
const forecast = [
  {
    day: "TUE",
    icon: "partly-cloudy",
    precip: 56,
    low: 78,
    high: 86,
    sunrise: "6:37 AM",
    sunset: "7:27 PM",
    hourly: [
      { time: "12 AM", condition: "Light Rain and Breezy", precip: 100, temp: 79 },
      { time: "2 AM", condition: "Heavy Rain and Breezy", precip: 100, temp: 78 },
      { time: "4 AM", condition: "Heavy Rain and Windy", precip: 100, temp: 78 },
      { time: "6 AM", condition: "Heavy Rain and Dangerously Windy", precip: 100, temp: 79 },
      { time: "8 AM", condition: "", precip: 95, temp: 80 },
      { time: "10 AM", condition: "", precip: 90, temp: 82 },
      { time: "12 PM", condition: "Heavy Rain and Breezy", precip: 100, temp: 84 },
      { time: "2 PM", condition: "", precip: 85, temp: 86 },
      { time: "4 PM", condition: "Heavy Rain", precip: 100, temp: 85 },
      { time: "6 PM", condition: "Humid and Partly Cloudy", precip: 20, temp: 83 },
      { time: "8 PM", condition: "", precip: 15, temp: 81 },
      { time: "10 PM", condition: "", precip: 10, temp: 80 },
    ],
  },
  {
    day: "WED",
    icon: "partly-cloudy",
    precip: 60,
    low: 74,
    high: 90,
    sunrise: "6:38 AM",
    sunset: "7:26 PM",
    hourly: [
      { time: "12 AM", condition: "Partly Cloudy", precip: 20, temp: 75 },
      { time: "2 AM", condition: "Clear", precip: 10, temp: 74 },
      { time: "4 AM", condition: "Clear", precip: 5, temp: 74 },
      { time: "6 AM", condition: "Sunny", precip: 0, temp: 76 },
      { time: "8 AM", condition: "Sunny", precip: 0, temp: 78 },
      { time: "10 AM", condition: "Sunny", precip: 10, temp: 82 },
      { time: "12 PM", condition: "Hot and Sunny", precip: 15, temp: 86 },
      { time: "2 PM", condition: "Very Hot", precip: 20, temp: 90 },
      { time: "4 PM", condition: "Hot and Humid", precip: 30, temp: 88 },
      { time: "6 PM", condition: "Partly Cloudy", precip: 40, temp: 84 },
      { time: "8 PM", condition: "Cloudy", precip: 50, temp: 80 },
      { time: "10 PM", condition: "Light Rain", precip: 60, temp: 78 },
    ],
  },
  { day: "THU", icon: "rainy", precip: 88, low: 77, high: 88, sunrise: "6:39 AM", sunset: "7:25 PM", hourly: [] },
  {
    day: "FRI",
    icon: "partly-cloudy",
    precip: 41,
    low: 76,
    high: 90,
    sunrise: "6:40 AM",
    sunset: "7:24 PM",
    hourly: [],
  },
  { day: "SAT", icon: "sunny", precip: 26, low: 77, high: 88, sunrise: "6:41 AM", sunset: "7:23 PM", hourly: [] },
  { day: "SUN", icon: "rainy", precip: 44, low: 76, high: 88, sunrise: "6:42 AM", sunset: "7:22 PM", hourly: [] },
  { day: "MON", icon: "rainy", precip: 52, low: 74, high: 87, sunrise: "6:43 AM", sunset: "7:21 PM", hourly: [] },
  {
    day: "TUE",
    icon: "partly-cloudy",
    precip: 38,
    low: 74,
    high: 86,
    sunrise: "6:44 AM",
    sunset: "7:20 PM",
    hourly: [],
  },
]

const WeatherIcon = ({ type, className = "w-8 h-8" }: { type: string; className?: string }) => {
  switch (type) {
    case "sunny":
      return <Sun className={`${className} text-yellow-500`} />
    case "partly-cloudy":
      return <Cloud className={`${className} text-gray-500`} />
    case "rainy":
      return <Umbrella className={`${className} text-blue-500`} />
    default:
      return <Sun className={`${className} text-yellow-500`} />
  }
}

const isDayTime = (timeString: string) => {
  const hour = Number.parseInt(timeString.split(" ")[0])
  const period = timeString.split(" ")[1]

  if (period === "AM") {
    return hour >= 6 && hour <= 11
  } else {
    // PM
    return hour >= 12 || hour <= 6
  }
}

const isSunriseTime = (timeString: string, sunriseTime: string) => {
  // Extract hour from both times for comparison
  const hourTime = Number.parseInt(timeString.split(" ")[0])
  const sunriseHour = Number.parseInt(sunriseTime.split(":")[0])
  const period = timeString.split(" ")[1]
  const sunrisePeriod = sunriseTime.split(" ")[1]

  return hourTime === sunriseHour && period === sunrisePeriod
}

const isSunsetTime = (timeString: string, sunsetTime: string) => {
  // Extract hour from both times for comparison
  const hourTime = Number.parseInt(timeString.split(" ")[0])
  const sunsetHour = Number.parseInt(sunsetTime.split(":")[0])
  const period = timeString.split(" ")[1]
  const sunsetPeriod = sunsetTime.split(" ")[1]

  return hourTime === sunsetHour && period === sunsetPeriod
}

const HourlyBreakdown = ({ day, hourlyData }: { day: any; hourlyData: any[] }) => {
  // Calculate temperature range for positioning
  const temps = hourlyData.map((h) => h.temp)
  const minTemp = Math.min(...temps)
  const maxTemp = Math.max(...temps)
  const tempRange = maxTemp - minTemp

  const getTemperaturePosition = (temp: number) => {
    if (tempRange === 0) return 50 // Center if all temps are the same
    return ((temp - minTemp) / tempRange) * 100
  }

  return (
    <div className="overflow-hidden transition-all duration-300 ease-in-out" style={{ maxHeight: "1000px" }}>
      <div className="p-4 bg-gray-50 rounded-lg mt-2">
        <div className="mb-4">
          <h3 className="font-bold text-lg mb-1">{day.day} Detailed Forecast</h3>
          <p className="text-gray-600 text-sm">
            High: {day.high}° Low: {day.low}° Heavy rain and windy until afternoon.
          </p>
        </div>

        <div className="space-y-2">
          {hourlyData.map((hour, index) => {
            const isDay = isDayTime(hour.time)
            const isSunrise = isSunriseTime(hour.time, day.sunrise)
            const isSunset = isSunsetTime(hour.time, day.sunset)

            return (
              <div key={index}>
                {/* Sunrise/Sunset Special Markers */}
                {isSunrise && (
                  <div className="flex items-center justify-center py-2 mb-2">
                    <div className="flex items-center gap-2 px-3 py-1 bg-gradient-to-r from-orange-100 to-yellow-100 rounded-full border border-orange-200">
                      <Sunrise className="w-4 h-4 text-orange-500" />
                      <span className="text-xs font-medium text-orange-700">Sunrise {day.sunrise}</span>
                    </div>
                  </div>
                )}

                {isSunset && (
                  <div className="flex items-center justify-center py-2 mb-2">
                    <div className="flex items-center gap-2 px-3 py-1 bg-gradient-to-r from-purple-100 to-pink-100 rounded-full border border-purple-200">
                      <Sunset className="w-4 h-4 text-purple-500" />
                      <span className="text-xs font-medium text-purple-700">Sunset {day.sunset}</span>
                    </div>
                  </div>
                )}

                {/* Regular Hourly Row */}
                <div
                  className={`flex items-center rounded-lg px-2 py-1 transition-colors ${
                    isSunrise
                      ? "bg-gradient-to-r from-orange-50 to-yellow-50 border border-orange-100"
                      : isSunset
                        ? "bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-100"
                        : isDay
                          ? "bg-gradient-to-r from-yellow-50 to-orange-50"
                          : "bg-gradient-to-r from-indigo-50 to-purple-50"
                  }`}
                >
                  {/* Time and Precipitation Bar */}
                  <div className="flex items-center w-24">
                    <div className="w-1 h-12 mr-3 relative bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="absolute bottom-0 w-full bg-gradient-to-t from-blue-600 via-blue-500 to-blue-400 rounded-full transition-all duration-300"
                        style={{
                          height: `${hour.precip}%`,
                        }}
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="font-medium text-xs w-12">{hour.time}</span>
                      {isSunrise && <Sunrise className="w-3 h-3 text-orange-500" />}
                      {isSunset && <Sunset className="w-3 h-3 text-purple-500" />}
                    </div>
                  </div>

                  {/* Condition */}
                  <div className="flex-1 px-3">
                    {hour.condition && (
                      <div>
                        <p className="text-xs font-medium">{hour.condition}</p>
                        {hour.precip > 50 && <p className="text-xs text-gray-500">({hour.precip}%)</p>}
                      </div>
                    )}
                  </div>

                  {/* Temperature Scale Area */}
                  <div className="relative w-32 h-8 flex items-center">
                    {/* Temperature scale background */}
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-200 via-yellow-200 to-red-200 rounded-full opacity-30" />

                    {/* Temperature circle positioned based on value */}
                    <div
                      className="absolute w-6 h-6 bg-gray-600 rounded-full flex items-center justify-center transform -translate-x-1/2 transition-all duration-300"
                      style={{
                        left: `${getTemperaturePosition(hour.temp)}%`,
                        backgroundColor: hour.temp > 85 ? "#ef4444" : hour.temp > 80 ? "#f59e0b" : "#6b7280",
                      }}
                    >
                      <span className="text-white text-xs font-medium">{hour.temp}</span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Temperature Scale Legend */}
        <div className="mt-4 flex justify-between text-xs text-gray-500">
          <span>{minTemp}°</span>
          <span>Temperature Scale</span>
          <span>{maxTemp}°</span>
        </div>

        {/* Sunrise/Sunset */}
        <div className="mt-4 pt-3 border-t border-gray-200">
          <p className="text-center text-gray-600 text-xs">
            Sunrise {day.sunrise}; Sunset {day.sunset}
          </p>
        </div>
      </div>
    </div>
  )
}

export default function WeatherApp() {
  const [activeTab, setActiveTab] = useState("TEMP (°F)")
  const [expandedDay, setExpandedDay] = useState<number | null>(null)

  const tabs = ["TEMP (°F)", "FEELS-LIKE (°F)", "PRECIP (%)", "WIND (MPH)"]

  const toggleDayExpansion = (index: number, event: React.MouseEvent) => {
    // Store current scroll position
    const scrollPosition = window.scrollY

    // Toggle the expanded day
    setExpandedDay(expandedDay === index ? null : index)

    // Prevent default behavior
    event.preventDefault()

    // Restore scroll position after a short delay to ensure it happens after any automatic scrolling
    setTimeout(() => {
      window.scrollTo({
        top: scrollPosition,
        behavior: "auto", // Use 'auto' instead of 'smooth' to prevent visible scrolling
      })
    }, 10)
  }

  return (
    <div className="max-w-sm mx-auto bg-white min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between p-4 pt-12">
        <div className="flex items-center gap-2">
          <Search className="w-5 h-5 text-gray-600" />
          <span className="text-lg font-medium">New Orleans, LA</span>
        </div>
        <Settings className="w-6 h-6 text-gray-600" />
      </div>

      {/* Navigation Tabs */}
      <div className="flex px-4 mb-4">
        {tabs.map((tab, index) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`text-sm font-medium px-2 py-1 ${
              activeTab === tab ? "text-orange-500 border-b-2 border-orange-500" : "text-gray-500"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Current Weather Info */}
      <div className="px-4 mb-6">
        <div className="text-center mb-4">
          <p className="text-gray-600">Sunrise 8½ hours (6:41 AM)</p>
        </div>

        <div className="mb-6">
          <h2 className="text-xl font-bold mb-2">Next 7 Days</h2>
          <p className="text-gray-600 text-sm italic">
            Light rain throughout the week, with high temperatures rising to 90°F tomorrow.
          </p>
        </div>
      </div>

      {/* 7-Day Forecast */}
      <div className="px-4 space-y-2 mb-20">
        {forecast.map((day, index) => (
          <div key={index} className="border-b border-gray-100 last:border-b-0">
            <div
              className="flex items-center justify-between py-3 cursor-pointer hover:bg-gray-50 rounded-lg px-2 -mx-2 transition-colors"
              onClick={(e) => toggleDayExpansion(index, e)}
            >
              <div className="flex items-center gap-3 w-20">
                <span className="font-bold text-sm">{day.day}</span>
                <div className="flex items-center gap-1">
                  <span className="text-blue-500 text-xs">💧</span>
                  <span className="text-blue-500 text-xs">{day.precip}%</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <WeatherIcon type={day.icon} />
              </div>

              <div className="flex items-center gap-2 flex-1 justify-end">
                <span className="text-sm font-medium w-8 text-right">{day.low}°</span>
                <div className="w-20 h-2 bg-gray-300 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gray-600 rounded-full"
                    style={{ width: `${((day.high - day.low) / (90 - 70)) * 100}%` }}
                  />
                </div>
                <span className="text-sm font-medium w-8">{day.high}°</span>
                {expandedDay === index ? (
                  <ChevronUp className="w-4 h-4 text-gray-400 ml-2" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-400 ml-2" />
                )}
              </div>
            </div>

            {/* Expanded Hourly View - Update this part */}
            <div
              className={`transition-all duration-300 ease-in-out overflow-hidden ${expandedDay === index ? "opacity-100" : "opacity-100 max-h-0"}`}
            >
              {expandedDay === index && day.hourly.length > 0 && <HourlyBreakdown day={day} hourlyData={day.hourly} />}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-1/2 transform -translate-x-1/2 w-full max-w-sm bg-white border-t border-gray-200">
        <div className="flex justify-around py-3">
          <button className="flex flex-col items-center gap-1">
            <div className="w-6 h-6 rounded-full border-2 border-blue-500 flex items-center justify-center">
              <div className="w-2 h-2 bg-blue-500 rounded-full" />
            </div>
            <span className="text-xs text-blue-500 font-medium">Forecast</span>
          </button>
          <button className="flex flex-col items-center gap-1">
            <div className="w-6 h-6 rounded-full bg-gray-300 flex items-center justify-center">
              <div className="w-3 h-3 bg-gray-600 rounded-full" />
            </div>
            <span className="text-xs text-gray-500">Map</span>
          </button>
          <button className="flex flex-col items-center gap-1">
            <div className="w-6 h-6 rounded-full bg-gray-300 flex items-center justify-center">
              <div className="w-2 h-2 bg-gray-600 rounded" />
            </div>
            <span className="text-xs text-gray-500">Notifications</span>
          </button>
          <button className="flex flex-col items-center gap-1">
            <div className="w-6 h-6 rounded-full bg-gray-300 flex items-center justify-center">
              <div className="w-3 h-2 bg-gray-600 rounded" />
            </div>
            <span className="text-xs text-gray-500">Report</span>
          </button>
        </div>
      </div>
    </div>
  )
}

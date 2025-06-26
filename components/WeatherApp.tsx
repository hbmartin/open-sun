"use client"

import { Clock, Eye, Library, Wind } from "lucide-react"
import type React from "react"
import { useState } from "react"
import CurrentWeather from "@/components/CurrentWeather"
import SunInfo from "@/components/SunInfo"
import WeeklyWeather from "@/components/WeeklyWeather"

const tabs = ["TEMP (°F)", "FEELS-LIKE (°F)", "HUMID (%)", "WIND (MPH)", "UV"]
const navItems = ["History", "Forecast", "Notifications"]
const iconMap: Record<string, React.ElementType> = {
  Forecast: Eye,
  History: Library,
  Notifications: Clock,
}

export default function WeatherApp() {
  const [activeTab, setActiveTab] = useState("TEMP")
  const [activeNavItem, setActiveNavItem] = useState("History")

  return (
    <div className="min-h-screen bg-gray-50 max-w-sm mx-auto relative">
      <div className="px-4 pt-2 mb-2">
        <div className="flex space-x-6 border-b border-gray-200">
          {tabs.map((tab) => (
            <button
              type="button"
              key={tab}
              onClick={() => setActiveTab(tab.split(" ")[0])}
              className={`pb-2 text-sm font-medium transition-colors ${
                activeTab === tab.split(" ")[0]
                  ? "text-orange-500 border-b-2 border-orange-500"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <CurrentWeather />
      <SunInfo />
      <WeeklyWeather />

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-sm bg-white border-t border-gray-200">
        <div className="flex justify-around py-2">
          {navItems.map((item) => {
            const IconComponent = iconMap[item] ?? Wind

            return (
              <button
                type="button"
                key={item}
                onClick={() => setActiveNavItem(item)}
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

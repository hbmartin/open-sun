"use client"

import { useQuery } from "@tanstack/react-query"
import {
    Clock,
    Cloud,
    CloudRain,
    CloudSnow,
    Droplets,
    Eye,
    MapPin,
    Sun,
    Wind,
} from "lucide-react"
import React, { useState } from "react"
import { fetchCurrentWeatherData, fetchLastWeekData } from "@/lib/fetcher"
import type { HourlyData } from "@/lib/types"

const WeatherIcon = ({ type, size = 24 }: { type: string; size?: number }) => {
    const iconProps = { size, className: "text-orange-500" }

    switch (type) {
        case "sunny":
            return <Sun {...iconProps} className="text-yellow-500" />
        case "partly-cloudy":
            return <Cloud {...iconProps} className="text-gray-500" />
        case "rainy":
            return <CloudRain {...iconProps} className="text-blue-500" />
        case "snowy":
            return <CloudSnow {...iconProps} className="text-blue-300" />
        default:
            return <Sun {...iconProps} />
    }
}

const TemperatureBar = ({
    low,
    high,
    minTemp = 70,
    maxTemp = 95,
}: {
    low: number
    high: number
    minTemp?: number
    maxTemp?: number
}) => {
    const range = maxTemp - minTemp
    const lowPercent = ((low - minTemp) / range) * 100
    const highPercent = ((high - minTemp) / range) * 100
    const barWidth = highPercent - lowPercent

    return (
        <div className="flex items-center space-x-2 flex-1">
            <span className="text-sm font-medium text-gray-700 w-8 text-right">
                {low}°
            </span>
            <div className="relative flex-1 h-1 bg-gray-200 rounded-full">
                <div
                    className="absolute h-full bg-gradient-to-r from-blue-400 to-orange-400 rounded-full"
                    style={{
                        left: `${lowPercent}%`,
                        width: `${barWidth}%`,
                    }}
                />
            </div>
            <span className="text-sm font-medium text-gray-900 w-8">
                {high}°
            </span>
        </div>
    )
}

const HourlyRow = ({
    hour,
    minTemp = 70,
    maxTemp = 95,
}: {
    hour: HourlyData
    minTemp?: number
    maxTemp?: number
}) => {
    // Calculate temperature position (0-100%)
    const tempRange = maxTemp - minTemp
    const tempPosition = ((hour.temp - minTemp) / tempRange) * 100

    // Calculate rain color intensity
    const getRainColor = (intensity: number) => {
        if (intensity === 0) return "bg-gray-200"
        if (intensity <= 0.2) return "bg-blue-200"
        if (intensity <= 0.4) return "bg-blue-300"
        if (intensity <= 0.6) return "bg-blue-400"
        if (intensity <= 0.8) return "bg-blue-500"
        return "bg-blue-600"
    }

    return (
        <div className="flex items-center border-b border-gray-100 last:border-b-0 relative">
            {/* Rain intensity bar */}
            <div
                className={`w-1 h-full absolute left-0 ${getRainColor(hour.precipIntensity)}`}
            />

            <div className="flex items-center w-full pl-4 pr-4 py-3">
                <div className="w-16 text-sm font-semibold text-gray-900">
                    {hour.time}
                </div>

                <div className="flex-1 px-3">
                    {hour.condition && (
                        <div className="text-sm text-gray-700 mb-1">
                            {hour.condition}
                        </div>
                    )}
                    {hour.precipChance > 0 && (
                        <div className="text-xs text-gray-500">
                            ({hour.precipChance}%)
                        </div>
                    )}
                </div>

                {/* Temperature positioning area */}
                <div className="relative w-24 h-12 flex items-center">
                    <div
                        className="absolute w-10 h-10 bg-gray-700 rounded-full flex items-center justify-center transition-all duration-300"
                        style={{
                            left: `${Math.max(0, Math.min(56, (tempPosition / 100) * 56))}px`,
                        }}
                    >
                        <span className="text-white text-sm font-medium">
                            {hour.temp}°
                        </span>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default function WeatherApp() {
    const [activeTab, setActiveTab] = useState("TEMP")
    const [activeNavItem, setActiveNavItem] = useState("Forecast")
    const [expandedDayIndex, setExpandedDayIndex] = useState<number | null>(
        null,
    )

    const tabs = ["TEMP (°F)", "FEELS-LIKE (°F)", "PRECIP (%)", "WIND (MPH)"]
    const navItems = ["Forecast", "Map", "Notifications", "Report"]

    const handleDayClick = (index: number) => {
        setExpandedDayIndex(expandedDayIndex === index ? null : index)
    }

    const { data: currentWeatherData, isPending: isLoadingCurrentWeatherData } =
        useQuery({
            queryKey: ["currentWeatherData"],
            queryFn: fetchCurrentWeatherData,
        })
    const { data: lastWeekData, isPending: isLoadingLastWeekData } = useQuery({
        queryKey: ["lastWeekData"],
        queryFn: fetchLastWeekData,
    })

    return (
        <div className="min-h-screen bg-gray-50 max-w-sm mx-auto relative">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center space-x-3">
                    <div>
                        <h1 className="text-lg font-semibold text-gray-900">
                            Lassen, LA
                        </h1>
                    </div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="px-4 mb-4">
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

            {/* Sunrise Info */}
            <div className="px-4 py-3 text-center">
                <div className="flex items-center justify-center space-x-2">
                    <Sun size={16} className="text-orange-500" />
                    <span className="text-gray-700">
                        Sunrise 8½ hours (6:41 AM)
                    </span>
                </div>
            </div>

            {/* Current Weather Stats */}
            <div className="px-4 py-2 bg-white mx-4 rounded-lg shadow-sm mb-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="text-center">
                        <div className="text-2xl font-bold text-gray-900">
                            {isLoadingCurrentWeatherData
                                ? "..."
                                : currentWeatherData?.outTemp}
                            °
                        </div>
                        <div className="text-sm text-gray-500">Temperature</div>
                    </div>
                    <div className="text-center">
                        <div className="text-2xl font-bold text-blue-500">
                            {isLoadingCurrentWeatherData
                                ? "..."
                                : currentWeatherData?.outHumi}
                            %
                        </div>
                        <div className="text-sm text-gray-500">Humidity</div>
                    </div>
                </div>
            </div>

            {/* Weekly Forecast */}
            <div className="px-4">
                <h2 className="text-xl font-bold text-gray-900 mb-2">
                    Next 7 Days
                </h2>
                <p className="text-gray-600 text-sm mb-4 italic">
                    Light rain throughout the week, with high temperatures
                    rising to 90°F tomorrow.
                </p>

                <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                    {!isLoadingLastWeekData &&
                        lastWeekData &&
                        lastWeekData.map((day, index) => (
                            <div key={index}>
                                <button
                                    type="button"
                                    onClick={() => handleDayClick(index)}
                                    className="w-full flex items-center px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors"
                                >
                                    <div className="w-12 text-sm font-semibold text-gray-900">
                                        {day.day}
                                    </div>

                                    <div className="flex items-center space-x-3 w-20">
                                        <div className="flex items-center space-x-1">
                                            <Droplets
                                                size={12}
                                                className="text-blue-400"
                                            />
                                            <span className="text-sm text-blue-500 font-medium">
                                                {day.precipChance}%
                                            </span>
                                        </div>
                                        <WeatherIcon
                                            type={day.icon}
                                            size={20}
                                        />
                                    </div>

                                    <TemperatureBar
                                        low={day.lowTemp}
                                        high={day.highTemp}
                                    />
                                </button>

                                {/* Expanded Hourly View */}
                                <div
                                    className={`overflow-hidden transition-all duration-500 ease-in-out ${
                                        expandedDayIndex === index
                                            ? "max-h-[800px] opacity-100"
                                            : "max-h-0 opacity-0"
                                    }`}
                                >
                                    {expandedDayIndex === index &&
                                        day.hourlyData.length > 0 && (
                                            <div className="bg-gray-50 border-t border-gray-200">
                                                {/* Day Header */}
                                                <div className="px-4 py-3 border-b border-gray-200">
                                                    <div className="text-sm font-semibold text-gray-900 mb-1">
                                                        {day.date}
                                                    </div>
                                                    <div className="text-xs text-gray-600 italic">
                                                        High: {day.highTemp}°
                                                        Low: {day.lowTemp}°.{" "}
                                                        {day.description}
                                                    </div>
                                                </div>

                                                {/* Hourly Data */}
                                                <div className="bg-white">
                                                    {day.hourlyData.map(
                                                        (hour, hourIndex) => (
                                                            <HourlyRow
                                                                key={hourIndex}
                                                                hour={hour}
                                                            />
                                                        ),
                                                    )}
                                                </div>

                                                {/* Sunrise/Sunset */}
                                                <div className="px-4 py-3 text-center text-sm text-gray-600 border-t border-gray-200">
                                                    Sunrise 6:37 AM; Sunset 7:27
                                                    PM
                                                </div>
                                            </div>
                                        )}
                                </div>
                            </div>
                        ))}
                </div>
            </div>

            {/* Bottom Navigation */}
            <div className="fixed bottom-0 left-1/2 transform -translate-x-1/2 w-full max-w-sm bg-white border-t border-gray-200">
                <div className="flex justify-around py-2">
                    {navItems.map((item) => {
                        const IconComponent =
                            item === "Forecast"
                                ? Eye
                                : item === "Map"
                                  ? MapPin
                                  : item === "Notifications"
                                    ? Clock
                                    : Wind

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
            <div className="h-16"></div>
        </div>
    )
}

import { useQuery } from "@tanstack/react-query"
import { Droplets } from "lucide-react"
import type React from "react"
import { useState } from "react"
import HourlyContainer from "@/components/HourlyContainer"
import RangedBar from "@/components/RangedBar"
import WeatherIcon from "@/components/WeatherIcon"
import { fetchLastWeekData } from "@/lib/fetcher"

export default function WeeklyWeather(): React.JSX.Element {
  const [expandedDayIndex, setExpandedDayIndex] = useState<Set<number>>(
    new Set(),
  )

  const { data: lastWeekData, isPending: isLoadingLastWeekData } = useQuery({
    queryKey: ["lastWeekData"],
    queryFn: fetchLastWeekData,
  })

  const handleDayClick = (index: number) => {
    setExpandedDayIndex((previous) => {
      const newSet = new Set(previous)
      if (previous.has(index)) {
        newSet.delete(index)
      } else {
        newSet.add(index)
      }
      return newSet
    })
  }

  return (
    <div className="px-4">
      <h2 className="text-xl font-bold text-gray-900 mb-2">Last Week</h2>

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        {!isLoadingLastWeekData &&
          lastWeekData &&
          lastWeekData.data.map((day, index) => (
            <div key={day.date}>
              <button
                type="button"
                onClick={() => handleDayClick(index)}
                className="w-full flex items-center px-4 py-3 border-b border-gray-100 transition-colors"
              >
                <div className="flex flex-col w-14">
                  <div className="text-base font-semibold text-gray-900 text-left">
                    {index === 0 ? "TDY" : day.day}
                  </div>
                  <div className="flex space-x-1">
                    <Droplets size={14} className="text-blue-400" />
                    <span className="text-xs text-blue-500 font-medium">
                      {day.avg_rainofhourly}&quot;
                    </span>
                  </div>
                </div>
                <WeatherIcon data={day} size={30} />
                <RangedBar
                  low={day.min_outTemp}
                  high={day.max_outTemp}
                  minTemp={lastWeekData.ranges.min_outTemp}
                  maxTemp={lastWeekData.ranges.max_outTemp}
                />
              </button>

              {/* Expanded Hourly View */}
              <div
                className={`overflow-hidden transition-all duration-300 ease-out ${
                  expandedDayIndex.has(index)
                    ? "max-h-screen"
                    : "max-h-0"
                }`}
              >
                <HourlyContainer date={day.date} />
              </div>
            </div>
          ))}
      </div>
    </div>
  )
}

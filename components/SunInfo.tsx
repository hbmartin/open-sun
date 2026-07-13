import type React from "react"
import type { TimesData } from "@/lib/suncalc"
import { Rss, Sunrise, Sunset } from "lucide-react"
import { useMemo } from "react"

interface SunInfoProperties {
  currentDate: Date,
  timesData: TimesData
}

export default function SunInfo({ currentDate, timesData }: SunInfoProperties): React.JSX.Element {
  const loadTime = useMemo(() => {
    const hours = currentDate.getHours() % 12 || 12
    const minutes = currentDate.getMinutes().toString().padStart(2, "0")
    const period = currentDate.getHours() >= 12 ? "PM" : "AM"
    return `${hours}:${minutes} ${period}`
  }, [currentDate])

  return (
    <div className="px-4 py-3 text-center">
      <div className="flex items-center justify-center">
        <Sunrise size={16} className="text-orange-600 dark:text-orange-400 mr-2" />
        <span className="text-gray-700 dark:text-gray-300 mr-4" suppressHydrationWarning>
          {timesData.dawn.getHours()}:{timesData.dawn.getMinutes()} AM
        </span>
        <Rss size={16} className="text-gray-800 dark:text-gray-300 mr-2" />
        <span className="text-gray-700 dark:text-gray-300 mr-4">{loadTime}</span>
        <Sunset size={16} className="text-purple-800 dark:text-purple-400 mr-2" />
        <span className="text-gray-700 dark:text-gray-300" suppressHydrationWarning>
          {timesData.dusk.getHours()}:{timesData.dusk.getMinutes()} PM
        </span>
      </div>
    </div>
  )
}

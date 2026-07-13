import type React from "react"
import type { TimesData } from "@/lib/suncalc"
import { Rss, Sunrise, Sunset } from "lucide-react"
import { formatStationTime } from "@/lib/utils"

interface SunInfoProperties {
  currentDate: Date,
  timesData: TimesData
}

export default function SunInfo({ currentDate, timesData }: SunInfoProperties): React.JSX.Element {
  return (
    <div className="px-4 py-3 text-center">
      <div className="flex items-center justify-center">
        <Sunrise size={16} className="text-orange-600 dark:text-orange-400 mr-2" />
        <span className="text-gray-700 dark:text-gray-300 mr-4">
          {formatStationTime(timesData.dawn)}
        </span>
        <Rss size={16} className="text-gray-800 dark:text-gray-300 mr-2" />
        <span className="text-gray-700 dark:text-gray-300 mr-4">
          {formatStationTime(currentDate)}
        </span>
        <Sunset size={16} className="text-purple-800 dark:text-purple-400 mr-2" />
        <span className="text-gray-700 dark:text-gray-300">
          {formatStationTime(timesData.dusk)}
        </span>
      </div>
    </div>
  )
}

import type { ForecastDayData, ForecastMetric } from "@/lib/types"
import type React from "react"
import { Sunrise, Sunset } from "lucide-react"
import ForecastHourlyDetail from "@/components/forecast-hourly-detail"
import { formatCalendarDate, formatStationTime } from "@/lib/utils"

export default function ForecastHourlyContainer({
  day,
  metric,
}: {
  day: ForecastDayData
  metric: ForecastMetric
}): React.JSX.Element {
  if (day.hours.every((hour) => hour === undefined)) {
    // Days beyond the published hourly horizon hit this. The day list renders
    // those rows inert, so this is a safety net rather than the normal path.
    return (
      <div className="text-center text-gray-500 dark:text-gray-400 py-8">
        Hourly detail is only available for the next 4 days.
      </div>
    )
  }

  return (
    <div className="bg-gray-50 dark:bg-gray-950 border-t border-gray-200 dark:border-gray-800">
      <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-800 flex">
        <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex-1">
          {formatCalendarDate(day.date)}
        </div>
        <div className="flex items-center justify-center">
          <Sunrise size={12} className="text-orange-600 dark:text-orange-400 mr-2" />
          <span className="text-sm text-gray-700 dark:text-gray-300 mr-4">
            {formatStationTime(day.sunTimes.dawn)}
          </span>
          <Sunset size={12} className="text-purple-800 dark:text-purple-400 mr-2" />
          <span className="text-sm text-gray-700 dark:text-gray-300">
            {formatStationTime(day.sunTimes.dusk)}
          </span>
        </div>
      </div>
      <ForecastHourlyDetail
        hourly_data={day.hours}
        metric={metric}
        minTemp={day.hourRanges[`min_${metric}`]}
        maxTemp={day.hourRanges[`max_${metric}`]}
      />
    </div>
  )
}

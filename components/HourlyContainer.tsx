import { Sunrise, Sunset } from "lucide-react"
import type React from "react"
import HourlyDetailInline from "@/components/hourly-detail-inline"
import type { DailyData, DisplayMetric } from "@/lib/types"
import type { TimesData } from "@/lib/suncalc"

interface HourlyContainerProperties {
  date: string
  metric: DisplayMetric
  dailyData: DailyData
  timesData: TimesData
}

export default function HourlyContainer({
  date,
  metric,
  dailyData,
  timesData,
}: HourlyContainerProperties): React.JSX.Element {
  if (!dailyData.data) {
    return (
      <div className="text-center text-gray-500 py-8">
        Something went wrong.
      </div>
    )
  }
  if (dailyData.data.every((item) => item === undefined)) {
    return (
      <div className="text-center text-gray-500 py-8">
        No hourly data available for this day.
      </div>
    )
  }

  return (
    <div className="bg-gray-50 border-t border-gray-200">
      <div className="px-4 py-2 border-b border-gray-200 flex">
        <div className="text-sm font-semibold text-gray-900 flex-1">
          {new Date(date).toLocaleDateString()}
        </div>
        <div className="flex items-center justify-center">
          <Sunrise size={12} className="text-orange-600 mr-2" />
          <span className="text-sm text-gray-700 mr-4" suppressHydrationWarning>
            {timesData.dawn.getHours()}:
            {timesData.dawn.getMinutes().toString().padStart(2, "0")} AM
          </span>
          <Sunset size={12} className="text-purple-800 mr-2" />
          <span className="text-sm text-gray-700" suppressHydrationWarning>
            {timesData.dusk.getHours()}:
            {timesData.dusk.getMinutes().toString().padStart(2, "0")} PM
          </span>
        </div>
      </div>
      <HourlyDetailInline
        hourly_data={dailyData.data}
        metric={metric}
        minTemp={dailyData.ranges[`min_${metric}`]}
        maxTemp={dailyData.ranges[`max_${metric}`]}
      />
    </div>
  )
}

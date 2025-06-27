import { useQuery } from "@tanstack/react-query"
import { Sunrise, Sunset } from "lucide-react"
import type React from "react"
import HourlyDetailInline from "@/components/hourly-detail-inline"
import { fetchHourlyData } from "@/lib/fetcher"
import { getSunTimes } from "@/lib/utils"

export default function HourlyContainer({
  date,
}: {
  date: string
}): React.JSX.Element {
  const { data, isPending } = useQuery({
    queryKey: ["dailyData", date],
    queryFn: ({ queryKey }) => fetchHourlyData(queryKey[1]),
  })

  if (isPending)
    return (
      <div className="animate-pulse">
        <div className="space-y-3">
          {Array.from({ length: 24 }).map((_, index) => (
            <div
              key={`${index} ${date}`}
              className="flex items-center justify-between"
            >
              <div className="w-4 h-12 bg-gray-200 rounded" />
              <div className="flex-1 ml-4">
                <div className="h-4 bg-gray-200 rounded w-16 mb-2" />
                <div className="h-3 bg-gray-200 rounded w-32" />
              </div>
              <div className="size-10 bg-gray-200 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    )
  if (!isPending && data?.data.every((item) => item === undefined)) {
    return (
      <div className="text-center text-gray-500 py-8">
        No hourly data available for this day.
      </div>
    )
  }
  if (!isPending && !data?.data) {
    return (
      <div className="text-center text-gray-500 py-8">
        Something went wrong.
      </div>
    )
  }
  const timesData = getSunTimes(new Date(date))

  return (
    <div className="bg-gray-50 border-t border-gray-200">
      <div className="px-4 py-2 border-b border-gray-200 flex">
        <div className="text-sm font-semibold text-gray-900 flex-1">
          {new Date(date).toLocaleDateString()}
        </div>
        <div className="flex items-center justify-center">
          <Sunrise size={12} className="text-orange-600 mr-2" />
          <span className="text-sm text-gray-700 mr-4">
            {timesData.dawn.getHours()}:
            {timesData.dawn.getMinutes().toString().padStart(2, "0")} AM
          </span>
          <Sunset size={12} className="text-purple-800 mr-2" />
          <span className="text-sm text-gray-700">
            {timesData.dusk.getHours()}:
            {timesData.dusk.getMinutes().toString().padStart(2, "0")} PM
          </span>
        </div>
      </div>
      <HourlyDetailInline
        hourly_data={data?.data}
        minTemp={data?.ranges.min_outTemp}
        maxTemp={data?.ranges.max_outTemp}
      />
    </div>
  )
}

import type React from "react"
import { useQuery } from "@tanstack/react-query"
import { fetchHourlyData } from "@/lib/fetcher"
import HourlyRow from "@/components/HourlyRow"
import HourlyDetailInline from "./hourly-detail-inline"
import { useEffect } from "react"

export default function HourlyContainer({
  date,
}: {
  date: string
}): React.JSX.Element {
  const { data, isPending } = useQuery({
    queryKey: ["dailyData", date],
    queryFn: ({ queryKey }) => fetchHourlyData(queryKey[1]),
  })

  useEffect(() => {
    console.log(data)
  }, [data])

  if (isPending)
    return (
      <div className="animate-pulse">
        <div className="space-y-3">
          {Array.from({ length: 24 }).map((_, i) => (
            <div
              key={`${i} ${date}`}
              className="flex items-center justify-between"
            >
              <div className="w-4 h-12 bg-gray-200 rounded"></div>
              <div className="flex-1 ml-4">
                <div className="h-4 bg-gray-200 rounded w-16 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-32"></div>
              </div>
              <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
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

  return (
    <div className="bg-gray-50 border-t border-gray-200">
      {/* Day Header 
    <div className="px-4 py-3 border-b border-gray-200">
      <div className="text-sm font-semibold text-gray-900 mb-1">
        {day.date}
      </div>
      <div className="text-xs text-gray-600 italic">
        High: {day.max_outTemp}° Low: {day.min_outTemp}°.{" "}
        {day.description}
      </div>
    </div>
    */}

      {/* Hourly Data */}
      {/* <div className="bg-white">
        {[...Array(24).keys()].map((i) => {
          const hourly_data = data?.data[i] ?? undefined
          return hourly_data !== undefined ? (
            <HourlyRow
              key={`${i} ${date}`}
              hour={hourly_data}
            />
          ) : (
            <p key={`${i} ${date}`}>No data</p>
          )
        })}
      </div> */}
      <HourlyDetailInline
        hourly_data={data?.data}
        minTemp={data?.ranges.min_outTemp}
        maxTemp={data?.ranges.max_outTemp}
      />

      {/* Sunrise/Sunset */}
      <div className="px-4 py-3 text-center text-sm text-gray-600 border-t border-gray-200">
        Sunrise 6:37 AM; Sunset 7:27 PM
      </div>
    </div>
  )
}

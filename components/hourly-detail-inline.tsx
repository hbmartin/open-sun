import type React from "react"
import type { HourData } from "@/lib/types"

const getWeatherConditionColor = (condition: string) => {
  switch (condition) {
    case "light-rain":
      return "bg-blue-200"
    case "heavy-rain":
      return "bg-blue-400"
    case "humid-cloudy":
      return "bg-gray-300"
    default:
      return "bg-blue-200"
  }
}

export default function HourlyDetailInline({
  hourly_data,
  minTemp,
  maxTemp,
}: {
  hourly_data: HourData[] | undefined
  minTemp: number
  maxTemp: number
}): React.JSX.Element {
  console.log(hourly_data)
  if (hourly_data === undefined) {
    return <div>No data</div>
  }
  return (
    <div className="bg-gray-50 transition-all duration-500 ease-in-out">
      <div className="py-4">
        {/* <div className="mb-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            {selectedDay.dayOfWeek} Hourly Forecast
          </h3>
          <p className="text-sm text-gray-600">
            High: {selectedDay.highTemp}° Low: {selectedDay.lowTemp}° Heavy rain
            and windy until afternoon.
          </p>
        </div> */}

        <div className="relative">
          {[...Array(12).keys()].map((i) => {
            const hour = hourly_data[i * 2]
            if (hour === undefined) {
              return <p key={`${i}`}>No data</p>
            }
            return (
              <div
                key={`${hour.hour} ${hour.date}`}
                className="flex items-center relative"
                style={{ height: "60px" }}
              >
                <div
                  className={`absolute left-0 w-4 ${getWeatherConditionColor("light-rain")}`} // TODO: Add weather condition color
                  style={{
                    height: "60px",
                    top: 0,
                  }}
                />

                <div className="flex items-center justify-between w-full ml-6 py-3">
                  <div className="w-8">
                    <div className="font-semibold text-gray-900">
                      {hour.hour}
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      {hour.avg_rainofhourly}&quot;
                    </div>
                  </div>

                  <div className="relative w-full h-10 flex items-center mx-4">
                    <div
                      className="absolute bg-gray-700 text-white rounded-full w-10 h-10 flex items-center justify-center font-medium text-sm transition-all duration-300 ease-out"
                      style={{
                        left: `${((hour.avg_outTemp - minTemp) / (maxTemp - minTemp)) * 100}%`,
                        transform: "translateX(-50%)",
                      }}
                    >
                      {Math.round(hour.avg_outTemp)}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-4 pt-3 border-t border-gray-200 text-center text-sm text-gray-600">
          Sunrise 6:37 AM; Sunset 7:27 PM
        </div>
      </div>
    </div>
  )
}

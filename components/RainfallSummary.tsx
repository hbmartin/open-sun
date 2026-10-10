import type { InstantObservation } from "@/lib/types"
import { formatRainfall } from "@/lib/rainfall"
import { formatStationDateTime } from "@/lib/utils"

export default function RainfallSummary({
  currentWeatherData,
}: {
  currentWeatherData: InstantObservation
}) {
  return (
    <div className="py-2">
      <div className="grid grid-cols-2 gap-2 text-center">
        <div>
          <div className="text-lg font-semibold text-blue-600 dark:text-blue-400">
            {formatRainfall(currentWeatherData.rain_total_in)} in
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Rain today</div>
        </div>
        <div>
          <div className="text-lg font-semibold text-blue-600 dark:text-blue-400">
            {formatRainfall(currentWeatherData.rainofhourly)} in/hr
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Rain rate</div>
        </div>
      </div>
      {currentWeatherData.observedAt && (
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-2">
          Observed: {formatStationDateTime(new Date(currentWeatherData.observedAt))}
        </p>
      )}
    </div>
  )
}

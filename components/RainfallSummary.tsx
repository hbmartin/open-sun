import type { InstantObservation } from "@/lib/types"
import { formatRainfall } from "@/lib/rainfall"
import { describeStationReading } from "@/lib/station-reading"

export default function RainfallSummary({
  currentWeatherData,
  now,
}: {
  currentWeatherData: InstantObservation
  now?: Date
}) {
  const reading = describeStationReading(currentWeatherData.observedAt, now)
  return (
    <section aria-label="Station rainfall snapshot" className="py-2">
      <div className="grid grid-cols-2 gap-2 text-center">
        <div>
          <div className="text-lg font-semibold text-blue-600 dark:text-blue-400">
            {formatRainfall(currentWeatherData.rain_total_in)} in
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{reading.rainLabel}</div>
        </div>
        <div>
          <div className="text-lg font-semibold text-blue-600 dark:text-blue-400">
            {formatRainfall(currentWeatherData.rainofhourly)} in/hr
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Rain rate</div>
        </div>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-2">
        {reading.timeLabel}
      </p>
      {reading.older && (
        <p className="text-xs font-medium text-amber-700 dark:text-amber-400 text-center mt-1">
          Older snapshot
        </p>
      )}
      <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-2">
        Snapshots publish about hourly.
      </p>
    </section>
  )
}

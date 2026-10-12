"use client"

import type { ForecastFetchResult, ForecastMetric } from "@/lib/types"
import type React from "react"
import { useMemo } from "react"
import NextHoursChart from "@/components/NextHoursChart"
import { buildNextHours } from "@/lib/next-hours"

export default function NextHours({
  forecast,
  metric,
  now,
}: {
  forecast: ForecastFetchResult
  metric: ForecastMetric
  now: Date
}): React.JSX.Element | undefined {
  const days = forecast.kind === "ok" ? forecast.forecast.days : undefined
  // The chart reads date, hour, and minute; resume events can change only the seconds.
  const minuteTimestamp = Math.floor(now.getTime() / 60_000) * 60_000
  const model = useMemo(
    () =>
      days === undefined ? undefined : buildNextHours(days, new Date(minuteTimestamp), metric),
    [days, minuteTimestamp, metric],
  )

  if (forecast.kind === "unavailable") {
    // The forecast panel below already explains the outage; saying it twice
    // on one screen would be noise.
    return undefined
  }
  if (model === undefined) {
    return (
      <div className="mx-4 mb-4 px-4 py-6 bg-white dark:bg-gray-900 rounded-lg shadow-sm text-center text-sm text-gray-500 dark:text-gray-400">
        Hourly forecast is unavailable right now.
      </div>
    )
  }
  return <NextHoursChart model={model} metric={metric} />
}

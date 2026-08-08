"use client"

import type { ForecastFetchResult, ForecastMetric } from "@/lib/types"
import type React from "react"
import { useEffect, useMemo, useState } from "react"
import NextHoursChart from "@/components/NextHoursChart"
import { buildNextHours } from "@/lib/next-hours"

export default function NextHours({
  forecast,
  metric,
  initialNow,
}: {
  forecast: ForecastFetchResult
  metric: ForecastMetric
  initialNow: Date
}): React.JSX.Element | undefined {
  // Seeded from the server prop so hydration matches the server markup, then
  // corrected on mount: the page is statically revalidated hourly, so the
  // server's clock can be up to an hour behind by the time this renders. The
  // interval keeps the Now line honest on a long-open tab.
  const [now, setNow] = useState(initialNow)
  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const model = useMemo(
    () =>
      forecast.kind === "ok" ? buildNextHours(forecast.forecast.days, now, metric) : undefined,
    [forecast, now, metric],
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

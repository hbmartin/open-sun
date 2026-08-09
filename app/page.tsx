import WeatherApp from "@/components/WeatherApp"
import {
  fetchCurrentWeatherData,
  fetchForecastData,
  fetchHourlyDataRange,
  fetchLastWeekData,
} from "@/lib/fetcher"
import { buildTwilightEvents } from "@/lib/twilight"

// Incremental Static Regeneration: the page is statically rendered and
// regenerated at most once an hour, matching the hourly Vercel cron that
// also triggers on-demand revalidation via /api/revalidate.
export const revalidate = 3600

export default async function Page() {
  const currentDate = new Date()
  // fetchForecastData never rejects, so a missing or malformed forecast cannot
  // fail this Promise.all and take the station history down with it.
  const [currentWeatherData, lastWeekData, forecast] = await Promise.all([
    fetchCurrentWeatherData(),
    fetchLastWeekData(),
    fetchForecastData(currentDate),
  ])

  const lastItem = lastWeekData.data.at(-1)
  if (!lastItem) {
    throw new Error("No data")
  }

  const hourlyDataByDate = await fetchHourlyDataRange(lastItem.date)

  return (
    <WeatherApp
      currentWeatherData={currentWeatherData}
      lastWeekData={lastWeekData}
      hourlyDataByDate={hourlyDataByDate}
      currentDate={currentDate}
      // Anchored on the same instant NextHours gets as initialNow, so the sun
      // strip and the chart's Now line never disagree about which day it is.
      twilight={buildTwilightEvents(currentDate)}
      forecast={forecast}
    />
  )
}

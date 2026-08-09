import WeatherApp from "@/components/WeatherApp"
import {
  fetchCurrentWeatherData,
  fetchForecastData,
  fetchHourlyDataRange,
  fetchLastWeekData,
} from "@/lib/fetcher"
import { buildMoonEvents } from "@/lib/moon"
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
      // Anchored on the same instant that seeds WeatherApp's clock, so the sun
      // strip and the chart's Now line never disagree about which day it is.
      twilight={buildTwilightEvents(currentDate)}
      // Same anchor as the twilight events, for the same reason: the sun and
      // moon cells of one strip must not disagree about which day it is.
      moon={buildMoonEvents(currentDate)}
      forecast={forecast}
    />
  )
}

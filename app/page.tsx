import WeatherApp from "@/components/WeatherApp"
import { fetchCurrentWeatherData, fetchHourlyDataRange, fetchLastWeekData } from "@/lib/fetcher"

// Incremental Static Regeneration: the page is statically rendered and
// regenerated at most once an hour, matching the hourly Vercel cron that
// also triggers on-demand revalidation via /api/revalidate.
export const revalidate = 3600

export default async function Page() {
  const currentDate = new Date()
  const [currentWeatherData, lastWeekData] = await Promise.all([
    fetchCurrentWeatherData(),
    fetchLastWeekData(),
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
    />
  )
}

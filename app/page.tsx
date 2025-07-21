import WeatherApp from "@/components/WeatherApp"
import { fetchCurrentWeatherData, fetchHourlyDataRange, fetchLastWeekData } from "@/lib/fetcher"

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

import WeatherApp from "@/components/WeatherApp"
import { fetchCurrentWeatherData, fetchHourlyDataRange, fetchLastWeekData } from "@/lib/fetcher"
import { getSunTimes } from "@/lib/utils"

export default async function Page() {
  const currentDate = new Date()
  const [currentWeatherData, lastWeekData] = await Promise.all([
    fetchCurrentWeatherData(),
    fetchLastWeekData(),
  ])

  // Add sun times to current weather data
  const currentWeatherDataWithSunTimes = {
    ...currentWeatherData,
    sunTimes: getSunTimes(currentDate),
  }

  const lastItem = lastWeekData.data.at(-1)
  if (!lastItem) {
    throw new Error("No data")
  }

  const hourlyDataByDate = await fetchHourlyDataRange(lastItem.date)

  return (
    <WeatherApp
      currentWeatherData={currentWeatherDataWithSunTimes}
      lastWeekData={lastWeekData}
      hourlyDataByDate={hourlyDataByDate}
      currentDate={currentDate}
    />
  )
}

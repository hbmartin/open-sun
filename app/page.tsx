import WeatherApp from "@/components/WeatherApp"
import { fetchCurrentWeatherData, fetchHourlyDataRange, fetchLastWeekData } from "@/lib/fetcher"

export default async function Page() {
  const currentDate = new Date()
  // const [currentWeatherData, lastWeekData] = await Promise.all([
  //   fetchCurrentWeatherData(),
  //   fetchLastWeekData(),
  // ])
  console.log("fetching current weather data")
  const currentWeatherData = await fetchCurrentWeatherData()
  console.log("fetching last week data")
  const lastWeekData = await fetchLastWeekData()
  console.log("fetching hourly data")

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

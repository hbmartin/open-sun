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

  // Add sun times to last week data
  const lastWeekDataWithSunTimes = {
    ...lastWeekData,
    data: lastWeekData.data.map(day => ({
      ...day,
      sunTimes: getSunTimes(new Date(day.date)),
    })),
  }
  console.log(lastWeekDataWithSunTimes.data[0].sunTimes)

  const lastItem = lastWeekData.data.at(-1)
  if (!lastItem) {
    throw new Error("No data")
  }

  const hourlyDataByDate = await fetchHourlyDataRange(lastItem.date)

  return (
    <WeatherApp
      currentWeatherData={currentWeatherDataWithSunTimes}
      lastWeekData={lastWeekDataWithSunTimes}
      hourlyDataByDate={hourlyDataByDate}
      currentDate={currentDate}
    />
  )
}

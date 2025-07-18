import WeatherApp from "@/components/WeatherApp"
import { fetchCurrentWeatherData, fetchHourlyDataRange, fetchLastWeekData } from "@/lib/fetcher"
import { getSunTimes } from "@/lib/utils"

export default async function Page() {
  const [currentWeatherData, lastWeekData] = await Promise.all([
    fetchCurrentWeatherData(),
    fetchLastWeekData(),
  ])

  // Add sun times to current weather data
  const currentWeatherDataWithSunTimes = {
    ...currentWeatherData,
    sunTimes: getSunTimes(new Date()),
  }

  // Add sun times to last week data
  const lastWeekDataWithSunTimes = {
    ...lastWeekData,
    data: lastWeekData.data.map(day => ({
      ...day,
      sunTimes: getSunTimes(new Date(day.date)),
    })),
  }

  const startDate = lastWeekData.data.at(-1)?.date
  const endDate = lastWeekData.data[0]?.date
  const hourlyDataByDate = startDate && endDate 
    ? await fetchHourlyDataRange(startDate, endDate)
    : {}

  return (
    <WeatherApp
      currentWeatherData={currentWeatherDataWithSunTimes}
      lastWeekData={lastWeekDataWithSunTimes}
      hourlyDataByDate={hourlyDataByDate}
    />
  )
}

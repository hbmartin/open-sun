import WeatherApp from "@/components/WeatherApp"
import { fetchCurrentWeatherData, fetchHourlyData, fetchLastWeekData } from "@/lib/fetcher"
import { getSunTimes } from "@/lib/utils"

export default async function Page() {
  const [currentWeatherData, lastWeekData] = await Promise.all([
    fetchCurrentWeatherData(),
    fetchLastWeekData(),
  ])

  // Add sun times to current weather data
  const currentWeatherDataWithSunTimes = {
    ...currentWeatherData,
    sunTimes: getSunTimes(new Date())
  }

  // Add sun times to last week data
  const lastWeekDataWithSunTimes = {
    ...lastWeekData,
    data: lastWeekData.data.map(day => ({
      ...day,
      sunTimes: getSunTimes(new Date(day.date))
    }))
  }

  const hourlyDataPromises = lastWeekData.data.map(day => 
    fetchHourlyData(day.date),
  )
  const hourlyDataArray = await Promise.all(hourlyDataPromises)
  
  const hourlyDataByDate = Object.fromEntries(
    lastWeekData.data.map((day, index) => [day.date, hourlyDataArray[index]]),
  )

  return (
    <WeatherApp
      currentWeatherData={currentWeatherDataWithSunTimes}
      lastWeekData={lastWeekDataWithSunTimes}
      hourlyDataByDate={hourlyDataByDate}
    />
  )
}

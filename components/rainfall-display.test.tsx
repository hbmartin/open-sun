import type { InstantObservation, RangeObservation } from "@/lib/types"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import HourlyDetailInline from "@/components/hourly-detail-inline"
import RainfallSummary from "@/components/RainfallSummary"
import WeeklyWeather from "@/components/WeeklyWeather"
import { calculateRanges, mapDailyApiResponse } from "@/lib/mappers"
import { getTimes } from "@/lib/suncalc"
import { DisplayMetric } from "@/lib/types"

const row: RangeObservation = {
  date: "2026-10-10",
  min_outTemp: 54,
  avg_outTemp: 55,
  max_outTemp: 56,
  min_outHumi: 80,
  avg_outHumi: 85,
  max_outHumi: 90,
  max_gustspeed: 3,
  min_avgwind: 0,
  avg_avgwind: 1,
  max_avgwind: 2,
  avg_rainofhourly: 0.0007,
  rain_total_in: 0.01,
  min_uvi: 0,
  avg_uvi: 1,
  max_uvi: 2,
  min_solarrad: 100,
  avg_solarrad: 110,
  max_solarrad: 120,
}

describe("station rainfall display", () => {
  it("shows the daily accumulated hundredth even when the mean rate rounds to zero", () => {
    const data = mapDailyApiResponse({ data: [row] })
    const markup = renderToStaticMarkup(
      <WeeklyWeather
        metric={DisplayMetric.TEMP}
        lastWeekData={{ data, ranges: calculateRanges(data) }}
        hourlyDataByDate={{}}
      />,
    )
    expect(markup).toContain("0.01 in")
    expect(markup).not.toContain("0.00 in")
  })

  it("adds both hours in each displayed period, including rain in the second hour", () => {
    const hours = Array.from({ length: 24 }) as (
      | ({ hour: string } & RangeObservation)
      | undefined
    )[]
    hours[14] = { ...row, hour: "14", rain_total_in: 0.01 }
    hours[15] = { ...row, hour: "15", rain_total_in: 0.02 }
    const markup = renderToStaticMarkup(
      <HourlyDetailInline
        hourly_data={hours}
        metric={DisplayMetric.TEMP}
        minTemp={50}
        maxTemp={60}
      />,
    )
    expect(markup).toContain("0.03")
    expect(markup).not.toContain("0.01")
  })

  it("keeps today's accumulation distinct from the current rate and stamps the reading", () => {
    const observation: InstantObservation = {
      inTemp: null,
      inHumi: null,
      AbsPress: null,
      RelPress: null,
      pm25: null,
      outTemp: 55,
      outHumi: 85,
      windir: 180,
      avgwind: 1,
      gustspeed: 2,
      dailygust: 3,
      solarrad: 110,
      uv: 1,
      uvi: 1,
      eventrain: 0.01,
      rainofhourly: 0.07,
      rain_total_in: 0.01,
      observedAt: "2026-10-10T21:46:00+00:00",
      sunTimes: getTimes(new Date("2026-10-10T21:46:00Z"), 34.2768, -117.1692),
    }
    const markup = renderToStaticMarkup(<RainfallSummary currentWeatherData={observation} />)
    expect(markup).toContain("0.01 in")
    expect(markup).toContain("0.07 in/hr")
    expect(markup).toContain("Rain today")
    expect(markup).toContain("Observed: Oct 10, 2026, 2:46 PM PDT")
  })
})

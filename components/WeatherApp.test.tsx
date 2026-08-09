import type { InstantObservation, WeeklyData } from "@/lib/types"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import WeatherApp from "@/components/WeatherApp"
import { parsedForecastDocument } from "@/lib/__fixtures__/forecast"
import { mapForecastDocument } from "@/lib/forecast-mappers"
import { buildMoonEvents } from "@/lib/moon"
import { getTimes } from "@/lib/suncalc"
import { buildTwilightEvents } from "@/lib/twilight"

// useForegroundRefresh reaches for the app router, which real Next supplies
// during SSR but a bare renderToStaticMarkup does not.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const NOW = new Date("2026-08-05T16:00:00Z")

const observation: InstantObservation = {
  inTemp: null,
  inHumi: null,
  AbsPress: null,
  RelPress: null,
  outTemp: 82,
  outHumi: 40,
  windir: 0,
  avgwind: 1,
  gustspeed: 2,
  dailygust: 3,
  solarrad: 500,
  uv: 1,
  uvi: 5,
  pm25: null,
  rainofhourly: 0,
  eventrain: 0,
  sunTimes: getTimes(NOW, 34.2768, -117.1692),
}

const emptyWeek: WeeklyData = {
  data: [],
  ranges: {
    min_outTemp: 0,
    max_outTemp: 100,
    min_outHumi: 0,
    max_outHumi: 100,
    max_gustspeed: 10,
    min_avgwind: 0,
    max_avgwind: 10,
    min_uvi: 0,
    max_uvi: 10,
    min_solarrad: 0,
    max_solarrad: 1000,
  },
}

describe("WeatherApp", () => {
  it("offers Forecast, History and Info views, defaulting to Forecast", () => {
    const markup = renderToStaticMarkup(
      <WeatherApp
        currentWeatherData={observation}
        lastWeekData={emptyWeek}
        hourlyDataByDate={{}}
        currentDate={NOW}
        twilight={buildTwilightEvents(NOW)}
        moon={buildMoonEvents(NOW)}
        forecast={{ kind: "ok", forecast: mapForecastDocument(parsedForecastDocument(), NOW) }}
      />,
    )
    expect(markup).toContain(">Info<")
    expect(markup).not.toContain("Notifications")
    // Forecast is the initial view: its tablist and panel render.
    expect(markup).toContain('role="tabpanel"')
    expect(markup).toContain("Next 10 Days")
  })

  it("puts the sun and moon strip above the hourly chart, and the almanac last", () => {
    const markup = renderToStaticMarkup(
      <WeatherApp
        currentWeatherData={observation}
        lastWeekData={emptyWeek}
        hourlyDataByDate={{}}
        currentDate={NOW}
        twilight={buildTwilightEvents(NOW)}
        moon={buildMoonEvents(NOW)}
        forecast={{ kind: "ok", forecast: mapForecastDocument(parsedForecastDocument(), NOW) }}
      />,
    )
    const strip = markup.indexOf("Next sun and moon times")
    // The fixture's single hourly row leaves buildNextHours with nothing to
    // plot, so the block renders its empty state rather than the chart; either
    // way it occupies the same slot.
    const chart = Math.max(
      markup.indexOf("Hourly Forecast"),
      markup.indexOf("Hourly forecast is unavailable right now."),
    )
    const days = markup.indexOf("Next 10 Days")
    const almanac = markup.indexOf(">Almanac<")
    expect(strip).toBeGreaterThan(-1)
    expect(chart).toBeGreaterThan(-1)
    expect(almanac).toBeGreaterThan(-1)
    expect(strip).toBeLessThan(chart)
    expect(chart).toBeLessThan(days)
    expect(days).toBeLessThan(almanac)
  })
})

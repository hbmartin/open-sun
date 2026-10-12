import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import WeatherApp from "@/components/WeatherApp"
import { parsedForecastDocument } from "@/lib/__fixtures__/forecast"
import { makeEmptyWeek, makeObservation } from "@/lib/__fixtures__/station"
import { mapForecastDocument } from "@/lib/forecast-mappers"
import { buildMoonEvents } from "@/lib/moon"
import { buildTwilightEvents } from "@/lib/twilight"

// useForegroundRefresh reaches for the app router, which real Next supplies
// during SSR but a bare renderToStaticMarkup does not.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const NOW = new Date("2026-08-05T16:00:00Z")

const observation = makeObservation(NOW)
const emptyWeek = makeEmptyWeek()

describe("WeatherApp", () => {
  it("offers Forecast, Map, History and Info views, defaulting to Forecast", () => {
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
    expect(markup).toContain(">Map<")
    expect(markup).not.toContain("Notifications")
    // The map view is not the initial one, so its iframe stays unmounted.
    expect(markup).not.toContain("embed.ventusky.com")
    // Forecast is the initial view: its tablist and panel render.
    expect(markup).toContain('role="tabpanel"')
    expect(markup).toContain("Next 10 Days")
    expect(markup).toContain("Rain on Aug 5, 2026")
    expect(markup).toContain("Rain rate")
    expect(markup).toContain("Snapshots publish about hourly.")
    expect(markup).not.toContain("just now")
    expect(markup).not.toContain("Older snapshot")
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

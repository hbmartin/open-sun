// @vitest-environment jsdom

import type { ForecastFetchResult } from "@/lib/types"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import ForecastWeather from "@/components/ForecastWeather"
import { makeDailyRow, makeHourlyRow, parsedForecastDocument } from "@/lib/__fixtures__/forecast"
import { mapForecastDocument } from "@/lib/forecast-mappers"
import { ForecastMetric } from "@/lib/types"

const NOW = new Date("2026-08-05T16:00:00Z")

function render(forecast: ForecastFetchResult, metric = ForecastMetric.TEMP) {
  return renderToStaticMarkup(<ForecastWeather metric={metric} forecast={forecast} />)
}

function ok(overrides: Record<string, unknown> = {}): ForecastFetchResult {
  return {
    kind: "ok",
    forecast: mapForecastDocument(parsedForecastDocument(overrides), NOW),
  }
}

function provenance(markup: string) {
  const container = document.createElement("div")
  container.innerHTML = markup
  const paragraph = container.querySelector("p")
  expect(paragraph?.textContent).toContain("Last updated:")
  if (!paragraph) throw new Error("missing provenance line")
  return paragraph
}

describe("ForecastWeather", () => {
  it("renders the day list with temperature bounds", () => {
    const markup = render(ok())
    expect(markup).toContain("Next 10 Days")
    expect(markup).toContain("TDY")
    expect(markup).toContain("70")
    expect(markup).toContain("96")
  })

  it("explains itself when the publisher is unreachable", () => {
    const markup = render({ kind: "unavailable", reason: "HTTP 404" })
    expect(markup).toContain("Forecast unavailable.")
    expect(markup).toContain("HTTP 404")
  })

  it("stamps when the forecast was last updated, in the station's zone", () => {
    const markup = render(ok())
    // The fixture is issued at 15:36Z, which is a morning at the station.
    expect(markup).toContain("Last updated: Aug 5, 2026, 8:36 AM PDT")
    expect(markup).not.toContain("sources")
  })

  it("names the reason when the document is degraded", () => {
    const markup = render(ok({ status: "degraded", status_reason: "no live evidence" }))
    expect(markup).toContain("degraded: no live evidence")
    expect(provenance(markup).classList.contains("text-amber-600")).toBe(true)
  })

  it("warns when the publisher has gone quiet", () => {
    const markup = render(
      ok({ issued_at: "2026-08-04T10:00:00+00:00", observation_at: "2026-08-04T09:59:00Z" }),
    )
    expect(markup).toContain("publisher may be down")
  })

  it("warns about a missing observation with complete displayed output", () => {
    const markup = render(ok({ observation_at: null }))
    expect(markup).toContain("No recent station observation")
    expect(markup).not.toContain("Some displayed forecast values")
    expect(provenance(markup).classList.contains("text-amber-600")).toBe(true)
  })

  it.each(["temp_f", "humidity_pct", "wind_speed_mph", "precip_in", "pop"])(
    "warns about missing hourly %s with a fresh observation on every metric tab",
    (variable) => {
      const forecast = ok({
        hourly: [makeHourlyRow({ values: { ...makeHourlyRow().values, [variable]: null } })],
      })
      for (const metric of Object.values(ForecastMetric)) {
        const line = provenance(render(forecast, metric))
        expect(line.textContent).toContain("Some displayed forecast values are unavailable")
        expect(line.textContent).not.toContain("station observation")
        expect(line.classList.contains("text-amber-600")).toBe(true)
      }
    },
  )

  it.each(["temp_max_f", "temp_min_f", "pop", "precip_sum_in"])(
    "warns about missing daily %s with a fresh observation",
    (variable) => {
      const line = provenance(
        render(
          ok({ daily: [makeDailyRow({ values: { ...makeDailyRow().values, [variable]: null } })] }),
        ),
      )
      expect(line.textContent).toContain("Some displayed forecast values are unavailable")
      expect(line.classList.contains("text-amber-600")).toBe(true)
    },
  )

  it.each(["dew_point_f", "wind_gust_mph", "pressure_sea_inhg"])(
    "keeps Forecast neutral when only hidden %s is absent",
    (variable) => {
      const values = Object.fromEntries(
        Object.entries(makeHourlyRow().values).filter(([key]) => key !== variable),
      )
      const forecast = ok({ hourly: [makeHourlyRow({ values })] })
      expect(forecast.kind === "ok" && forecast.forecast.info.health.outputs.status).toBe("partial")
      const line = provenance(render(forecast))
      expect(line.textContent).not.toContain("unavailable")
      expect(line.classList.contains("text-amber-600")).toBe(false)
    },
  )

  it("keeps discarded and replaced rows out of Forecast warnings", () => {
    const forecast = ok({
      hourly: [
        makeHourlyRow({ values: {} }),
        makeHourlyRow(),
        makeHourlyRow({ valid_time: "2026-09-01T15:00:00Z", values: {} }),
      ],
    })
    expect(forecast.kind === "ok" && forecast.forecast.info.health.outputs.status).toBe("partial")
    const line = provenance(render(forecast))
    expect(line.textContent).not.toContain("unavailable")
    expect(line.classList.contains("text-amber-600")).toBe(false)
  })

  it.each([{ hourly: [] }, { daily: [] }, { hourly: [makeHourlyRow({ values: {} })] }])(
    "warns about an empty or wholly unavailable product: %o",
    (overrides) => {
      const line = provenance(render(ok(overrides)))
      expect(line.textContent).toContain("Some displayed forecast values are unavailable")
      expect(line.classList.contains("text-amber-600")).toBe(true)
    },
  )

  it("treats zero rain and wind as available", () => {
    const forecast = ok({
      hourly: [makeHourlyRow({ values: { ...makeHourlyRow().values, wind_speed_mph: 0 } })],
    })
    const line = provenance(render(forecast))
    expect(line.textContent).not.toContain("unavailable")
    expect(line.classList.contains("text-amber-600")).toBe(false)
  })

  it("reports both degradation and publisher expiry", () => {
    const line = provenance(
      render(
        ok({
          status: "degraded",
          status_reason: "no live evidence",
          issued_at: "2026-08-04T10:00:00Z",
          observation_at: "2026-08-04T09:59:00Z",
        }),
      ),
    )
    expect(line.textContent).toContain("degraded: no live evidence")
    expect(line.textContent).toContain("publisher may be down")
    expect(line.classList.contains("text-amber-600")).toBe(true)
  })

  it("marks an unevidenced day in the accessible label", () => {
    const document = parsedForecastDocument()
    document.daily[0].release_ids = {}
    const markup = renderToStaticMarkup(
      <ForecastWeather
        metric={ForecastMetric.TEMP}
        forecast={{ kind: "ok", forecast: mapForecastDocument(document, NOW) }}
      />,
    )
    expect(markup).toContain("unvalidated")
  })

  it("keeps uncertainty bands out of the daily rows", () => {
    // A row is only as wide as it is tall, so nested bands collapsed into a
    // gray disc behind the high label. They belong to the Next 24 Hours chart,
    // which has the horizontal room to nest them legibly.
    expect(render(ok())).not.toContain("range-bar-band")
  })

  it("collapses a zero-width range to a single value", () => {
    // Probability with no quantiles gives low === high.
    expect(render(ok(), ForecastMetric.POP)).toContain("0%")
  })

  it("renders a day beyond the hourly horizon inert and grayed", () => {
    const markup = render(
      ok({
        daily: [makeDailyRow(), makeDailyRow({ date_local: "2026-08-12", lead_days: 7 })],
      }),
    )
    // One expandable day, one inert one: a single button, a single hourly panel.
    expect(markup.match(/<button/gu)).toHaveLength(1)
    expect(markup.match(/forecast-hourly-/gu)).toHaveLength(2)
    expect(markup).toContain("text-gray-400 dark:text-gray-600")
  })
})

import type { ForecastFetchResult } from "@/lib/types"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import ForecastWeather from "@/components/ForecastWeather"
import { makeDailyRow, parsedForecastDocument } from "@/lib/__fixtures__/forecast"
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

  it("shows how old the forecast is", () => {
    expect(render(ok())).toContain("Issued")
  })

  it("names the reason when the document is degraded", () => {
    const markup = render(ok({ status: "degraded", status_reason: "no live evidence" }))
    expect(markup).toContain("degraded: no live evidence")
    expect(markup).toContain("text-amber-600")
  })

  it("warns when the publisher has gone quiet", () => {
    const markup = render(ok({ issued_at: "2026-08-04T10:00:00+00:00" }))
    expect(markup).toContain("publisher may be down")
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

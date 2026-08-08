import type { ForecastFetchResult } from "@/lib/types"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import ForecastInfo from "@/components/ForecastInfo"
import {
  makeDailyRow,
  makeForecastDocument,
  makeHourlyRow,
  parsedForecastDocument,
} from "@/lib/__fixtures__/forecast"
import { mapForecastDocument } from "@/lib/forecast-mappers"
import { ForecastDocumentSchema } from "@/lib/forecast-schemas"

const NOW = new Date("2026-08-05T16:00:00Z")

function render(forecast: ForecastFetchResult) {
  return renderToStaticMarkup(<ForecastInfo forecast={forecast} />)
}

function ok(overrides: Record<string, unknown> = {}): ForecastFetchResult {
  return {
    kind: "ok",
    forecast: mapForecastDocument(parsedForecastDocument(overrides), NOW),
  }
}

describe("ForecastInfo", () => {
  it("summarizes a healthy document", () => {
    const markup = render(ok())
    expect(markup).toContain("Forecast Model")
    expect(markup).toContain("Status: Ready")
    expect(markup).toContain("Release: c22474d379549f29")
    // The fixture backs 1 of 8 hourly and 1 of 4 daily value slots.
    expect(markup).toContain("13% of hourly values and 25% of daily")
    expect(markup).toContain("nbm, nws, open_meteo")
    expect(markup).toContain("718e5bfa65100a5b")
    expect(markup).toContain("publisher 1.0.0")
    expect(markup).not.toContain("NaN")
    expect(markup).not.toContain("undefined")
  })

  it("reports full evidence coverage without amber", () => {
    const markup = render(
      ok({
        hourly: [makeHourlyRow({ values: { temp_f: 82 } })],
        daily: [makeDailyRow({ values: { temp_max_f: 95 } })],
      }),
    )
    expect(markup).toContain("100% of hourly values and 100% of daily")
  })

  it("names the degraded reason in amber", () => {
    const markup = render(ok({ status: "degraded", status_reason: "no live evidence" }))
    expect(markup).toContain("Status: Degraded — no live evidence")
    expect(markup).toContain("text-amber-600")
  })

  it("turns the age line amber when stale", () => {
    const markup = render(ok({ issued_at: "2026-08-05T10:00:00+00:00" }))
    expect(markup).toContain("Issued 6h ago (stale)")
    expect(markup).toContain("text-amber-600")
  })

  it("marks an expired document as a possible publisher outage", () => {
    const markup = render(ok({ issued_at: "2026-08-04T10:00:00+00:00" }))
    expect(markup).toContain("publisher may be down")
  })

  it("says so when the document predates selection-reason reporting", () => {
    const { selection_reasons: _hourly, ...hourlyRow } = makeHourlyRow()
    const { selection_reasons: _daily, ...dailyRow } = makeDailyRow()
    const document = ForecastDocumentSchema.parse(
      makeForecastDocument({ hourly: [hourlyRow], daily: [dailyRow] }),
    )
    const markup = render({ kind: "ok", forecast: mapForecastDocument(document, NOW) })
    expect(markup).toContain("predates selection-reason reporting")
  })

  it("folds a long method roster into a +N more suffix", () => {
    const methods = [
      "gbm_quantile",
      "best_provider",
      "persistence",
      "analog_ensemble",
      "conformal_ewma",
      "seamless_regression",
      "harmonic_grounded_equal_weight",
    ]
    const markup = render(
      ok({
        hourly: methods.map((method, index) =>
          makeHourlyRow({
            valid_time: `2026-08-05T${15 + index}:00:00+00:00`,
            methods: { temp_f: method },
          }),
        ),
      }),
    )
    expect(markup).toContain("+3 more")
  })

  it("explains an unavailable forecast", () => {
    const markup = render({ kind: "unavailable", reason: "HTTP 404" })
    expect(markup).toContain("Model status unavailable.")
    expect(markup).toContain("HTTP 404")
  })
})

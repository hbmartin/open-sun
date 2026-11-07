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
    expect(markup).toContain("Models: Ready")
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
    expect(markup).toContain("Models: Degraded — no live evidence")
    expect(markup).toContain("text-amber-600")
  })

  it("turns the age line amber when stale", () => {
    const markup = render(
      ok({ issued_at: "2026-08-05T10:00:00+00:00", observation_at: "2026-08-05T09:59:00Z" }),
    )
    expect(markup).toContain("Issued 6h ago (stale)")
    expect(markup).toContain("text-amber-600")
  })

  it("marks an expired document as a possible publisher outage", () => {
    const markup = render(
      ok({ issued_at: "2026-08-04T10:00:00+00:00", observation_at: "2026-08-04T09:59:00Z" }),
    )
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

  it.each([ok(), { kind: "unavailable", reason: "HTTP 404" } as ForecastFetchResult])(
    "explains station snapshots regardless of forecast availability",
    (forecast) => {
      const markup = render(forecast)
      expect(markup).toContain("Station snapshots")
      expect(markup).toContain("Station readings are collected every minute.")
      expect(markup).toContain(
        "Snapshots are published about hourly, and page caching can add delay.",
      )
      expect(markup).toContain("A zero rain rate can still accompany rainfall already accumulated.")
    },
  )

  it("opens with a link to the walkthrough, above the status cards", () => {
    const markup = render(ok())
    expect(markup).toContain("https://www.youtube.com/watch?v=sqhd5yF8Tfg")
    expect(markup).toContain("See how it works")
    expect(markup).toContain('rel="noopener noreferrer"')
    expect(markup.indexOf("See how it works")).toBeLessThan(markup.indexOf("Models: Ready"))
  })

  it("warns about missing observations and omitted values even with ready models", () => {
    const markup = render(
      ok({ observation_at: null, hourly: [makeHourlyRow({ values: { temp_f: 70 } })] }),
    )
    expect(markup).toContain("Models: Ready")
    expect(markup).toContain("No recent station observation")
    expect(markup).toContain("1 of 8 hourly")
    expect(markup).toContain("1 hourly pressure value unavailable")
    expect(markup).toContain("1 hourly dew point value unavailable")
    expect(markup).not.toContain("Healthy means Ready")
  })

  it("reports numeric age for fresh observations", () => {
    expect(render(ok())).toContain(
      "station observation was 39 seconds old when this forecast was issued",
    )
  })

  it.each([
    ["2026-08-05T15:35:59.999999Z", "less than 1 second"],
    ["2026-08-05T15:06:00.000001Z", "29 minutes"],
    ["2026-08-05T13:36:00Z", "2 hours"],
    ["2026-08-03T15:36:00Z", "2 days"],
  ])("describes observation %s by its age at issue time", (observation_at, age) => {
    expect(render(ok({ observation_at }))).toContain(
      `station observation was ${age} old when this forecast was issued`,
    )
  })

  it("builds the freshness note from the effective observation threshold", () => {
    const forecast = ok()
    if (forecast.kind !== "ok") throw new Error("expected fixture forecast")
    forecast.forecast.info.health.observation.maxAgeSeconds = 3600
    expect(render(forecast)).toContain("less than 1 hour old at issue time")
  })

  it("labels document-wide counts and pluralizes both hourly and daily warnings", () => {
    const markup = render(
      ok({
        hourly: [
          makeHourlyRow(),
          makeHourlyRow({ valid_time: "2026-09-01T15:00:00Z", values: {} }),
        ],
        daily: [
          makeDailyRow({ values: {} }),
          makeDailyRow({ date_local: "2026-08-06", values: {} }),
        ],
      }),
    )
    expect(markup).toContain("Published document values available: 8 of 16 hourly")
    expect(markup).toContain("Published document: 2 hourly rows")
    expect(markup).toContain("1 hourly pressure value unavailable")
    expect(markup).toContain("2 daily high temperature values unavailable")
    expect(markup).toContain("Evidence and method summaries cover accepted display rows")
    expect(render(ok({ daily: [makeDailyRow({ values: {} })] }))).toContain(
      "1 daily high temperature value unavailable",
    )
  })

  // A publisher outage is when the explainer is most wanted, so it must not be
  // rendered only on the healthy branch.
  it("keeps the walkthrough link when the document is unavailable", () => {
    const markup = render({ kind: "unavailable", reason: "HTTP 404" })
    expect(markup).toContain("https://www.youtube.com/watch?v=sqhd5yF8Tfg")
  })
})

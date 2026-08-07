import { describe, expect, it } from "vitest"
import { makeDailyRow, makeForecastDocument, makeHourlyRow } from "@/lib/__fixtures__/forecast"
import { ForecastDocumentSchema } from "@/lib/forecast-schemas"

function parse(overrides: Record<string, unknown> = {}) {
  return ForecastDocumentSchema.safeParse(makeForecastDocument(overrides))
}

function parseHourly(overrides: Record<string, unknown>) {
  return parse({ hourly: [makeHourlyRow(overrides)] })
}

describe("ForecastDocumentSchema", () => {
  it("accepts a full valid document", () => {
    const result = parse()
    expect(result.success).toBe(true)
  })

  it("ignores extra top-level keys the publisher adds", () => {
    // published_at and source_schema_version are in the fixture but unmodelled.
    expect(parse({ future_field: 1 }).success).toBe(true)
  })

  describe("values", () => {
    it("accepts a null value", () => {
      const result = parseHourly({
        values: { ...makeHourlyRow().values, temp_f: null },
      })
      expect(result.success).toBe(true)
    })

    it("accepts a variable that is entirely absent", () => {
      const { temp_f: _omitted, ...rest } = makeHourlyRow().values
      expect(parseHourly({ values: rest }).success).toBe(true)
    })

    it("rejects pop expressed as a percent", () => {
      const result = parseHourly({ values: { ...makeHourlyRow().values, pop: 45 } })
      expect(result.success).toBe(false)
    })

    it("rejects an out-of-range humidity", () => {
      const result = parseHourly({
        values: { ...makeHourlyRow().values, humidity_pct: 120 },
      })
      expect(result.success).toBe(false)
    })

    it("rejects negative precipitation", () => {
      const result = parseHourly({
        values: { ...makeHourlyRow().values, precip_in: -1 },
      })
      expect(result.success).toBe(false)
    })
  })

  describe("units block", () => {
    it("rejects Celsius smuggled in under a Fahrenheit key", () => {
      const units = { ...makeForecastDocument().units, temp_f: "C" }
      const result = parse({ units })
      expect(result.success).toBe(false)
      expect(result.error?.issues[0].path).toEqual(["units", "temp_f"])
    })

    it("rejects pop redeclared as a percent", () => {
      const units = { ...makeForecastDocument().units, pop: "percent" }
      expect(parse({ units }).success).toBe(false)
    })

    it("rejects a dropped unit key", () => {
      const { wind_speed_mph: _omitted, ...units } = makeForecastDocument().units
      expect(parse({ units }).success).toBe(false)
    })
  })

  describe("quantiles", () => {
    it("accepts an empty map", () => {
      expect(parseHourly({ quantiles: {} }).success).toBe(true)
    })

    it("defaults a missing map to empty", () => {
      const { quantiles: _omitted, ...row } = makeHourlyRow()
      const result = parse({ hourly: [row] })
      expect(result.success).toBe(true)
      expect(result.data?.hourly[0].quantiles).toEqual({})
    })

    it("accepts a nineteen-level native grid", () => {
      const native = Object.fromEntries(
        Array.from({ length: 19 }, (_, index) => [
          String(Number(((index + 1) * 0.05).toFixed(2))),
          index,
        ]),
      )
      expect(parseHourly({ quantiles: { wind_gust_mph: native } }).success).toBe(true)
    })

    it("rejects a string quantile value", () => {
      const result = parseHourly({ quantiles: { temp_f: { "0.05": "cold" } } })
      expect(result.success).toBe(false)
    })
  })

  describe("metadata maps", () => {
    it("accepts empty release_ids, as most daily rows have", () => {
      const result = parse({ daily: [makeDailyRow({ release_ids: {} })] })
      expect(result.success).toBe(true)
    })

    it("defaults missing sources to an empty array", () => {
      const { sources: _omitted, ...document } = makeForecastDocument()
      const result = ForecastDocumentSchema.safeParse(document)
      expect(result.data?.sources).toEqual([])
    })
  })

  describe("status", () => {
    it("accepts degraded with a reason", () => {
      const result = parse({ status: "degraded", status_reason: "no live evidence" })
      expect(result.success).toBe(true)
    })

    it("rejects an unknown status", () => {
      expect(parse({ status: "fine" }).success).toBe(false)
    })
  })

  describe("versioning", () => {
    it("rejects a future schema version", () => {
      expect(parse({ schema_version: 2 }).success).toBe(false)
    })

    it("requires a publisher version", () => {
      expect(parse({ publisher_version: "" }).success).toBe(false)
    })
  })

  describe("timestamps", () => {
    it("accepts a Z-suffixed timestamp", () => {
      expect(parse({ issued_at: "2026-08-05T15:36:00Z" }).success).toBe(true)
    })

    it("accepts an explicit +00:00 offset", () => {
      expect(parse({ issued_at: "2026-08-05T15:36:00+00:00" }).success).toBe(true)
    })

    it("rejects an offset-less timestamp", () => {
      // datetime.utcnow().isoformat() produces this; reading it as local time
      // would shift the whole forecast by seven hours.
      expect(parse({ issued_at: "2026-08-05T15:36:00" }).success).toBe(false)
    })

    it("rejects a space-separated timestamp", () => {
      expect(parse({ issued_at: "2026-08-05 15:36:00+00:00" }).success).toBe(false)
    })

    it("accepts a null observation_at", () => {
      expect(parse({ observation_at: null }).success).toBe(true)
    })

    it("rejects a non-ISO date_local", () => {
      const result = parse({ daily: [makeDailyRow({ date_local: "08/05/2026" })] })
      expect(result.success).toBe(false)
    })
  })

  describe("timezone", () => {
    it("rejects a timezone other than the station's", () => {
      // Hour bucketing hardcodes America/Los_Angeles; a mismatch would scatter
      // hourly rows across the wrong local days.
      const result = parse({ timezone: "America/Denver" })
      expect(result.success).toBe(false)
    })
  })

  describe("lead fields", () => {
    it("accepts a fractional lead_hours", () => {
      expect(parseHourly({ lead_hours: 0.42 }).success).toBe(true)
    })

    it("rejects an unknown lead_bucket", () => {
      expect(parseHourly({ lead_bucket: "96-168h" }).success).toBe(false)
    })
  })

  it("rejects an out-of-range latitude", () => {
    expect(parse({ latitude: 91 }).success).toBe(false)
  })
})

import { describe, expect, it } from "vitest"
import {
  dressedGrid,
  makeDailyRow,
  makeForecastDocument,
  makeHourlyRow,
  parsedForecastDocument,
} from "@/lib/__fixtures__/forecast"
import {
  calculateForecastRanges,
  getForecastFreshness,
  mapForecastDocument,
} from "@/lib/forecast-mappers"
import { ForecastDocumentSchema } from "@/lib/forecast-schemas"
import { ForecastMetric } from "@/lib/types"

const NOW = new Date("2026-08-05T16:00:00Z")

function mapDocument(overrides: Record<string, unknown> = {}, now: Date = NOW) {
  return mapForecastDocument(parsedForecastDocument(overrides), now)
}

describe("getForecastFreshness", () => {
  it("reports a recent forecast as fresh", () => {
    const result = getForecastFreshness("2026-08-05T15:36:00+00:00", NOW)
    expect(result.freshness).toBe("fresh")
    expect(result.ageHours).toBeCloseTo(0.4, 2)
  })

  it("treats exactly three hours as still fresh", () => {
    expect(getForecastFreshness("2026-08-05T13:00:00Z", NOW).freshness).toBe("fresh")
  })

  it("reports a six-hour-old forecast as stale", () => {
    expect(getForecastFreshness("2026-08-05T10:00:00Z", NOW).freshness).toBe("stale")
  })

  it("treats exactly twelve hours as still stale", () => {
    expect(getForecastFreshness("2026-08-05T04:00:00Z", NOW).freshness).toBe("stale")
  })

  it("reports a day-old forecast as expired", () => {
    const result = getForecastFreshness("2026-08-04T10:00:00Z", NOW)
    expect(result.freshness).toBe("expired")
    expect(result.ageHours).toBeCloseTo(30, 5)
  })

  it("clamps publisher clock skew to a zero age rather than a negative one", () => {
    const result = getForecastFreshness("2026-08-05T16:30:00Z", NOW)
    expect(result.ageHours).toBe(0)
    expect(result.freshness).toBe("fresh")
  })
})

describe("mapForecastDocument", () => {
  it("carries document-level provenance onto the view model", () => {
    const forecast = mapDocument()
    expect(forecast.issuedAt).toBe("2026-08-05T15:36:00+00:00")
    expect(forecast.status).toBe("ready")
    expect(forecast.statusReason).toBeUndefined()
    expect(forecast.sources).toEqual(["nbm", "nws", "open_meteo"])
    expect(forecast.publisherVersion).toBe("1.0.0")
  })

  it("surfaces a degraded status and its reason", () => {
    const forecast = mapDocument({ status: "degraded", status_reason: "no live evidence" })
    expect(forecast.status).toBe("degraded")
    expect(forecast.statusReason).toBe("no live evidence")
  })

  it("labels each day with its abbreviated weekday", () => {
    // 2026-08-05 is a Wednesday.
    expect(mapDocument().days[0].day).toBe("WED")
  })

  it("attaches sun times per day", () => {
    expect(mapDocument().days[0].sunTimes.sunrise).toBeInstanceOf(Date)
  })

  describe("hour bucketing", () => {
    it("places an hourly row in its station-local day and hour slot", () => {
      // 15:00Z is 08:00 in PDT (UTC-7).
      const forecast = mapDocument()
      const hours = forecast.days[0].hours
      expect(hours[8]?.hour).toBe("08")
      expect(hours[8]?.date).toBe("2026-08-05")
    })

    it("buckets 22:00Z into the same local day, at 15:00", () => {
      const forecast = mapDocument({
        hourly: [makeHourlyRow({ valid_time: "2026-08-05T22:00:00+00:00" })],
      })
      expect(forecast.days[0].hours[15]?.hour).toBe("15")
    })

    it("rolls 07:00Z back into the previous local day", () => {
      // 07:00Z on the 6th is midnight PDT on the 6th; 06:00Z is 23:00 on the 5th.
      const forecast = mapDocument({
        hourly: [makeHourlyRow({ valid_time: "2026-08-06T06:00:00+00:00" })],
      })
      expect(forecast.days[0].hours[23]?.hour).toBe("23")
    })

    it("leaves unfilled hour slots undefined", () => {
      const hours = mapDocument().days[0].hours
      expect(hours[0]).toBeUndefined()
      expect(hours[23]).toBeUndefined()
    })

    it("gives days beyond the hourly horizon no hours at all", () => {
      const forecast = mapDocument({
        daily: [makeDailyRow(), makeDailyRow({ date_local: "2026-08-12", lead_days: 7 })],
      })
      expect(forecast.days[1].hours).toEqual([])
    })

    it("drops an hourly row whose day is not in the daily list", () => {
      const forecast = mapDocument({
        hourly: [makeHourlyRow({ valid_time: "2026-09-01T15:00:00+00:00" })],
      })
      expect(forecast.days[0].hours.filter(Boolean)).toHaveLength(0)
    })
  })

  describe("values", () => {
    it("takes daily temperature bounds from the row", () => {
      const day = mapDocument().days[0]
      expect(day.min_temp).toBe(69.99)
      expect(day.max_temp).toBe(95.54)
    })

    it("scales pop from a fraction to a percent", () => {
      const forecast = mapDocument({
        daily: [makeDailyRow({ values: { ...makeDailyRow().values, pop: 0.35 } })],
      })
      expect(forecast.days[0].pop).toBe(35)
    })

    it("maps a null value to undefined", () => {
      const forecast = mapDocument({
        daily: [makeDailyRow({ values: { ...makeDailyRow().values, temp_max_f: null } })],
      })
      expect(forecast.days[0].max_temp).toBeUndefined()
    })

    it("maps an absent variable to undefined", () => {
      const { temp_max_f: _omitted, ...values } = makeDailyRow().values
      const forecast = mapDocument({ daily: [makeDailyRow({ values })] })
      expect(forecast.days[0].max_temp).toBeUndefined()
    })

    it("derives daily humidity and wind bounds from the hourly rows", () => {
      const forecast = mapDocument({
        hourly: [
          makeHourlyRow(),
          makeHourlyRow({
            valid_time: "2026-08-05T16:00:00+00:00",
            values: { ...makeHourlyRow().values, humidity_pct: 40, wind_speed_mph: 12 },
          }),
        ],
      })
      const day = forecast.days[0]
      expect(day.min_humidity).toBe(18.17)
      expect(day.max_humidity).toBe(40)
      expect(day.min_wind).toBe(0.32)
      expect(day.max_wind).toBe(12)
    })

    it("leaves humidity and wind bounds undefined beyond the hourly horizon", () => {
      const forecast = mapDocument({
        daily: [makeDailyRow(), makeDailyRow({ date_local: "2026-08-12", lead_days: 7 })],
      })
      const day = forecast.days[1]
      expect(day.min_humidity).toBeUndefined()
      expect(day.max_humidity).toBeUndefined()
      expect(day.min_wind).toBeUndefined()
      expect(day.max_wind).toBeUndefined()
    })
  })

  describe("evidence", () => {
    it("marks a row with release ids as evidenced", () => {
      expect(mapDocument().days[0].hasEvidence).toBe(true)
    })

    it("marks a row with no release ids as unevidenced", () => {
      const forecast = mapDocument({ daily: [makeDailyRow({ release_ids: {} })] })
      expect(forecast.days[0].hasEvidence).toBe(false)
    })
  })

  describe("bands and methods", () => {
    it("derives a temperature band from the quantile grid", () => {
      expect(mapDocument().days[0].bands[ForecastMetric.TEMP]).toEqual({
        low: 79.14,
        high: 85.72,
        coverage: 0.8,
      })
    })

    it("leaves the band undefined when the row carries no quantiles", () => {
      const forecast = mapDocument({ daily: [makeDailyRow({ quantiles: {} })] })
      expect(forecast.days[0].bands[ForecastMetric.TEMP]).toBeUndefined()
    })

    it("falls back to the point value for pop bounds without quantiles", () => {
      const forecast = mapDocument({
        daily: [
          makeDailyRow({
            values: { ...makeDailyRow().values, pop: 0.4 },
            quantiles: {},
          }),
        ],
      })
      expect(forecast.days[0].min_pop).toBe(40)
      expect(forecast.days[0].max_pop).toBe(40)
    })

    it("uses the pop quantile band when present", () => {
      const forecast = mapDocument({
        daily: [
          makeDailyRow({
            quantiles: { pop: { "0.1": 0.2, "0.9": 0.6 } },
          }),
        ],
      })
      expect(forecast.days[0].min_pop).toBeCloseTo(20, 6)
      expect(forecast.days[0].max_pop).toBeCloseTo(60, 6)
    })

    it("carries the serving method per metric", () => {
      const day = mapDocument().days[0]
      expect(day.methods[ForecastMetric.TEMP]).toBe("inverse_mse")
      expect(day.methods[ForecastMetric.PRECIP]).toBeUndefined()
    })
  })

  describe("daytime", () => {
    it("marks a midday hour as daytime", () => {
      // 20:00Z is 13:00 PDT.
      const forecast = mapDocument({
        hourly: [makeHourlyRow({ valid_time: "2026-08-05T20:00:00+00:00" })],
      })
      expect(forecast.days[0].hours[13]?.isDaytime).toBe(true)
    })

    it("marks a pre-dawn hour as nighttime", () => {
      // 10:00Z is 03:00 PDT.
      const forecast = mapDocument({
        hourly: [makeHourlyRow({ valid_time: "2026-08-05T10:00:00+00:00" })],
      })
      expect(forecast.days[0].hours[3]?.isDaytime).toBe(false)
    })
  })

  describe("info", () => {
    it("carries the model-state fields onto the summary", () => {
      const info = mapDocument().info
      expect(info.status).toBe("ready")
      expect(info.statusReason).toBeUndefined()
      expect(info.issuedAt).toBe("2026-08-05T15:36:00+00:00")
      expect(info.freshness).toBe("fresh")
      expect(info.observationAt).toBe("2026-08-05T15:35:21+00:00")
      expect(info.releaseIds).toEqual(["c22474d379549f29"])
      expect(info.sources).toEqual(["nbm", "nws", "open_meteo"])
      expect(info.datasetFingerprint).toBe("718e5bfa65100a5b")
      expect(info.publisherVersion).toBe("1.0.0")
      expect(info.schemaVersion).toBe(1)
      expect(info.timezone).toBe("America/Los_Angeles")
      expect(info.hourlyRows).toBe(1)
      expect(info.dailyRows).toBe(1)
    })

    it("maps a null observation time to undefined", () => {
      expect(mapDocument({ observation_at: null }).info.observationAt).toBeUndefined()
    })

    it("computes evidence coverage as backed slots over value slots", () => {
      const info = mapDocument().info
      // The hourly fixture row carries 8 values and 1 release id; daily 4 and 1.
      expect(info.evidenceCoverage.hourly).toBeCloseTo(0.125, 10)
      expect(info.evidenceCoverage.daily).toBeCloseTo(0.25, 10)
    })

    it("reports zero coverage for an empty product", () => {
      expect(mapDocument({ hourly: [] }).info.evidenceCoverage.hourly).toBe(0)
    })

    it("sorts method counts descending with a name tiebreak", () => {
      const info = mapDocument({
        hourly: [
          makeHourlyRow({ methods: { temp_f: "gbm_quantile", pop: "gbm_quantile" } }),
          makeHourlyRow({
            valid_time: "2026-08-05T16:00:00+00:00",
            methods: { temp_f: "best_provider" },
          }),
        ],
        daily: [makeDailyRow({ methods: { temp_max_f: "analog_ensemble" } })],
      }).info
      expect(info.methodCounts).toEqual([
        { name: "gbm_quantile", count: 2 },
        { name: "analog_ensemble", count: 1 },
        { name: "best_provider", count: 1 },
      ])
    })

    it("tallies selection reasons across hourly and daily rows", () => {
      const info = mapDocument({
        hourly: [
          makeHourlyRow({
            selection_reasons: { temp_f: "lowest MAE", pop: "lowest MAE (gated)" },
          }),
        ],
        daily: [makeDailyRow({ selection_reasons: { temp_max_f: "lowest MAE" } })],
      }).info
      expect(info.reasonCounts).toEqual([
        { name: "lowest MAE", count: 2 },
        { name: "lowest MAE (gated)", count: 1 },
      ])
    })

    it("keeps hourly rows outside the daily horizon out of the aggregates", () => {
      const info = mapDocument({
        hourly: [
          makeHourlyRow(),
          makeHourlyRow({
            valid_time: "2026-09-01T15:00:00+00:00",
            methods: { temp_f: "orphan_method" },
            selection_reasons: { temp_f: "orphan reason" },
            release_ids: {},
          }),
        ],
      }).info
      expect(info.methodCounts.map((count) => count.name)).not.toContain("orphan_method")
      expect(info.reasonCounts.map((count) => count.name)).not.toContain("orphan reason")
      // Coverage spans only the in-horizon row's slots: 1 backed of 8.
      expect(info.evidenceCoverage.hourly).toBeCloseTo(0.125, 10)
    })

    it("stays empty on documents published before 1.3.0", () => {
      const { selection_reasons: _hourly, ...hourlyRow } = makeHourlyRow()
      const { selection_reasons: _daily, ...dailyRow } = makeDailyRow()
      const { release_ids: _cohort, ...document } = makeForecastDocument({
        hourly: [hourlyRow],
        daily: [dailyRow],
      })
      const info = mapForecastDocument(ForecastDocumentSchema.parse(document), NOW).info
      expect(info.reasonCounts).toEqual([])
      expect(info.releaseIds).toEqual([])
    })
  })

  it("spans every day when computing document ranges", () => {
    const forecast = mapDocument({
      daily: [
        makeDailyRow(),
        makeDailyRow({
          date_local: "2026-08-06",
          lead_days: 1,
          values: { temp_max_f: 101, temp_min_f: 60, pop: 0, precip_sum_in: 0 },
        }),
      ],
    })
    expect(forecast.ranges.min_temp).toBe(60)
    expect(forecast.ranges.max_temp).toBe(101)
  })
})

describe("calculateForecastRanges", () => {
  it("returns zeros for an empty day list", () => {
    expect(calculateForecastRanges([])).toEqual({
      min_temp: 0,
      max_temp: 0,
      min_pop: 0,
      max_pop: 0,
      min_precip: 0,
      max_precip: 0,
      min_humidity: 0,
      max_humidity: 0,
      min_wind: 0,
      max_wind: 0,
    })
  })

  it("ignores days whose metric is undefined rather than producing NaN", () => {
    const forecast = mapDocument({
      daily: [
        makeDailyRow({ values: { ...makeDailyRow().values, temp_max_f: null } }),
        makeDailyRow({
          date_local: "2026-08-06",
          lead_days: 1,
          values: { temp_max_f: 90, temp_min_f: 70, pop: 0, precip_sum_in: 0 },
          quantiles: { temp_max_f: dressedGrid },
        }),
      ],
    })
    expect(Number.isNaN(forecast.ranges.max_temp)).toBe(false)
    expect(forecast.ranges.max_temp).toBe(90)
  })
})

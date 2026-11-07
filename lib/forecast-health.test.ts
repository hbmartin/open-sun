import { describe, expect, it } from "vitest"
import { makeDailyRow, makeHourlyRow, parsedForecastDocument } from "@/lib/__fixtures__/forecast"
import { forecastHealth } from "@/lib/forecast-health"

describe("forecast observation and output health", () => {
  it("does not let an approved release hide missing observations and persistence outputs", () => {
    const health = forecastHealth(
      parsedForecastDocument({
        status: "ready",
        observation_at: null,
        hourly: [
          makeHourlyRow({
            values: {
              temp_f: 65,
              humidity_pct: 30,
              dew_point_f: null,
              wind_speed_mph: 0,
              wind_gust_mph: 0,
              precip_in: 0,
              pop: 0,
            },
          }),
        ],
      }),
    )
    expect(health.status).toBe("attention")
    expect(health.observation.status).toBe("missing")
    expect(health.outputs.status).toBe("partial")
    expect(health.outputs.hourly.availableValues).toBe(6)
    expect(health.outputs.hourly.missingByVariable).toEqual({
      dew_point_f: 1,
      pressure_sea_inhg: 1,
    })
  })

  it.each([
    ["2026-08-05T15:06:00.001Z", "fresh"],
    ["2026-08-05T15:06:00.000001Z", "fresh"],
    ["2026-08-05T15:06:00Z", "stale"],
    ["2026-08-05T15:05:59.999999Z", "stale"],
    ["2026-08-04T15:36:00Z", "stale"],
    ["2026-08-05T15:36:01Z", "invalid"],
    ["2026-08-05T15:36:00.000001Z", "invalid"],
    [null, "missing"],
  ])("classifies observation %s at the exact issue-time cutoff", (observation_at, expected) => {
    expect(forecastHealth(parsedForecastDocument({ observation_at })).observation.status).toBe(
      expected,
    )
  })

  it("counts omitted and all-null products without treating zero rain as missing", () => {
    const complete = forecastHealth(parsedForecastDocument())
    expect(complete.outputs.hourly.availableValues).toBe(8)
    expect(complete.outputs.daily.availableValues).toBe(4)
    expect(complete.status).toBe("ok")
    for (const daily of [[], [makeDailyRow({ values: {} })]]) {
      const health = forecastHealth(parsedForecastDocument({ daily }))
      expect(health.outputs.status).toBe("missing")
      expect(health.outputs.daily.availableValues).toBe(0)
    }
  })

  it("classifies malformed in-memory timestamps as invalid", () => {
    const health = forecastHealth(parsedForecastDocument({ observation_at: "invalid" }))
    expect(health.observation.status).toBe("invalid")
    expect(health.observation.ageSeconds).toBeNull()
  })

  it("derives health from the document even if copied metadata claims it is healthy", () => {
    expect(
      forecastHealth(parsedForecastDocument({ observation_at: null, health: { status: "ok" } }))
        .status,
    ).toBe("attention")
  })
})

import { describe, expect, it } from "vitest"
import fixture from "@/lib/__fixtures__/town-card.json"
import { mapForecastToCondition } from "@/lib/forecast-conditions"
import { type DayPartRun, type NextHoursPoint, buildSummary } from "@/lib/next-hours"
import { quantileBands } from "@/lib/quantiles"
import { getTimes } from "@/lib/suncalc"

// The exact fixture is also consumed by the Python publisher and town Worker.
describe("town-card publisher parity", () => {
  it("publishes the same normalized bands as Open Sun", () => {
    for (const hour of fixture.expected.forecast.hours) {
      const raw = fixture.input.forecast.hourly.find(
        (h) => Date.parse(h.valid_time) === Date.parse(hour.valid_time),
      )
      const expected = raw ? quantileBands(raw.quantiles.temp_f) : []
      for (const [index, band] of hour.bands.entries()) {
        expect(band.coverage).toBe(expected[index].coverage)
        expect(band.low_f).toBeCloseTo(expected[index].low, 8)
        expect(band.high_f).toBeCloseTo(expected[index].high, 8)
      }
      expect(hour.bands).toHaveLength(expected.length)
    }
  })
  it("publishes the same outlook as Open Sun", () => {
    const points: NextHoursPoint[] = []
    const runs: DayPartRun[] = []
    const labels = ["Overnight", "Morning", "Afternoon", "Evening"] as const
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      hour: "numeric",
      hourCycle: "h23",
    })
    for (const [offset, hour] of fixture.expected.forecast.hours.entries()) {
      const raw = fixture.input.forecast.hourly.find(
        (h) => Date.parse(h.valid_time) === Date.parse(hour.valid_time),
      )
      const at = new Date(hour.valid_time)
      const localHour = Number(formatter.format(at))
      const label = labels[Math.floor(localHour / 6)]
      if (runs.at(-1)?.label === label) runs.at(-1)!.endOffset = offset + 1
      else runs.push({ label, heading: label, startOffset: offset, endOffset: offset + 1 })
      if (!raw) continue
      const sun = getTimes(at, 34.2768, -117.1692)
      points.push({
        offset,
        hour: String(localHour),
        bands: [],
        condition: mapForecastToCondition({
          pop: raw.values.pop * 100,
          precip: raw.values.precip_in,
          humidity: raw.values.humidity_pct,
          wind: raw.values.wind_speed_mph,
          isDaytime: at >= sun.sunrise && at <= sun.sunset,
        }),
      })
    }
    expect(buildSummary(points, runs)).toBe(fixture.expected.forecast.outlook)
  })
})

import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { makeDailyRow, makeHourlyRow, parsedForecastDocument } from "@/lib/__fixtures__/forecast"
import { mapForecastDocument } from "@/lib/forecast-mappers"
import { ForecastDocumentSchema } from "@/lib/forecast-schemas"
import { buildNextHours } from "@/lib/next-hours"
import { ForecastMetric } from "@/lib/types"

// 16:00Z is 09:00 PDT on the fixture's station-local day.
const NOW = new Date("2026-08-05T16:00:00Z")

/** Consecutive hourly rows starting at the given UTC time. */
function hourlyRows(startIso: string, count: number, overrides: Record<string, unknown> = {}) {
  const start = new Date(startIso).getTime()
  return Array.from({ length: count }, (_, index) =>
    makeHourlyRow({
      valid_time: new Date(start + index * 3_600_000).toISOString().replace(".000Z", "+00:00"),
      ...overrides,
    }),
  )
}

function daysFor(overrides: Record<string, unknown>) {
  return mapForecastDocument(parsedForecastDocument(overrides), NOW).days
}

const twoDays = {
  daily: [makeDailyRow(), makeDailyRow({ date_local: "2026-08-06", lead_days: 1 })],
}

describe("buildNextHours", () => {
  it("assembles a 24-hour window across midnight", () => {
    // 16:00Z on the 5th through 15:00Z on the 6th is 09:00 local to 08:00 local.
    const days = daysFor({ ...twoDays, hourly: hourlyRows("2026-08-05T16:00:00Z", 24) })
    const model = buildNextHours(days, NOW, ForecastMetric.TEMP)
    expect(model).toBeDefined()
    expect(model?.points).toHaveLength(24)
    expect(model?.points[0]).toMatchObject({ offset: 0, hour: "09" })
    expect(model?.points[23]).toMatchObject({ offset: 23, hour: "08" })
    expect(model?.startHour).toBe(9)
  })

  it("excludes hours before the current one", () => {
    // 10:00Z is 03:00 local, six hours before the window opens.
    const days = daysFor({
      ...twoDays,
      hourly: [
        makeHourlyRow({ valid_time: "2026-08-05T10:00:00+00:00" }),
        ...hourlyRows("2026-08-05T16:00:00Z", 24),
      ],
    })
    const model = buildNextHours(days, NOW, ForecastMetric.TEMP)
    expect(model?.points).toHaveLength(24)
    expect(model?.points.every((point) => point.offset >= 0)).toBe(true)
  })

  it("emits no point for a missing hour slot", () => {
    const rows = hourlyRows("2026-08-05T16:00:00Z", 24)
    rows.splice(5, 1)
    const days = daysFor({ ...twoDays, hourly: rows })
    const model = buildNextHours(days, NOW, ForecastMetric.TEMP)
    expect(model?.points).toHaveLength(23)
    expect(model?.points.find((point) => point.offset === 5)).toBeUndefined()
  })

  it("groups the window into day-part runs, partial at both ends", () => {
    const days = daysFor({ ...twoDays, hourly: hourlyRows("2026-08-05T16:00:00Z", 24) })
    const model = buildNextHours(days, NOW, ForecastMetric.TEMP)
    expect(model?.dayParts.map((run) => run.label)).toEqual([
      "Morning",
      "Afternoon",
      "Evening",
      "Overnight",
      "Morning",
    ])
    // 09:00-11:00 local fills the partial first run.
    expect(model?.dayParts[0]).toMatchObject({ startOffset: 0, endOffset: 3 })
    expect(model?.dayParts[1]).toMatchObject({ startOffset: 3, endOffset: 9 })
    expect(model?.dayParts.at(-1)).toMatchObject({ startOffset: 21, endOffset: 24 })
  })

  it("takes each run's rain chance from its highest hourly pop", () => {
    const rows = hourlyRows("2026-08-05T16:00:00Z", 24)
    // Offset 4 sits in the Afternoon run; pop arrives as a fraction.
    rows[4] = makeHourlyRow({
      valid_time: rows[4].valid_time,
      values: { ...makeHourlyRow().values, pop: 0.45 },
    })
    const days = daysFor({ ...twoDays, hourly: rows })
    const model = buildNextHours(days, NOW, ForecastMetric.TEMP)
    expect(model?.dayParts[1].maxPop).toBe(45)
    expect(model?.dayParts[2].maxPop).toBe(0)
  })

  it("places the now marker by minutes into the current hour", () => {
    const days = daysFor({ ...twoDays, hourly: hourlyRows("2026-08-05T16:00:00Z", 24) })
    const model = buildNextHours(days, new Date("2026-08-05T16:30:00Z"), ForecastMetric.TEMP)
    expect(model?.nowFraction).toBeCloseTo(30 / 60 / 24, 10)
  })

  it("returns undefined when fewer than two hours carry a value", () => {
    const days = daysFor({ ...twoDays, hourly: hourlyRows("2026-08-05T16:00:00Z", 1) })
    expect(buildNextHours(days, NOW, ForecastMetric.TEMP)).toBeUndefined()
  })

  it("returns undefined when the forecast does not cover today", () => {
    const days = daysFor({ ...twoDays, hourly: hourlyRows("2026-08-05T16:00:00Z", 24) })
    expect(
      buildNextHours(days, new Date("2026-09-01T16:00:00Z"), ForecastMetric.TEMP),
    ).toBeUndefined()
  })

  it("widens the domain to cover the uncertainty band", () => {
    const days = daysFor({ ...twoDays, hourly: hourlyRows("2026-08-05T16:00:00Z", 24) })
    const model = buildNextHours(days, NOW, ForecastMetric.TEMP)
    // The fixture's dressed grid spans 79.14-85.72 around a temp of 82.29.
    expect(model?.domainMin).toBe(79.14)
    expect(model?.domainMax).toBe(85.72)
  })

  it("serves humidity values without a band", () => {
    const days = daysFor({ ...twoDays, hourly: hourlyRows("2026-08-05T16:00:00Z", 24) })
    const model = buildNextHours(days, NOW, ForecastMetric.HUMIDITY)
    expect(model?.points[0].value).toBe(18.17)
    expect(model?.points[0].bandLow).toBeUndefined()
    // Every fixture hour carries the same humidity, so the degenerate domain
    // pads out by one on each side.
    expect(model?.domainMin).toBe(17.17)
    expect(model?.domainMax).toBe(19.17)
  })

  it("writes a summary from the first two day parts and the next sun event", () => {
    const days = daysFor({ ...twoDays, hourly: hourlyRows("2026-08-05T16:00:00Z", 24) })
    const model = buildNextHours(days, NOW, ForecastMetric.TEMP)
    // The fixture's dry, 18% humidity hours read as clear skies all day.
    expect(model?.summary).toMatch(/^Clear skies this morning and this afternoon\. Sunset at \d/u)
  })

  it("names the coming rain in the summary", () => {
    const days = daysFor({
      ...twoDays,
      hourly: hourlyRows("2026-08-05T16:00:00Z", 24, {
        values: { ...makeHourlyRow().values, pop: 0.7 },
      }),
    })
    const model = buildNextHours(days, NOW, ForecastMetric.TEMP)
    expect(model?.summary).toMatch(/^A chance of rain this morning and this afternoon\./u)
  })
})

describe("against the captured published document", () => {
  it("builds a full window at issue time", () => {
    const parsed = ForecastDocumentSchema.parse(
      JSON.parse(readFileSync("lib/__fixtures__/forecast.sample.json", "utf8")),
    )
    const now = new Date(parsed.issued_at)
    const forecast = mapForecastDocument(parsed, now)
    for (const metric of Object.values(ForecastMetric)) {
      const model = buildNextHours(forecast.days, now, metric)
      expect(model).toBeDefined()
      expect(model?.points.length).toBeGreaterThanOrEqual(20)
      expect(model?.dayParts.length).toBeGreaterThanOrEqual(4)
      expect(model?.dayParts.length).toBeLessThanOrEqual(5)
      expect(Number.isFinite(model?.domainMin)).toBe(true)
      expect(Number.isFinite(model?.domainMax)).toBe(true)
    }
  })
})

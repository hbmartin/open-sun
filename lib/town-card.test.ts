import type { mapForecastDocument as MapForecastDocument } from "@/lib/forecast-mappers"
import type { ForecastDocument } from "@/lib/forecast-schemas"
import type { QuantileBand } from "@/lib/quantiles"
import type {
  getStationDate as GetStationDate,
  getStationHour as GetStationHour,
  getStationSunTimes as GetStationSunTimes,
} from "@/lib/utils"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { makeDailyRow, makeForecastDocument, makeHourlyRow } from "@/lib/__fixtures__/forecast"
import edgeFixture from "@/lib/__fixtures__/town-card-edges.json"
import fixture from "@/lib/__fixtures__/town-card.json"
import { buildNextHours, buildSummary } from "@/lib/next-hours"
import { quantileAt } from "@/lib/quantiles"
import { ForecastMetric } from "@/lib/types"

interface WireBand {
  coverage: number
  low_f: number
  high_f: number
}
// JSON inference makes keys absent in other cases optional. Normalize the
// grids to numeric records without asserting away those optional properties.
const edges = {
  ...edgeFixture,
  quantiles: edgeFixture.quantiles.map((testCase) => ({
    name: testCase.name,
    temp_f: testCase.temp_f,
    at: testCase.at,
    ui_bands: testCase.ui_bands,
    card_bands: testCase.card_bands,
    grid: Object.fromEntries(
      Object.entries(testCase.grid).filter(
        (entry): entry is [string, number] => typeof entry[1] === "number",
      ),
    ),
  })),
}

let mapForecastDocument: typeof MapForecastDocument
let getStationDate: typeof GetStationDate
let getStationHour: typeof GetStationHour
let getStationSunTimes: typeof GetStationSunTimes
let parseDocument: (document: unknown) => ForecastDocument

beforeAll(async () => {
  vi.resetModules()
  ;({ mapForecastDocument } = await import("@/lib/forecast-mappers"))
  ;({ getStationDate, getStationHour, getStationSunTimes } = await import("@/lib/utils"))
  const { ForecastDocumentSchema } = await import("@/lib/forecast-schemas")
  parseDocument = (document) => ForecastDocumentSchema.parse(document)
})
afterAll(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

function documentFor(overrides: Record<string, unknown> = {}): ForecastDocument {
  return parseDocument(
    makeForecastDocument({
      ...fixture.input.forecast,
      hourly: fixture.input.forecast.hourly.map((row) => makeHourlyRow(row)),
      daily: fixture.input.forecast.daily.map((row) => makeDailyRow(row)),
      ...overrides,
    }),
  )
}

function expectBands(actual: QuantileBand[], expected: WireBand[]) {
  expect(actual).toHaveLength(expected.length)
  for (const [index, band] of actual.entries()) {
    expect(band.coverage).toBe(expected[index].coverage)
    expect(band.low).toBeCloseTo(expected[index].low_f, 8)
    expect(band.high).toBeCloseTo(expected[index].high_f, 8)
  }
}

describe("town-card publisher contracts", () => {
  it.each(edges.condition_only_duplicates)(
    "uses whole-row last-usable replacement for $name",
    (testCase) => {
      const original = documentFor()
      const first = original.hourly[0]
      const replacement = makeHourlyRow({
        ...first,
        values: testCase.values,
        quantiles: {},
      })
      const mapped = mapForecastDocument(
        documentFor({ hourly: [...original.hourly, replacement] }),
        new Date(first.valid_time),
      )
      const hour = mapped.days
        .flatMap((day) => day.hours)
        .find((point) => point?.validTime === first.valid_time)!
      expect(hour.temp).toBeUndefined()
      expect(hour.pop).toBeUndefined()
      expect(hour.bands[ForecastMetric.TEMP]).toEqual([])
    },
  )

  it("intentionally keeps the UI's clear-sky fallback for temperature-only hours", () => {
    const testCase = edges.temperature_only
    const hours = fixture.expected.forecast.hours
    const start = new Date(hours[0].valid_time)
    const hourly = hours.map((hour) =>
      makeHourlyRow({
        valid_time: hour.valid_time,
        values: { temp_f: testCase.temp_f },
        quantiles: {},
      }),
    )
    const mapped = mapForecastDocument(documentFor({ hourly }), start)
    const model = buildNextHours(mapped.days, start, ForecastMetric.TEMP)!
    expect(model.points).toHaveLength(24)
    expect(model.points.map((point) => point.value)).toEqual(
      Array.from({ length: 24 }, () => testCase.temp_f),
    )
    expect(model.summary).toBe(testCase.ui_outlook)
    expect(buildSummary(model.points, model.dayParts)).toBe(testCase.ui_outlook)
    expect(model.summary).not.toBe(testCase.card_outlook)
  })

  it("matches mapped UI bands on the shared document", () => {
    const forecast = mapForecastDocument(
      documentFor(),
      new Date(fixture.input.forecast.published_at),
    )
    const hours = forecast.days.flatMap((day) => day.hours)
    for (const hour of fixture.expected.forecast.hours) {
      const mapped = hours.find((point) => point?.validTime === hour.valid_time)
      expect(mapped).toBeDefined()
      expectBands(mapped!.bands[ForecastMetric.TEMP] ?? [], hour.bands)
    }
  })

  it("matches the production summary when the windows align", () => {
    const start = new Date(fixture.expected.forecast.hours[0].valid_time)
    const forecast = mapForecastDocument(documentFor(), start)
    const model = buildNextHours(forecast.days, start, ForecastMetric.TEMP)!
    expect(model.points[0].offset).toBe(0)
    expect(model.summary).toBe(fixture.expected.forecast.outlook)
    expect(buildSummary(model.points, model.dayParts)).toBe(fixture.expected.forecast.outlook)
  })

  it("intentionally starts the card at the next full hour instead of the UI's current hour", () => {
    const published = new Date(fixture.input.forecast.published_at)
    const forecast = mapForecastDocument(documentFor(), published)
    const model = buildNextHours(forecast.days, published, ForecastMetric.TEMP)!
    expect(model.startHour).toBe(5)
    expect(model.points[0].offset).toBe(1)
    expect(Number(getStationHour(new Date(fixture.expected.forecast.hours[0].valid_time)))).toBe(6)
    expect(model.summary).toBeUndefined() // No published rows for the first Overnight run.
    expect(fixture.expected.forecast.outlook).toBe("Rain this morning and this afternoon.")
  })

  it.each(edges.quantiles)(
    "shares interpolation and explicitly checks card nesting: $name",
    (testCase) => {
      expect(quantileAt(testCase.grid, testCase.at.probability)).toBeCloseTo(testCase.at.value, 8)
      const row = makeHourlyRow({
        valid_time: fixture.input.forecast.hourly[0].valid_time,
        values: { temp_f: testCase.temp_f },
        quantiles: { temp_f: testCase.grid },
      })
      const mapped = mapForecastDocument(documentFor({ hourly: [row] }), new Date(row.valid_time))
      const hour = mapped.days.flatMap((day) => day.hours).find((point) => point !== undefined)!
      expectBands(hour.bands[ForecastMetric.TEMP] ?? [], testCase.ui_bands)
      if (testCase.name === "crossed nonnested intervals") {
        const mappedBands = hour.bands[ForecastMetric.TEMP]!
        expect(mappedBands).toHaveLength(3)
        expect(mappedBands[1].low).toBeLessThan(mappedBands[0].low)
      } else {
        expectBands(hour.bands[ForecastMetric.TEMP] ?? [], testCase.card_bands)
      }
      if (testCase.temp_f === null) {
        expect(hour.temp).toBeUndefined()
        expect(hour.bands[ForecastMetric.TEMP]).toHaveLength(3)
      }
    },
  )

  it.each(edges.sun_events)(
    "matches shared SunCalc event milliseconds: $date_local",
    (testCase) => {
      const sun = getStationSunTimes(testCase.date_local)
      expect(sun.sunrise.toISOString()).toBe(testCase.sunrise)
      expect(sun.sunset.toISOString()).toBe(testCase.sunset)
    },
  )

  it.each(edges.daylight)(
    "uses the production mapper's sunrise/sunset day: $valid_time",
    (testCase) => {
      const at = new Date(testCase.valid_time)
      const row = makeHourlyRow({ valid_time: testCase.valid_time })
      const document = documentFor({
        hourly: [row],
        daily: [makeDailyRow({ date_local: getStationDate(at) })],
      })
      const mapped = mapForecastDocument(document, at)
      const hour = mapped.days[0].hours[Number(getStationHour(at))]!
      const sun = getStationSunTimes(getStationDate(at))
      expect(hour.isDaytime).toBe(testCase.is_daytime)
      expect(hour.isDaytime).toBe(at >= sun.sunrise && at <= sun.sunset)
    },
  )

  it.each(edges.dst)(
    "documents the UI's fixed local slots versus the card's absolute hours: $name",
    (testCase) => {
      const start = new Date(testCase.published_at)
      const times = Array.from({ length: 24 }, (_, i) => new Date(start.getTime() + i * 3_600_000))
      const hourly = times.map((at, i) =>
        makeHourlyRow({
          valid_time: at.toISOString(),
          values: {
            temp_f: 40 + i,
            humidity_pct: Number(getStationHour(at)) < 6 ? 30 : 90,
          },
          quantiles: { temp_f: { "0.05": 30 + i, "0.95": 50 + i } },
        }),
      )
      const daily = [...new Set(times.map((at) => getStationDate(at)))].map((day) =>
        makeDailyRow({ date_local: day }),
      )
      const mapped = mapForecastDocument(documentFor({ hourly, daily }), start)
      const model = buildNextHours(mapped.days, start, ForecastMetric.TEMP)!
      const fallBack = testCase.name === "fall back"
      const retainedIndices = Array.from({ length: 24 }, (_, i) => i).filter(
        (i) => !fallBack || i !== 1,
      )
      const expectedOffsets = retainedIndices.map((i) => {
        if (fallBack) {
          return Math.max(0, i - 1)
        }
        return i < 2 ? i : i + 1
      })
      expect(model.points.map((point) => point.offset)).toEqual(expectedOffsets)
      expect(model.points.map((point) => point.value)).toEqual(retainedIndices.map((i) => 40 + i))
      expect(model.points.map((point) => point.bands[0].low)).toEqual(
        retainedIndices.map((i) => 30 + i),
      )
      const mappedHours = mapped.days
        .flatMap((day) => day.hours)
        .filter((hour) => hour !== undefined)
      expect(mappedHours.map((hour) => hour.validTime)).toEqual(
        retainedIndices.map((i) => times[i].toISOString()),
      )
      expect(mapped.days.map((day) => day.date)).toEqual(
        fallBack ? ["2026-11-01"] : ["2026-03-08", "2026-03-09"],
      )
      expect(model.summary).toBe("Clear skies overnight, cloudy this morning.")
      if (testCase.name === "fall back") {
        expect(model.points.find((point) => point.offset === 1)?.value).toBe(42)
        expect(mapped.days[0].hours[1]?.validTime).toBe(times[2].toISOString())
      } else {
        expect(mapped.days[0].hours[2]).toBeUndefined()
        expect(model.points.find((point) => point.offset === 2)).toBeUndefined()
        expect(model.points.find((point) => point.offset === 3)?.value).toBe(42)
      }
    },
  )
})

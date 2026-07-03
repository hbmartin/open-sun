import { afterEach, describe, expect, it, vi } from "vitest"
import {
  fetchCurrentWeatherData,
  fetchHourlyDataRange,
  fetchLastWeekData,
} from "@/lib/fetcher"

function stubFetchJson(payload: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    json: () => Promise.resolve(payload),
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

function makeRangeItem(overrides: Record<string, unknown> = {}) {
  return {
    date: "2026-06-01",
    min_outTemp: 50,
    avg_outTemp: 60,
    max_outTemp: 70,
    min_outHumi: 40,
    avg_outHumi: 55,
    max_outHumi: 80,
    max_gustspeed: 12,
    min_avgwind: 1,
    avg_avgwind: 4,
    max_avgwind: 8,
    avg_rainofhourly: 0,
    min_uvi: 0,
    avg_uvi: 3,
    max_uvi: 7,
    min_solarrad: 0,
    avg_solarrad: 450,
    max_solarrad: 900,
    ...overrides,
  }
}

const currentWeatherFixture = {
  data: {
    inTemp: 71.2,
    inHumi: 45,
    AbsPress: 29.8,
    RelPress: 30,
    outTemp: 64.5,
    outHumi: 58,
    windir: 270,
    avgwind: 4.5,
    gustspeed: 9.2,
    dailygust: 15.4,
    solarrad: 512.3,
    uv: 1200,
    uvi: 5,
    pm25: null,
    rainofhourly: 0,
    eventrain: 0.12,
  },
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("fetchCurrentWeatherData", () => {
  it("returns the validated observation with computed sun times", async () => {
    stubFetchJson(currentWeatherFixture)

    const observation = await fetchCurrentWeatherData()

    expect(observation.outTemp).toBe(64.5)
    expect(observation.pm25).toBeNull()
    expect(observation.sunTimes.sunrise).toBeInstanceOf(Date)
    expect(observation.sunTimes.sunset).toBeInstanceOf(Date)
  })

  it("rejects when the API response does not match the schema", async () => {
    stubFetchJson({ data: { outTemp: "warm" } })

    await expect(fetchCurrentWeatherData()).rejects.toThrow()
  })
})

describe("fetchLastWeekData", () => {
  it("returns days newest-first with ranges across the week", async () => {
    stubFetchJson({
      data: [
        makeRangeItem({ date: "2026-06-01", min_outTemp: 48, max_outTemp: 66 }),
        makeRangeItem({ date: "2026-06-02", min_outTemp: 52, max_outTemp: 74 }),
      ],
    })

    const weekly = await fetchLastWeekData()

    expect(weekly.data.map((day) => day.date)).toEqual([
      "2026-06-02",
      "2026-06-01",
    ])
    expect(weekly.ranges.min_outTemp).toBe(48)
    expect(weekly.ranges.max_outTemp).toBe(74)
  })

  it("rejects when the API payload is malformed", async () => {
    stubFetchJson({ data: [{ date: "2026-06-01" }] })

    await expect(fetchLastWeekData()).rejects.toThrow()
  })
})

describe("fetchHourlyDataRange", () => {
  it("appends start_date when using the localhost API", async () => {
    const fetchMock = stubFetchJson({
      data: {
        "2026-06-01": [{ ...makeRangeItem(), hour: "00" }],
      },
    })

    await fetchHourlyDataRange("2026-06-01")

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("start_date=2026-06-01"),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it("maps hourly data keyed by date, preserving missing hours", async () => {
    stubFetchJson({
      data: {
        "2026-06-01": [
          null,
          { ...makeRangeItem({ min_outTemp: 44 }), hour: "01" },
        ],
      },
    })

    const result = await fetchHourlyDataRange("2026-06-01")

    expect(Object.keys(result)).toEqual(["2026-06-01"])
    expect(result["2026-06-01"].data[0]).toBeUndefined()
    expect(result["2026-06-01"].data[1]?.hour).toBe("01")
    expect(result["2026-06-01"].ranges.min_outTemp).toBe(44)
  })

  it("rejects when the API payload is malformed", async () => {
    stubFetchJson({ data: { "2026-06-01": [{ hour: "00" }] } })

    await expect(fetchHourlyDataRange("2026-06-01")).rejects.toThrow()
  })
})

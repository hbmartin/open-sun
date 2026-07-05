import type { RangeObservation } from "@/lib/types"
import {
  calculateRanges,
  mapDailyApiResponse,
  mapHourlyApiResponse,
} from "@/lib/mappers"
import { getSunTimes } from "@/lib/utils"

beforeAll(() => {
  process.env.LOCATION_LATITUDE = "37.7749"
  process.env.LOCATION_LONGITUDE = "-122.4194"
})

function makeRangeObs(overrides: Partial<RangeObservation> = {}): RangeObservation {
  return {
    date: "2025-07-01",
    min_outTemp: 60,
    avg_outTemp: 72,
    max_outTemp: 85,
    min_outHumi: 30,
    avg_outHumi: 50,
    max_outHumi: 70,
    max_gustspeed: 15,
    min_avgwind: 2,
    max_avgwind: 10,
    avg_avgwind: 5,
    avg_rainofhourly: 0,
    avg_uvi: 6,
    avg_solarrad: 600,
    min_uvi: 0,
    max_uvi: 10,
    min_solarrad: 0,
    max_solarrad: 900,
    ...overrides,
  }
}

describe("calculateRanges", () => {
  it("returns correct min/max across multiple observations", () => {
    const obs1 = makeRangeObs({ min_outTemp: 50, max_outTemp: 80 })
    const obs2 = makeRangeObs({ min_outTemp: 55, max_outTemp: 90 })
    const ranges = calculateRanges([obs1, obs2])
    expect(ranges.min_outTemp).toBe(50)
    expect(ranges.max_outTemp).toBe(90)
  })

  it("handles a single observation", () => {
    const obs = makeRangeObs()
    const ranges = calculateRanges([obs])
    expect(ranges.min_outTemp).toBe(60)
    expect(ranges.max_outTemp).toBe(85)
    expect(ranges.max_gustspeed).toBe(15)
  })

  it("computes all range fields", () => {
    const obs = makeRangeObs()
    const ranges = calculateRanges([obs])
    expect(ranges).toEqual({
      min_outTemp: 60,
      max_outTemp: 85,
      min_outHumi: 30,
      max_outHumi: 70,
      max_gustspeed: 15,
      min_avgwind: 2,
      max_avgwind: 10,
      min_uvi: 0,
      max_uvi: 10,
      min_solarrad: 0,
      max_solarrad: 900,
    })
  })
})

describe("mapDailyApiResponse", () => {
  const apiItem = {
    date: "2025-07-01",
    min_outTemp: 60,
    avg_outTemp: 72,
    max_outTemp: 85,
    min_outHumi: 30,
    avg_outHumi: 50,
    max_outHumi: 70,
    max_gustspeed: 15,
    min_avgwind: 2,
    max_avgwind: 10,
    avg_avgwind: 5,
    avg_rainofhourly: 0,
    avg_uvi: 6,
    avg_solarrad: 600,
    min_uvi: 0,
    max_uvi: 10,
    min_solarrad: 0,
    max_solarrad: 900,
  }

  it("maps API response to DayData with day abbreviation", () => {
    const result = mapDailyApiResponse({ data: [apiItem] })
    expect(result).toHaveLength(1)
    expect(result[0].day).toBe("TUE") // 2025-07-01 is a Tuesday
    expect(result[0].date).toBe("2025-07-01")
    expect(result[0].avg_outTemp).toBe(72)
  })

  it("includes sunTimes", () => {
    const result = mapDailyApiResponse({ data: [apiItem] })
    expect(result[0].sunTimes).toBeDefined()
    expect(result[0].sunTimes).toEqual(getSunTimes(new Date("2025-07-01")))
  })

  it("maps multiple items", () => {
    const result = mapDailyApiResponse({
      data: [apiItem, { ...apiItem, date: "2025-07-02" }],
    })
    expect(result).toHaveLength(2)
    expect(result[1].day).toBe("WED")
  })
})

describe("mapHourlyApiResponse", () => {
  const hourItem = {
    date: "2025-07-01",
    hour: "14",
    min_outTemp: 70,
    avg_outTemp: 75,
    max_outTemp: 80,
    min_outHumi: 40,
    avg_outHumi: 50,
    max_outHumi: 60,
    max_gustspeed: 10,
    min_avgwind: 3,
    max_avgwind: 8,
    avg_avgwind: 5,
    avg_rainofhourly: 0,
    avg_uvi: 5,
    avg_solarrad: 500,
    min_uvi: 3,
    max_uvi: 7,
    min_solarrad: 300,
    max_solarrad: 700,
  }

  it("maps hourly API response keyed by date", () => {
    const result = mapHourlyApiResponse({
      data: { "2025-07-01": [hourItem] },
    })
    expect(result["2025-07-01"]).toBeDefined()
    expect(result["2025-07-01"].data).toHaveLength(1)
  })

  it("filters out null entries from data", () => {
    const result = mapHourlyApiResponse({
      data: { "2025-07-01": [hourItem, null] },
    })
    // data array keeps undefined for null entries
    expect(result["2025-07-01"].data).toHaveLength(2)
    expect(result["2025-07-01"].data[1]).toBeUndefined()
  })

  it("computes ranges from valid entries", () => {
    const result = mapHourlyApiResponse({
      data: { "2025-07-01": [hourItem] },
    })
    expect(result["2025-07-01"].ranges.min_outTemp).toBe(70)
    expect(result["2025-07-01"].ranges.max_outTemp).toBe(80)
  })

  it("handles multiple dates", () => {
    const result = mapHourlyApiResponse({
      data: {
        "2025-07-01": [hourItem],
        "2025-07-02": [{ ...hourItem, date: "2025-07-02" }],
      },
    })
    expect(Object.keys(result)).toHaveLength(2)
  })
})

import type { RangeObservation } from "@/lib/types"
import { describe, expect, it } from "vitest"
import {
  calculateRanges,
  mapDailyApiResponse,
  mapHourlyApiResponse,
} from "@/lib/mappers"

function makeObservation(
  overrides: Partial<RangeObservation> = {},
): RangeObservation {
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

describe("mapDailyApiResponse", () => {
  it("maps API items to DayData with abbreviated day and sun times", () => {
    const response = {
      data: [
        makeObservation({ date: "2026-06-01" }),
        makeObservation({ date: "2026-06-02", max_outTemp: 75 }),
      ],
    }

    const result = mapDailyApiResponse(response)

    expect(result).toHaveLength(2)
    // 2026-06-01 is a Monday
    expect(result[0].day).toBe("MON")
    expect(result[1].day).toBe("TUE")
    expect(result[0].date).toBe("2026-06-01")
    expect(result[1].max_outTemp).toBe(75)
    expect(result[0].sunTimes.sunrise).toBeInstanceOf(Date)
    expect(result[0].sunTimes.sunset).toBeInstanceOf(Date)
  })
})

describe("mapHourlyApiResponse", () => {
  it("groups hours by date and keeps missing hours as undefined", () => {
    const response = {
      data: {
        "2026-06-01": [
          null,
          { ...makeObservation({ date: "2026-06-01" }), hour: "01" },
          {
            ...makeObservation({
              date: "2026-06-01",
              min_outTemp: 45,
              max_outTemp: 72,
            }),
            hour: "02",
          },
        ],
      },
    }

    const result = mapHourlyApiResponse(response)

    expect(Object.keys(result)).toEqual(["2026-06-01"])
    const daily = result["2026-06-01"]
    expect(daily.data).toHaveLength(3)
    expect(daily.data[0]).toBeUndefined()
    expect(daily.data[1]?.hour).toBe("01")
    expect(daily.data[2]?.min_outTemp).toBe(45)
  })

  it("calculates ranges from present hours only", () => {
    const response = {
      data: {
        "2026-06-01": [
          null,
          { ...makeObservation({ min_outTemp: 48, max_outTemp: 66 }), hour: "01" },
          { ...makeObservation({ min_outTemp: 52, max_outTemp: 71 }), hour: "02" },
        ],
      },
    }

    const { ranges } = mapHourlyApiResponse(response)["2026-06-01"]

    expect(ranges.min_outTemp).toBe(48)
    expect(ranges.max_outTemp).toBe(71)
    expect(Number.isFinite(ranges.max_gustspeed)).toBe(true)
  })

  it("returns zero ranges when every hourly observation is missing", () => {
    const result = mapHourlyApiResponse({
      data: { "2026-06-01": [null, null] },
    })

    expect(result["2026-06-01"].data).toEqual([undefined, undefined])
    expect(result["2026-06-01"].ranges).toEqual({
      min_outTemp: 0,
      max_outTemp: 0,
      min_outHumi: 0,
      max_outHumi: 0,
      max_gustspeed: 0,
      min_avgwind: 0,
      max_avgwind: 0,
      min_uvi: 0,
      max_uvi: 0,
      min_solarrad: 0,
      max_solarrad: 0,
    })
  })

  it("maps multiple dates independently", () => {
    const response = {
      data: {
        "2026-06-01": [{ ...makeObservation(), hour: "00" }],
        "2026-06-02": [{ ...makeObservation({ max_outTemp: 99 }), hour: "00" }],
      },
    }

    const result = mapHourlyApiResponse(response)

    expect(Object.keys(result).toSorted()).toEqual([
      "2026-06-01",
      "2026-06-02",
    ])
    expect(result["2026-06-01"].ranges.max_outTemp).toBe(70)
    expect(result["2026-06-02"].ranges.max_outTemp).toBe(99)
  })
})

describe("calculateRanges", () => {
  it("returns zero ranges when no observations are provided", () => {
    expect(calculateRanges([])).toEqual({
      min_outTemp: 0,
      max_outTemp: 0,
      min_outHumi: 0,
      max_outHumi: 0,
      max_gustspeed: 0,
      min_avgwind: 0,
      max_avgwind: 0,
      min_uvi: 0,
      max_uvi: 0,
      min_solarrad: 0,
      max_solarrad: 0,
    })
  })

  it("returns min/max across all observations", () => {
    const ranges = calculateRanges([
      makeObservation({
        min_outTemp: 40,
        max_outTemp: 65,
        min_outHumi: 30,
        max_outHumi: 70,
        max_gustspeed: 10,
        min_avgwind: 2,
        max_avgwind: 6,
        min_uvi: 1,
        max_uvi: 5,
        min_solarrad: 10,
        max_solarrad: 800,
      }),
      makeObservation({
        min_outTemp: 45,
        max_outTemp: 75,
        min_outHumi: 25,
        max_outHumi: 90,
        max_gustspeed: 18,
        min_avgwind: 0,
        max_avgwind: 9,
        min_uvi: 0,
        max_uvi: 8,
        min_solarrad: 5,
        max_solarrad: 950,
      }),
    ])

    expect(ranges).toEqual({
      min_outTemp: 40,
      max_outTemp: 75,
      min_outHumi: 25,
      max_outHumi: 90,
      max_gustspeed: 18,
      min_avgwind: 0,
      max_avgwind: 9,
      min_uvi: 0,
      max_uvi: 8,
      min_solarrad: 5,
      max_solarrad: 950,
    })
  })
})

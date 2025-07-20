import { beforeAll, describe, expect, it } from "@jest/globals"
import {
  calculateRanges,
  mapDailyApiResponse,
  mapHourlyApiResponse,
} from "@/lib/mappers"
import type { DayData, HourData } from "@/lib/types"

beforeAll(() => {
  // Set required environment variables for tests
  process.env["LOCATION_LATITUDE"] = "37"
  process.env["LOCATION_LONGITUDE"] = "-122"
})

describe("mapDailyApiResponse", () => {
  it("should map API response to DayData correctly", () => {
    const apiItem = {
      date: "2024-01-15",
      min_outTemp: 10.5,
      avg_outTemp: 17.9,
      max_outTemp: 25.3,
      min_outHumi: 30,
      avg_outHumi: 55,
      max_outHumi: 80,
      max_gustspeed: 15.2,
      min_avgwind: 5,
      max_avgwind: 12,
      avg_avgwind: 8.1,
      avg_rainofhourly: 0.5,
      avg_uvi: 4.5,
      avg_solarrad: 850,
      min_uvi: 2,
      max_uvi: 7,
      min_solarrad: 600,
      max_solarrad: 1100,
    }

    const result = mapDailyApiResponse(apiItem)

    expect(result).toMatchObject({
      day: "MON",
      date: "2024-01-15",
      min_outTemp: 10.5,
      avg_outTemp: 17.9,
      max_outTemp: 25.3,
      min_outHumi: 30,
      avg_outHumi: 55,
      max_outHumi: 80,
      max_gustspeed: 15.2,
      min_avgwind: 5,
      max_avgwind: 12,
      avg_avgwind: 8.1,
      avg_rainofhourly: 0.5,
      avg_uvi: 4.5,
      avg_solarrad: 850,
      min_uvi: 2,
      max_uvi: 7,
      min_solarrad: 600,
      max_solarrad: 1100,
    })
    expect(result.sunTimes).toBeDefined()
  })

  it("should handle different days of the week correctly", () => {
    const sundayItem = {
      date: "2024-01-14",
      min_outTemp: 0,
      avg_outTemp: 0,
      max_outTemp: 0,
      min_outHumi: 0,
      avg_outHumi: 0,
      max_outHumi: 0,
      max_gustspeed: 0,
      min_avgwind: 0,
      max_avgwind: 0,
      avg_avgwind: 0,
      avg_rainofhourly: 0,
      avg_uvi: 0,
      avg_solarrad: 0,
      min_uvi: 0,
      max_uvi: 0,
      min_solarrad: 0,
      max_solarrad: 0,
    }
    const wednesdayItem = {
      date: "2024-01-17",
      min_outTemp: 0,
      avg_outTemp: 0,
      max_outTemp: 0,
      min_outHumi: 0,
      avg_outHumi: 0,
      max_outHumi: 0,
      max_gustspeed: 0,
      min_avgwind: 0,
      max_avgwind: 0,
      avg_avgwind: 0,
      avg_rainofhourly: 0,
      avg_uvi: 0,
      avg_solarrad: 0,
      min_uvi: 0,
      max_uvi: 0,
      min_solarrad: 0,
      max_solarrad: 0,
    }

    expect(mapDailyApiResponse(sundayItem).day).toBe("SUN")
    expect(mapDailyApiResponse(wednesdayItem).day).toBe("WED")
  })
})

describe("mapHourlyApiResponse", () => {
  it("should map API response to HourData correctly", () => {
    const apiItem = {
      hour: "14:00",
      min_outTemp: 20.1,
      avg_outTemp: 22.5,
      max_outTemp: 25,
      min_outHumi: 40,
      avg_outHumi: 55,
      max_outHumi: 70,
      max_gustspeed: 12.3,
      avg_avgwind: 6.8,
      avg_rainofhourly: 0.2,
    }
    const date = "2024-01-15"

    const result = mapHourlyApiResponse(apiItem, date)

    expect(result).toEqual({
      date: "2024-01-15",
      hour: "14:00",
      min_outTemp: 20.1,
      avg_outTemp: 22.5,
      max_outTemp: 25,
      min_outHumi: 40,
      avg_outHumi: 55,
      max_outHumi: 70,
      max_gustspeed: 12.3,
      avg_avgwind: 6.8,
      avg_rainofhourly: 0.2,
    })
  })

  it("should return undefined for null API items", () => {
    const result = mapHourlyApiResponse(null, "2024-01-15")
    expect(result).toBeUndefined()
  })
})

describe("calculateDayDataRanges", () => {
  it("should calculate ranges correctly for day data", () => {
    const dayData: DayData[] = [
      {
        day: "MON",
        date: "2024-01-15",
        min_outTemp: 10,
        avg_outTemp: 17,
        max_outTemp: 25,
        min_outHumi: 30,
        avg_outHumi: 40,
        max_outHumi: 70,
        max_gustspeed: 15,
        min_avgwind: 5,
        max_avgwind: 12,
        avg_avgwind: 8,
        avg_rainofhourly: 0.5,
        avg_uvi: 3,
        avg_solarrad: 800,
        min_uvi: 2,
        max_uvi: 5,
        min_solarrad: 600,
        max_solarrad: 1000,
        sunTimes: {
          dawn: new Date(),
          sunrise: new Date(),
          sunset: new Date(),
          dusk: new Date(),
        },
      },
      {
        day: "TUE",
        date: "2024-01-16",
        min_outTemp: 12,
        avg_outTemp: 19,
        max_outTemp: 28,
        min_outHumi: 25,
        avg_outHumi: 35,
        max_outHumi: 80,
        max_gustspeed: 20,
        min_avgwind: 7,
        max_avgwind: 15,
        avg_avgwind: 10,
        avg_rainofhourly: 1,
        avg_uvi: 4,
        avg_solarrad: 800,
        min_uvi: 3,
        max_uvi: 6,
        min_solarrad: 650,
        max_solarrad: 950,
        sunTimes: {
          dawn: new Date(),
          sunrise: new Date(),
          sunset: new Date(),
          dusk: new Date(),
        },
      },
      {
        day: "WED",
        date: "2024-01-17",
        min_outTemp: 8,
        avg_outTemp: 15,
        max_outTemp: 22,
        min_outHumi: 35,
        avg_outHumi: 45,
        max_outHumi: 75,
        max_gustspeed: 12,
        min_avgwind: 3,
        max_avgwind: 10,
        avg_avgwind: 6,
        avg_rainofhourly: 0.2,
        avg_uvi: 5,
        avg_solarrad: 800,
        min_uvi: 4,
        max_uvi: 7,
        min_solarrad: 700,
        max_solarrad: 900,
        sunTimes: {
          dawn: new Date(),
          sunrise: new Date(),
          sunset: new Date(),
          dusk: new Date(),
        },
      },
    ]

    const result = calculateRanges(dayData)

    expect(result).toEqual({
      min_outTemp: 8,
      max_outTemp: 28,
      min_outHumi: 25,
      max_outHumi: 80,
      max_gustspeed: 20,
      min_avgwind: 3,
      max_avgwind: 15,
      min_uvi: 2,
      max_uvi: 7,
      min_solarrad: 600,
      max_solarrad: 1000,
    })
  })

  it("should handle single day data", () => {
    const dayData: DayData[] = [
      {
        day: "MON",
        date: "2024-01-15",
        min_outTemp: 15,
        avg_outTemp: 17,
        max_outTemp: 25,
        min_outHumi: 40,
        avg_outHumi: 51,
        max_outHumi: 60,
        max_gustspeed: 10,
        min_avgwind: 3,
        max_avgwind: 8,
        avg_avgwind: 5,
        avg_rainofhourly: 0,
        avg_uvi: 3,
        avg_solarrad: 800,
        min_uvi: 2,
        max_uvi: 5,
        min_solarrad: 650,
        max_solarrad: 950,
        sunTimes: {
          dawn: new Date(),
          sunrise: new Date(),
          sunset: new Date(),
          dusk: new Date(),
        },
      },
    ]

    const result = calculateRanges(dayData)

    expect(result).toEqual({
      min_outTemp: 15,
      max_outTemp: 25,
      min_outHumi: 40,
      max_outHumi: 60,
      max_gustspeed: 10,
      min_avgwind: 3,
      max_avgwind: 8,
      min_uvi: 2,
      max_uvi: 5,
      min_solarrad: 650,
      max_solarrad: 950,
    })
  })
})

describe("calculateHourDataRanges", () => {
  it("should calculate ranges correctly for hour data", () => {
    const hourData: HourData[] = [
      {
        date: "2024-01-15",
        hour: "12:00",
        min_outTemp: 18,
        avg_outTemp: 20,
        max_outTemp: 22,
        min_outHumi: 45,
        avg_outHumi: 50,
        max_outHumi: 55,
        max_gustspeed: 8,
        min_avgwind: 3,
        max_avgwind: 7,
        avg_avgwind: 5,
        avg_rainofhourly: 0.1,
        avg_uvi: 3,
        avg_solarrad: 800,
        min_uvi: 2,
        max_uvi: 5,
        min_solarrad: 650,
        max_solarrad: 950,
      },
      {
        date: "2024-01-15",
        hour: "13:00",
        min_outTemp: 20,
        avg_outTemp: 23,
        max_outTemp: 26,
        min_outHumi: 40,
        avg_outHumi: 45,
        max_outHumi: 50,
        max_gustspeed: 12,
        min_avgwind: 5,
        max_avgwind: 9,
        avg_avgwind: 7,
        avg_rainofhourly: 0,
        avg_uvi: 3,
        avg_solarrad: 800,
        min_uvi: 2,
        max_uvi: 5,
        min_solarrad: 700,
        max_solarrad: 900,
      },
      {
        date: "2024-01-15",
        hour: "14:00",
        min_outTemp: 16,
        avg_outTemp: 19,
        max_outTemp: 24,
        min_outHumi: 35,
        avg_outHumi: 40,
        max_outHumi: 45,
        max_gustspeed: 15,
        min_avgwind: 7,
        max_avgwind: 11,
        avg_avgwind: 9,
        avg_rainofhourly: 0.3,
        avg_uvi: 3,
        avg_solarrad: 800,
        min_uvi: 2,
        max_uvi: 5,
        min_solarrad: 750,
        max_solarrad: 850,
      },
    ]

    const result = calculateRanges(hourData)

    expect(result).toEqual({
      min_outTemp: 16,
      max_outTemp: 26,
      min_outHumi: 35,
      max_outHumi: 55,
      max_gustspeed: 15,
      min_avgwind: 3,
      max_avgwind: 11,
      min_uvi: 2,
      max_uvi: 5,
      min_solarrad: 650,
      max_solarrad: 950,
    })
  })
})

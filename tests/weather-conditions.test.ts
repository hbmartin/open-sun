import type { HourData, RangeObservation } from "@/lib/types"
import { mapWeatherToColor, mapWeatherToCondition } from "@/lib/weather-conditions"

function makeHourData(overrides: Partial<HourData> = {}): HourData {
  return {
    date: "2025-07-01",
    hour: "12",
    min_outTemp: 70,
    avg_outTemp: 75,
    max_outTemp: 80,
    min_outHumi: 40,
    avg_outHumi: 50,
    max_outHumi: 60,
    max_gustspeed: 10,
    min_avgwind: 3,
    avg_avgwind: 5,
    max_avgwind: 8,
    avg_rainofhourly: 0,
    avg_uvi: 5,
    avg_solarrad: 500,
    min_uvi: 3,
    max_uvi: 7,
    min_solarrad: 300,
    max_solarrad: 700,
    ...overrides,
  }
}

function makeObservation(overrides: Partial<RangeObservation> = {}): RangeObservation {
  return makeHourData(overrides)
}

describe("mapWeatherToColor", () => {
  it("returns light blue for light drizzle", () => {
    expect(mapWeatherToColor(makeHourData({ avg_rainofhourly: 0.005 }))).toBe("#cdf6ff")
  })

  it("returns medium blue for light rain", () => {
    expect(mapWeatherToColor(makeHourData({ avg_rainofhourly: 0.05 }))).toBe("#77c0ed")
  })

  it("returns dark blue for heavy rain", () => {
    expect(mapWeatherToColor(makeHourData({ avg_rainofhourly: 0.5 }))).toBe("#3b8bb5")
  })

  it("returns warm color for high solar radiation", () => {
    expect(mapWeatherToColor(makeHourData({ avg_solarrad: 800 }))).toBe("#ffd49b")
  })

  it("returns light warm color for moderate solar radiation", () => {
    expect(mapWeatherToColor(makeHourData({ avg_solarrad: 200 }))).toBe("#ffeab3")
  })

  it("returns gray for high humidity with low solar and no rain", () => {
    expect(mapWeatherToColor(makeHourData({ avg_outHumi: 90, avg_solarrad: 50 }))).toBe("#B8B8B8")
  })

  it("returns default gray for no special conditions", () => {
    expect(mapWeatherToColor(makeHourData({ avg_solarrad: 50, avg_outHumi: 50 }))).toBe("#EBEBED")
  })
})

describe("mapWeatherToCondition", () => {
  it("returns rain-wind for heavy rain with wind", () => {
    expect(mapWeatherToCondition(makeObservation({
      avg_rainofhourly: 0.2,
      avg_avgwind: 25,
    }))).toBe("rain-wind")
  })

  it("returns rain for rain without wind", () => {
    expect(mapWeatherToCondition(makeObservation({
      avg_rainofhourly: 0.2,
      avg_avgwind: 5,
    }))).toBe("rain")
  })

  it("returns drizzle for very light rain", () => {
    expect(mapWeatherToCondition(makeObservation({
      avg_rainofhourly: 0.005,
    }))).toBe("drizzle")
  })

  it("returns clear-night for nighttime low humidity", () => {
    expect(mapWeatherToCondition(makeObservation({
      avg_solarrad: 0,
      avg_uvi: 0,
      avg_outHumi: 50,
    }))).toBe("clear-night")
  })

  it("returns cloudy for nighttime high humidity", () => {
    expect(mapWeatherToCondition(makeObservation({
      avg_solarrad: 0,
      avg_uvi: 0,
      avg_outHumi: 90,
    }))).toBe("cloudy")
  })

  it("returns wind for windy conditions without clear sky", () => {
    expect(mapWeatherToCondition(makeObservation({
      avg_avgwind: 25,
      avg_solarrad: 300,
      avg_uvi: 2,
    }))).toBe("wind")
  })

  it("returns cloudy for very low solar radiation", () => {
    expect(mapWeatherToCondition(makeObservation({
      avg_solarrad: 50,
      avg_uvi: 0.5,
    }))).toBe("cloudy")
  })

  it("returns sun-dim for mostly cloudy radiation", () => {
    expect(mapWeatherToCondition(makeObservation({
      avg_solarrad: 300,
      avg_uvi: 2,
      avg_avgwind: 5,
    }))).toBe("sun-dim")
  })

  it("returns sun-medium for partly sunny radiation", () => {
    expect(mapWeatherToCondition(makeObservation({
      avg_solarrad: 500,
      avg_uvi: 4,
      avg_avgwind: 5,
    }))).toBe("sun-medium")
  })

  it("returns sunny for clear sky high radiation", () => {
    expect(mapWeatherToCondition(makeObservation({
      avg_solarrad: 800,
      avg_uvi: 8,
    }))).toBe("sunny")
  })

  it("prioritizes rain over nighttime", () => {
    expect(mapWeatherToCondition(makeObservation({
      avg_rainofhourly: 0.2,
      avg_solarrad: 0,
      avg_uvi: 0,
    }))).toBe("rain")
  })

  it("prioritizes drizzle over nighttime", () => {
    expect(mapWeatherToCondition(makeObservation({
      avg_rainofhourly: 0.005,
      avg_solarrad: 0,
      avg_uvi: 0,
    }))).toBe("drizzle")
  })
})

import { describe, expect, it } from "vitest"
import { mapWeatherToColor, mapWeatherToCondition } from "@/lib/weather-conditions"
import type { HourData } from "@/lib/types"

function makeHour(overrides: Partial<HourData> = {}): HourData {
  return {
    date: "2026-06-01",
    hour: "12",
    min_outTemp: 50,
    avg_outTemp: 60,
    max_outTemp: 70,
    min_outHumi: 40,
    avg_outHumi: 55,
    max_outHumi: 80,
    max_gustspeed: 5,
    min_avgwind: 1,
    avg_avgwind: 3,
    max_avgwind: 5,
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

describe("mapWeatherToColor", () => {
  it("maps drizzle to the lightest rain color", () => {
    expect(mapWeatherToColor(makeHour({ avg_rainofhourly: 0.005 }))).toBe(
      "#cdf6ff",
    )
  })

  it("maps light rain to the medium rain color", () => {
    expect(mapWeatherToColor(makeHour({ avg_rainofhourly: 0.05 }))).toBe(
      "#77c0ed",
    )
  })

  it("maps heavy rain to the darkest rain color", () => {
    expect(mapWeatherToColor(makeHour({ avg_rainofhourly: 0.5 }))).toBe(
      "#3b8bb5",
    )
  })

  it("maps bright sun to the strong sun color", () => {
    expect(
      mapWeatherToColor(makeHour({ avg_solarrad: 750, avg_rainofhourly: 0 })),
    ).toBe("#ffd49b")
  })

  it("maps moderate sun to the soft sun color", () => {
    expect(mapWeatherToColor(makeHour({ avg_solarrad: 300 }))).toBe("#ffeab3")
  })

  it("maps humid overcast to gray", () => {
    expect(
      mapWeatherToColor(makeHour({ avg_solarrad: 50, avg_outHumi: 90 })),
    ).toBe("#B8B8B8")
  })

  it("falls back to the neutral color", () => {
    expect(
      mapWeatherToColor(makeHour({ avg_solarrad: 50, avg_outHumi: 60 })),
    ).toBe("#EBEBED")
  })
})

describe("mapWeatherToCondition", () => {
  it("returns rain-wind for rain with high wind", () => {
    expect(
      mapWeatherToCondition(
        makeHour({ avg_rainofhourly: 0.2, avg_avgwind: 25 }),
      ),
    ).toBe("rain-wind")
  })

  it("returns rain for rain without high wind", () => {
    expect(
      mapWeatherToCondition(makeHour({ avg_rainofhourly: 0.2, avg_avgwind: 5 })),
    ).toBe("rain")
  })

  it("returns rain for light rain", () => {
    expect(
      mapWeatherToCondition(
        makeHour({ avg_rainofhourly: 0.05, avg_avgwind: 5 }),
      ),
    ).toBe("rain")
  })

  it("returns drizzle for trace precipitation", () => {
    expect(
      mapWeatherToCondition(makeHour({ avg_rainofhourly: 0.005 })),
    ).toBe("drizzle")
  })

  it("returns cloudy for humid nights", () => {
    expect(
      mapWeatherToCondition(
        makeHour({ avg_solarrad: 0, avg_uvi: 0, avg_outHumi: 95 }),
      ),
    ).toBe("cloudy")
  })

  it("returns clear-night for dry nights", () => {
    expect(
      mapWeatherToCondition(
        makeHour({ avg_solarrad: 0, avg_uvi: 0, avg_outHumi: 50 }),
      ),
    ).toBe("clear-night")
  })

  it("returns wind for windy days without clear skies", () => {
    expect(
      mapWeatherToCondition(
        makeHour({ avg_avgwind: 25, avg_solarrad: 300, avg_uvi: 2 }),
      ),
    ).toBe("wind")
  })

  it("returns cloudy for low daytime solar radiation", () => {
    expect(
      mapWeatherToCondition(makeHour({ avg_solarrad: 150, avg_uvi: 1 })),
    ).toBe("cloudy")
  })

  it("returns sun-dim for mostly cloudy radiation", () => {
    expect(
      mapWeatherToCondition(makeHour({ avg_solarrad: 300, avg_uvi: 2 })),
    ).toBe("sun-dim")
  })

  it("returns sun-medium for partly sunny radiation", () => {
    expect(
      mapWeatherToCondition(makeHour({ avg_solarrad: 550, avg_uvi: 4 })),
    ).toBe("sun-medium")
  })

  it("returns sunny for clear-sky radiation", () => {
    expect(
      mapWeatherToCondition(makeHour({ avg_solarrad: 800, avg_uvi: 8 })),
    ).toBe("sunny")
  })
})

import type { ForecastHourData } from "@/lib/types"
import { describe, expect, it } from "vitest"
import { mapForecastToColor, mapForecastToCondition } from "@/lib/forecast-conditions"

function condition(input: Partial<Parameters<typeof mapForecastToCondition>[0]> = {}) {
  return mapForecastToCondition({ isDaytime: true, ...input })
}

function hour(overrides: Partial<ForecastHourData> = {}): ForecastHourData {
  return {
    date: "2026-08-05",
    hour: "12",
    validTime: "2026-08-05T19:00:00+00:00",
    leadBucket: "3-6h",
    isDaytime: true,
    hasEvidence: true,
    bands: {},
    methods: {},
    ...overrides,
  }
}

describe("mapForecastToCondition", () => {
  describe("precipitation", () => {
    it("reports heavy rain", () => {
      expect(condition({ precip: 0.5 })).toBe("rain")
    })

    it("reports heavy rain with wind", () => {
      expect(condition({ precip: 0.5, wind: 25 })).toBe("rain-wind")
    })

    it("reports light rain", () => {
      expect(condition({ precip: 0.05 })).toBe("rain")
    })

    it("reports light rain with wind", () => {
      expect(condition({ precip: 0.05, wind: 30 })).toBe("rain-wind")
    })

    it("reports a trace of precipitation as drizzle", () => {
      expect(condition({ precip: 0.005 })).toBe("drizzle")
    })

    it("reports a high chance of rain as drizzle even with no accumulation", () => {
      expect(condition({ pop: 60, precip: 0 })).toBe("drizzle")
    })

    it("takes precipitation over night", () => {
      expect(condition({ precip: 0.5, isDaytime: false })).toBe("rain")
    })
  })

  describe("night", () => {
    it("reports a humid night as cloudy", () => {
      expect(condition({ isDaytime: false, humidity: 90 })).toBe("cloudy")
    })

    it("reports a dry night as clear", () => {
      expect(condition({ isDaytime: false, humidity: 40 })).toBe("clear-night")
    })

    it("does not report wind at night", () => {
      expect(condition({ isDaytime: false, humidity: 40, wind: 30 })).toBe("clear-night")
    })
  })

  describe("day", () => {
    it("reports wind", () => {
      expect(condition({ wind: 25 })).toBe("wind")
    })

    it("reports a high chance of rain as cloudy", () => {
      expect(condition({ pop: 35 })).toBe("cloudy")
    })

    it("reports high humidity as cloudy", () => {
      expect(condition({ humidity: 90 })).toBe("cloudy")
    })

    it("reports a moderate chance of rain as dim sun", () => {
      expect(condition({ pop: 20 })).toBe("sun-dim")
    })

    it("reports moderate humidity as dim sun", () => {
      expect(condition({ humidity: 80 })).toBe("sun-dim")
    })

    it("reports mild humidity as medium sun", () => {
      expect(condition({ humidity: 65 })).toBe("sun-medium")
    })

    it("reports a dry clear day as sunny", () => {
      expect(condition({ humidity: 20, pop: 0 })).toBe("sunny")
    })
  })

  it("falls back to sunny when every input is absent", () => {
    // A deliberate default rather than an accident: an all-missing daytime row
    // renders as clear rather than throwing or showing rain.
    expect(mapForecastToCondition({ isDaytime: true })).toBe("sunny")
  })

  it("falls back to clear-night when every input is absent at night", () => {
    expect(mapForecastToCondition({ isDaytime: false })).toBe("clear-night")
  })
})

describe("mapForecastToColor", () => {
  it("colours a trace of rain palest", () => {
    expect(mapForecastToColor(hour({ precip: 0.005 }))).toBe("#cdf6ff")
  })

  it("colours light rain mid blue", () => {
    expect(mapForecastToColor(hour({ precip: 0.05 }))).toBe("#77c0ed")
  })

  it("colours heavy rain deepest", () => {
    expect(mapForecastToColor(hour({ precip: 0.5 }))).toBe("#3b8bb5")
  })

  it("colours a clear daytime hour warm", () => {
    expect(mapForecastToColor(hour({ pop: 5 }))).toBe("#ffd49b")
  })

  it("colours an uncertain daytime hour pale warm", () => {
    expect(mapForecastToColor(hour({ pop: 30 }))).toBe("#ffeab3")
  })

  it("colours a humid overcast hour grey", () => {
    expect(mapForecastToColor(hour({ pop: 50, humidity: 90 }))).toBe("#B8B8B8")
  })

  it("colours a plain night hour neutral", () => {
    expect(mapForecastToColor(hour({ isDaytime: false, humidity: 40 }))).toBe("#EBEBED")
  })
})

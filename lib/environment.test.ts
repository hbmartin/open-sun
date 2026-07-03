import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

async function importFreshEnvironment() {
  vi.resetModules()
  return await import("@/lib/environment")
}

describe("getEnvironment", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("parses coordinates from process.env and applies URL defaults", async () => {
    vi.stubEnv("LOCATION_LATITUDE", "51.5")
    vi.stubEnv("LOCATION_LONGITUDE", "-0.12")
    const { getEnvironment } = await importFreshEnvironment()

    const environment = getEnvironment()

    expect(environment.LOCATION_LATITUDE).toBe(51.5)
    expect(environment.LOCATION_LONGITUDE).toBe(-0.12)
    expect(environment.WEATHER_CURRENT_API_URL).toBe("http://localhost:8080/")
    expect(environment.WEATHER_DAILY_API_URL).toContain("daily.json")
    expect(environment.WEATHER_HOURLY_API_URL).toContain("hourly.json")
  })

  it("prefers explicitly configured API URLs over defaults", async () => {
    vi.stubEnv("WEATHER_CURRENT_API_URL", "https://station.example.com/current")
    const { getEnvironment } = await importFreshEnvironment()

    expect(getEnvironment().WEATHER_CURRENT_API_URL).toBe(
      "https://station.example.com/current",
    )
  })

  it("throws when a required coordinate is missing", async () => {
    const originalLatitude = process.env["LOCATION_LATITUDE"]
    delete process.env["LOCATION_LATITUDE"]
    try {
      const { getEnvironment } = await importFreshEnvironment()

      expect(() => getEnvironment()).toThrow()
    } finally {
      process.env["LOCATION_LATITUDE"] = originalLatitude
    }
  })

  it("throws when a coordinate is out of range", async () => {
    vi.stubEnv("LOCATION_LATITUDE", "91")
    const { getEnvironment } = await importFreshEnvironment()

    expect(() => getEnvironment()).toThrow()
  })

  it("throws when an API URL is not a valid URL", async () => {
    vi.stubEnv("WEATHER_DAILY_API_URL", "not-a-url")
    const { getEnvironment } = await importFreshEnvironment()

    expect(() => getEnvironment()).toThrow()
  })

  it("caches the parsed environment after the first call", async () => {
    vi.stubEnv("LOCATION_LATITUDE", "10")
    const { getEnvironment } = await importFreshEnvironment()

    const first = getEnvironment()
    vi.stubEnv("LOCATION_LATITUDE", "20")
    const second = getEnvironment()

    expect(second).toBe(first)
    expect(second.LOCATION_LATITUDE).toBe(10)
  })
})

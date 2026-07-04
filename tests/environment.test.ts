import { vi } from "vitest"
import { ZodError } from "zod"

async function importFreshEnvironment() {
  vi.resetModules()
  return await import("@/lib/environment")
}

describe("getEnvironment", () => {
  const originalEnvironment = process.env

  beforeEach(() => {
    process.env = { ...originalEnvironment }
    vi.resetModules()
  })

  afterAll(() => {
    process.env = originalEnvironment
  })

  it("uses default URLs when env vars are not set", async () => {
    process.env.LOCATION_LATITUDE = "37.7749"
    process.env.LOCATION_LONGITUDE = "-122.4194"
    const { getEnvironment: freshGetEnvironment } = await importFreshEnvironment()
    const environment = freshGetEnvironment()
    expect(environment.WEATHER_CURRENT_API_URL).toBe("http://localhost:8080/")
    expect(environment.WEATHER_DAILY_API_URL).toContain("localhost:8080")
    expect(environment.WEATHER_HOURLY_API_URL).toContain("localhost:8080")
  })

  it("parses latitude and longitude as numbers", async () => {
    process.env.LOCATION_LATITUDE = "37.7749"
    process.env.LOCATION_LONGITUDE = "-122.4194"
    const { getEnvironment: freshGetEnvironment } = await importFreshEnvironment()
    const environment = freshGetEnvironment()
    expect(environment.LOCATION_LATITUDE).toBe(37.7749)
    expect(environment.LOCATION_LONGITUDE).toBe(-122.4194)
  })

  it("throws when required latitude is missing", async () => {
    process.env.LOCATION_LONGITUDE = "-122.4194"
    delete process.env.LOCATION_LATITUDE
    const { getEnvironment: freshGetEnvironment } = await importFreshEnvironment()
    expect(() => freshGetEnvironment()).toThrow(ZodError)
  })

  it("throws for out-of-range latitude", async () => {
    process.env.LOCATION_LATITUDE = "100"
    process.env.LOCATION_LONGITUDE = "-122.4194"
    const { getEnvironment: freshGetEnvironment } = await importFreshEnvironment()
    expect(() => freshGetEnvironment()).toThrow(ZodError)
  })

  it("uses custom URLs when provided", async () => {
    process.env.LOCATION_LATITUDE = "37.7749"
    process.env.LOCATION_LONGITUDE = "-122.4194"
    process.env.WEATHER_CURRENT_API_URL = "https://example.com/current"
    const { getEnvironment: freshGetEnvironment } = await importFreshEnvironment()
    const environment = freshGetEnvironment()
    expect(environment.WEATHER_CURRENT_API_URL).toBe("https://example.com/current")
  })
})

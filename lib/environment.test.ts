import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ZodError } from "zod"

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
    expect(environment.REVALIDATE_SECRET).toBe("test-secret")
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

  it("prefers SITE_URL over the legacy public site URL", async () => {
    vi.stubEnv("SITE_URL", "https://site.example.com")
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://legacy.example.com")
    const { getConfiguredSiteUrl } = await importFreshEnvironment()

    expect(getConfiguredSiteUrl()).toBe("https://site.example.com")
  })

  it("falls back to the legacy public site URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://legacy.example.com")
    const { getConfiguredSiteUrl } = await importFreshEnvironment()

    expect(getConfiguredSiteUrl()).toBe("https://legacy.example.com")
  })

  it("builds the app URL from the production Vercel domain", async () => {
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "open-sun.example.vercel.app")
    vi.stubEnv("VERCEL_URL", "preview-open-sun.example.vercel.app")
    const { getAppUrl } = await importFreshEnvironment()

    expect(getAppUrl()).toBe("https://open-sun.example.vercel.app")
  })

  it("falls back to the preview Vercel domain for the app URL", async () => {
    vi.stubEnv("VERCEL_URL", "preview-open-sun.example.vercel.app")
    const { getAppUrl } = await importFreshEnvironment()

    expect(getAppUrl()).toBe("https://preview-open-sun.example.vercel.app")
  })

  it("falls back to localhost for the app URL", async () => {
    const { getAppUrl } = await importFreshEnvironment()

    expect(getAppUrl()).toBe("http://localhost:3000")
  })

  it("throws when the revalidation secret is missing", async () => {
    vi.stubEnv("REVALIDATE_SECRET", "")
    const { getEnvironment } = await importFreshEnvironment()

    expect(() => getEnvironment()).toThrow(ZodError)
  })

  it("throws when a required coordinate is missing", async () => {
    const originalLatitude = process.env["LOCATION_LATITUDE"]
    delete process.env["LOCATION_LATITUDE"]
    try {
      const { getEnvironment } = await importFreshEnvironment()

      expect(() => getEnvironment()).toThrow(ZodError)
    } finally {
      process.env["LOCATION_LATITUDE"] = originalLatitude
    }
  })

  it("throws when a coordinate is out of range", async () => {
    vi.stubEnv("LOCATION_LATITUDE", "91")
    const { getEnvironment } = await importFreshEnvironment()

    expect(() => getEnvironment()).toThrow(ZodError)
  })

  it("throws when an API URL is not a valid URL", async () => {
    vi.stubEnv("WEATHER_DAILY_API_URL", "not-a-url")
    const { getEnvironment } = await importFreshEnvironment()

    expect(() => getEnvironment()).toThrow(ZodError)
  })

  it("throws when the configured site URL is not a valid URL", async () => {
    vi.stubEnv("SITE_URL", "not-a-url")
    const { getEnvironment } = await importFreshEnvironment()

    expect(() => getEnvironment()).toThrow(ZodError)
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

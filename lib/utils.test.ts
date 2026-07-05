import { describe, expect, it } from "vitest"
import { cn, formatDate, formatHour, getSunTimes } from "@/lib/utils"

describe("cn", () => {
  it("joins class names and drops falsy values", () => {
    expect(cn("a", false, undefined, "b")).toBe("a b")
  })

  it("lets later tailwind classes win over earlier conflicting ones", () => {
    expect(cn("p-2", "p-4")).toBe("p-4")
  })
})

describe("formatHour", () => {
  it("formats midnight as 12 AM", () => {
    expect(formatHour("0")).toBe("12 AM")
    expect(formatHour("00")).toBe("12 AM")
  })

  it("formats noon as 12 PM", () => {
    expect(formatHour("12")).toBe("12 PM")
  })

  it("formats morning hours as AM", () => {
    expect(formatHour("1")).toBe("1 AM")
    expect(formatHour("11")).toBe("11 AM")
  })

  it("formats afternoon and evening hours as PM", () => {
    expect(formatHour("13")).toBe("1 PM")
    expect(formatHour("23")).toBe("11 PM")
  })

  it("handles zero-padded hour strings", () => {
    expect(formatHour("09")).toBe("9 AM")
  })
})

describe("formatDate", () => {
  it("formats an ISO date as a long en-US date", () => {
    expect(formatDate("2024-01-15")).toBe("Monday, January 15, 2024")
  })

  it("formats the last day of the year", () => {
    expect(formatDate("2025-12-31")).toBe("Wednesday, December 31, 2025")
  })

  it("formats a datetime string with a time component", () => {
    expect(formatDate("2025-01-15T00:00:00")).toBe("Wednesday, January 15, 2025")
  })
})

describe("getSunTimes", () => {
  it("returns sun times for the configured coordinates", () => {
    const sunTimes = getSunTimes(new Date(Date.UTC(2026, 5, 21)))

    expect(sunTimes.sunrise).toBeInstanceOf(Date)
    expect(sunTimes.sunset).toBeInstanceOf(Date)
    expect(sunTimes.sunrise.getTime()).toBeLessThan(sunTimes.sunset.getTime())
    expect(sunTimes.solarNoon.getTime()).toBeGreaterThan(
      sunTimes.sunrise.getTime(),
    )
    expect(sunTimes.solarNoon.getTime()).toBeLessThan(
      sunTimes.sunset.getTime(),
    )
  })
})

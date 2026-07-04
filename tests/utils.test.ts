import { cn, formatDate, formatHour } from "@/lib/utils"

describe("formatHour", () => {
  it("formats midnight as 12 AM", () => {
    expect(formatHour("0")).toBe("12 AM")
    expect(formatHour("00")).toBe("12 AM")
  })

  it("formats noon as 12 PM", () => {
    expect(formatHour("12")).toBe("12 PM")
  })

  it("formats morning hours", () => {
    expect(formatHour("1")).toBe("1 AM")
    expect(formatHour("6")).toBe("6 AM")
    expect(formatHour("11")).toBe("11 AM")
  })

  it("formats afternoon/evening hours", () => {
    expect(formatHour("13")).toBe("1 PM")
    expect(formatHour("18")).toBe("6 PM")
    expect(formatHour("23")).toBe("11 PM")
  })
})

describe("formatDate", () => {
  it("formats a date string as a readable date", () => {
    const result = formatDate("2025-01-15T00:00:00")
    expect(result).toContain("January")
    expect(result).toContain("15")
    expect(result).toContain("2025")
  })

  it("includes the weekday", () => {
    // 2025-01-15 is a Wednesday
    const result = formatDate("2025-01-15T00:00:00")
    expect(result).toContain("Wednesday")
  })
})

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("px-2", "py-1")).toBe("px-2 py-1")
  })

  it("handles conflicting tailwind classes", () => {
    expect(cn("px-2", "px-4")).toBe("px-4")
  })

  it("handles conditional classes", () => {
    const isHidden = false
    expect(cn("base", isHidden && "hidden", "extra")).toBe("base extra")
  })
})

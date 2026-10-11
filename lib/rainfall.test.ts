import { describe, expect, it } from "vitest"
import { formatRainfall, sumHourlyRainfall } from "@/lib/rainfall"

describe("formatRainfall", () => {
  it("preserves a measurable hundredth of an inch", () => {
    expect(formatRainfall(0.01)).toBe("0.01")
    expect(formatRainfall(0.13)).toBe("0.13")
    expect(formatRainfall(0)).toBe("0.00")
  })

  it("shows missing totals as unknown", () => {
    expect(formatRainfall(null)).toBe("—")
    expect(formatRainfall()).toBe("—")
    expect(formatRainfall(Number.NaN)).toBe("—")
  })
})

describe("sumHourlyRainfall", () => {
  it("keeps a period without any hour records unknown", () => {
    expect(sumHourlyRainfall([])).toBeUndefined()
    expect(sumHourlyRainfall([undefined, undefined])).toBeUndefined()
  })
})

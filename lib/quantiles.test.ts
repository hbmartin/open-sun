import { describe, expect, it } from "vitest"
import { FORECAST_BAND_COVERAGE, quantileAt, quantileBand } from "@/lib/quantiles"

// The two grids the publisher actually emits.
const dressedGrid = {
  "0.05": 77.96,
  "0.1": 79.14,
  "0.25": 80.6,
  "0.75": 83.92,
  "0.9": 85.72,
  "0.95": 87.52,
}

const nativeGrid = Object.fromEntries(
  Array.from({ length: 19 }, (_, index) => {
    const probability = (index + 1) * 0.05
    return [String(Number(probability.toFixed(2))), index + 1]
  }),
)

describe("quantileAt", () => {
  it("returns undefined for an undefined map", () => {
    expect(quantileAt(undefined, 0.5)).toBeUndefined()
  })

  it("returns undefined for an empty map", () => {
    expect(quantileAt({}, 0.5)).toBeUndefined()
  })

  it("hits an exact level on the six-level dressed grid", () => {
    expect(quantileAt(dressedGrid, 0.1)).toBe(79.14)
    expect(quantileAt(dressedGrid, 0.9)).toBe(85.72)
  })

  it("hits an exact level on the nineteen-level native grid", () => {
    expect(quantileAt(nativeGrid, 0.1)).toBe(2)
    expect(quantileAt(nativeGrid, 0.9)).toBe(18)
  })

  it("interpolates between bracketing levels", () => {
    // Halfway between p0.25 (80.6) and p0.75 (83.92).
    expect(quantileAt(dressedGrid, 0.5)).toBeCloseTo(82.26, 6)
  })

  it("clamps below the lowest level instead of extrapolating", () => {
    expect(quantileAt(dressedGrid, 0.01)).toBe(77.96)
    expect(quantileAt(dressedGrid, 0)).toBe(77.96)
  })

  it("clamps above the highest level instead of extrapolating", () => {
    expect(quantileAt(dressedGrid, 0.99)).toBe(87.52)
    expect(quantileAt(dressedGrid, 1)).toBe(87.52)
  })

  it("sorts levels rather than trusting insertion order", () => {
    const shuffled = { "0.9": 85.72, "0.05": 77.96, "0.5": 82, "0.1": 79.14 }
    expect(quantileAt(shuffled, 0.05)).toBe(77.96)
    expect(quantileAt(shuffled, 0.9)).toBe(85.72)
    expect(quantileAt(shuffled, 0.5)).toBe(82)
  })

  it("ignores non-numeric keys", () => {
    expect(quantileAt({ median: 5, "0.5": 9 }, 0.5)).toBe(9)
  })

  it("ignores non-finite values", () => {
    expect(quantileAt({ "0.05": Number.NaN, "0.5": 9 }, 0.05)).toBe(9)
  })

  it("clamps to the only level of a single-level grid", () => {
    expect(quantileAt({ "0.5": 4 }, 0.05)).toBe(4)
    expect(quantileAt({ "0.5": 4 }, 0.95)).toBe(4)
  })

  it("does not divide by zero on duplicate probabilities", () => {
    const duplicated = { "0.1": 3, "0.10": 5, "0.9": 9 }
    const value = quantileAt(duplicated, 0.1)
    expect(Number.isNaN(value)).toBe(false)
    expect(value).toBeDefined()
  })
})

describe("quantileBand", () => {
  it("returns undefined for an empty map", () => {
    expect(quantileBand({})).toBeUndefined()
  })

  it("reads p10/p90 exactly off the dressed grid", () => {
    expect(quantileBand(dressedGrid)).toEqual({
      low: 79.14,
      high: 85.72,
      coverage: FORECAST_BAND_COVERAGE,
    })
  })

  it("reads p10/p90 exactly off the native grid", () => {
    expect(quantileBand(nativeGrid)).toEqual({
      low: 2,
      high: 18,
      coverage: FORECAST_BAND_COVERAGE,
    })
  })

  it("orders a crossed band rather than rendering it inside out", () => {
    const crossed = { "0.1": 90, "0.9": 10 }
    expect(quantileBand(crossed)).toEqual({
      low: 10,
      high: 90,
      coverage: FORECAST_BAND_COVERAGE,
    })
  })

  it("honours an explicit coverage", () => {
    const band = quantileBand(dressedGrid, 0.9)
    expect(band).toEqual({ low: 77.96, high: 87.52, coverage: 0.9 })
  })
})

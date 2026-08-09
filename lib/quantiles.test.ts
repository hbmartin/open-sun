import { describe, expect, it } from "vitest"
import { likelyBand, quantileAt, quantileBand, quantileBands } from "@/lib/quantiles"

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
    expect(quantileBand({}, 0.8)).toBeUndefined()
  })

  it("reads p10/p90 exactly off the dressed grid", () => {
    expect(quantileBand(dressedGrid, 0.8)).toEqual({
      low: 79.14,
      high: 85.72,
      coverage: 0.8,
    })
  })

  it("reads p10/p90 exactly off the native grid", () => {
    expect(quantileBand(nativeGrid, 0.8)).toEqual({
      low: 2,
      high: 18,
      coverage: 0.8,
    })
  })

  it("orders a crossed band rather than rendering it inside out", () => {
    const crossed = { "0.1": 90, "0.9": 10 }
    expect(quantileBand(crossed, 0.8)).toEqual({
      low: 10,
      high: 90,
      coverage: 0.8,
    })
  })
})

describe("quantileBands", () => {
  it("returns an empty array for an undefined map", () => {
    // oxlint-disable-next-line unicorn/no-useless-undefined
    expect(quantileBands(undefined)).toEqual([])
  })

  it("returns an empty array for an empty map", () => {
    expect(quantileBands({})).toEqual([])
  })

  it("reads all three coverages off the dressed grid, widest first", () => {
    const bands = quantileBands(dressedGrid)
    expect(bands.map((band) => band.coverage)).toEqual([0.9, 0.6, 0.3])
    // 90% (p05/p95) is exact on this grid.
    expect(bands[0]).toEqual({ low: 77.96, high: 87.52, coverage: 0.9 })
    // 60% (p20/p80) interpolates: p20 two thirds of 0.1→0.25, p80 one third of
    // 0.75→0.9.
    expect(bands[1].low).toBeCloseTo(80.113_33, 4)
    expect(bands[1].high).toBeCloseTo(84.52, 6)
    // 30% (p35/p65) interpolates 0.25→0.75 at fractions 0.2 and 0.8.
    expect(bands[2].low).toBeCloseTo(81.264, 6)
    expect(bands[2].high).toBeCloseTo(83.256, 6)
  })

  it("reads all three coverages exactly off the native grid", () => {
    expect(quantileBands(nativeGrid)).toEqual([
      { low: 1, high: 19, coverage: 0.9 },
      { low: 4, high: 16, coverage: 0.6 },
      { low: 7, high: 13, coverage: 0.3 },
    ])
  })
})

describe("likelyBand", () => {
  it("returns the 60% band", () => {
    const bands = quantileBands(nativeGrid)
    expect(likelyBand(bands)).toEqual({ low: 4, high: 16, coverage: 0.6 })
  })

  it("returns undefined for an empty array", () => {
    expect(likelyBand([])).toBeUndefined()
  })
})

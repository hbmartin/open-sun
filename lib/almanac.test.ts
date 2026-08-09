import type { DayData } from "@/lib/types"
import { describe, expect, it } from "vitest"
import { averageDailyHighF, dewPointF } from "@/lib/almanac"
import { getStationSunTimes } from "@/lib/utils"

const SUN_TIMES = getStationSunTimes("2026-08-05")

// Only max_outTemp is read; the rest exists so the fixture is a real DayData
// rather than a cast that would hide a field being renamed out from under us.
function day(max_outTemp: number): DayData {
  return {
    date: "2026-08-05",
    day: "Wed",
    sunTimes: SUN_TIMES,
    min_outTemp: 50,
    avg_outTemp: 65,
    max_outTemp,
    min_outHumi: 30,
    avg_outHumi: 45,
    max_outHumi: 60,
    max_gustspeed: 12,
    min_avgwind: 1,
    avg_avgwind: 4,
    max_avgwind: 8,
    avg_rainofhourly: 0,
    min_uvi: 0,
    avg_uvi: 3,
    max_uvi: 8,
    min_solarrad: 0,
    avg_solarrad: 300,
    max_solarrad: 900,
  }
}

describe("dewPointF", () => {
  // Against the Magnus-Tetens reference: 20 C at 50% RH dews at 9.26 C.
  it("matches the reference value for a mild, half-saturated day", () => {
    expect(dewPointF(68, 50)).toBeCloseTo(48.67, 1)
  })

  it("matches the reference value for a warm, humid day", () => {
    expect(dewPointF(86, 60)).toBeCloseTo(70.5, 1)
  })

  it("meets the air temperature at saturation", () => {
    expect(dewPointF(68, 100)).toBeCloseTo(68, 1)
    expect(dewPointF(32, 100)).toBeCloseTo(32, 1)
  })

  it("stays below the air temperature everywhere short of saturation", () => {
    for (const humidity of [10, 25, 50, 75, 99]) {
      expect(dewPointF(75, humidity)).toBeLessThan(75)
    }
  })

  it("works below freezing", () => {
    expect(dewPointF(20, 80)).toBeLessThan(20)
    expect(Number.isFinite(dewPointF(20, 80))).toBe(true)
  })

  // ln(0) is -Infinity, which would render as "-Infinity°" in the card.
  it("returns NaN rather than -Infinity at or below zero humidity", () => {
    expect(dewPointF(68, 0)).toBeNaN()
    expect(dewPointF(68, -5)).toBeNaN()
    expect(dewPointF(68, Number.NaN)).toBeNaN()
  })
})

describe("averageDailyHighF", () => {
  // lib/fetcher.ts reverses the published document, so index 0 is today.
  it("averages the prior days and excludes today", () => {
    expect(averageDailyHighF([day(100), day(80), day(90)])).toBe(85)
  })

  it("returns undefined when there is no prior day to average", () => {
    expect(averageDailyHighF([day(80)])).toBeUndefined()
    expect(averageDailyHighF([])).toBeUndefined()
  })

  it("is unmoved by today's value", () => {
    const prior = [day(70), day(72)]
    expect(averageDailyHighF([day(200), ...prior])).toBe(averageDailyHighF([day(-40), ...prior]))
  })

  it("handles a full eight-day document, the most the publisher sends", () => {
    const days = Array.from({ length: 8 }, (_, index) => day(index * 10))
    // Today is 0; the prior seven are 10..70, averaging 40.
    expect(averageDailyHighF(days)).toBe(40)
  })
})

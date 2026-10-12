import type { InstantObservation, WeeklyData } from "@/lib/types"
import { getTimes } from "@/lib/suncalc"

/** Station view fixtures anchored to an explicit time rather than the test clock. */
export function makeObservation(
  now: Date,
  overrides: Partial<InstantObservation> = {},
): InstantObservation {
  return {
    inTemp: null,
    inHumi: null,
    AbsPress: null,
    RelPress: null,
    outTemp: 82,
    outHumi: 40,
    windir: 0,
    avgwind: 1,
    gustspeed: 2,
    dailygust: 3,
    solarrad: 500,
    uv: 1,
    uvi: 5,
    pm25: null,
    rainofhourly: 0,
    eventrain: 0,
    observedAt: now.toISOString(),
    sunTimes: getTimes(now, 34.2768, -117.1692),
    ...overrides,
  }
}

export function makeEmptyWeek(): WeeklyData {
  return {
    data: [],
    ranges: {
      min_outTemp: 0,
      max_outTemp: 100,
      min_outHumi: 0,
      max_outHumi: 100,
      max_gustspeed: 10,
      min_avgwind: 0,
      max_avgwind: 10,
      min_uvi: 0,
      max_uvi: 10,
      min_solarrad: 0,
      max_solarrad: 1000,
    },
  }
}

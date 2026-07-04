import { describe, expect, it, vi } from "vitest"
import {
  getMoonIllumination,
  getMoonPosition,
  getMoonTimes,
  getPosition,
  getTimes,
} from "@/lib/suncalc"

// Reference values from the upstream SunCalc test suite
// (https://github.com/mourner/suncalc): 2013-03-05 UTC at 50.5°N, 30.5°E.
const date = new Date(Date.UTC(2013, 2, 5))
const latitude = 50.5
const longitude = 30.5

function expectSameSecond(actual: Date, expectedIso: string) {
  const expected = new Date(expectedIso)
  expect(Math.abs(actual.getTime() - expected.getTime())).toBeLessThan(1000)
}

describe("getPosition", () => {
  it("returns the sun azimuth and altitude", () => {
    const position = getPosition(date, latitude, longitude)

    expect(position.azimuth).toBeCloseTo(-2.500_317_590_716_838, 6)
    expect(position.altitude).toBeCloseTo(-0.700_040_683_878_161, 6)
  })
})

describe("getTimes", () => {
  const times = getTimes(date, latitude, longitude)

  it("calculates solar noon", () => {
    expectSameSecond(times.solarNoon, "2013-03-05T10:10:57Z")
  })

  it("calculates sunrise and sunset", () => {
    expectSameSecond(times.sunrise, "2013-03-05T04:34:56Z")
    expectSameSecond(times.sunset, "2013-03-05T15:46:57Z")
    expectSameSecond(times.sunriseEnd, "2013-03-05T04:38:19Z")
    expectSameSecond(times.sunsetStart, "2013-03-05T15:43:34Z")
  })

  it("calculates twilight phases", () => {
    expectSameSecond(times.dawn, "2013-03-05T04:02:17Z")
    expectSameSecond(times.dusk, "2013-03-05T16:19:36Z")
    expectSameSecond(times.nauticalDawn, "2013-03-05T03:24:31Z")
    expectSameSecond(times.nauticalDusk, "2013-03-05T16:57:22Z")
    expectSameSecond(times.nightEnd, "2013-03-05T02:46:17Z")
    expectSameSecond(times.night, "2013-03-05T17:35:36Z")
  })

  it("calculates golden hour", () => {
    expectSameSecond(times.goldenHourEnd, "2013-03-05T05:19:01Z")
    expectSameSecond(times.goldenHour, "2013-03-05T15:02:52Z")
  })

  it("places nadir half a day after solar noon", () => {
    const halfDayMs = 12 * 60 * 60 * 1000
    expect(times.nadir.getTime() - times.solarNoon.getTime()).toBeCloseTo(
      halfDayMs,
      -3,
    )
  })
})

describe("getMoonPosition", () => {
  it("returns the moon azimuth, altitude, and distance", () => {
    const position = getMoonPosition(date, latitude, longitude)

    expect(position.azimuth).toBeCloseTo(-0.978_399_952_243_822, 6)
    expect(position.altitude).toBeCloseTo(0.014_551_482_243_892, 6)
    expect(position.distance).toBeCloseTo(364_121.372_562_561, 3)
  })
})

describe("getMoonIllumination", () => {
  it("returns the moon fraction, phase, and angle", () => {
    const illumination = getMoonIllumination(date)

    expect(illumination.fraction).toBeCloseTo(0.484_806_820_245_637, 6)
    expect(illumination.phase).toBeCloseTo(0.754_836_883_853_876, 6)
    expect(illumination.angle).toBeCloseTo(1.673_294_267_857_834, 6)
  })
})

describe("getMoonTimes", () => {
  it("returns moon rise and set times", () => {
    const moonTimes = getMoonTimes(
      new Date(Date.UTC(2013, 2, 4)),
      latitude,
      longitude,
      true,
    )

    expect(moonTimes.rise).toBeInstanceOf(Date)
    expect(moonTimes.set).toBeInstanceOf(Date)
    // Allow a minute of tolerance: the interpolation is approximate.
    expect(
      Math.abs(
        (moonTimes.rise?.getTime() ?? 0) -
          new Date("2013-03-04T23:54:29Z").getTime(),
      ),
    ).toBeLessThan(60_000)
    expect(
      Math.abs(
        (moonTimes.set?.getTime() ?? 0) -
          new Date("2013-03-04T07:47:58Z").getTime(),
      ),
    ).toBeLessThan(60_000)
  })
})

describe("addTime", () => {
  it("adds a custom time pair to getTimes results", async () => {
    vi.resetModules()
    try {
      const { addTime, getTimes } = await import("@/lib/suncalc")

      addTime(-4, "customDawn", "customDusk")

      const times = getTimes(date, latitude, longitude)

      expect(times["customDawn"]).toBeInstanceOf(Date)
      expect(times["customDusk"]).toBeInstanceOf(Date)
      expect(times["customDawn"].getTime()).toBeGreaterThan(times.dawn.getTime())
      expect(times["customDusk"].getTime()).toBeLessThan(times.dusk.getTime())
    } finally {
      vi.resetModules()
    }
  })
})

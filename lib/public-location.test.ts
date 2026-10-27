import { spawnSync } from "node:child_process"
import { afterEach, describe, expect, it, vi } from "vitest"
import { parsedForecastDocument } from "@/lib/__fixtures__/forecast"
import { mapForecastDocument } from "@/lib/forecast-mappers"
import { buildMoonEvents } from "@/lib/moon"
import { PUBLIC_LOCATION } from "@/lib/public-location"
import { getTimes } from "@/lib/suncalc"
import { buildTwilightEvents } from "@/lib/twilight"
import { getStationSunTimes, getSunTimes } from "@/lib/utils"

afterEach(() => vi.unstubAllEnvs())

describe("public astronomy location", () => {
  it.each(["2026-03-08", "2026-06-21", "2026-11-01"])(
    "never depends on private configuration on %s",
    (day) => {
      const at = new Date(`${day}T12:00:00Z`)
      const snapshot = () => ({
        current: getSunTimes(at),
        historical: getSunTimes(new Date(day)),
        stationDay: getStationSunTimes(day),
        twilight: buildTwilightEvents(at),
        moon: buildMoonEvents(at),
        forecast: mapForecastDocument(parsedForecastDocument(), at),
      })
      const expected = snapshot()
      expect(expected.current).toEqual(
        getTimes(at, PUBLIC_LOCATION.latitude, PUBLIC_LOCATION.longitude),
      )
      for (const [latitude, longitude] of [
        ["34.23456789", "-117.21234567"],
        ["51.5", "-0.12"],
        ["", "0x22"],
        [undefined, undefined],
      ]) {
        vi.stubEnv("LOCATION_LATITUDE", latitude)
        vi.stubEnv("LOCATION_LONGITUDE", longitude)
        expect(snapshot()).toEqual(expected)
      }
    },
  )

  it("uses the same public point in the publisher and Python card", () => {
    const result = spawnSync(
      "python3",
      [
        "-B",
        "-c",
        "import sys,json; sys.path.insert(0,'scripts'); import town_card,publish_forecast; print(json.dumps([town_card.PUBLIC_LOCATION,publish_forecast.PUBLIC_LOCATION]))",
      ],
      { encoding: "utf8", timeout: 10000 },
    )
    expect(result.status, result.stderr).toBe(0)
    const point = [PUBLIC_LOCATION.latitude, PUBLIC_LOCATION.longitude]
    expect(JSON.parse(result.stdout)).toEqual([point, point])
  })
})

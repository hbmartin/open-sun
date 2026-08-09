import type { DayData, ForecastFetchResult, InstantObservation, WeeklyData } from "@/lib/types"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import Almanac from "@/components/Almanac"
import { litPath } from "@/components/moon-path"
import MoonDisc from "@/components/MoonDisc"
import { parsedForecastDocument } from "@/lib/__fixtures__/forecast"
import { mapForecastDocument } from "@/lib/forecast-mappers"
import { buildMoonEvents } from "@/lib/moon"
import { getStationSunTimes } from "@/lib/utils"

const NOW = new Date("2026-08-05T16:00:00Z")
const MOON = buildMoonEvents(NOW)
const SUN_TIMES = getStationSunTimes("2026-08-05")

const observation: InstantObservation = {
  inTemp: null,
  inHumi: null,
  AbsPress: null,
  RelPress: null,
  outTemp: 68,
  outHumi: 50,
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
  sunTimes: SUN_TIMES,
}

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

function week(highs: number[]): WeeklyData {
  return {
    data: highs.map((high) => day(high)),
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

const UNAVAILABLE: ForecastFetchResult = { kind: "unavailable", reason: "HTTP 404" }

function render(
  lastWeekData: WeeklyData = week([90, 80, 84]),
  forecast: ForecastFetchResult = UNAVAILABLE,
): string {
  return renderToStaticMarkup(
    <Almanac
      moon={MOON}
      now={NOW}
      currentWeatherData={observation}
      lastWeekData={lastWeekData}
      forecast={forecast}
    />,
  )
}

describe("Almanac", () => {
  it("names the phase, illumination and next full moon", () => {
    const markup = render()
    // 2026-08-05 is the real last quarter of that lunation.
    expect(markup).toContain("Last Quarter")
    expect(markup).toContain("Illumination")
    expect(markup).toContain("54%")
    expect(markup).toContain("Next Full Moon")
  })

  it("gives the moonset in station time", () => {
    const markup = render()
    expect(markup).toContain("Moonset")
    // 20:50Z on the 5th is 1:50 PM at the station, not the following morning.
    expect(markup).toContain("1:50 PM")
  })

  it("compares today's high against the trailing week, not a climate normal", () => {
    // Today 90, prior days 80 and 84 averaging 82: nine above.
    const markup = render(week([90, 80, 84]))
    expect(markup).toContain("+8°")
    expect(markup).toContain("above the 7-day average high")
    expect(markup).toContain("H:90°")
    expect(markup).toContain("7-day avg")
    expect(markup).toContain("H:82°")
  })

  it("reads the other way round on a cool day", () => {
    const markup = render(week([70, 80, 84]))
    expect(markup).toContain("-12°")
    expect(markup).toContain("below the 7-day average high")
  })

  it("says so plainly when today matches the average", () => {
    const markup = render(week([82, 80, 84]))
    expect(markup).toContain("at the 7-day average")
    // `${-0}` is "0", but a rounding path that produced "-0°" would slip past a
    // looser assertion.
    expect(markup).not.toContain("-0°")
  })

  it("prefers the forecast's high for today, so it agrees with the day list", () => {
    const forecast: ForecastFetchResult = {
      kind: "ok",
      forecast: mapForecastDocument(parsedForecastDocument(), NOW),
    }
    const high = forecast.kind === "ok" ? forecast.forecast.days[0]?.max_temp : undefined
    expect(high).toBeDefined()
    // The station's own running maximum for today is deliberately ignored.
    const markup = render(week([1, 80, 84]), forecast)
    expect(markup).toContain(`H:${Math.round(high!)}°`)
    expect(markup).not.toContain("H:1°")
  })

  it("falls back to the station's high when the forecast is unavailable", () => {
    expect(render(week([90, 80, 84]), UNAVAILABLE)).toContain("H:90°")
  })

  it("admits when there is no history to average against", () => {
    expect(render(week([90]))).toContain("Not enough history yet.")
    expect(render(week([]))).toContain("Not enough history yet.")
  })

  it("reports humidity and dew point from the live station reading", () => {
    const markup = render()
    expect(markup).toContain("50%")
    // 68F at 50% RH dews at 48.7F.
    expect(markup).toContain("The dew point is 49° right now.")
  })

  it("leaks neither NaN nor an invalid date", () => {
    const markup = render()
    expect(markup).not.toContain("NaN")
    expect(markup).not.toContain("Invalid Date")
    expect(markup).not.toContain("undefined")
    expect(markup).not.toContain("Infinity")
  })

  it("survives a station reading of zero humidity", () => {
    const markup = renderToStaticMarkup(
      <Almanac
        moon={MOON}
        now={NOW}
        currentWeatherData={{ ...observation, outHumi: 0 }}
        lastWeekData={week([90, 80, 84])}
        forecast={UNAVAILABLE}
      />,
    )
    expect(markup).not.toContain("NaN")
    expect(markup).not.toContain("Infinity")
    expect(markup).toContain("The dew point is — right now.")
  })
})

describe("MoonDisc", () => {
  function radiusOf(path: string): number {
    // The terminator's x-radius: the second arc's first number.
    return Number(/A[\d.]+ \d+ 0 0 \d 0 \d+A([\d.]+) /u.exec(path)![1])
  }

  function flagsOf(path: string): number[] {
    return [...path.matchAll(/0 0 (\d) 0/gu)].map((match) => Number(match[1]))
  }

  it("flattens the terminator to a straight line at the quarters", () => {
    expect(radiusOf(litPath(0.5, true))).toBe(0)
    expect(radiusOf(litPath(0.5, false))).toBe(0)
  })

  it("opens the terminator back to the full disc at new and full", () => {
    expect(radiusOf(litPath(0, true))).toBe(11)
    expect(radiusOf(litPath(1, true))).toBe(11)
  })

  it("bows the terminator away from the lit limb when gibbous, across it when crescent", () => {
    // A crescent and a gibbous of equal |fraction - 0.5| share a terminator
    // width and differ only in which way it curves. Get this flag backwards and
    // the moon renders as a plausible but wrong phase.
    expect(radiusOf(litPath(0.25, true))).toBe(radiusOf(litPath(0.75, true)))
    const [, crescent] = flagsOf(litPath(0.25, true))
    const [, gibbous] = flagsOf(litPath(0.75, true))
    expect(crescent).not.toBe(gibbous)
  })

  it("lights the right limb waxing and the left limb waning", () => {
    // Northern hemisphere. Mirroring this is the classic silent bug.
    expect(flagsOf(litPath(0.25, true))[0]).toBe(1)
    expect(flagsOf(litPath(0.25, false))[0]).toBe(0)
  })

  it("mirrors waxing and waning of the same fraction", () => {
    const waxing = flagsOf(litPath(0.3, true))
    const waning = flagsOf(litPath(0.3, false))
    expect(waning).toEqual(waxing.map((flag) => 1 - flag))
  })

  it("closes a full circle at full moon and encloses nothing at new", () => {
    // Same flag on both arcs continues one way round the circle; opposite flags
    // retrace the same semicircle and enclose no area at all.
    const [full, fullTerminator] = flagsOf(litPath(1, true))
    expect(full).toBe(fullTerminator)
    const [dark, darkTerminator] = flagsOf(litPath(0, true))
    expect(dark).not.toBe(darkTerminator)
  })

  it("renders a disc behind the lit region and hides both from assistive tech", () => {
    const markup = renderToStaticMarkup(<MoonDisc fraction={0.54} phase={0.74} size={88} />)
    expect(markup).toContain("<circle")
    expect(markup).toContain('aria-hidden="true"')
    expect(markup).toContain('width="88"')
    expect(markup).not.toContain("NaN")
  })
})

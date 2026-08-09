import type { DayPartLabel, DayPartRun, NextHoursModel, NextHoursPoint } from "@/lib/next-hours"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import NextHoursChart from "@/components/NextHoursChart"
import { ForecastMetric } from "@/lib/types"

function makePoints(count = 24): NextHoursPoint[] {
  return Array.from({ length: count }, (_, offset) => ({
    offset,
    hour: String((9 + offset) % 24),
    // Modulo keeps the domain identical however long the horizon runs, so the
    // geometry of the first 24 hours can be compared across horizons.
    value: 70 + (offset % 24),
    bands: [],
    condition: "sunny" as const,
    pop: 10,
  }))
}

/** Three nested bands around each point's value, widest first. */
function bandedPoints(): NextHoursPoint[] {
  return makePoints().map((point) =>
    Object.assign(point, {
      bands: [
        { low: (point.value as number) - 6, high: (point.value as number) + 6, coverage: 0.9 },
        { low: (point.value as number) - 4, high: (point.value as number) + 4, coverage: 0.6 },
        { low: (point.value as number) - 2, high: (point.value as number) + 2, coverage: 0.3 },
      ],
    }),
  )
}

const DAY_PART_LABELS: DayPartLabel[] = ["Overnight", "Morning", "Afternoon", "Evening"]

/** The runs buildNextHours would produce from startHour 9 over `hours` slots. */
function dayPartsFor(hours: number): DayPartRun[] {
  const runs: DayPartRun[] = []
  for (let offset = 0; offset < hours; offset++) {
    const label = DAY_PART_LABELS[Math.floor(((9 + offset) % 24) / 6)]
    const previous = runs.at(-1)
    if (previous?.label === label) {
      previous.endOffset = offset + 1
    } else {
      runs.push({ label, heading: label, startOffset: offset, endOffset: offset + 1, maxPop: 10 })
    }
  }
  return runs
}

function makeModel(overrides: Partial<NextHoursModel> = {}): NextHoursModel {
  return {
    points: makePoints(),
    dayParts: [
      { label: "Morning", heading: "Morning", startOffset: 0, endOffset: 3, maxPop: 10 },
      { label: "Afternoon", heading: "Afternoon", startOffset: 3, endOffset: 9, maxPop: 10 },
      { label: "Evening", heading: "Evening", startOffset: 9, endOffset: 15, maxPop: 0 },
      {
        label: "Overnight",
        heading: "Overnight",
        startOffset: 15,
        endOffset: 21,
        maxPop: undefined,
      },
      { label: "Morning", heading: "Morning", startOffset: 21, endOffset: 24, maxPop: 10 },
    ],
    startHour: 9,
    horizonHours: 24,
    nowOffset: 0.48,
    domainMin: 70,
    domainMax: 93,
    summary: "Clear skies this morning and this afternoon.",
    ...overrides,
  }
}

/** A model spanning `hours` slots, i.e. `hours / 24` screenfuls of scroll. */
function makeHorizonModel(hours: number, overrides: Partial<NextHoursModel> = {}): NextHoursModel {
  return makeModel({
    points: makePoints(hours),
    dayParts: dayPartsFor(hours),
    horizonHours: hours,
    ...overrides,
  })
}

function render(model: NextHoursModel, metric: ForecastMetric = ForecastMetric.TEMP): string {
  return renderToStaticMarkup(<NextHoursChart model={model} metric={metric} />)
}

describe("NextHoursChart", () => {
  it("renders the heading, summary, day parts, now marker and labeled values", () => {
    const markup = render(makeModel())
    expect(markup).toContain("Hourly Forecast")
    expect(markup).toContain("Clear skies this morning and this afternoon.")
    expect(markup).toContain("Afternoon")
    expect(markup).toContain("Now")
    expect(markup).toContain("70°")
    expect(markup).toContain("10%")
    expect(markup).toContain("9 AM")
  })

  it("never leaks NaN or undefined into the markup", () => {
    const markup = render(makeModel())
    expect(markup).not.toContain("NaN")
    expect(markup).not.toContain("undefined")
  })

  it("renders a dash for a day part with no rain chance", () => {
    expect(render(makeModel())).toContain("—")
  })

  it("splits the line where the window has a gap", () => {
    const points = makePoints().filter((point) => point.offset !== 10 && point.offset !== 11)
    const markup = render(makeModel({ points }))
    expect(markup.match(/<polyline/gu)).toHaveLength(2)
  })

  it("draws no band without quantiles and one layer per coverage with them", () => {
    // The band polygons are the only marks wearing these fills.
    expect(render(makeModel())).not.toContain("band-fill")
    const markup = render(makeModel({ points: bandedPoints() }))
    expect(markup).toContain("band-fill-90")
    expect(markup).toContain("band-fill-60")
    expect(markup).toContain("band-fill-30")
    expect(markup.match(/band-fill-/gu)).toHaveLength(3)
  })

  it("formats values by the selected metric's precision and unit", () => {
    const points = makePoints().map((point) => Object.assign(point, { value: 0.125 }))
    const markup = render(makeModel({ points, domainMin: 0, domainMax: 1 }), ForecastMetric.PRECIP)
    expect(markup).toContain("0.13&quot;")
  })

  it("haloes the value labels so they survive the darkest band", () => {
    const markup = render(makeModel({ points: bandedPoints() }))
    expect(markup).toContain('paint-order="stroke"')
    expect(markup).toContain("stroke-white dark:stroke-gray-900")
  })

  it("omits the summary paragraph when there is none", () => {
    expect(render(makeModel({ summary: undefined }))).not.toContain("Clear skies")
  })

  it("draws a time tick under every labeled dot", () => {
    const markup = render(makeModel())
    // The tick row is the only fontSize-9 text in the chart.
    expect(markup.match(/font-size="9"/gu)).toHaveLength(8)
    // startHour 9 in three-hour steps, rolling over midnight.
    const ticks = [...markup.matchAll(/font-size="9"[^>]*>([^<]+)</gu)].map((match) => match[1])
    expect(ticks).toEqual(["9 AM", "12 PM", "3 PM", "6 PM", "9 PM", "12 AM", "3 AM", "6 AM"])
  })

  it("describes every interval, value and band to screen readers", () => {
    const markup = render(makeModel({ points: bandedPoints() }))

    // The SVG must point at the off-screen list that actually holds the data.
    const describedBy = /aria-describedby="([^"]+)"/u.exec(markup)?.[1]
    expect(describedBy).toBeDefined()
    expect(markup).toContain(`<ul id="${describedBy}" class="sr-only">`)

    expect(markup).toContain("Afternoon: 10% chance of rain")
    expect(markup).toContain("Overnight: rain chance unknown")
    // The 60% band is voiced, not the widest (±6) or narrowest (±2).
    expect(markup).toContain("9 AM: 70°, likely between 66° and 74°")
    // All 24 plotted hours are listed, not just the labeled samples.
    expect(markup.match(/likely between/gu)).toHaveLength(24)
  })

  it("keeps the hour list out of the flattened description", () => {
    const markup = render(makeModel())
    const describedBy = /aria-describedby="([^"]+)"/u.exec(markup)?.[1]
    // The described list holds the five day parts, not the 24 hours.
    const described = markup.split(`<ul id="${describedBy}" class="sr-only">`)[1].split("</ul>")[0]
    expect(described.match(/<li/gu)).toHaveLength(5)
    expect(markup).toContain("Hourly temperature detail")
  })

  it("names the day part by day and part where the header shows only the day", () => {
    const model = makeModel()
    for (const run of model.dayParts) {
      if (run.label === "Overnight") {
        run.heading = "THU"
      }
    }
    const markup = render(model)
    expect(markup).toContain("THU overnight: rain chance unknown")
    expect(markup).toContain(">THU</div>")
  })
})

describe("scrolling past the first screenful", () => {
  it("scales the viewBox and the track by the same factor", () => {
    // Both scale by horizonHours/24, which is what holds the rendered height
    // and the hours-per-screen constant however far the horizon runs.
    const markup = render(makeHorizonModel(48))
    expect(markup).toContain('viewBox="0 0 720 130"')
    expect(markup).toContain("width:200%")
    expect(markup).toContain('class="w-full h-auto"')
  })

  it("collapses to the plain 24-hour chart when the horizon is one screenful", () => {
    const markup = render(makeModel())
    expect(markup).toContain('viewBox="0 0 360 130"')
    expect(markup).toContain("width:100%")
  })

  it("plots the first 24 hours identically however long the horizon", () => {
    const short = /<polyline points="([^"]+)"/u.exec(render(makeHorizonModel(24)))?.[1]
    const long = /<polyline points="([^"]+)"/u.exec(render(makeHorizonModel(48)))?.[1]
    expect(short).toBeDefined()
    expect(long?.split(" ").slice(0, 24)).toEqual(short?.split(" "))
  })

  it("exposes the scroll region to the keyboard with a name", () => {
    const markup = render(makeHorizonModel(48))
    expect(markup).toContain('tabindex="0"')
    expect(markup).toContain('role="group"')
    expect(markup).toContain('aria-label="Hourly forecast, scroll horizontally for later hours"')
  })

  it("hints at more to the right only when there is more", () => {
    expect(render(makeModel())).not.toContain("bg-linear-to-l")
    expect(render(makeHorizonModel(48))).toContain("bg-linear-to-l")
  })

  it("renders a tick every third hour across the whole horizon", () => {
    expect(render(makeHorizonModel(48)).match(/font-size="9"/gu)).toHaveLength(16)
    // A horizon that is not a multiple of the label step still labels its tail.
    expect(render(makeHorizonModel(49)).match(/font-size="9"/gu)).toHaveLength(17)
  })

  it("keeps every mark inside the widened viewBox", () => {
    const markup = render(makeHorizonModel(48, { points: bandedPoints() }))
    const xs = [...markup.matchAll(/\b(?:x|cx)="([\d.]+)"/gu)].map((match) => Number(match[1]))
    expect(xs.length).toBeGreaterThan(0)
    expect(xs.every((x) => x >= 0 && x <= 720)).toBe(true)
  })

  it("positions day parts as a fraction of the horizon", () => {
    const markup = render(
      makeModel({
        horizonHours: 48,
        dayParts: [
          { label: "Morning", heading: "Morning", startOffset: 0, endOffset: 6, maxPop: 10 },
          { label: "Afternoon", heading: "Afternoon", startOffset: 6, endOffset: 48, maxPop: 10 },
        ],
      }),
    )
    expect(markup).toContain("width:12.5%")
  })

  it("positions icons as a fraction of the horizon", () => {
    const points = makePoints(48).map((point) =>
      Object.assign(point, {
        condition: point.offset < 24 ? ("sunny" as const) : ("cloudy" as const),
      }),
    )
    const markup = render(makeHorizonModel(48, { points }))
    // Offset 24 is the first sample whose condition changed, so it draws.
    expect(markup).toContain(`left:${((24 + 0.5) / 48) * 100}%`)
  })

  it("names the full horizon in the chart label", () => {
    expect(render(makeHorizonModel(48))).toContain("forecast for the next 48 hours")
  })
})

import type { NextHoursModel, NextHoursPoint } from "@/lib/next-hours"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import NextHoursChart from "@/components/NextHoursChart"
import { ForecastMetric } from "@/lib/types"

function makePoints(): NextHoursPoint[] {
  return Array.from({ length: 24 }, (_, offset) => ({
    offset,
    hour: String((9 + offset) % 24),
    value: 70 + offset,
    condition: "sunny" as const,
    pop: 10,
  }))
}

function makeModel(overrides: Partial<NextHoursModel> = {}): NextHoursModel {
  return {
    points: makePoints(),
    dayParts: [
      { label: "Morning", startOffset: 0, endOffset: 3, maxPop: 10 },
      { label: "Afternoon", startOffset: 3, endOffset: 9, maxPop: 10 },
      { label: "Evening", startOffset: 9, endOffset: 15, maxPop: 0 },
      { label: "Overnight", startOffset: 15, endOffset: 21, maxPop: undefined },
      { label: "Morning", startOffset: 21, endOffset: 24, maxPop: 10 },
    ],
    startHour: 9,
    nowFraction: 0.02,
    domainMin: 70,
    domainMax: 93,
    summary: "Clear skies this morning and this afternoon. Sunset at 7:31 PM.",
    ...overrides,
  }
}

function render(model: NextHoursModel, metric: ForecastMetric = ForecastMetric.TEMP): string {
  return renderToStaticMarkup(<NextHoursChart model={model} metric={metric} />)
}

describe("NextHoursChart", () => {
  it("renders the heading, summary, day parts, now marker and labeled values", () => {
    const markup = render(makeModel())
    expect(markup).toContain("Next 24 Hours")
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

  it("draws no band without quantiles and one with them", () => {
    // The band polygon is the only mark wearing this fill.
    expect(render(makeModel())).not.toContain("fill-gray-300")
    const banded = makePoints().map((point) =>
      Object.assign(point, {
        bandLow: (point.value as number) - 2,
        bandHigh: (point.value as number) + 2,
      }),
    )
    expect(render(makeModel({ points: banded }))).toContain("fill-gray-300")
  })

  it("formats values by the selected metric's precision and unit", () => {
    const points = makePoints().map((point) => Object.assign(point, { value: 0.125 }))
    const markup = render(makeModel({ points, domainMin: 0, domainMax: 1 }), ForecastMetric.PRECIP)
    expect(markup).toContain("0.13&quot;")
  })

  it("omits the summary paragraph when there is none", () => {
    expect(render(makeModel({ summary: undefined }))).not.toContain("Clear skies")
  })

  it("describes every interval, value and band to screen readers", () => {
    const banded = makePoints().map((point) =>
      Object.assign(point, {
        bandLow: (point.value as number) - 2,
        bandHigh: (point.value as number) + 2,
      }),
    )
    const markup = render(makeModel({ points: banded }))

    // The SVG must point at the off-screen list that actually holds the data.
    const describedBy = /aria-describedby="([^"]+)"/u.exec(markup)?.[1]
    expect(describedBy).toBeDefined()
    expect(markup).toContain(`<ul id="${describedBy}" class="sr-only">`)

    expect(markup).toContain("Afternoon: 10% chance of rain")
    expect(markup).toContain("Overnight: rain chance unknown")
    expect(markup).toContain("9 AM: 70°, likely between 68° and 72°")
    // All 24 plotted hours are listed, not just the labeled samples.
    expect(markup.match(/likely between/gu)).toHaveLength(24)
  })
})

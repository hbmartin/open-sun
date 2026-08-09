import type { ForecastHourData } from "@/lib/types"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import ForecastHourlyDetail from "@/components/forecast-hourly-detail"
import { ForecastMetric } from "@/lib/types"

describe("forecast hourly rainfall", () => {
  it.each([
    [undefined, "—"],
    [0, "0.00"],
    [0.0049, "0.00"],
    [0.005, "0.01"],
    [0.0051, "0.01"],
    [0.01, "0.01"],
    [0.13, "0.13"],
  ])("renders precipitation %s as %s in", (precip, expected) => {
    const hour: ForecastHourData = {
      date: "2026-10-10",
      hour: "14",
      validTime: "2026-10-10T21:00:00Z",
      leadBucket: "0-6h",
      isDaytime: true,
      hasEvidence: true,
      temp: 70,
      precip,
      bands: {},
      methods: {},
    }
    const markup = renderToStaticMarkup(
      <ForecastHourlyDetail
        hourly_data={[hour]}
        metric={ForecastMetric.TEMP}
        minTemp={60}
        maxTemp={80}
      />,
    )
    expect(markup).toContain(`<span>${expected} in</span>`)
  })
})

function makeHour(overrides: Partial<ForecastHourData> = {}): ForecastHourData {
  return {
    date: "2026-08-05",
    hour: "12",
    validTime: "2026-08-05T19:00:00+00:00",
    leadBucket: "0-1h",
    isDaytime: true,
    hasEvidence: true,
    temp: 82,
    pop: 0,
    precip: 0,
    humidity: 27,
    wind: 1.4,
    bands: {},
    methods: {},
    ...overrides,
  }
}

/** Only even indices render, so the hour under test goes first. */
function render(overrides: Partial<ForecastHourData> = {}) {
  return renderToStaticMarkup(
    <ForecastHourlyDetail
      hourly_data={[makeHour(overrides)]}
      metric={ForecastMetric.TEMP}
      minTemp={70}
      maxTemp={96}
    />,
  )
}

describe("ForecastHourlyDetail", () => {
  it("shows wind alone when the hour is dry", () => {
    const markup = render({ precip: 0 })
    expect(markup).toContain("1 mph")
    // Dry hours with wind omit the rainfall value.
    expect(markup).not.toContain(" in")
  })

  it("shows rain and wind together once the hour is wet", () => {
    const markup = render({ precip: 0.02 })
    expect(markup).toContain("0.02 in · 1 mph")
  })

  it("treats the 0.01 inch threshold as inclusive", () => {
    expect(render({ precip: 0.01 })).toContain("0.01 in")
  })

  it("reads as dry just below the threshold", () => {
    const markup = render({ precip: 0.009 })
    expect(markup).toContain("1 mph")
    expect(markup).not.toContain(" in")
  })

  it("keeps unknown rainfall distinct from dry weather alongside wind", () => {
    expect(render({ precip: undefined })).toContain("— in · 1 mph")
  })

  it("no longer crowds the row with humidity", () => {
    expect(render({ humidity: 27 })).not.toContain("27%")
  })

  it("still reads as dry when there is no wind reading", () => {
    const markup = render({ precip: 0, wind: undefined })
    expect(markup).toContain("0.00 in")
    expect(markup).not.toContain("·")
  })

  it("drops the separator when rain has no wind to pair with", () => {
    const markup = render({ precip: 0.02, wind: undefined })
    expect(markup).toContain("0.02 in")
    expect(markup).not.toContain("·")
  })
})

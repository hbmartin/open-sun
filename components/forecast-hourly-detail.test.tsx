import type { ForecastHourData } from "@/lib/types"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import ForecastHourlyDetail from "@/components/forecast-hourly-detail"
import { ForecastMetric } from "@/lib/types"

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
    // renderToStaticMarkup escapes the inches mark, so its absence means no rain.
    expect(markup).not.toContain("&quot;")
  })

  it("shows rain and wind together once the hour is wet", () => {
    const markup = render({ precip: 0.02 })
    expect(markup).toContain("0.02&quot; · 1 mph")
  })

  it("treats the 0.01 inch threshold as inclusive", () => {
    expect(render({ precip: 0.01 })).toContain("0.01&quot;")
  })

  it("reads as dry just below the threshold", () => {
    const markup = render({ precip: 0.009 })
    expect(markup).toContain("1 mph")
    expect(markup).not.toContain("&quot;")
  })

  it("no longer crowds the row with humidity", () => {
    expect(render({ humidity: 27 })).not.toContain("27%")
  })

  it("still reads as dry when there is no wind reading", () => {
    const markup = render({ precip: 0, wind: undefined })
    expect(markup).toContain("0&quot;")
    expect(markup).not.toContain("·")
  })

  it("drops the separator when rain has no wind to pair with", () => {
    const markup = render({ precip: 0.02, wind: undefined })
    expect(markup).toContain("0.02&quot;")
    expect(markup).not.toContain("·")
  })
})

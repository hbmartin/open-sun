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

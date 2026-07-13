import type { TimesData } from "@/lib/suncalc"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import HourlyContainer from "@/components/HourlyContainer"
import { DisplayMetric } from "@/lib/types"

describe("HourlyContainer", () => {
  it("renders an error state when the requested date has no hourly data", () => {
    const markup = renderToStaticMarkup(
      <HourlyContainer
        date="2026-07-12"
        metric={DisplayMetric.TEMP}
        dailyData={undefined}
        timesData={{} as TimesData}
      />,
    )

    expect(markup).toContain("Something went wrong.")
  })
})

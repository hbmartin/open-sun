// A real document captured from the data branch, so publisher drift that the
// hand-written fixtures would miss still fails a test.
import { readFileSync } from "node:fs"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import ForecastWeather from "@/components/ForecastWeather"
import { mapForecastDocument } from "@/lib/forecast-mappers"
import { ForecastDocumentSchema } from "@/lib/forecast-schemas"
import { ForecastMetric } from "@/lib/types"

describe("a captured published document", () => {
  const raw: unknown = JSON.parse(readFileSync("lib/__fixtures__/forecast.sample.json", "utf8"))

  it("satisfies the schema", () => {
    const parsed = ForecastDocumentSchema.safeParse(raw)
    if (!parsed.success) {
      throw new Error(JSON.stringify(parsed.error.issues.slice(0, 5), undefined, 2))
    }
    expect(parsed.data.hourly.length).toBeGreaterThan(40)
    expect(parsed.data.daily.length).toBe(10)
  })

  it("maps and renders every metric", () => {
    const parsed = ForecastDocumentSchema.parse(raw)
    const forecast = mapForecastDocument(parsed, new Date(parsed.issued_at))
    expect(forecast.days).toHaveLength(10)

    const withHours = forecast.days.filter((day) => day.hours.some(Boolean))
    expect(withHours.length).toBeGreaterThanOrEqual(2)

    for (const metric of Object.values(ForecastMetric)) {
      const markup = renderToStaticMarkup(
        <ForecastWeather metric={metric} forecast={{ kind: "ok", forecast }} />,
      )
      expect(markup).toContain("Next 10 Days")
      expect(markup).not.toContain("NaN")
      expect(markup).not.toContain("undefined")
    }
  })
})

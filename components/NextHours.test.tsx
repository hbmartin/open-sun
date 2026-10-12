// @vitest-environment jsdom

import type { ForecastFetchResult } from "@/lib/types"
import type { Root } from "react-dom/client"
import type { MockInstance } from "vitest"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import NextHours from "@/components/NextHours"
import { makeDailyRow, makeHourlyRow, parsedForecastDocument } from "@/lib/__fixtures__/forecast"
import { mapForecastDocument, withForecastFreshness } from "@/lib/forecast-mappers"
import * as nextHours from "@/lib/next-hours"
import { ForecastMetric } from "@/lib/types"

const NOW = new Date("2026-08-05T16:00:00Z")
const UNAVAILABLE: ForecastFetchResult = { kind: "unavailable", reason: "HTTP 404" }

let container: HTMLDivElement
let root: Root
let forecast: Extract<ForecastFetchResult, { kind: "ok" }>
let build: MockInstance<typeof nextHours.buildNextHours>

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  build = vi.spyOn(nextHours, "buildNextHours")
  forecast = {
    kind: "ok",
    forecast: mapForecastDocument(
      parsedForecastDocument({
        hourly: Array.from({ length: 4 }, (_, index) =>
          makeHourlyRow({
            valid_time: new Date(NOW.getTime() + index * 3_600_000).toISOString(),
          }),
        ),
      }),
      NOW,
    ),
  }
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function render(
  result: ForecastFetchResult = forecast,
  now: Date = NOW,
  metric: ForecastMetric = ForecastMetric.TEMP,
) {
  await act(() => root.render(<NextHours forecast={result} now={now} metric={metric} />))
}

describe("NextHours chart inputs", () => {
  it("reuses the chart model when only the forecast freshness changes", async () => {
    await render()
    expect(build).toHaveBeenCalledTimes(1)

    await render({
      kind: "ok",
      forecast: withForecastFreshness(forecast.forecast, new Date("2026-08-06T16:00:00Z")),
    })
    expect(build).toHaveBeenCalledTimes(1)
    expect(container.querySelector('svg[role="img"]')).not.toBeNull()
  })

  it.each([
    { label: "the same instant", time: "2026-08-05T16:00:00Z" },
    { label: "one millisecond later", time: "2026-08-05T16:00:00.001Z" },
    { label: "the end of the same minute", time: "2026-08-05T16:00:59.999Z" },
  ])("reuses the model for a new Date at $label", async ({ time }) => {
    await render()
    await render(forecast, new Date(time))

    expect(build).toHaveBeenCalledTimes(1)
    expect(build.mock.results[0].value?.nowOffset).toBe(0)
    expect(container.querySelector('svg[role="img"]')).not.toBeNull()
  })

  it.each([
    {
      label: "the next minute",
      from: "2026-08-05T16:00:59.999Z",
      to: "2026-08-05T16:01:00Z",
      startHour: 9,
      nowOffset: 1 / 60,
    },
    {
      label: "the next hour",
      from: "2026-08-05T16:59:59.999Z",
      to: "2026-08-05T17:00:00Z",
      startHour: 10,
      nowOffset: 0,
    },
    {
      label: "station-local midnight",
      from: "2026-08-06T06:59:59.999Z",
      to: "2026-08-06T07:00:00Z",
      startHour: 0,
      nowOffset: 0,
    },
    {
      label: "a backward clock correction",
      from: "2026-08-05T16:01:00Z",
      to: "2026-08-05T16:00:59.999Z",
      startHour: 9,
      nowOffset: 0,
    },
  ])("rebuilds the model at $label", async ({ from, to, startHour, nowOffset }) => {
    const twoDays: ForecastFetchResult = {
      kind: "ok",
      forecast: mapForecastDocument(
        parsedForecastDocument({
          daily: [makeDailyRow(), makeDailyRow({ date_local: "2026-08-06" })],
          hourly: Array.from({ length: 48 }, (_, index) =>
            makeHourlyRow({
              valid_time: new Date(NOW.getTime() + index * 3_600_000).toISOString(),
            }),
          ),
        }),
        NOW,
      ),
    }
    await render(twoDays, new Date(from))
    expect(build.mock.results[0].value).toBeDefined()

    await render(twoDays, new Date(to))
    expect(build).toHaveBeenCalledTimes(2)
    expect(build.mock.results[1].value?.startHour).toBe(startHour)
    expect(build.mock.results[1].value?.nowOffset).toBeCloseTo(nowOffset, 10)
    expect(container.querySelector('svg[role="img"]')).not.toBeNull()
  })

  it("rebuilds the chart when the days change", async () => {
    await render()
    expect(build.mock.results[0].value?.points[0].value).toBe(82.29)
    const days = forecast.forecast.days.map((day) => ({
      ...day,
      hours: day.hours.map((hour) =>
        hour === undefined ? undefined : { ...hour, temp: (hour.temp ?? 0) + 10 },
      ),
    }))

    await render({ kind: "ok", forecast: { ...forecast.forecast, days } })
    expect(build).toHaveBeenCalledTimes(2)
    expect(build.mock.results[1].value?.points[0].value).toBe(92.29)
  })

  it("moves the Now line when the clock changes", async () => {
    await render()
    expect(build.mock.results[0].value?.nowOffset).toBe(0)

    await render(forecast, new Date("2026-08-05T16:30:00Z"))
    expect(build).toHaveBeenCalledTimes(2)
    expect(build.mock.results[1].value?.nowOffset).toBe(0.5)
  })

  it("changes the plotted values when the metric changes", async () => {
    await render()
    expect(build.mock.results[0].value?.points[0].value).toBe(82.29)

    await render(forecast, NOW, ForecastMetric.POP)
    expect(build).toHaveBeenCalledTimes(2)
    expect(build.mock.results[1].value?.points[0].value).toBe(0)
    expect(container.querySelector('svg[role="img"]')?.getAttribute("aria-label")).toContain(
      "rain chance",
    )
  })

  it("handles unavailable and available transitions without retaining the old chart", async () => {
    await render(UNAVAILABLE)
    expect(build).not.toHaveBeenCalled()
    expect(container.innerHTML).toBe("")

    await render()
    expect(build).toHaveBeenCalledTimes(1)
    expect(container.querySelector('svg[role="img"]')).not.toBeNull()

    await render(UNAVAILABLE)
    expect(build).toHaveBeenCalledTimes(1)
    expect(container.innerHTML).toBe("")

    await render()
    expect(build).toHaveBeenCalledTimes(2)
    expect(container.querySelector('svg[role="img"]')).not.toBeNull()
  })

  it("replaces the chart with the hourly-unavailable message for empty days", async () => {
    await render()
    await render({ kind: "ok", forecast: { ...forecast.forecast, days: [] } })
    expect(build).toHaveBeenCalledTimes(2)
    expect(container.querySelector('svg[role="img"]')).toBeNull()
    expect(container.textContent).toBe("Hourly forecast is unavailable right now.")
  })
})

// @vitest-environment jsdom

import type { Root } from "react-dom/client"
import { act } from "react"
import { createRoot, hydrateRoot } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import RainfallSummary from "@/components/RainfallSummary"
import { useNow } from "@/components/use-now"
import WeatherApp from "@/components/WeatherApp"
import { makeDailyRow, makeHourlyRow, parsedForecastDocument } from "@/lib/__fixtures__/forecast"
import { makeEmptyWeek, makeObservation } from "@/lib/__fixtures__/station"
import { mapForecastDocument } from "@/lib/forecast-mappers"
import * as nextHours from "@/lib/next-hours"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const SERVER_TIME = new Date("2026-10-10T22:00:00Z")
const CLIENT_TIME = new Date("2026-10-10T23:00:00Z")
const observation = makeObservation(SERVER_TIME, {
  outTemp: 55,
  outHumi: 85,
  windir: 180,
  solarrad: 110,
  uvi: 1,
  rainofhourly: 0.07,
  eventrain: 0.01,
  rain_total_in: 0.01,
  observedAt: "2026-10-10T20:46:00Z",
})
const emptyWeek = makeEmptyWeek()

let container: HTMLDivElement
let root: Root | undefined

beforeEach(() => {
  // Vitest's visual jsdom environment starts visible; hidden-state mocks must be restored.
  expect(document.visibilityState).toBe("visible")
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] })
  vi.setSystemTime(CLIENT_TIME)
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe = vi.fn()
      disconnect = vi.fn()
    },
  )
  container = document.createElement("div")
  document.body.append(container)
})

afterEach(async () => {
  if (root !== undefined) await act(() => root?.unmount())
  root = undefined
  container.remove()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function Clock({ seed, intervalMs = 60_000 }: { seed: Date; intervalMs?: number }) {
  const { now, hasClientTime } = useNow(seed, intervalMs)
  return <output data-ready={hasClientTime}>{now.toISOString()}</output>
}

function StationClock({ seed }: { seed: Date }) {
  const { now, hasClientTime } = useNow(seed)
  return <RainfallSummary currentWeatherData={observation} now={hasClientTime ? now : undefined} />
}

async function resumePage(event: "visibilitychange" | "pageshow") {
  await act(() =>
    event === "visibilitychange"
      ? document.dispatchEvent(new Event("visibilitychange"))
      : globalThis.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })),
  )
}

async function clickNav(name: string) {
  const button = [...container.querySelectorAll("button")].find((item) => item.textContent === name)
  expect(button).toBeDefined()
  await act(() => button?.click())
}

function App({
  seed,
  issuedAt,
  mappedAt = seed,
  degraded = false,
}: {
  seed: Date
  issuedAt: string
  mappedAt?: Date
  degraded?: boolean
}) {
  return (
    <WeatherApp
      currentWeatherData={observation}
      lastWeekData={emptyWeek}
      hourlyDataByDate={{}}
      currentDate={seed}
      twilight={[]}
      moon={[]}
      forecast={{
        kind: "ok",
        forecast: mapForecastDocument(
          parsedForecastDocument({
            issued_at: issuedAt,
            status: degraded ? "degraded" : "ready",
            status_reason: degraded ? "no live evidence" : null,
            daily: [makeDailyRow({ date_local: "2026-10-10" })],
            hourly: Array.from({ length: 4 }, (_, index) =>
              makeHourlyRow({
                valid_time: new Date(SERVER_TIME.getTime() + index * 3_600_000).toISOString(),
              }),
            ),
          }),
          mappedAt,
        ),
      }}
    />
  )
}

function forecastProvenance() {
  return [...container.querySelectorAll("p")].find((item) =>
    item.textContent?.startsWith("Last updated:"),
  )
}

function infoAge() {
  return [...container.querySelectorAll("p")].find((item) =>
    item.textContent?.startsWith("Issued "),
  )
}

describe("shared client clock", () => {
  it.each(["visibilitychange", "pageshow"] as const)(
    "corrects browser time immediately on %s without an interval tick",
    async (event) => {
      root = createRoot(container)
      await act(() => root?.render(<Clock seed={SERVER_TIME} />))
      const resumedTime = new Date("2026-10-11T07:00:00Z")
      vi.setSystemTime(resumedTime)
      expect(container.textContent).toBe(CLIENT_TIME.toISOString())

      await resumePage(event)
      expect(container.textContent).toBe(resumedTime.toISOString())
      expect(container.querySelector("output")?.dataset["ready"]).toBe("true")
      expect(vi.getTimerCount()).toBe(1)
    },
  )

  it("does not resync on hidden visibility or a non-persisted pageshow", async () => {
    root = createRoot(container)
    await act(() => root?.render(<Clock seed={SERVER_TIME} />))
    vi.setSystemTime(new Date("2026-10-11T07:00:00Z"))
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden")
    await act(() => document.dispatchEvent(new Event("visibilitychange")))
    expect(container.textContent).toBe(CLIENT_TIME.toISOString())
    await act(() =>
      globalThis.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: false })),
    )
    expect(container.textContent).toBe(CLIENT_TIME.toISOString())
    expect(container.querySelector("output")?.dataset["ready"]).toBe("true")
  })

  it("removes resume listeners on interval replacement and unmount", async () => {
    const documentAdd = vi.spyOn(document, "addEventListener")
    const documentRemove = vi.spyOn(document, "removeEventListener")
    const windowAdd = vi.spyOn(globalThis, "addEventListener")
    const windowRemove = vi.spyOn(globalThis, "removeEventListener")
    root = createRoot(container)
    await act(() => root?.render(<Clock seed={SERVER_TIME} />))
    const visibilityHandler = documentAdd.mock.calls.find(
      ([name]) => name === "visibilitychange",
    )?.[1]
    const pageShowHandler = windowAdd.mock.calls.find(([name]) => name === "pageshow")?.[1]
    expect(visibilityHandler).toBeDefined()
    expect(pageShowHandler).toBeDefined()

    await act(() => root?.render(<Clock seed={SERVER_TIME} intervalMs={120_000} />))
    expect(documentRemove).toHaveBeenCalledWith("visibilitychange", visibilityHandler)
    expect(windowRemove).toHaveBeenCalledWith("pageshow", pageShowHandler)
    expect(vi.getTimerCount()).toBe(1)
    vi.setSystemTime(new Date("2026-10-11T07:00:00Z"))
    await resumePage("visibilitychange")
    expect(container.textContent).toBe("2026-10-11T07:00:00.000Z")

    await act(() => root?.unmount())
    root = undefined
    const visibilityRegistrations = documentAdd.mock.calls.filter(
      ([name]) => name === "visibilitychange",
    )
    const pageShowRegistrations = windowAdd.mock.calls.filter(([name]) => name === "pageshow")
    expect(visibilityRegistrations).toHaveLength(2)
    expect(pageShowRegistrations).toHaveLength(2)
    for (const [name, handler] of visibilityRegistrations) {
      expect(documentRemove).toHaveBeenCalledWith(name, handler)
    }
    for (const [name, handler] of pageShowRegistrations) {
      expect(windowRemove).toHaveBeenCalledWith(name, handler)
    }
    expect(vi.getTimerCount()).toBe(0)
  })

  it("hydrates the server seed, corrects readiness and time together, and keeps ticking across prop updates", async () => {
    container.innerHTML = renderToString(<Clock seed={SERVER_TIME} />)
    expect(container.querySelector("output")?.dataset["ready"]).toBe("false")
    expect(container.textContent).toBe(SERVER_TIME.toISOString())
    const recoverable = vi.fn()
    await act(() => {
      root = hydrateRoot(container, <Clock seed={SERVER_TIME} />, {
        onRecoverableError: recoverable,
      })
    })
    expect(container.querySelector("output")?.dataset["ready"]).toBe("true")
    expect(container.textContent).toBe(CLIENT_TIME.toISOString())
    expect(recoverable).not.toHaveBeenCalled()

    await act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(container.textContent).toBe("2026-10-10T23:01:00.000Z")
    await act(() => root?.render(<Clock seed={new Date("2026-10-10T21:00:00Z")} />))
    expect(container.querySelector("output")?.dataset["ready"]).toBe("true")
    expect(container.textContent).toBe("2026-10-10T23:01:00.000Z")
    await act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(container.textContent).toBe("2026-10-10T23:02:00.000Z")

    await act(() => root?.unmount())
    root = undefined
    expect(vi.getTimerCount()).toBe(0)
  })

  it("replaces the interval without retaining the previous timer", async () => {
    root = createRoot(container)
    await act(() => root?.render(<Clock seed={SERVER_TIME} />))
    await act(() => root?.render(<Clock seed={SERVER_TIME} intervalMs={120_000} />))
    expect(vi.getTimerCount()).toBe(1)
    await act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(container.textContent).toBe(CLIENT_TIME.toISOString())
    await act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(container.textContent).toBe("2026-10-10T23:02:00.000Z")
  })

  it("hydrates absolute station markup into the corrected age and warning", async () => {
    container.innerHTML = renderToString(<StationClock seed={SERVER_TIME} />)
    const lines = () => [...container.querySelectorAll("p")]
    expect(lines()[0].textContent).toBe("Observed: Oct 10, 2026, 1:46 PM PDT")
    expect(lines()[1].textContent).toBe("")
    expect(lines()[2].textContent).toBe("")
    expect(lines()[1].getAttribute("aria-hidden")).toBe("true")
    expect(lines()[2].getAttribute("aria-hidden")).toBe("true")
    const recoverable = vi.fn()
    await act(() => {
      root = hydrateRoot(container, <StationClock seed={SERVER_TIME} />, {
        onRecoverableError: recoverable,
      })
    })
    expect(lines()[0].textContent).toBe("Observed: Oct 10, 2026, 1:46 PM PDT")
    expect(lines()[1].textContent).toBe("2 hours 14 minutes ago")
    expect(lines()[2].textContent).toBe("Older snapshot")
    expect(container.textContent).toContain("Rain today")
    expect(lines()[1].getAttribute("aria-hidden")).toBe("false")
    expect(lines()[2].getAttribute("aria-hidden")).toBe("false")
    expect(recoverable).not.toHaveBeenCalled()
  })

  it.each(["visibilitychange", "pageshow"] as const)(
    "updates station freshness and the observation day on %s after midnight",
    async (event) => {
      vi.setSystemTime(new Date("2026-10-10T21:00:00Z"))
      root = createRoot(container)
      await act(() => root?.render(<StationClock seed={SERVER_TIME} />))
      const lines = () => [...container.querySelectorAll("p")]
      expect(lines()[1].textContent).toBe("14 minutes ago")
      expect(lines()[2].textContent).toBe("")
      expect(container.textContent).toContain("Rain today")

      vi.setSystemTime(new Date("2026-10-11T07:01:00Z"))
      await resumePage(event)
      expect(lines()[0].textContent).toBe("Observed: Oct 10, 2026, 1:46 PM PDT")
      expect(lines()[1].textContent).toBe("10 hours 15 minutes ago")
      expect(lines()[2].textContent).toBe("Older snapshot")
      expect(container.textContent).toContain("Rain on Oct 10, 2026")
    },
  )
})

describe("forecast freshness follows the client clock", () => {
  it("preserves supplied forecast freshness before client-clock readiness", async () => {
    const app = <App seed={SERVER_TIME} mappedAt={CLIENT_TIME} issuedAt="2026-10-10T19:30:00Z" />
    container.innerHTML = renderToString(app)
    expect(forecastProvenance()?.className).toContain("text-amber-600")
    const recoverable = vi.fn()
    await act(() => {
      root = hydrateRoot(container, app, { onRecoverableError: recoverable })
    })
    expect(forecastProvenance()?.className).toContain("text-amber-600")
    await clickNav("Info")
    expect(infoAge()?.textContent).toContain("Issued 4h ago (stale)")
    expect(recoverable).not.toHaveBeenCalled()
  })

  it.each([
    {
      event: "visibilitychange",
      boundary: "three-hour",
      issuedAt: "2026-10-10T20:00:00Z",
      before: "fresh",
      after: "stale",
    },
    {
      event: "pageshow",
      boundary: "three-hour",
      issuedAt: "2026-10-10T20:00:00Z",
      before: "fresh",
      after: "stale",
    },
    {
      event: "visibilitychange",
      boundary: "twelve-hour",
      issuedAt: "2026-10-10T11:00:00Z",
      before: "stale",
      after: "expired",
    },
    {
      event: "pageshow",
      boundary: "twelve-hour",
      issuedAt: "2026-10-10T11:00:00Z",
      before: "stale",
      after: "expired",
    },
  ] as const)(
    "corrects both forecast views on $event immediately beyond the $boundary issue boundary",
    async ({ event, issuedAt, before, after }) => {
      const build = vi.spyOn(nextHours, "buildNextHours")
      // CLIENT_TIME is exactly three or twelve hours after these issues.
      vi.setSystemTime(new Date(CLIENT_TIME.getTime() - 60_000))
      root = createRoot(container)
      await act(() => root?.render(<App seed={SERVER_TIME} issuedAt={issuedAt} />))
      expect(forecastProvenance()?.className.includes("text-amber-600")).toBe(before !== "fresh")
      expect(forecastProvenance()?.textContent?.includes("publisher may be down")).toBe(false)
      await clickNav("Info")
      expect(infoAge()?.textContent).toContain(`(${before})`)
      expect(infoAge()?.className.includes("text-amber-600")).toBe(before !== "fresh")
      await clickNav("Forecast")
      expect(container.querySelector('svg[role="img"]')).not.toBeNull()
      const beforeMinuteCount = build.mock.calls.length

      vi.setSystemTime(CLIENT_TIME)
      await resumePage(event)
      expect(build).toHaveBeenCalledTimes(beforeMinuteCount + 1)
      expect(forecastProvenance()?.className.includes("text-amber-600")).toBe(before !== "fresh")
      expect(forecastProvenance()?.textContent?.includes("publisher may be down")).toBe(false)
      await clickNav("Info")
      expect(infoAge()?.textContent).toContain(`(${before})`)
      expect(infoAge()?.className.includes("text-amber-600")).toBe(before !== "fresh")
      await clickNav("Forecast")
      expect(forecastProvenance()?.className.includes("text-amber-600")).toBe(before !== "fresh")
      expect(forecastProvenance()?.textContent?.includes("publisher may be down")).toBe(false)
      const atBoundaryCount = build.mock.calls.length

      vi.setSystemTime(new Date(CLIENT_TIME.getTime() + 1))
      expect(forecastProvenance()?.className.includes("text-amber-600")).toBe(before !== "fresh")
      await resumePage(event)
      expect(build).toHaveBeenCalledTimes(atBoundaryCount)
      expect(forecastProvenance()?.className).toContain("text-amber-600")
      expect(forecastProvenance()?.textContent?.includes("publisher may be down")).toBe(
        after === "expired",
      )
      await clickNav("Info")
      expect(infoAge()?.textContent).toContain(`(${after})`)
      expect(infoAge()?.className).toContain("text-amber-600")
      expect(infoAge()?.textContent?.includes("publisher may be down")).toBe(after === "expired")
      await clickNav("Forecast")
      expect(forecastProvenance()?.className).toContain("text-amber-600")
      expect(forecastProvenance()?.textContent?.includes("publisher may be down")).toBe(
        after === "expired",
      )
    },
  )

  it("corrects cached freshness in both views and preserves browser time on router prop refresh", async () => {
    const issuedAt = "2026-10-10T19:30:00Z"
    container.innerHTML = renderToString(<App seed={SERVER_TIME} issuedAt={issuedAt} />)
    expect(forecastProvenance()?.className).not.toContain("text-amber-600")
    const recoverable = vi.fn()
    await act(() => {
      root = hydrateRoot(container, <App seed={SERVER_TIME} issuedAt={issuedAt} />, {
        onRecoverableError: recoverable,
      })
    })
    expect(forecastProvenance()?.className).toContain("text-amber-600")
    await clickNav("Info")
    expect(infoAge()?.textContent).toContain("Issued 4h ago (stale)")
    expect(infoAge()?.className).toContain("text-amber-600")
    await act(() => root?.render(<App seed={SERVER_TIME} issuedAt="2026-10-10T22:30:00Z" />))
    expect(infoAge()?.textContent).toContain("Issued 30m ago (fresh)")
    await clickNav("Forecast")
    expect(forecastProvenance()?.className).not.toContain("text-amber-600")
    expect(recoverable).not.toHaveBeenCalled()
  })

  it.each([
    ["2026-10-10T20:00:00Z", "fresh", "stale"],
    ["2026-10-10T11:00:00Z", "stale", "expired"],
  ])(
    "crosses the freshness boundary for an issue at %s on the next clock tick",
    async (issuedAt, before, after) => {
      root = createRoot(container)
      await act(() => root?.render(<App seed={SERVER_TIME} issuedAt={issuedAt} />))
      expect(forecastProvenance()?.className.includes("text-amber-600")).toBe(before !== "fresh")
      expect(forecastProvenance()?.textContent?.includes("publisher may be down")).toBe(false)
      await clickNav("Info")
      expect(infoAge()?.textContent).toContain(`(${before})`)
      // Exactly at either threshold the previous category still applies. The
      // next minute tick is one millisecond beyond the boundary.
      vi.setSystemTime(new Date("2026-10-10T22:59:00.001Z"))
      await act(() => {
        vi.advanceTimersByTime(60_000)
      })
      expect(infoAge()?.textContent).toContain(`(${after})`)
      expect(infoAge()?.className).toContain("text-amber-600")
      expect(infoAge()?.textContent?.includes("publisher may be down")).toBe(after === "expired")
      await clickNav("Forecast")
      expect(forecastProvenance()?.className).toContain("text-amber-600")
      expect(forecastProvenance()?.textContent?.includes("publisher may be down")).toBe(
        after === "expired",
      )
    },
  )

  it("retains degraded status while recalculating freshness", async () => {
    root = createRoot(container)
    await act(() =>
      root?.render(<App seed={SERVER_TIME} issuedAt="2026-10-10T22:30:00Z" degraded />),
    )
    expect(forecastProvenance()?.textContent).toContain("degraded: no live evidence")
    expect(forecastProvenance()?.className).toContain("text-amber-600")
    await clickNav("Info")
    expect(container.textContent).toContain("Status: Degraded")
    expect(infoAge()?.textContent).toContain("Issued 30m ago (fresh)")
    expect(infoAge()?.className).not.toContain("text-amber-600")
  })

  it("leaves unavailable forecast messages intact", async () => {
    root = createRoot(container)
    await act(() =>
      root?.render(
        <WeatherApp
          currentWeatherData={observation}
          lastWeekData={emptyWeek}
          hourlyDataByDate={{}}
          currentDate={SERVER_TIME}
          twilight={[]}
          moon={[]}
          forecast={{ kind: "unavailable", reason: "HTTP 404" }}
        />,
      ),
    )
    expect(container.textContent).toContain("Forecast unavailable.HTTP 404")
    await clickNav("Info")
    expect(container.textContent).toContain("Model status unavailable.HTTP 404")
  })
})

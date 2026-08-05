import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { makeForecastDocument } from "@/lib/__fixtures__/forecast"
import { fetchForecastData } from "@/lib/fetcher"

const NOW = new Date("2026-08-05T16:00:00Z")

function stubFetch(implementation: () => unknown) {
  const fetchMock = vi.fn().mockImplementation(implementation)
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

function stubOk(payload: unknown, status = 200) {
  return stubFetch(() =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(payload),
    }),
  )
}

beforeEach(() => {
  // Every failure path warns; the assertions cover the return value instead.
  vi.spyOn(console, "warn").mockImplementation(vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("fetchForecastData", () => {
  it("returns a mapped forecast for a valid document", async () => {
    stubOk(makeForecastDocument())
    const result = await fetchForecastData(NOW)

    expect(result.kind).toBe("ok")
    if (result.kind !== "ok") return
    expect(result.forecast.days).toHaveLength(1)
    expect(result.forecast.freshness).toBe("fresh")
    expect(result.forecast.status).toBe("ready")
  })

  it("passes an abort signal so a hung publisher cannot stall rendering", async () => {
    const fetchMock = stubOk(makeForecastDocument())
    await fetchForecastData(NOW)
    expect(fetchMock.mock.calls[0][1]).toHaveProperty("signal")
  })

  it("reports a non-OK status rather than trying to parse the body", async () => {
    stubOk("<html>404</html>", 404)
    const result = await fetchForecastData(NOW)
    expect(result).toEqual({ kind: "unavailable", reason: "HTTP 404" })
  })

  it("reports a unit-block mismatch by path", async () => {
    const units = { ...makeForecastDocument().units, temp_f: "C" }
    stubOk(makeForecastDocument({ units }))

    const result = await fetchForecastData(NOW)
    expect(result).toEqual({
      kind: "unavailable",
      reason: "schema mismatch: units.temp_f",
    })
  })

  it("reports a schema mismatch when the version moves", async () => {
    stubOk(makeForecastDocument({ schema_version: 2 }))
    const result = await fetchForecastData(NOW)
    expect(result.kind).toBe("unavailable")
  })

  it("reports a network failure", async () => {
    stubFetch(() => Promise.reject(new Error("ECONNREFUSED")))
    const result = await fetchForecastData(NOW)
    expect(result).toEqual({ kind: "unavailable", reason: "network error" })
  })

  it("reports an unparseable body", async () => {
    stubFetch(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError("Unexpected token <")),
      }),
    )
    const result = await fetchForecastData(NOW)
    expect(result).toEqual({ kind: "unavailable", reason: "network error" })
  })

  it("surfaces staleness instead of failing when the publisher has stopped", async () => {
    stubOk(makeForecastDocument({ issued_at: "2026-08-04T10:00:00+00:00" }))
    const result = await fetchForecastData(NOW)

    expect(result.kind).toBe("ok")
    if (result.kind !== "ok") return
    expect(result.forecast.freshness).toBe("expired")
  })

  it("never rejects, whatever fetch does", async () => {
    for (const implementation of [
      () => Promise.reject(new Error("boom")),
      () => {
        throw new TypeError("sync throw")
      },
      () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(null) }),
      () => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) }),
    ]) {
      stubFetch(implementation)
      await expect(fetchForecastData(NOW)).resolves.toBeDefined()
    }
  })
})

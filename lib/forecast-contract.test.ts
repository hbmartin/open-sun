import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import fixture from "@/lib/__fixtures__/forecast-contract.json"
import { OBSERVATION_MAX_AGE_SECONDS, forecastHealth } from "@/lib/forecast-health"
import { FORECAST_SCHEMA_VERSION, ForecastDocumentSchema } from "@/lib/forecast-schemas"

interface PreparedCase {
  name: string
  accepted: boolean
  payload?: unknown
  error?: string
}

describe("Python publisher / frontend contract", () => {
  it("accepts every prepared shared fixture with the production frontend schema", () => {
    const home = mkdtempSync(path.join(tmpdir(), "forecast-contract-"))
    try {
      const result = spawnSync(
        "python3",
        [
          "-B",
          "-c",
          "import sys,json; sys.path.insert(0,'scripts'); from test_publish_contract import prepared_contract_cases; print(json.dumps(prepared_contract_cases()))",
        ],
        { encoding: "utf8", env: { ...process.env, HOME: home }, timeout: 10000 },
      )
      expect(result.status, result.stderr).toBe(0)
      const prepared: PreparedCase[] = JSON.parse(result.stdout)
      expect(prepared).toHaveLength(fixture.cases.length)
      for (const [index, actual] of prepared.entries()) {
        const expected = fixture.cases[index]
        expect(actual.name).toBe(expected.name)
        expect(actual.accepted, `${actual.name}: ${actual.error}`).toBe(expected.accepted)
        if (actual.accepted) {
          expect(actual.payload).toHaveProperty("schema_version", FORECAST_SCHEMA_VERSION)
          const raw = JSON.stringify(actual.payload)
          expect(raw).not.toMatch(/"(?:latitude|longitude|lat|lon)"\s*:/u)
          if (actual.name === "coordinate-like legitimate temperature") {
            expect(actual.payload).toHaveProperty("hourly.0.values.temp_f", 34.25)
          }
          const parsed = ForecastDocumentSchema.safeParse(actual.payload)
          expect(parsed.success, `${actual.name}: ${parsed.error}`).toBe(true)
          if (parsed.success) {
            const health = forecastHealth(parsed.data)
            const wireProduct = (product: typeof health.outputs.hourly) => ({
              rows: product.rows,
              expected_values: product.expectedValues,
              available_values: product.availableValues,
              missing_by_variable: product.missingByVariable,
            })
            expect(actual.payload).toHaveProperty("health", {
              status: health.status,
              observation: {
                status: health.observation.status,
                age_seconds: health.observation.ageSeconds,
                max_age_seconds: OBSERVATION_MAX_AGE_SECONDS,
              },
              outputs: {
                status: health.outputs.status,
                hourly: wireProduct(health.outputs.hourly),
                daily: wireProduct(health.outputs.daily),
              },
            })
            if (expected.observation_health) {
              expect(actual.payload).toHaveProperty("health.observation", {
                ...expected.observation_health,
                max_age_seconds: OBSERVATION_MAX_AGE_SECONDS,
              })
            }
          }
        }
      }
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})

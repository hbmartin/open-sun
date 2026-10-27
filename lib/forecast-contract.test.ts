import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import fixture from "@/lib/__fixtures__/forecast-contract.json"
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
          expect(raw).not.toContain(String(fixture.source.latitude))
          expect(raw).not.toContain(String(fixture.source.longitude))
          const parsed = ForecastDocumentSchema.safeParse(actual.payload)
          expect(parsed.success, `${actual.name}: ${parsed.error}`).toBe(true)
        }
      }
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})

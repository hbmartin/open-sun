import type { ForecastDocument } from "@/lib/forecast-schemas"
import type { ForecastHourData } from "@/lib/types"
import { FORECAST_DAILY_VARIABLES, FORECAST_HOURLY_VARIABLES } from "@/lib/forecast-schemas"
import { ForecastMetric } from "@/lib/types"
import { describeDuration } from "@/lib/utils"
// oxlint-disable unicorn/no-null -- Match the public JSON contract for unavailable observation ages.

export interface ProductHealth {
  rows: number
  expectedValues: number
  availableValues: number
  missingByVariable: Record<string, number>
}

export interface OutputHealth {
  status: "complete" | "partial" | "missing"
  hourly: ProductHealth
  daily: ProductHealth
}

export interface ForecastHealth {
  status: "ok" | "attention"
  observation: {
    status: "fresh" | "stale" | "missing" | "invalid"
    ageSeconds: number | null
    maxAgeSeconds: number
  }
  outputs: OutputHealth
}

export const OBSERVATION_MAX_AGE_SECONDS = 1800

function productHealth(
  rows: { values: Record<string, number | null | undefined> }[],
  variables: string[],
): ProductHealth {
  const missing: Record<string, number> = {}
  for (const variable of variables) {
    const count = rows.filter((row) => !Number.isFinite(row.values[variable])).length
    if (count) missing[variable] = count
  }
  const expected = rows.length * variables.length
  return {
    rows: rows.length,
    expectedValues: expected,
    availableValues: expected - Object.values(missing).reduce((sum, value) => sum + value, 0),
    missingByVariable: missing,
  }
}

/** Date.parse alone discards fractions below a millisecond; Python supports six digits. */
function timestampMicroseconds(timestamp: string): bigint | null {
  const wholeMilliseconds = Date.parse(timestamp.replace(/\.\d+/u, ""))
  if (!Number.isFinite(wholeMilliseconds)) return null
  const fraction = (timestamp.match(/\.(\d+)/u)?.[1] ?? "").padEnd(6, "0").slice(0, 6)
  return BigInt(wholeMilliseconds) * 1000n + BigInt(fraction)
}

function observationHealth(document: ForecastDocument): ForecastHealth["observation"] {
  const issued = timestampMicroseconds(document.issued_at)
  const observed =
    document.observation_at === null ? null : timestampMicroseconds(document.observation_at)
  const age = issued === null || observed === null ? null : Number(issued - observed) / 1_000_000
  let status: ForecastHealth["observation"]["status"] = "fresh"
  if (document.observation_at === null) status = "missing"
  else if (age === null || age < 0) status = "invalid"
  else if (age >= OBSERVATION_MAX_AGE_SECONDS) status = "stale"
  return {
    status,
    ageSeconds: age,
    maxAgeSeconds: OBSERVATION_MAX_AGE_SECONDS,
  }
}

function outputHealth(hourly: ProductHealth, daily: ProductHealth): OutputHealth {
  let status: OutputHealth["status"] = "complete"
  if (!hourly.availableValues || !daily.availableValues) status = "missing"
  else if (
    hourly.availableValues < hourly.expectedValues ||
    daily.availableValues < daily.expectedValues
  )
    status = "partial"
  return { status, hourly, daily }
}

/** Derive all published fields, including old publishers. Ages are fixed at issue time. */
export function forecastHealth(document: ForecastDocument): ForecastHealth {
  const observation = observationHealth(document)
  const outputs = outputHealth(
    productHealth(document.hourly, FORECAST_HOURLY_VARIABLES),
    productHealth(document.daily, FORECAST_DAILY_VARIABLES),
  )
  return {
    status: observation.status === "fresh" && outputs.status === "complete" ? "ok" : "attention",
    observation,
    outputs,
  }
}

/** Only surviving display slots and the five selectable metrics affect Forecast warnings. */
export function displayedOutputHealth(
  hours: ForecastHourData[],
  daily: ForecastDocument["daily"],
): OutputHealth {
  return outputHealth(
    productHealth(
      hours.map((hour) => ({
        values: {
          temp: hour.temp,
          humidity: hour.humidity,
          wind: hour.wind,
          precip: hour.precip,
          pop: hour.pop,
        },
      })),
      Object.values(ForecastMetric),
    ),
    productHealth(daily, FORECAST_DAILY_VARIABLES),
  )
}

export function observationHealthMessage(health: ForecastHealth): string {
  switch (health.observation.status) {
    case "missing": {
      return "No recent station observation was available when this forecast was issued."
    }
    case "invalid": {
      return "The station observation timestamp is invalid for this forecast."
    }
    case "stale":
    case "fresh": {
      return `The station observation was ${describeDuration(health.observation.ageSeconds ?? 0)} old when this forecast was issued.`
    }
  }
}

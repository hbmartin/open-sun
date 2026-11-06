import type { ForecastDocument } from "@/lib/forecast-schemas"
// oxlint-disable unicorn/no-null -- Match the public JSON contract for unavailable observation ages.

export interface ProductHealth {
  rows: number
  expected_values: number
  available_values: number
  missing_by_variable: Record<string, number>
}

export interface ForecastHealth {
  status: "ok" | "attention"
  observation: {
    status: "fresh" | "stale" | "missing" | "invalid"
    age_seconds: number | null
    max_age_seconds: number
  }
  outputs: {
    status: "complete" | "partial" | "missing"
    hourly: ProductHealth
    daily: ProductHealth
  }
}

const HOURLY_VARIABLES = [
  "temp_f",
  "humidity_pct",
  "dew_point_f",
  "wind_speed_mph",
  "wind_gust_mph",
  "pressure_sea_inhg",
  "precip_in",
  "pop",
]
const DAILY_VARIABLES = ["temp_max_f", "temp_min_f", "pop", "precip_sum_in"]
const OBSERVATION_MAX_AGE_SECONDS = 1800

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
    expected_values: expected,
    available_values: expected - Object.values(missing).reduce((sum, value) => sum + value, 0),
    missing_by_variable: missing,
  }
}

function observationHealth(document: ForecastDocument): ForecastHealth["observation"] {
  const age =
    document.observation_at === null
      ? null
      : (Date.parse(document.issued_at) - Date.parse(document.observation_at)) / 1000
  let status: ForecastHealth["observation"]["status"] = "fresh"
  if (age === null) status = "missing"
  else if (!Number.isFinite(age) || age < 0) status = "invalid"
  else if (age >= OBSERVATION_MAX_AGE_SECONDS) status = "stale"
  return {
    status,
    age_seconds: age !== null && Number.isFinite(age) ? age : null,
    max_age_seconds: OBSERVATION_MAX_AGE_SECONDS,
  }
}

/** Derive from values, including old publishers without health metadata. Ages are at issue time. */
export function forecastHealth(document: ForecastDocument): ForecastHealth {
  const observation = observationHealth(document)
  const hourly = productHealth(document.hourly, HOURLY_VARIABLES)
  const daily = productHealth(document.daily, DAILY_VARIABLES)
  let outputStatus: ForecastHealth["outputs"]["status"] = "complete"
  if (!hourly.available_values || !daily.available_values) outputStatus = "missing"
  else if (
    hourly.available_values < hourly.expected_values ||
    daily.available_values < daily.expected_values
  )
    outputStatus = "partial"
  return {
    status: observation.status === "fresh" && outputStatus === "complete" ? "ok" : "attention",
    observation,
    outputs: { status: outputStatus, hourly, daily },
  }
}

export function observationHealthMessage(health: ForecastHealth): string {
  switch (health.observation.status) {
    case "missing": {
      return "No recent station observation was available when this forecast was issued."
    }
    case "invalid": {
      return "The station observation timestamp is invalid for this forecast."
    }
    case "stale": {
      return `The station observation was ${Math.round((health.observation.age_seconds ?? 0) / 60)} minutes old when this forecast was issued.`
    }
    case "fresh": {
      return "A recent station observation was available when this forecast was issued."
    }
  }
}

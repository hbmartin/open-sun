import type { ForecastDocument } from "@/lib/forecast-schemas"

/**
 * Builders for publish-contract documents, shaped like the real thing.
 *
 * The timestamps sit in a single station-local day (2026-08-05 is PDT, UTC-7)
 * so hour-bucketing assertions read plainly: 15:00Z is 08:00 local.
 */

export const dressedGrid = {
  "0.05": 77.96,
  "0.1": 79.14,
  "0.25": 80.6,
  "0.75": 83.92,
  "0.9": 85.72,
  "0.95": 87.52,
}

export function makeHourlyRow(overrides: Record<string, unknown> = {}) {
  return {
    valid_time: "2026-08-05T15:00:00+00:00",
    lead_hours: 0.4,
    lead_bucket: "0-1h",
    values: {
      temp_f: 82.29,
      humidity_pct: 18.17,
      dew_point_f: 34.53,
      wind_speed_mph: 0.32,
      wind_gust_mph: 3.4,
      pressure_sea_inhg: 29.016,
      precip_in: 0,
      pop: 0,
    },
    methods: { temp_f: "anchored_trend_grounded", pop: "damped_grounded_equal_weight" },
    release_ids: { temp_f: "c22474d379549f29" },
    quantiles: { temp_f: dressedGrid },
    selection_reasons: { temp_f: "lowest backtest MAE among promotable common-case methods" },
    ...overrides,
  }
}

export function makeDailyRow(overrides: Record<string, unknown> = {}) {
  return {
    date_local: "2026-08-05",
    lead_days: 0,
    values: { temp_max_f: 95.54, temp_min_f: 69.99, pop: 0, precip_sum_in: 0 },
    methods: { temp_max_f: "inverse_mse", temp_min_f: "equal_weight" },
    release_ids: { temp_max_f: "c22474d379549f29" },
    quantiles: { temp_max_f: dressedGrid },
    selection_reasons: { temp_max_f: "lowest backtest MAE among promotable common-case methods" },
    ...overrides,
  }
}

export function makeForecastDocument(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    publisher_version: "1.0.0",
    source_schema_version: 5,
    published_at: "2026-08-05T15:45:03+00:00",
    issued_at: "2026-08-05T15:36:00+00:00",
    observation_at: "2026-08-05T15:35:21+00:00",
    issue_interval_seconds: 3600,
    timezone: "America/Los_Angeles",
    latitude: 34.2768,
    longitude: -117.1692,
    dataset_fingerprint: "718e5bfa65100a5b",
    sources: ["nbm", "nws", "open_meteo"],
    release_ids: ["c22474d379549f29"],
    status: "ready",
    // The wire contract is JSON, where an absent reason is explicitly null.
    status_reason: null,
    units: {
      temp_f: "F",
      temp_max_f: "F",
      temp_min_f: "F",
      dew_point_f: "F",
      humidity_pct: "percent",
      wind_speed_mph: "mph",
      wind_gust_mph: "mph",
      pressure_sea_inhg: "inHg",
      precip_in: "in",
      precip_sum_in: "in",
      pop: "fraction",
    },
    truth_semantics: { temp_f: "mean", pop: "inst" },
    hourly: [makeHourlyRow()],
    daily: [makeDailyRow()],
    ...overrides,
  }
}

/** A parsed document, for tests that exercise the mappers rather than the schema. */
export function parsedForecastDocument(overrides: Record<string, unknown> = {}): ForecastDocument {
  return makeForecastDocument(overrides) as unknown as ForecastDocument
}

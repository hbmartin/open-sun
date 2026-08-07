import { z } from "zod"
import { STATION_TIME_ZONE } from "@/lib/utils"

/**
 * The contract with scripts/publish_forecast.py.
 *
 * The publisher converts the forecasting pipeline's metric document to imperial
 * units and declares what it produced in a `units` block. Asserting those
 * literals here is the point of the block: a publisher that starts emitting
 * Celsius under a `temp_f` key fails validation loudly instead of rendering 25
 * as a plausible-looking Fahrenheit reading.
 *
 * Breaking shape changes bump `schema_version`; additive changes and fixes bump
 * `publisher_version` only.
 */
export const FORECAST_SCHEMA_VERSION = 1

const ForecastUnitsSchema = z.object({
  temp_f: z.literal("F"),
  temp_max_f: z.literal("F"),
  temp_min_f: z.literal("F"),
  dew_point_f: z.literal("F"),
  humidity_pct: z.literal("percent"),
  wind_speed_mph: z.literal("mph"),
  wind_gust_mph: z.literal("mph"),
  pressure_sea_inhg: z.literal("inHg"),
  precip_in: z.literal("in"),
  precip_sum_in: z.literal("in"),
  // Never a percent. open-sun scales for display; the wire format stays [0, 1].
  pop: z.literal("fraction"),
})

// Both null and absent are legitimate: the pipeline emits null when a value is
// non-finite, and omits the key entirely when no method could serve the slice.
const optionalNumber = z.number().nullable().optional()

const ForecastHourlyValuesSchema = z.object({
  temp_f: optionalNumber,
  humidity_pct: z.number().min(0).max(100).nullable().optional(),
  dew_point_f: optionalNumber,
  wind_speed_mph: z.number().min(0).nullable().optional(),
  wind_gust_mph: z.number().min(0).nullable().optional(),
  pressure_sea_inhg: optionalNumber,
  precip_in: z.number().min(0).nullable().optional(),
  // The range check is the second guard against a fraction/percent mixup: if
  // the publisher switched scale but forgot the units block, 45 fails here.
  pop: z.number().min(0).max(1).nullable().optional(),
})

const ForecastDailyValuesSchema = z.object({
  temp_max_f: optionalNumber,
  temp_min_f: optionalNumber,
  pop: z.number().min(0).max(1).nullable().optional(),
  precip_sum_in: z.number().min(0).nullable().optional(),
})

// Grids vary in length by serving method, so this stays an open record and the
// consumer interpolates. See lib/quantiles.ts.
const QuantileMapSchema = z.record(z.string(), z.number())
const PerVariableQuantilesSchema = z.record(z.string(), QuantileMapSchema)
const PerVariableStringSchema = z.record(z.string(), z.string())

// offset: true accepts both "Z" and "+00:00" while still rejecting an
// offset-less timestamp, which would silently be read as local time.
const utcTimestamp = z.iso.datetime({ offset: true })

const ForecastHourlyRowSchema = z.object({
  valid_time: utcTimestamp,
  // Fractional: the first row is typically ~0.4h out, not 0.
  lead_hours: z.number().min(0),
  lead_bucket: z.enum(["0-1h", "1-3h", "3-6h", "6-12h", "12-24h", "24-48h"]),
  values: ForecastHourlyValuesSchema,
  methods: PerVariableStringSchema.default({}),
  release_ids: PerVariableStringSchema.default({}),
  quantiles: PerVariableQuantilesSchema.default({}),
})

const ForecastDailyRowSchema = z.object({
  date_local: z.iso.date(),
  lead_days: z.number().int().min(0),
  values: ForecastDailyValuesSchema,
  methods: PerVariableStringSchema.default({}),
  release_ids: PerVariableStringSchema.default({}),
  quantiles: PerVariableQuantilesSchema.default({}),
})

export const ForecastDocumentSchema = z.object({
  schema_version: z.literal(FORECAST_SCHEMA_VERSION),
  publisher_version: z.string().min(1),
  issued_at: utcTimestamp,
  observation_at: utcTimestamp.nullable(),
  issue_interval_seconds: z.number().positive(),
  // Hard-asserted because lib/utils.ts buckets every hourly row into a local
  // day using this exact zone. A publisher-side change would scatter hours
  // across the wrong days with no other visible symptom.
  timezone: z.literal(STATION_TIME_ZONE),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  dataset_fingerprint: z.string().min(1),
  sources: z.array(z.string()).default([]),
  status: z.enum(["ready", "degraded"]),
  status_reason: z.string().nullable(),
  units: ForecastUnitsSchema,
  truth_semantics: PerVariableStringSchema.default({}),
  // No fixed lengths: the publisher may legitimately emit fewer rows during a
  // provider outage, and the UI degrades per row anyway.
  hourly: z.array(ForecastHourlyRowSchema),
  daily: z.array(ForecastDailyRowSchema),
})

export type ForecastDocument = z.infer<typeof ForecastDocumentSchema>
export type ForecastHourlyRow = z.infer<typeof ForecastHourlyRowSchema>
export type ForecastDailyRow = z.infer<typeof ForecastDailyRowSchema>

import type { HourData } from "@/lib/types"

/** Missing accumulation stays unknown; it must never fall back to a rain rate. */
export function formatRainfall(value?: number | null): string {
  return typeof value !== "number" || !Number.isFinite(value) ? "—" : value.toFixed(2)
}

/** Skip absent hours, but keep the total unknown if any present hour is unknown. */
export function sumHourlyRainfall(
  hours: readonly (Pick<HourData, "rain_total_in"> | undefined)[],
): number | undefined {
  let total = 0
  let hasHours = false
  for (const hour of hours) {
    if (hour === undefined) continue
    const rainfall = hour.rain_total_in
    if (typeof rainfall !== "number" || !Number.isFinite(rainfall)) return undefined
    total += rainfall
    hasHours = true
  }
  return hasHours ? total : undefined
}

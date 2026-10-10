/** Missing accumulation stays unknown; it must never fall back to a rain rate. */
export function formatRainfall(value?: number | null): string {
  return typeof value !== "number" || !Number.isFinite(value) ? "—" : value.toFixed(2)
}

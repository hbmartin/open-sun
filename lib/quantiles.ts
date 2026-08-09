/**
 * Reading the forecast's uncertainty grids.
 *
 * The publisher passes quantile maps through verbatim from the forecasting
 * pipeline, where the grid size depends on how the serving method produced its
 * distribution: six levels (0.05, 0.1, 0.25, 0.75, 0.9, 0.95) when a point-only
 * method was dressed with residual quantiles, up to nineteen (0.05..0.95 by
 * 0.05) when the method emits a native distribution. Consumers therefore have
 * to interpolate rather than index fixed keys.
 */

export type QuantileMap = Record<string, number>

export interface QuantileBand {
  low: number
  high: number
  coverage: number
}

/**
 * Coverages of the nested uncertainty bands, widest first. The order is the
 * paint-order contract: consumers draw index 0 first so narrower bands stack
 * on top of wider ones. 90% (p05/p95) is an exact member of both known grids;
 * 60% (p20/p80) and 30% (p35/p65) are exact on the 19-level native grid and
 * interpolate on the six-level dressed grid, which is accepted.
 */
export const FORECAST_BAND_COVERAGES = [0.9, 0.6, 0.3] as const

/** The coverage whose bounds read as the "likely" range in labels and prose. */
export const FORECAST_LIKELY_COVERAGE = 0.6

interface Level {
  probability: number
  value: number
}

/**
 * Tolerance for treating a requested probability as an exact grid level.
 *
 * Needed because the tail arithmetic is not exact in binary floating point:
 * (1 - 0.8) / 2 is 0.09999999999999998, not 0.1, which would otherwise
 * interpolate a p10 that the grid holds exactly. Far larger than float noise
 * (~1e-16) and far smaller than the tightest grid spacing (0.05).
 */
const LEVEL_EPSILON = 1e-9

function sortedLevels(quantiles: QuantileMap | undefined): Level[] {
  if (!quantiles) {
    return []
  }
  const levels: Level[] = []
  for (const [key, value] of Object.entries(quantiles)) {
    const probability = Number(key)
    if (Number.isFinite(probability) && Number.isFinite(value)) {
      levels.push({ probability, value })
    }
  }
  // Object key order is insertion order for non-index keys like "0.05", so the
  // publisher's ordering is not something we can rely on.
  return levels.toSorted((a, b) => a.probability - b.probability)
}

/**
 * The value at a probability, interpolating between the bracketing levels.
 *
 * Outside the grid the nearest endpoint is returned rather than extrapolated:
 * projecting a distribution tail from two interior points produces confidently
 * wrong numbers, and reporting the widest level we actually have is honest.
 */
export function quantileAt(
  quantiles: QuantileMap | undefined,
  probability: number,
): number | undefined {
  const levels = sortedLevels(quantiles)
  if (levels.length === 0) {
    return undefined
  }

  const exact = levels.find((level) => Math.abs(level.probability - probability) < LEVEL_EPSILON)
  if (exact) {
    return exact.value
  }

  const first = levels[0]
  // .at(-1) widens to `| undefined` despite the emptiness guard above, and a
  // `??` fallback would add a branch that can never be taken.
  // oxlint-disable-next-line unicorn/prefer-at
  const last = levels[levels.length - 1]
  if (probability <= first.probability) {
    return first.value
  }
  if (probability >= last.probability) {
    return last.value
  }

  for (let index = 1; index < levels.length; index++) {
    const upper = levels[index]
    if (upper.probability < probability) {
      continue
    }
    const lower = levels[index - 1]
    const span = upper.probability - lower.probability
    if (span === 0) {
      // Duplicate probabilities ("0.1" and "0.10") would divide by zero.
      return lower.value
    }
    const fraction = (probability - lower.probability) / span
    return lower.value + fraction * (upper.value - lower.value)
  }

  return last.value
}

/**
 * A central interval covering `coverage` of the predicted distribution.
 *
 * Returns undefined when the variable carries no usable grid, so callers can
 * fall back to the point value rather than rendering a fake band.
 */
export function quantileBand(
  quantiles: QuantileMap | undefined,
  coverage: number,
): QuantileBand | undefined {
  const tail = (1 - coverage) / 2
  const low = quantileAt(quantiles, tail)
  const high = quantileAt(quantiles, 1 - tail)
  if (low === undefined || high === undefined) {
    return undefined
  }
  // Quantile crossing is real in dressed ensembles; order the band rather than
  // rendering it inside out.
  return low <= high ? { low, high, coverage } : { low: high, high: low, coverage }
}

/**
 * The nested forecast bands, widest first per FORECAST_BAND_COVERAGES.
 *
 * Returns an empty array when the variable carries no usable grid. Because
 * quantileAt clamps rather than failing, a usable grid always yields all
 * three bands — consumers see all-or-nothing.
 */
export function quantileBands(quantiles: QuantileMap | undefined): QuantileBand[] {
  const bands: QuantileBand[] = []
  for (const coverage of FORECAST_BAND_COVERAGES) {
    const band = quantileBand(quantiles, coverage)
    if (band) {
      bands.push(band)
    }
  }
  return bands
}

/** The band whose bounds stand in for the displayed "likely" range. */
export function likelyBand(bands: QuantileBand[]): QuantileBand | undefined {
  // Exact equality is safe: both sides originate from the same constant.
  return bands.find((band) => band.coverage === FORECAST_LIKELY_COVERAGE)
}

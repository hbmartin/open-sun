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
 * 80% coverage resolves to p10/p90, which are exact members of BOTH known
 * grids, so the rendered band never depends on interpolation. p50/p25/p75 would
 * each interpolate on one grid or the other.
 */
export const FORECAST_BAND_COVERAGE = 0.8

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

  const exact = levels.find(
    (level) => Math.abs(level.probability - probability) < LEVEL_EPSILON,
  )
  if (exact) {
    return exact.value
  }

  const first = levels[0]
  // .at(-1) widens to `| undefined` despite the emptiness guard above, and a
  // `??` fallback would add a branch that can never be taken.
  // eslint-disable-next-line unicorn/prefer-at
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
  coverage: number = FORECAST_BAND_COVERAGE,
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

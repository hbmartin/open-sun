import type { DayPartRun, NextHoursModel, NextHoursPoint } from "@/lib/next-hours"
import type { ForecastMetric } from "@/lib/types"
import type React from "react"
import { Droplets } from "lucide-react"
import { useId, useState } from "react"
import WeatherIcon from "@/components/WeatherIcon"
import { WINDOW_HOURS } from "@/lib/next-hours"
import { likelyBand } from "@/lib/quantiles"
import { forecast_metric_display_units, forecast_metric_precision } from "@/lib/types"
import { formatHour, formatMetricValue } from "@/lib/utils"

/**
 * SVG user units per hour. A WINDOW_HOURS-wide slice is the old 360-unit box,
 * and the track's CSS width scales by the same factor as the viewBox, so one
 * screenful stays exactly WINDOW_HOURS however far the horizon runs.
 */
const HOUR_WIDTH = 15
const HEIGHT = 130
const TOP = 22
const BOTTOM = 16
const PLOT_BOTTOM = HEIGHT - BOTTOM
/** Value labels and icons every LABEL_STEP hours keeps eight labels per screen. */
const LABEL_STEP = 3
/** Day-part runs shorter than this have no room for their header text. */
const MIN_LABELED_RUN = 3

const metric_chart_names: Record<ForecastMetric, string> = {
  temp: "temperature",
  pop: "rain chance",
  precip: "rainfall",
  humidity: "humidity",
  wind: "wind speed",
}

const band_coverage_fills: Record<number, string> = {
  0.9: "band-fill-90",
  0.6: "band-fill-60",
  0.3: "band-fill-30",
}

function xOf(offset: number): number {
  return (offset + 0.5) * HOUR_WIDTH
}

function edgeOf(offset: number): number {
  return offset * HOUR_WIDTH
}

/**
 * How a run is voiced. The header trades "Overnight" for the weekday to keep
 * four days of repeated labels apart, but a screen reader wants both.
 */
function runName(run: DayPartRun): string {
  return run.heading === run.label ? run.label : `${run.heading} ${run.label.toLowerCase()}`
}

/** Contiguous stretches of points that satisfy the predicate; gaps split runs. */
function contiguousRuns(
  points: NextHoursPoint[],
  include: (point: NextHoursPoint) => boolean,
): NextHoursPoint[][] {
  const runs: NextHoursPoint[][] = []
  for (const point of points) {
    if (!include(point)) {
      continue
    }
    const current = runs.at(-1)
    if (current && current.at(-1)?.offset === point.offset - 1) {
      current.push(point)
    } else {
      runs.push([point])
    }
  }
  return runs
}

function DayPartHeader({
  dayParts,
  horizonHours,
}: {
  dayParts: DayPartRun[]
  horizonHours: number
}): React.JSX.Element {
  return (
    <div className="flex">
      {dayParts.map((run, index) => (
        <div
          key={`${run.label}-${run.startOffset}`}
          className={`pb-1 ${index === 0 ? "" : "border-l border-gray-200 dark:border-gray-800 pl-2"}`}
          style={{ width: `${((run.endOffset - run.startOffset) / horizonHours) * 100}%` }}
        >
          {run.endOffset - run.startOffset >= MIN_LABELED_RUN && (
            <>
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400">
                {run.heading}
              </div>
              <div className="flex items-center space-x-1">
                <Droplets size={12} className="text-blue-400" />
                <span className="text-xs text-blue-500 dark:text-blue-400 font-medium">
                  {run.maxPop === undefined ? "—" : `${Math.round(run.maxPop)}%`}
                </span>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  )
}

function IconRow({
  points,
  horizonHours,
}: {
  points: NextHoursPoint[]
  horizonHours: number
}): React.JSX.Element {
  const sampled = points.filter((point) => point.offset % LABEL_STEP === 0)
  let previousCondition: string | undefined
  return (
    <div className="relative h-5">
      {sampled.map((point) => {
        if (point.condition === previousCondition) {
          return
        }
        previousCondition = point.condition
        return (
          <div
            key={point.offset}
            className="absolute -translate-x-1/2"
            style={{ left: `${((point.offset + 0.5) / horizonHours) * 100}%` }}
          >
            <WeatherIcon condition={point.condition} size={16} />
          </div>
        )
      })}
    </div>
  )
}

export default function NextHoursChart({
  model,
  metric,
}: {
  model: NextHoursModel
  metric: ForecastMetric
}): React.JSX.Element {
  const unit = forecast_metric_display_units[metric]
  const precision = forecast_metric_precision[metric]
  const { domainMin, domainMax, horizonHours } = model
  const descriptionId = useId()
  // The edge fade says "there is more to the right", so it has to go once
  // there isn't. Only the boolean is state, so a drag re-renders at most twice.
  const [atEnd, setAtEnd] = useState(false)

  const yOf = (value: number): number =>
    TOP + (1 - (value - domainMin) / (domainMax - domainMin)) * (PLOT_BOTTOM - TOP)

  const chartWidth = horizonHours * HOUR_WIDTH
  const lineRuns = contiguousRuns(model.points, (point) => point.value !== undefined)
  // Bands are all-or-nothing per point, so one run geometry serves all three
  // coverage layers.
  const bandRuns = contiguousRuns(model.points, (point) => point.bands.length > 0).filter(
    (run) => run.length > 1,
  )
  const labeled = model.points.filter(
    (point) => point.offset % LABEL_STEP === 0 && point.value !== undefined,
  )
  const nowX = edgeOf(model.nowOffset)
  const hourTicks = Array.from(
    { length: Math.ceil(horizonHours / LABEL_STEP) },
    (_, index) => index * LABEL_STEP,
  )
  // Ticks read their hour off the point rather than counting up from startHour,
  // so a DST transition inside the horizon cannot slide the labels by an hour.
  const hoursByOffset = new Map(model.points.map((point) => [point.offset, point.hour]))
  const scrollable = horizonHours > WINDOW_HOURS

  return (
    <div className="mx-4 mb-4">
      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">Hourly Forecast</h2>
      {model.summary !== undefined && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{model.summary}</p>
      )}

      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm px-3 pt-3 pb-1">
        <div className="relative">
          {/* The track is WINDOW_HOURS wide per screenful whatever the horizon,
              because its CSS width and the viewBox scale by the same factor.
              overflow-y-hidden is a guard: overflow-x alone would let the other
              axis compute to auto, and a stray scrollbar would narrow the box. */}
          <div
            className="overflow-x-auto overflow-y-hidden overscroll-x-contain"
            tabIndex={0}
            role="group"
            aria-label="Hourly forecast, scroll horizontally for later hours"
            onScroll={(event) => {
              const { scrollLeft, clientWidth, scrollWidth } = event.currentTarget
              setAtEnd(scrollLeft + clientWidth >= scrollWidth - 1)
            }}
          >
            <div style={{ width: `${(horizonHours / WINDOW_HOURS) * 100}%` }}>
              <DayPartHeader dayParts={model.dayParts} horizonHours={horizonHours} />
              <IconRow points={model.points} horizonHours={horizonHours} />

              <div className="text-gray-700 dark:text-gray-300">
                {/* role="img" is the accessible-SVG idiom; the a11y rule that wants
                    an <img> tag instead is switched off for this file. */}
                <svg
                  viewBox={`0 0 ${chartWidth} ${HEIGHT}`}
                  className="w-full h-auto"
                  role="img"
                  aria-label={`Hourly ${metric_chart_names[metric]} forecast for the next ${horizonHours} hours`}
                  aria-describedby={descriptionId}
                >
                  {model.dayParts.slice(1).map((run) => (
                    <line
                      key={run.startOffset}
                      x1={edgeOf(run.startOffset)}
                      x2={edgeOf(run.startOffset)}
                      y1={0}
                      y2={PLOT_BOTTOM}
                      strokeWidth={1}
                      className="stroke-gray-200 dark:stroke-gray-800"
                    />
                  ))}

                  {/* One solid layer per coverage, widest first; the nested narrower
                      bands paint over the wider ones, so the distribution reads
                      darker toward its center in full ramp steps. */}
                  {bandRuns.map((run) =>
                    run[0].bands.map((band, bandIndex) => (
                      <path
                        key={`${run[0].offset}-${band.coverage}`}
                        d={[
                          ...run.map(
                            (point, index) =>
                              `${index === 0 ? "M" : "L"}${xOf(point.offset)} ${yOf(point.bands[bandIndex].high)}`,
                          ),
                          ...run
                            .toReversed()
                            .map(
                              (point) => `L${xOf(point.offset)} ${yOf(point.bands[bandIndex].low)}`,
                            ),
                          "Z",
                        ].join(" ")}
                        className={band_coverage_fills[band.coverage] ?? "band-fill-60"}
                      />
                    )),
                  )}

                  {lineRuns.map((run) =>
                    run.length === 1 ? undefined : (
                      <polyline
                        key={run[0].offset}
                        points={run
                          .map((point) => `${xOf(point.offset)},${yOf(point.value as number)}`)
                          .join(" ")}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    ),
                  )}

                  {/* No caption: the dashed rule is the only vertical line on the
                      chart, so it reads as "now" unaided. y1 was 12 purely to
                      clear the label that used to sit above it. */}
                  <line
                    x1={nowX}
                    x2={nowX}
                    y1={4}
                    y2={PLOT_BOTTOM}
                    strokeWidth={1}
                    strokeDasharray="2 3"
                    className="stroke-gray-400 dark:stroke-gray-500"
                  />

                  {labeled.map((point) => {
                    const value = point.value as number
                    return (
                      <g key={point.offset}>
                        <circle
                          cx={xOf(point.offset)}
                          cy={yOf(value)}
                          r={4}
                          fill="currentColor"
                          strokeWidth={2}
                          className="stroke-white dark:stroke-gray-900"
                        />
                        {/* paint-order puts the halo under the glyphs, so the
                            value stays legible over the darkest band. */}
                        <text
                          x={Math.min(chartWidth - 12, Math.max(12, xOf(point.offset)))}
                          y={yOf(value) - 9}
                          textAnchor="middle"
                          fontSize={12}
                          paintOrder="stroke"
                          strokeWidth={3}
                          strokeLinejoin="round"
                          className="fill-gray-900 dark:fill-gray-100 stroke-white dark:stroke-gray-900 font-medium"
                        >
                          {formatMetricValue(value, precision)}
                          {unit}
                        </text>
                      </g>
                    )
                  })}

                  {hourTicks.map((offset) => (
                    <text
                      key={offset}
                      x={Math.min(chartWidth - 14, Math.max(14, xOf(offset)))}
                      y={HEIGHT - 4}
                      textAnchor="middle"
                      fontSize={9}
                      className="fill-gray-400 dark:fill-gray-500"
                    >
                      {formatHour(
                        hoursByOffset.get(offset) ?? String((model.startHour + offset) % 24),
                      )}
                    </text>
                  ))}
                </svg>
              </div>
            </div>
          </div>

          {scrollable && !atEnd && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-linear-to-l from-white dark:from-gray-900 to-transparent"
            />
          )}
        </div>

        {/* The chart's shape, readable: aria-describedby points screen readers
            here, since the SVG marks themselves carry no accessible values.
            Kept outside the scroller, whose sr-only negative margins would
            otherwise add a pixel of scrollable overflow. */}
        <ul id={descriptionId} className="sr-only">
          {model.dayParts.map((run) => (
            <li key={`part-${run.startOffset}`}>
              {runName(run)}:{" "}
              {run.maxPop === undefined
                ? "rain chance unknown"
                : `${Math.round(run.maxPop)}% chance of rain`}
            </li>
          ))}
        </ul>

        {/* Not the describedby target: a description is flattened into one
            string, and a horizon of hours is unlistenable that way. Here the
            same data is browsable item by item. */}
        <h3 className="sr-only">Hourly {metric_chart_names[metric]} detail</h3>
        <ul className="sr-only">
          {model.points.map((point) => {
            if (point.value === undefined) {
              return
            }
            // Only the 60% band is voiced: "likely" is honest at that
            // coverage, and three intervals per hour would be noise.
            const likely = likelyBand(point.bands)
            const band =
              likely === undefined
                ? ""
                : `, likely between ${formatMetricValue(likely.low, precision)}${unit} and ${formatMetricValue(likely.high, precision)}${unit}`
            return (
              <li key={`point-${point.offset}`}>
                {formatHour(point.hour)}: {formatMetricValue(point.value, precision)}
                {unit}
                {band}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

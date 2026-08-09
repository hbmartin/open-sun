import type { MoonEvent } from "@/lib/moon"
import type { ForecastFetchResult, InstantObservation, WeeklyData } from "@/lib/types"
import type React from "react"
import { Droplets, TrendingUp } from "lucide-react"
import MoonDisc from "@/components/MoonDisc"
import { averageDailyHighF, dewPointF } from "@/lib/almanac"
import { selectNextMoonEvents, summariseMoon } from "@/lib/moon"
import { formatStationTime } from "@/lib/utils"

/**
 * The three cards that close out the forecast: moon, temperature against the
 * recent past, and how humid it is right now.
 *
 * None of them depends on the selected metric, which is why they sit outside
 * the tabpanel rather than at the foot of ForecastWeather. Nor do they depend
 * on the forecast document -- two of the three still render when the publisher
 * is down, and the third falls back to the station's own record.
 */

/** What a card shows in place of a number it does not have. */
const NO_VALUE = "—"

function Card({
  title,
  icon,
  children,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="bg-white dark:bg-gray-900 rounded-lg shadow-sm p-4 mb-3">
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  )
}

function Row({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between border-t border-gray-100 dark:border-gray-800 py-2 first:border-t-0 first:pt-0 last:pb-0">
      <span className="text-sm text-gray-900 dark:text-gray-100">{label}</span>
      <span className="text-sm font-medium tabular-nums text-gray-500 dark:text-gray-400">
        {value}
      </span>
    </div>
  )
}

function MoonCard({ moon, now }: { moon: readonly MoonEvent[]; now: Date }): React.JSX.Element {
  const { fraction, phase, name, daysToFull } = summariseMoon(now)
  const nextSet = selectNextMoonEvents(moon, now).find((event) => event.kind === "moonset")

  return (
    <Card title={name} icon={<MoonDisc fraction={fraction} phase={phase} size={16} />}>
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <Row label="Illumination" value={`${Math.round(fraction * 100)}%`} />
          {/* Skipped outright above the Arctic circle, where the moon can go days
              without setting and there is no time to name. */}
          {nextSet !== undefined && <Row label="Moonset" value={formatStationTime(nextSet.at)} />}
          <Row label="Next Full Moon" value={daysToFull === 0 ? "Tonight" : `${daysToFull} days`} />
        </div>
        <MoonDisc fraction={fraction} phase={phase} size={88} />
      </div>
    </Card>
  )
}

function AveragesCard({
  lastWeekData,
  forecast,
}: {
  lastWeekData: WeeklyData
  forecast: ForecastFetchResult
}): React.JSX.Element {
  // The forecast's own number for today, so this card and the ten-day list
  // directly above it cannot print two different highs for the same day. The
  // station's running maximum is the fallback, and understates the day until
  // the afternoon -- which is why it is not the first choice.
  const forecastHigh = forecast.kind === "ok" ? forecast.forecast.days[0]?.max_temp : undefined
  const todayHigh = forecastHigh ?? lastWeekData.data[0]?.max_outTemp
  const average = averageDailyHighF(lastWeekData.data)

  if (todayHigh === undefined || average === undefined) {
    return (
      <Card title="Averages" icon={<TrendingUp size={14} aria-hidden="true" />}>
        <p className="text-sm text-gray-500 dark:text-gray-400">Not enough history yet.</p>
      </Card>
    )
  }

  const delta = Math.round(todayHigh - average)
  let comparison = "at the 7-day average"
  if (delta > 0) {
    comparison = "above the 7-day average high"
  } else if (delta < 0) {
    comparison = "below the 7-day average high"
  }

  return (
    <Card title="Averages" icon={<TrendingUp size={14} aria-hidden="true" />}>
      {/* `${-0}` is "0", so a delta rounding down to negative zero cannot print
          as "-0°" here. */}
      <p className="text-3xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">
        {delta > 0 ? "+" : ""}
        {delta}°
      </p>
      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">{comparison}</p>
      <Row label="Today" value={`H:${Math.round(todayHigh)}°`} />
      {/* Named for what it is: daily.json carries eight days, so this is a
          trailing mean of the week just gone, not a climate normal. */}
      <Row label="7-day avg" value={`H:${Math.round(average)}°`} />
    </Card>
  )
}

function HumidityCard({
  currentWeatherData,
}: {
  currentWeatherData: InstantObservation
}): React.JSX.Element {
  // The live station reading rather than the forecast's hour: this card says
  // "right now", and the station is the only source that can honour that.
  const { outTemp, outHumi } = currentWeatherData
  const dewPoint = dewPointF(outTemp, outHumi)

  return (
    <Card title="Humidity" icon={<Droplets size={14} aria-hidden="true" />}>
      <p className="text-3xl font-semibold tabular-nums text-gray-900 dark:text-gray-100 mb-2">
        {Math.round(outHumi)}%
      </p>
      <p className="text-sm text-gray-700 dark:text-gray-300">
        {Number.isFinite(dewPoint)
          ? `The dew point is ${Math.round(dewPoint)}° right now.`
          : `The dew point is ${NO_VALUE} right now.`}
      </p>
    </Card>
  )
}

export default function Almanac({
  moon,
  now,
  currentWeatherData,
  lastWeekData,
  forecast,
}: {
  moon: readonly MoonEvent[]
  now: Date
  currentWeatherData: InstantObservation
  lastWeekData: WeeklyData
  forecast: ForecastFetchResult
}): React.JSX.Element {
  return (
    <div className="px-4 mt-4">
      <h2 className="sr-only">Almanac</h2>
      <MoonCard moon={moon} now={now} />
      {/* Two up, as in the reference: neither card carries enough to earn a full
          row, and side by side they read as one block closing the page. */}
      <div className="grid grid-cols-2 gap-3 items-start">
        <AveragesCard lastWeekData={lastWeekData} forecast={forecast} />
        <HumidityCard currentWeatherData={currentWeatherData} />
      </div>
    </div>
  )
}

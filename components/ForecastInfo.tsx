import type { ForecastFetchResult, ForecastInfoData } from "@/lib/types"
import type React from "react"
import { ChevronRight, CirclePlay } from "lucide-react"
import { describeAge } from "@/lib/utils"

/**
 * Model-state summary for the Info view, written for a junior technician:
 * each card answers one question — is it healthy, is it evidence-backed, how
 * are values chosen, and what fed it — with a plain-language footnote.
 */

const METHOD_LIMIT = 6
const MILLISECONDS_PER_MINUTE = 60_000

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white dark:bg-gray-900 rounded-lg shadow-sm p-4 mb-3">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">{title}</h3>
      {children}
    </section>
  )
}

function Line({ amber = false, children }: { amber?: boolean; children: React.ReactNode }) {
  return (
    <p
      className={`text-sm mb-1 ${
        amber ? "text-amber-600 dark:text-amber-400" : "text-gray-700 dark:text-gray-300"
      }`}
    >
      {children}
    </p>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{children}</p>
}

const WALKTHROUGH_URL = "https://www.youtube.com/watch?v=sqhd5yF8Tfg"

/**
 * The way in to the rest of this view.
 *
 * Blue rather than the neutral card white, because the four cards below report
 * state while this one is an action; amber is already spoken for by the warning
 * Lines, so it cannot be reused for emphasis here.
 */
function VideoCallout() {
  return (
    <a
      href={WALKTHROUGH_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-900 rounded-lg shadow-sm p-4 mb-3 text-blue-800 dark:text-blue-200"
    >
      <CirclePlay size={20} className="shrink-0" aria-hidden="true" />
      <span className="text-sm font-semibold flex-1">See how it works</span>
      <ChevronRight size={16} className="shrink-0 opacity-60" aria-hidden="true" />
    </a>
  )
}

function percent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`
}

function HealthCard({ info }: { info: ForecastInfoData }) {
  const isDegraded = info.status === "degraded"
  const isFresh = info.freshness === "fresh"

  let ageLine = `Issued ${describeAge(info.ageHours)} (${info.freshness})`
  if (info.observationAt !== undefined) {
    const minutes = Math.max(
      0,
      Math.round(
        (Date.parse(info.issuedAt) - Date.parse(info.observationAt)) / MILLISECONDS_PER_MINUTE,
      ),
    )
    ageLine += ` · station observation ${minutes}m before issue`
  }
  if (info.freshness === "expired") {
    ageLine += " — publisher may be down"
  }

  return (
    <Card title="Health">
      <Line amber={isDegraded}>
        {isDegraded
          ? `Status: Degraded — ${info.statusReason ?? "no backtest evidence"}. Values come from fallback averages until the next promotion cycle.`
          : "Status: Ready — serving from promoted, backtested methods."}
      </Line>
      <Line amber={!isFresh}>{ageLine}</Line>
      <Note>
        Healthy means Ready and issued within the last 3 hours. A new document is published every
        hour.
      </Note>
    </Card>
  )
}

function EvidenceCard({ info }: { info: ForecastInfoData }) {
  const { hourly, daily } = info.evidenceCoverage
  const fullCoverage = hourly >= 1 && daily >= 1

  return (
    <Card title="Evidence">
      <Line amber={info.releaseIds.length === 0}>
        {info.releaseIds.length === 0
          ? "No promoted release"
          : `Release: ${info.releaseIds.join(", ")}`}
      </Line>
      <Line amber={!fullCoverage}>
        Backtest evidence backs {percent(hourly)} of hourly values and {percent(daily)} of daily
        values.
      </Line>
      <Note>
        Values without a release id came from fallbacks; their day labels show grayed in the
        forecast.
      </Note>
    </Card>
  )
}

function SelectionCard({ info }: { info: ForecastInfoData }) {
  const shown = info.methodCounts.slice(0, METHOD_LIMIT)
  const hidden = info.methodCounts.length - shown.length

  return (
    <Card title="How values are chosen">
      {info.reasonCounts.length === 0 ? (
        <Line>This document predates selection-reason reporting.</Line>
      ) : (
        info.reasonCounts.map((reason) => (
          <Line key={reason.name}>
            {reason.count} values: {reason.name}
          </Line>
        ))
      )}
      <Line>
        {shown.map((method) => `${method.name} ×${method.count}`).join(" · ")}
        {hidden > 0 ? ` · +${hidden} more` : ""}
      </Line>
      <Note>
        One method is chosen per variable and lead time from backtest scores; a mixed roster is
        normal.
      </Note>
    </Card>
  )
}

function ProvenanceCard({ info }: { info: ForecastInfoData }) {
  return (
    <Card title="Inputs & provenance">
      <Line>
        {info.sources.length} providers: {info.sources.join(", ")}
      </Line>
      <Line>
        {info.hourlyRows} hourly rows · {info.dailyRows} daily rows · times in {info.timezone}
      </Line>
      <Line>
        Data fingerprint {info.datasetFingerprint} · publisher {info.publisherVersion} · contract v
        {info.schemaVersion}
      </Line>
      <Note>
        Quote the fingerprint and release id when reporting a problem — together they identify the
        exact data and model.
      </Note>
    </Card>
  )
}

export default function ForecastInfo({
  forecast,
}: {
  forecast: ForecastFetchResult
}): React.JSX.Element {
  if (forecast.kind === "unavailable") {
    return (
      <div className="px-4">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Forecast Model</h2>
        {/* The walkthrough is about the model in general, so it outlives any one
            document -- a publisher outage is the moment it is most wanted. */}
        <VideoCallout />
        <div className="text-center text-gray-500 dark:text-gray-400 py-8">
          Model status unavailable.
          <div className="text-sm mt-1">{forecast.reason}</div>
        </div>
      </div>
    )
  }

  const info = forecast.forecast.info
  return (
    <div className="px-4">
      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Forecast Model</h2>
      <VideoCallout />
      <HealthCard info={info} />
      <EvidenceCard info={info} />
      <SelectionCard info={info} />
      <ProvenanceCard info={info} />
    </div>
  )
}

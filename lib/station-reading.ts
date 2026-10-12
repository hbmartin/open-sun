import { formatStationDate, formatStationDateTime, getStationDate } from "@/lib/utils"

const MINUTE_MS = 60_000
const OLDER_SNAPSHOT_MS = 2 * 60 * MINUTE_MS
const CLOCK_SKEW_TOLERANCE_MS = 5 * MINUTE_MS

interface StationReadingDescription {
  rainLabel: string
  timeLabel: string
  ageLabel?: string
  older: boolean
}

function describeStationAge(elapsed: number): string {
  const minutes = Math.floor(elapsed / MINUTE_MS)
  if (minutes === 0) return "just now"
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  const hourText = `${hours} ${hours === 1 ? "hour" : "hours"}`
  const minuteText =
    remainder === 0 ? "" : ` ${remainder} ${remainder === 1 ? "minute" : "minutes"}`
  return `${hourText}${minuteText} ago`
}

/** Add relative freshness only once the screen's shared clock is corrected. */
export function describeStationReading(
  observedAt: string | undefined,
  now?: Date,
): StationReadingDescription {
  const timestamp = observedAt ? Date.parse(observedAt) : Number.NaN
  if (!Number.isFinite(timestamp)) {
    return { rainLabel: "Rain total", timeLabel: "Reading time unavailable", older: false }
  }
  const observed = new Date(timestamp)
  const datedRainLabel = `Rain on ${formatStationDate(observed)}`
  const observedTimeLabel = `Observed: ${formatStationDateTime(observed)}`
  if (now === undefined) {
    return { rainLabel: datedRainLabel, timeLabel: observedTimeLabel, older: false }
  }
  const rainLabel = getStationDate(observed) === getStationDate(now) ? "Rain today" : datedRainLabel
  const elapsed = now.getTime() - timestamp
  const age =
    elapsed < -CLOCK_SKEW_TOLERANCE_MS
      ? "Reading time is ahead of current time"
      : describeStationAge(Math.max(0, elapsed))
  return {
    rainLabel,
    timeLabel: observedTimeLabel,
    ageLabel: age,
    older: elapsed > OLDER_SNAPSHOT_MS,
  }
}

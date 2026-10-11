import { formatStationDateTime, getStationDate } from "@/lib/utils"

const MINUTE_MS = 60_000
const OLDER_SNAPSHOT_MS = 2 * 60 * MINUTE_MS

function describeAge(elapsed: number): string {
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

/** Interpret the stored observation against the screen's shared clock. */
export function describeStationReading(observedAt: string | undefined, now: Date) {
  const timestamp = observedAt ? Date.parse(observedAt) : Number.NaN
  if (!Number.isFinite(timestamp)) {
    return { rainLabel: "Rain total", timeLabel: "Reading time unavailable", older: false }
  }
  const observed = new Date(timestamp)
  const observedDay = getStationDate(observed)
  const rainLabel = observedDay === getStationDate(now) ? "Rain today" : `Rain on ${observedDay}`
  const elapsed = now.getTime() - timestamp
  const age = elapsed < 0 ? "Reading time is ahead of current time" : describeAge(elapsed)
  return {
    rainLabel,
    timeLabel: `Observed: ${formatStationDateTime(observed)} · ${age}`,
    older: elapsed > OLDER_SNAPSHOT_MS,
  }
}

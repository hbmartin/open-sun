import { describe, expect, it } from "vitest"
import { describeStationReading } from "@/lib/station-reading"

const observedAt = "2026-10-10T21:46:00Z"

describe("station snapshot description", () => {
  it.each([
    ["2026-10-10T21:46:00Z", "just now"],
    ["2026-10-10T21:47:00Z", "1 minute ago"],
    ["2026-10-10T22:00:00Z", "14 minutes ago"],
    ["2026-10-10T22:46:00Z", "1 hour ago"],
    ["2026-10-10T22:47:00Z", "1 hour 1 minute ago"],
    ["2026-10-10T23:48:00Z", "2 hours 2 minutes ago"],
  ])("describes age at %s without changing the observation", (now, age) => {
    const reading = describeStationReading(observedAt, new Date(now))
    expect(reading.rainLabel).toBe("Rain today")
    expect(reading.timeLabel).toBe("Observed: Oct 10, 2026, 2:46 PM PDT")
    expect(reading.ageLabel).toBe(age)
  })

  it("marks snapshots only after two hours", () => {
    expect(describeStationReading(observedAt, new Date("2026-10-10T23:46:00Z")).older).toBe(false)
    expect(describeStationReading(observedAt, new Date("2026-10-10T23:46:00.001Z")).older).toBe(
      true,
    )
  })

  it("switches the accumulation label at station-local midnight", () => {
    const observation = "2026-10-11T06:59:00Z"
    expect(describeStationReading(observation, new Date("2026-10-11T06:59:59Z")).rainLabel).toBe(
      "Rain today",
    )
    expect(describeStationReading(observation, new Date("2026-10-11T07:00:00Z")).rainLabel).toBe(
      "Rain on Oct 10, 2026",
    )
  })

  it.each([undefined, "", "invalid"])("handles unavailable time %s", (timestamp) => {
    expect(describeStationReading(timestamp, new Date(observedAt))).toEqual({
      rainLabel: "Rain total",
      timeLabel: "Reading time unavailable",
      older: false,
    })
  })

  it.each(["2026-10-10T21:45:59.999Z", "2026-10-10T21:45:00Z", "2026-10-10T21:41:00Z"])(
    "tolerates small future clock differences at %s",
    (now) => {
      const reading = describeStationReading(observedAt, new Date(now))
      expect(reading.ageLabel).toBe("just now")
      expect(reading.older).toBe(false)
    },
  )

  it("names a future clock reading beyond five minutes", () => {
    const reading = describeStationReading(observedAt, new Date("2026-10-10T21:40:59.999Z"))
    expect(reading.ageLabel).toBe("Reading time is ahead of current time")
    expect(reading.older).toBe(false)
  })

  it("shows only absolute observation labels before the clock is corrected", () => {
    expect(describeStationReading(observedAt)).toEqual({
      rainLabel: "Rain on Oct 10, 2026",
      timeLabel: "Observed: Oct 10, 2026, 2:46 PM PDT",
      older: false,
    })
  })

  it("uses the station-local date for absolute labels around midnight", () => {
    expect(describeStationReading("2026-10-11T06:59:00Z").rainLabel).toBe("Rain on Oct 10, 2026")
    expect(describeStationReading("2026-10-11T07:00:00Z").rainLabel).toBe("Rain on Oct 11, 2026")
  })

  it.each([undefined, ""])("keeps unavailable time %s before hydration", (timestamp) => {
    expect(describeStationReading(timestamp)).toEqual({
      rainLabel: "Rain total",
      timeLabel: "Reading time unavailable",
      older: false,
    })
  })

  it("formats winter readings with the station's PST offset", () => {
    const reading = describeStationReading("2026-12-10T21:46:00Z", new Date("2026-12-10T22:00:00Z"))
    expect(reading.timeLabel).toContain("Dec 10, 2026, 1:46 PM PST")
  })
})

import type { TwilightKind } from "@/lib/twilight"
import { describe, expect, it } from "vitest"
import { getTimes } from "@/lib/suncalc"
import {
  TWILIGHT_LABELS,
  buildTwilightEvents,
  selectNextTwilight,
  stationDateSeries,
  twilightEventsForDate,
  twilightEventsFromTimes,
} from "@/lib/twilight"
import { formatStationTime, getStationDate } from "@/lib/utils"

// vitest.setup.ts configures the station at 37.7749/-122.4194 -- the same
// America/Los_Angeles zone as the real one, so every station-date claim holds.
const DAILY_ORDER: TwilightKind[] = [
  "astronomicalDawn",
  "civilDawn",
  "civilDusk",
  "astronomicalDusk",
]

function kindsOf(events: { kind: TwilightKind }[]): TwilightKind[] {
  return events.map((event) => event.kind)
}

describe("stationDateSeries", () => {
  it("walks consecutive station-local dates from the given instant", () => {
    // 16:00Z is 09:00 station-local on the 5th.
    expect(stationDateSeries(new Date("2026-08-05T16:00:00Z"), 3)).toEqual([
      "2026-08-05",
      "2026-08-06",
      "2026-08-07",
    ])
  })

  it("uses the station's calendar day, not UTC's", () => {
    // 04:00Z on the 6th is still 21:00 on the 5th at the station.
    expect(stationDateSeries(new Date("2026-08-06T04:00:00Z"), 1)).toEqual(["2026-08-05"])
  })

  it("rolls over the year boundary", () => {
    expect(stationDateSeries(new Date("2026-12-31T20:00:00Z"), 3)).toEqual([
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
    ])
  })

  // A naive `+ 86_400_000` walk repeats 2026-11-01 and skips 2026-03-08, because
  // those station-local days are 25 and 23 hours long.
  it("neither skips nor repeats a day across spring forward", () => {
    expect(stationDateSeries(new Date("2026-03-06T20:00:00Z"), 5)).toEqual([
      "2026-03-06",
      "2026-03-07",
      "2026-03-08",
      "2026-03-09",
      "2026-03-10",
    ])
  })

  it("neither skips nor repeats a day across fall back", () => {
    expect(stationDateSeries(new Date("2026-10-30T20:00:00Z"), 5)).toEqual([
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
    ])
  })

  it("returns nothing for a zero-length window", () => {
    expect(stationDateSeries(new Date("2026-08-05T16:00:00Z"), 0)).toEqual([])
  })
})

describe("twilightEventsForDate", () => {
  it("names the four boundaries of one station day in order", () => {
    const events = twilightEventsForDate("2026-08-05")
    expect(kindsOf(events)).toEqual(DAILY_ORDER)
    for (const event of events) {
      expect(getStationDate(event.at)).toBe("2026-08-05")
    }
  })

  it("returns strictly increasing times", () => {
    const events = twilightEventsForDate("2026-08-05")
    const times = events.map((event) => event.at.getTime())
    expect(times).toEqual(times.toSorted((first, second) => first - second))
    expect(new Set(times).size).toBe(times.length)
  })
})

describe("twilightEventsFromTimes", () => {
  const midsummer = new Date("2026-06-21T12:00:00Z")

  it("drops every event under the midnight sun", () => {
    // Svalbard: the sun never falls even to -6, so getTimes returns Invalid Dates.
    expect(twilightEventsFromTimes(getTimes(midsummer, 78.22, 15.65))).toEqual([])
  })

  it("keeps civil twilight where astronomical never arrives", () => {
    // At 55N on the solstice the sun bottoms out near -11.6: past -6, short of -18.
    const events = twilightEventsFromTimes(getTimes(midsummer, 55, 15.65))
    expect(kindsOf(events)).toEqual(["civilDawn", "civilDusk"])
  })

  it("never emits a time that formatStationTime would reject", () => {
    const events = twilightEventsFromTimes(getTimes(midsummer, 55, 15.65))
    expect(() => events.map((event) => formatStationTime(event.at))).not.toThrow()
  })
})

describe("buildTwilightEvents", () => {
  it("covers three days by default and stays ordered across day boundaries", () => {
    const events = buildTwilightEvents(new Date("2026-08-05T16:00:00Z"))
    expect(events).toHaveLength(12)
    const times = events.map((event) => event.at.getTime())
    expect(times).toEqual(times.toSorted((first, second) => first - second))
  })

  it("honours a custom day count", () => {
    expect(buildTwilightEvents(new Date("2026-08-05T16:00:00Z"), 1)).toHaveLength(4)
  })
})

describe("selectNextTwilight", () => {
  const events = buildTwilightEvents(new Date("2026-08-05T16:00:00Z"))

  it("takes the next four events after now", () => {
    // 09:00 station-local: both dawns are behind us, so the window opens on dusk
    // and wraps into tomorrow morning.
    const next = selectNextTwilight(events, new Date("2026-08-05T16:00:00Z"))
    expect(kindsOf(next)).toEqual([
      "civilDusk",
      "astronomicalDusk",
      "astronomicalDawn",
      "civilDawn",
    ])
  })

  it("rolls to the following day once astronomical dusk has passed", () => {
    const dusk = events.find((event) => event.kind === "astronomicalDusk")
    const next = selectNextTwilight(events, new Date(dusk!.at.getTime() + 60_000))
    expect(kindsOf(next)).toEqual(DAILY_ORDER)
    expect(getStationDate(next[0]!.at)).toBe("2026-08-06")
  })

  it("excludes an event landing exactly on now", () => {
    const [first] = events
    expect(kindsOf(selectNextTwilight(events, first!.at))[0]).not.toBe(first!.kind)
  })

  it("returns what is left when the window runs short", () => {
    const secondToLast = events.at(-3)
    expect(selectNextTwilight(events, secondToLast!.at)).toHaveLength(2)
  })

  it("returns nothing past the end of the window", () => {
    expect(selectNextTwilight(events, events.at(-1)!.at)).toEqual([])
  })

  it("honours a custom count", () => {
    expect(selectNextTwilight(events, new Date("2026-08-05T16:00:00Z"), 2)).toHaveLength(2)
  })
})

describe("TWILIGHT_LABELS", () => {
  it("names every kind", () => {
    expect(Object.keys(TWILIGHT_LABELS).toSorted()).toEqual(DAILY_ORDER.toSorted())
  })
})

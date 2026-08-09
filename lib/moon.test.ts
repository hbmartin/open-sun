import type { MoonKind } from "@/lib/moon"
import { describe, expect, it } from "vitest"
import {
  MOON_LABELS,
  buildMoonEvents,
  daysToNextFullMoon,
  moonEventsFromTimes,
  moonPhaseName,
  selectNextMoonEvents,
  summariseMoon,
} from "@/lib/moon"
import { formatStationTime } from "@/lib/utils"

// vitest.setup.ts puts the station at 37.7749/-122.4194, the same
// America/Los_Angeles zone as the real one. 16:00Z is 09:00 station-local.
const NOW = new Date("2026-08-05T16:00:00Z")
const EVENTS = buildMoonEvents(NOW)

// Real cardinal phases of the August 2026 lunation, at 20:00Z so each lands
// well inside its own station day.
function phaseOn(day: number): number {
  return summariseMoon(new Date(`2026-08-${String(day).padStart(2, "0")}T20:00:00Z`)).phase
}

function kindsOf(events: { kind: MoonKind }[]): MoonKind[] {
  return events.map((event) => event.kind)
}

describe("moonEventsFromTimes", () => {
  it("names a rise and a set", () => {
    const rise = new Date("2026-08-05T06:16:40Z")
    const set = new Date("2026-08-05T20:50:58Z")
    expect(moonEventsFromTimes({ rise, set })).toEqual([
      { kind: "moonrise", at: rise },
      { kind: "moonset", at: set },
    ])
  })

  it("drops the day entirely when the moon never sets", () => {
    // Circumpolar: getMoonTimes omits both times and flags alwaysUp instead.
    expect(moonEventsFromTimes({ alwaysUp: true })).toEqual([])
    expect(moonEventsFromTimes({ alwaysDown: true })).toEqual([])
  })

  it("drops an Invalid Date rather than letting formatStationTime throw", () => {
    const events = moonEventsFromTimes({ rise: new Date(Number.NaN) })
    expect(events).toEqual([])
    expect(() => events.map((event) => formatStationTime(event.at))).not.toThrow()
  })

  it("keeps a rise when only the set is missing", () => {
    const rise = new Date("2026-08-05T06:16:40Z")
    expect(kindsOf(moonEventsFromTimes({ rise }))).toEqual(["moonrise"])
  })
})

describe("buildMoonEvents", () => {
  it("covers three days by default, sorted and free of duplicates", () => {
    expect(EVENTS).toHaveLength(6)
    const times = EVENTS.map((event) => event.at.getTime())
    expect(times).toEqual(times.toSorted((first, second) => first - second))
    expect(new Set(times).size).toBe(times.length)
  })

  it("alternates rise and set, as a 24h50m cycle must", () => {
    expect(kindsOf(EVENTS)).toEqual([
      "moonrise",
      "moonset",
      "moonrise",
      "moonset",
      "moonrise",
      "moonset",
    ])
  })

  it("honours a custom day count", () => {
    expect(buildMoonEvents(NOW, 1)).toHaveLength(2)
    expect(buildMoonEvents(NOW, 0)).toEqual([])
  })

  it("emits times the station formatter accepts", () => {
    expect(() => EVENTS.map((event) => formatStationTime(event.at))).not.toThrow()
  })
})

describe("selectNextMoonEvents", () => {
  it("returns one rise and one set, in the order they happen", () => {
    const next = selectNextMoonEvents(EVENTS, NOW)
    // At 09:00 on the 5th the moon has already risen (23:16 on the 4th), so the
    // next event of each kind straddles the afternoon and late evening.
    expect(next.map((event) => [event.kind, formatStationTime(event.at)])).toEqual([
      ["moonset", "1:50 PM"],
      ["moonrise", "11:52 PM"],
    ])
  })

  it("never returns two of the same kind", () => {
    for (const event of EVENTS) {
      const kinds = kindsOf(selectNextMoonEvents(EVENTS, event.at))
      expect(new Set(kinds).size).toBe(kinds.length)
    }
  })

  it("excludes an event landing exactly on now", () => {
    const [first] = EVENTS
    expect(selectNextMoonEvents(EVENTS, first!.at)).not.toContainEqual(first)
  })

  it("returns what is left once the window runs short", () => {
    expect(kindsOf(selectNextMoonEvents(EVENTS, EVENTS.at(-2)!.at))).toEqual(["moonset"])
    expect(selectNextMoonEvents(EVENTS, EVENTS.at(-1)!.at)).toEqual([])
  })
})

describe("moonPhaseName", () => {
  // August 2026's real lunation: new on the 12th, first quarter the 19th, full
  // the 27th, last quarter the 5th. If suncalc drifts, these are the canary.
  it("names the four cardinal phases on the nights they occur", () => {
    expect(moonPhaseName(phaseOn(12))).toBe("New Moon")
    expect(moonPhaseName(phaseOn(19))).toBe("First Quarter")
    expect(moonPhaseName(phaseOn(27))).toBe("Full Moon")
    expect(moonPhaseName(phaseOn(5))).toBe("Last Quarter")
  })

  it("names the four intermediate phases", () => {
    expect(moonPhaseName(phaseOn(16))).toBe("Waxing Crescent")
    expect(moonPhaseName(phaseOn(23))).toBe("Waxing Gibbous")
    expect(moonPhaseName(phaseOn(30))).toBe("Waning Gibbous")
    expect(moonPhaseName(phaseOn(8))).toBe("Waning Crescent")
  })

  it("wraps cleanly at both ends of the cycle", () => {
    // Phase is cyclic, so 0 and 1 are the same instant and must agree.
    expect(moonPhaseName(0)).toBe("New Moon")
    expect(moonPhaseName(1)).toBe("New Moon")
    expect(moonPhaseName(0.999)).toBe("New Moon")
  })
})

describe("daysToNextFullMoon", () => {
  it("is zero at full moon and half a cycle at new", () => {
    expect(daysToNextFullMoon(0.5)).toBe(0)
    expect(daysToNextFullMoon(0)).toBe(15)
  })

  // A bare `0.5 - phase` is negative past full and would count backwards.
  it("counts forward to the NEXT full moon past a waning phase", () => {
    expect(daysToNextFullMoon(0.75)).toBe(22)
    expect(daysToNextFullMoon(0.9)).toBe(18)
  })

  it("never reports a negative or an out-of-cycle wait", () => {
    for (let step = 0; step <= 100; step++) {
      const days = daysToNextFullMoon(step / 100)
      expect(days).toBeGreaterThanOrEqual(0)
      expect(days).toBeLessThanOrEqual(30)
    }
  })
})

describe("summariseMoon", () => {
  it("agrees with the almanac on the night of the full moon", () => {
    const summary = summariseMoon(new Date("2026-08-27T20:00:00Z"))
    expect(summary.name).toBe("Full Moon")
    expect(summary.daysToFull).toBe(0)
    expect(summary.fraction).toBeGreaterThan(0.99)
  })

  it("reports a dark disc at new moon", () => {
    const summary = summariseMoon(new Date("2026-08-12T20:00:00Z"))
    expect(summary.name).toBe("New Moon")
    expect(summary.fraction).toBeLessThan(0.01)
  })
})

describe("MOON_LABELS", () => {
  it("names every kind", () => {
    expect(Object.keys(MOON_LABELS).toSorted()).toEqual(["moonrise", "moonset"])
  })
})

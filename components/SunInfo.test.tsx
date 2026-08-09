import type { MoonEvent } from "@/lib/moon"
import type { TwilightEvent } from "@/lib/twilight"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import MoonEventIcon from "@/components/MoonEventIcon"
import SunInfo from "@/components/SunInfo"
import TwilightIcon from "@/components/TwilightIcon"
import { buildMoonEvents, selectNextMoonEvents } from "@/lib/moon"
import { buildTwilightEvents, selectNextTwilight } from "@/lib/twilight"
import { formatStationTime } from "@/lib/utils"

// 09:00 station-local: both dawns are behind us, so the strip opens on tonight's
// dusk pair and wraps into tomorrow morning.
const NOW = new Date("2026-08-05T16:00:00Z")
const EVENTS = buildTwilightEvents(NOW)
const MOON = buildMoonEvents(NOW)

function render(
  twilight: readonly TwilightEvent[],
  now: Date = NOW,
  moon: readonly MoonEvent[] = MOON,
): string {
  return renderToStaticMarkup(<SunInfo twilight={twilight} moon={moon} now={now} />)
}

function timesIn(markup: string): string[] {
  return [...markup.matchAll(/<time[^>]*>([^<]+)<\/time>/gu)].map((match) => match[1]!)
}

describe("SunInfo", () => {
  it("shows four twilight times then the next moonrise and moonset", () => {
    const times = timesIn(render(EVENTS))
    expect(times).toHaveLength(6)
    expect(times).toEqual([
      ...selectNextTwilight(EVENTS, NOW).map((event) => formatStationTime(event.at)),
      ...selectNextMoonEvents(MOON, NOW).map((event) => formatStationTime(event.at)),
    ])
  })

  it("gives every cell a column, so six fit on one row", () => {
    const markup = render(EVENTS)
    expect(markup).toContain("grid-cols-6")
  })

  it("sits in a card, like every other block on the page", () => {
    const markup = render(EVENTS)
    expect(markup).toContain("bg-white")
    expect(markup).toContain("dark:bg-gray-900")
    expect(markup).toContain("rounded-lg")
    expect(markup).toContain("shadow-sm")
  })

  it("stacks the icon above a bold time", () => {
    const markup = render(EVENTS)
    expect(markup).toContain("flex-col items-center")
    expect(markup).toContain("font-semibold")
    // Tabular figures are why the strip does not shuffle on the minute tick.
    expect(markup).toContain("tabular-nums")
  })

  it("formats times in the station's zone, not UTC", () => {
    // Tonight's civil dusk is an evening time locally and would read as the
    // following morning under the TZ=UTC the suite runs in.
    expect(render(EVENTS)).toContain("8:44 PM")
    expect(render(EVENTS)).not.toContain("3:44 AM")
  })

  it("names each event for screen readers now the visible label is gone", () => {
    const markup = render(EVENTS)
    expect(markup).toContain("Civil dusk")
    expect(markup).toContain("Astronomical dusk")
    expect(markup).toContain("Astronomical dawn")
    expect(markup).toContain("Civil dawn")
    expect(markup).toContain("Moonrise")
    expect(markup).toContain("Moonset")
    expect(markup).toContain('aria-label="Next sun and moon times"')
  })

  it("tints dawn orange and dusk purple, fading the astronomical pair", () => {
    const markup = render(EVENTS)
    expect(markup).toContain("text-orange-600")
    expect(markup).toContain("text-purple-800")
    expect(markup.match(/opacity-60/gu)).toHaveLength(2)
  })

  it("keeps the moon off the morning/evening hue axis", () => {
    // Moonrise walks through every hour of the day across a month, so borrowing
    // the dawn orange or the dusk purple would state something false.
    expect(render(EVENTS)).toContain("text-indigo-500")
  })

  it("leaks neither NaN nor an invalid date", () => {
    const markup = render(EVENTS)
    expect(markup).not.toContain("NaN")
    expect(markup).not.toContain("Invalid Date")
    expect(markup).not.toContain("undefined")
  })

  it("renders what is left when the windows run short", () => {
    // Late on the third day: two twilight cells left, and one moon event -- the
    // next moonrise is already past the end of the precomputed window.
    const markup = render(EVENTS, EVENTS.at(-3)!.at)
    expect(timesIn(markup)).toHaveLength(3)
    expect(markup).toContain("Moonset")
    expect(markup).not.toContain("Moonrise")
  })

  it("keeps the card alive on the moon alone once the sun window is spent", () => {
    const markup = render(EVENTS, EVENTS.at(-1)!.at, buildMoonEvents(EVENTS.at(-1)!.at))
    expect(timesIn(markup)).toHaveLength(2)
    expect(markup).toContain("Moonrise")
  })

  it("renders nothing once both windows are exhausted", () => {
    expect(render(EVENTS, EVENTS.at(-1)!.at, [])).toBe("")
  })
})

describe("TwilightIcon", () => {
  // The four variants differ only by two paths. Pin them, or a silent geometry
  // regression turns the set into four identical glyphs.
  const paths = (kind: TwilightEvent["kind"]) =>
    [...renderToStaticMarkup(<TwilightIcon kind={kind} />).matchAll(/d="([^"]+)"/gu)].map(
      (match) => match[1],
    )

  it("sits the civil sun higher above the horizon than the astronomical one", () => {
    expect(paths("civilDawn")[1]).toBe("M6.5 21a5.5 5.5 0 0 1 11 0")
    expect(paths("astronomicalDawn")[1]).toBe("M7.1 21a5.5 5.5 0 0 1 9.8 0")
    expect(paths("civilDusk")[1]).toBe(paths("civilDawn")[1])
    expect(paths("astronomicalDusk")[1]).toBe(paths("astronomicalDawn")[1])
  })

  it("points the arrow up at dawn and down at dusk", () => {
    expect(paths("civilDawn")[3]).toBe("m9 6 3-3 3 3")
    expect(paths("astronomicalDawn")[3]).toBe("m9 6 3-3 3 3")
    expect(paths("civilDusk")[3]).toBe("m9 8 3 3 3-3")
    expect(paths("astronomicalDusk")[3]).toBe("m9 8 3 3 3-3")
  })

  it("throws rays off the civil sun only, clear of its cap", () => {
    // r=8 out to r=10 about (12,21): outside the cap's 5.5 plus its 2-unit
    // stroke, so the gap survives at the 16px the strip renders at.
    expect(paths("civilDawn").slice(4)).toEqual(["m6.34 15.34-1.41-1.41", "m17.66 15.34 1.41-1.41"])
    expect(paths("civilDusk").slice(4)).toEqual(paths("civilDawn").slice(4))
    expect(paths("astronomicalDawn")).toHaveLength(4)
    expect(paths("astronomicalDusk")).toHaveLength(4)
  })

  it("shares one horizon across every variant", () => {
    expect(paths("civilDawn")[0]).toBe("M2 21h20")
    expect(paths("astronomicalDusk")[0]).toBe("M2 21h20")
  })

  it("hides the glyph from assistive tech", () => {
    expect(renderToStaticMarkup(<TwilightIcon kind="civilDusk" />)).toContain('aria-hidden="true"')
  })
})

describe("MoonEventIcon", () => {
  const paths = (kind: MoonEvent["kind"]) =>
    [...renderToStaticMarkup(<MoonEventIcon kind={kind} />).matchAll(/d="([^"]+)"/gu)].map(
      (match) => match[1],
    )

  it("borrows the twilight horizon and arrow exactly", () => {
    // Sharing the frame is what makes the six-cell strip read as one row.
    expect(paths("moonrise")[0]).toBe("M2 21h20")
    expect(paths("moonrise")[2]).toBe("M12 3v8")
    expect(paths("moonrise")[3]).toBe("m9 6 3-3 3 3")
    expect(paths("moonset")[3]).toBe("m9 8 3 3 3-3")
  })

  it("puts a crescent where the sun's cap goes, tangent to the horizon", () => {
    // Ends at y=21 on the rule, and its top at y=14 clears the shaft's y=11.
    expect(paths("moonrise")[1]).toBe("M12 14a2.5 2.5 0 0 0 3.5 3.5 3.5 3.5 0 1 1-3.5-3.5Z")
    expect(paths("moonset")[1]).toBe(paths("moonrise")[1])
  })

  it("differs from the sun glyphs by exactly one path", () => {
    const moon = paths("moonrise")
    const sun = [
      ...renderToStaticMarkup(<TwilightIcon kind="civilDawn" />).matchAll(/d="([^"]+)"/gu),
    ]
      .map((match) => match[1])
      .slice(0, 4)
    expect(moon).toHaveLength(4)
    expect(moon.filter((path, index) => path !== sun[index])).toHaveLength(1)
  })

  it("hides the glyph from assistive tech", () => {
    expect(renderToStaticMarkup(<MoonEventIcon kind="moonset" />)).toContain('aria-hidden="true"')
  })
})

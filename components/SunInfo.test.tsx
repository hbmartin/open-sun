import type { TwilightEvent } from "@/lib/twilight"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import SunInfo from "@/components/SunInfo"
import TwilightIcon from "@/components/TwilightIcon"
import { buildTwilightEvents, selectNextTwilight } from "@/lib/twilight"
import { formatStationTime } from "@/lib/utils"

// 09:00 station-local: both dawns are behind us, so the strip opens on tonight's
// dusk pair and wraps into tomorrow morning.
const NOW = new Date("2026-08-05T16:00:00Z")
const EVENTS = buildTwilightEvents(NOW)

function render(twilight: readonly TwilightEvent[], now: Date = NOW): string {
  return renderToStaticMarkup(<SunInfo twilight={twilight} now={now} />)
}

describe("SunInfo", () => {
  it("shows the next four twilight times in order", () => {
    const markup = render(EVENTS)
    const times = [...markup.matchAll(/<time[^>]*>([^<]+)<\/time>/gu)].map((match) => match[1])
    expect(times).toHaveLength(4)
    expect(times).toEqual(
      selectNextTwilight(EVENTS, NOW).map((event) => formatStationTime(event.at)),
    )
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
    expect(markup).toContain('aria-label="Next twilight times"')
  })

  it("tints dawn orange and dusk purple, fading the astronomical pair", () => {
    const markup = render(EVENTS)
    expect(markup).toContain("text-orange-600")
    expect(markup).toContain("text-purple-800")
    expect(markup.match(/opacity-60/gu)).toHaveLength(2)
  })

  it("leaks neither NaN nor an invalid date", () => {
    const markup = render(EVENTS)
    expect(markup).not.toContain("NaN")
    expect(markup).not.toContain("Invalid Date")
    expect(markup).not.toContain("undefined")
  })

  it("renders what is left when the window runs short", () => {
    const markup = render(EVENTS, EVENTS.at(-3)!.at)
    expect([...markup.matchAll(/<time/gu)]).toHaveLength(2)
  })

  it("renders nothing once the window is exhausted", () => {
    expect(render(EVENTS, EVENTS.at(-1)!.at)).toBe("")
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

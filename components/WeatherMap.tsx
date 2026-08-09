// oxlint-disable react/iframe-missing-sandbox -- see the sandbox note below.
import type React from "react"

// Centred on the station at zoom 12, opening on the temperature layer. Ventusky
// reads the whole view out of the fragment-style `p` triple, so the coordinates
// and the zoom travel as one parameter.
const VENTUSKY_SRC = "https://embed.ventusky.com/?p=34.258;-117.189;12&l=temperature-2m"

/**
 * The Ventusky embed, filling everything the bottom navigation leaves.
 *
 * Ventusky's published snippet is a 4:3 padding-box, which on a phone would
 * leave two thirds of the screen empty; the map is the whole point of this view,
 * so the frame takes the viewport instead. 4.5rem is the fixed nav's height plus
 * the page's pt-3, and dvh rather than vh so the map is not cropped behind
 * mobile Safari's collapsing toolbar.
 */
export default function WeatherMap(): React.JSX.Element {
  return (
    <div className="h-[calc(100dvh-4.5rem)] w-full overflow-hidden">
      <h2 className="sr-only">Weather Map</h2>
      {/* The map is a WebGL canvas that keeps its layer and position in its own
          storage, so it needs scripts and its own origin; allow-same-origin is
          cross-origin here, so it grants Ventusky nothing of ours. Popups are
          for its own attribution links, which would otherwise fail silently.
          The rule guards against the pair on a same-origin frame, where it
          would let the frame drop its own sandbox; what is left still withholds
          forms, downloads and top-level navigation, which no-sandbox would not.
          Hence the file-level disable: the rule flags the attribute line, which
          a disable-next-line above the element does not reach. */}
      <iframe
        src={VENTUSKY_SRC}
        title="Ventusky weather map"
        className="block h-full w-full border-0"
        sandbox="allow-scripts allow-same-origin allow-popups"
        loading="lazy"
      />
    </div>
  )
}

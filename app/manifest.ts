import type { MetadataRoute } from "next"

// Next serves this at /manifest.webmanifest and injects the <link rel="manifest">
// itself; nothing in app/layout.tsx has to reference it.
//
// The colours are the light-mode --background from app/globals.css, the same
// value the themeColor pair in app/layout.tsx carries. That is now three places
// holding one colour -- change one and change all three.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Weather Forecast: North of the Ridge",
    // Still the short name: home-screen labels truncate past about 12 characters,
    // so this one stays as it is while the full name follows the title.
    short_name: "Open Sun",
    description:
      "Weather station readings and a grounded ten-day forecast for Lassen, with uncertainty bands and sun and moon times.",
    // trailingSlash is on in next.config.mjs, so the installed app launches at
    // the same "/" the site canonicalises to.
    start_url: "/",
    display: "standalone",
    background_color: "#f9fafb",
    theme_color: "#f9fafb",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      // Android crops maskable icons to whatever shape the launcher uses. The
      // logo is opaque edge to edge, so it survives the crop without padding.
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}

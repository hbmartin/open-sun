import type { Metadata, Viewport } from "next"
import "./globals.css"
import type React from "react"
import { ThemeProvider } from "@/components/theme-provider"
import { getAppUrl } from "@/lib/environment"

function getMetadataBase() {
  return new URL(getAppUrl())
}

export const metadata: Metadata = {
  metadataBase: getMetadataBase(),
  title: "Lassen - Open Sun",
}

// Paints the iOS Safari status bar to match the page rather than letting it sit
// on a contrasting strip. These are the --background values from globals.css;
// keep the three in step. `media` keys off the OS scheme, which is exact only
// because the app always follows the system theme -- reintroducing a manual
// toggle would desync the bar from the page.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9fafb" },
    { media: "(prefers-color-scheme: dark)", color: "#030712" },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {/* There is no theme switch: the app follows the OS. The storage key is
            versioned past "theme" so anyone left pinned to light or dark by the
            old toggle falls back to the system default. Nothing writes it now. */}
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          storageKey="theme-v2"
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}

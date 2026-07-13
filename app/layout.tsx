import type { Metadata } from "next"
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
